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

        stage('Checkout') {
            steps { checkout scm }
        }

        /* BUILD IMAGE */
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

    stage('Detect Live Color') {
    steps {
        sshagent([SSH_CRED]) {
            script {
                def activeColor = sh(
                    script: """
                        ssh -o StrictHostKeyChecking=no ${K8S_USER}@${K8S_NODE} \\
                        "kubectl get svc ${RELEASE_NAME} -n ${NAMESPACE} -o jsonpath='{.spec.selector.color}'"
                    """,
                    returnStdout: true
                ).trim()

                if (activeColor == "blue") {
                    env.TARGET = "green"
                } else if (activeColor == "green") {
                    env.TARGET = "blue"
                } else {
                    env.TARGET = "blue"
                }

                echo "Active color = ${activeColor}, Deploying TARGET = ${env.TARGET}"
            }
        }
    }
}


        /* COPY HELM CHART */
        stage('Copy Helm Chart') {
            steps {
                sshagent([SSH_CRED]) {
                    sh """
                    scp -o StrictHostKeyChecking=no -r helm ${K8S_MASTER}:/home/rocky/
                    """
                }
            }
        }

        /* DEPLOY TO INACTIVE COLOR ONLY */
        stage('Deploy Inactive Color') {
            steps {
                sshagent([SSH_CRED]) {
                    sh """
                    ssh ${K8S_MASTER} "
                        helm upgrade --install ${HELM_RELEASE} ${HELM_CHART_PATH} \
                          --namespace default \
                          --set image.tag=${BUILD_NUMBER} \
                          --set liveColor=${CURRENT_COLOR} \
                          --wait --timeout 90s --debug
                    "
                    """
                }
            }
        }

        /* HEALTH CHECK NEW COLOR */
        stage('Health Check New Color') {
            steps {
                sshagent([SSH_CRED]) {
                    sh """
                    ssh ${K8S_MASTER} "
                        kubectl rollout status deployment/app-${NEW_COLOR} \
                          -n default --timeout=60s
                    "
                    """
                }
            }
        }

        /* SWITCH TRAFFIC */
        stage('Switch Traffic') {
            steps {
                sshagent([SSH_CRED]) {
                    sh """
                    ssh ${K8S_MASTER} "
                        helm upgrade --install ${HELM_RELEASE} ${HELM_CHART_PATH} \
                          --namespace default \
                          --set image.tag=${BUILD_NUMBER} \
                          --set liveColor=${NEW_COLOR} \
                          --wait --timeout 60s --debug
                    "
                    """
                }
            }
        }
    }

    post {
        success {
            echo "SUCCESS! Traffic routed to ${env.NEW_COLOR}"
        }
        failure {
            echo "FAILED! Rolling back to ${env.CURRENT_COLOR}"
        }
    }
}
