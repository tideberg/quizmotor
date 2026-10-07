import { spawn } from 'node:child_process';
const processes=[spawn(process.execPath,['server/server.mjs'],{stdio:'inherit',env:{...process.env,QUIZ_FRONTEND_PORT:'5173'}}),spawn('npm',['run','dev:ui'],{stdio:'inherit'})];
let exiting=false;
function stop(){if(exiting)return;exiting=true;for(const p of processes)p.kill('SIGTERM');}
for(const p of processes)p.on('exit',code=>{if(!exiting){stop();process.exitCode=code||0;}});
process.on('SIGINT',stop);process.on('SIGTERM',stop);
