const express=require('express');const app=express();const color=process.env.COLOR||'unknown';app.get('/',(req,res)=>res.send(`Finacplus App (${color})`));app.listen(3000,()=>console.log('Running'));
