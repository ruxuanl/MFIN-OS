import {python} from './python.mjs';
const child=python('./setup_model.py');
child.stdout.pipe(process.stdout);
child.stderr.pipe(process.stderr);
child.on('error',()=>{console.error('Python unavailable; install Python and requirements.txt first.');process.exitCode=1;});
child.on('close',code=>{process.exitCode=code??1;});
