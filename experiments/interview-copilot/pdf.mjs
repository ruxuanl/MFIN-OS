import {python} from './python.mjs';

export function renderPdf(archive) {
  return new Promise((resolve,reject)=>{
    const child=python('./render_pdf.py');
    const chunks=[];let size=0;
    const timer=setTimeout(()=>child.kill(),30000);
    child.stdout.on('data',chunk=>{size+=chunk.length;if(size>20000000)child.kill();else chunks.push(chunk);});
    child.stderr.resume(); // Never expose private contents or raw parser errors to the browser.
    child.stdin.on('error',()=>{});
    child.on('error',()=>{clearTimeout(timer);reject(Error('PDF 生成器不可用，请检查 Python 与 reportlab 安装。'));});
    child.on('close',code=>{clearTimeout(timer);const pdf=Buffer.concat(chunks);if(code!==0||pdf.subarray(0,5).toString()!=='%PDF-')reject(Error('PDF 生成失败，请检查中文字体与运行环境后重试。'));else resolve(pdf);});
    child.stdin.end(JSON.stringify({content:archive.content}));
  });
}
