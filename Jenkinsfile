pipeline {
    agent any

    environment {
        AWS_REGION      = "us-east-1"
        ACCOUNT_ID      = "157314643992"
        REPO            = "finacplus/app-01v"
        IMAGE_URI       = "${ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${REPO}"

        K8S_MASTER      = "rocky@172.31.86.230"
        SSH_CRED        = "kube-master-ssh"

        HELM_RELEASE    = "finacplus"
        HELM_CHART_PATH = "/home/rocky/helm/bluegreen"
        NAMESPACE       = "default"
    }

    stages {

        /* ────────────────────────────────
           CHECKOUT CODE
        ──────────────────────────────── */
        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        /* ────────────────────────────────
           BUILD & PUSH DOCKER IMAGE
        ──────────────────────────────── */
        stage('Build & Push Image') {
            steps {
                sh """
                aws ecr get-login-password --region ${AWS_REGION} \
                | docker login --username AWS --password-stdin ${IMAGE_URI}

                docker build -t finacplus-app .
                docker tag finacplus-app:latest ${IMAGE_URI}:${BUILD_NUMBER}
                docker push ${IMAGE_URI}:${BUILD_NUMBER}
                """
            }
        }

        /* ────────────────────────────────
           DETECT ACTIVE COLOR
        ──────────────────────────────── */
        stage('Detect Active Color') {
            steps {
                sshagent([SSH_CRED]) {
                    script {
                        def color = sh(
                            script: """ssh ${K8S_MASTER} \
                                "kubectl get svc finacplus-service -n ${NAMESPACE} -o jsonpath='{.spec.selector.color}'" """,
                            returnStdout: true
                        ).trim()

                        env.CURRENT_COLOR = (color == "green") ? "green" : "blue"
                        env.NEW_COLOR = (env.CURRENT_COLOR == "blue") ? "green" : "blue"

                        echo "Current Live Color: ${env.CURRENT_COLOR}"
                        echo "New Deployment Target: ${env.NEW_COLOR}"
                    }
                }
            }
        }

        /* ────────────────────────────────
           COPY HELM CHART TO MASTER
        ──────────────────────────────── */
        stage('Copy Helm Chart') {
            steps {
                sshagent([SSH_CRED]) {
                    sh """
                    scp -o StrictHostKeyChecking=no -r helm ${K8S_MASTER}:/home/rocky/
                    """
                }
            }
        }

        /* ────────────────────────────────
           HELM BLUE-GREEN DEPLOYMENT
        ──────────────────────────────── */
        stage("Helm Upgrade to New Color") {
            steps {
                sshagent([SSH_CRED]) {
                    sh """
                    ssh ${K8S_MASTER} '
                        helm upgrade --install ${HELM_RELEASE} ${HELM_CHART_PATH} \
                            --namespace ${NAMESPACE} \
                            --create-namespace \
                            --set image.tag=${BUILD_NUMBER} \
                            --set liveColor=${NEW_COLOR} \
                            --wait --timeout 120s --debug
                    '
                    """
                }
            }
        }

        /* ────────────────────────────────
           HEALTH CHECK
        ──────────────────────────────── */
        stage("Health Check") {
            steps {
                sshagent([SSH_CRED]) {
                    sh """
                    ssh ${K8S_MASTER} "
                        kubectl rollout status deployment/app-${NEW_COLOR} \
                        -n ${NAMESPACE} --timeout=60s
                    "
                    """
                }
            }
        }
    }

    /* ────────────────────────────────
       POST DEPLOYMENT
    ──────────────────────────────── */
    post {
        success {
            echo "SUCCESS: Traffic switched to ${env.NEW_COLOR}!"
        }

        failure {
            echo "DEPLOYMENT FAILED — Rolling back to ${env.CURRENT_COLOR}..."

            sshagent([SSH_CRED]) {
                sh """
                ssh ${K8S_MASTER} '
                    helm upgrade --install ${HELM_RELEASE} ${HELM_CHART_PATH} \
                        --namespace ${NAMESPACE} \
                        --set liveColor=${CURRENT_COLOR}
                '
                """
            }
        }
    }
}
