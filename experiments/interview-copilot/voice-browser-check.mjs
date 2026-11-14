import {chromium} from 'playwright';
import {fileURLToPath} from 'node:url';
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
const context=await browser.newContext({permissions:['microphone'],viewport:{width:1200,height:950}});
await context.addInitScript(()=>{window.SpeechRecognition=class {start(){setTimeout(()=>{const result=[{transcript:'首先我整理了行业数据，然后分析关键假设，最后总结结果。'}];result.isFinal=true;this.onresult?.({resultIndex:0,results:[result]});},350);}stop(){this.onend?.();}abort(){}};});
const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
try {
 await page.goto('http://127.0.0.1:3210/interview/setup');await page.locator('#job').selectOption('demo-research');await page.locator('#resume').selectOption('demo-finance-v2');await page.getByRole('button',{name:'确认并开始面试'}).click();await page.locator('#record').waitFor();
 if(await page.locator('#elapsed').textContent()!=='00:00')throw Error('timer started before click');
 await page.locator('#record').click();await page.getByText('请先确认浏览器语音识别的外发说明。',{exact:true}).waitFor();
 await page.locator('#speech-consent').check();await page.locator('#record').click();await page.getByRole('button',{name:'停止录音',exact:false}).waitFor();
 await page.waitForFunction(()=>document.getElementById('elapsed').textContent!=='00:00');await page.locator('#answer').evaluate(e=>{if(!e.readOnly)throw Error('should lock transcript while recording');});
 await page.locator('#record').click();await page.locator('#playback').waitFor({state:'visible'});await page.waitForFunction(()=>document.getElementById('playback').src.startsWith('blob:'));
 if(!(await page.locator('#answer').inputValue()).includes('行业数据'))throw Error('transcription missing');
 await page.locator('#answer').fill('首先我整理了行业数据，然后分析关键假设，最后总结结果。校对后的文字。');
 await page.getByRole('button',{name:'提交，进入下一题'}).click();await page.getByRole('heading',{name:/哪一步由你亲自完成/}).waitFor();
 await page.getByRole('button',{name:'结束并查看复盘'}).click();await page.getByRole('heading',{name:'逐题复盘与作答记录'}).waitFor();
 await page.getByText('校对后的文字。',{exact:false}).first().waitFor();await page.getByText('AI 评分 · 待接入 DeepSeek',{exact:true}).waitFor();await page.reload();await page.getByText('校对后的文字。',{exact:false}).first().waitFor();
 await page.screenshot({path:fileURLToPath(new URL('artifacts/voice-review.png',import.meta.url)),fullPage:true});
 await page.goto('http://127.0.0.1:3210/interview/setup');await page.locator('#job').selectOption('demo-research');await page.locator('#resume').selectOption('demo-finance-v2');await page.getByRole('button',{name:'确认并开始面试'}).click();await page.locator('#record').waitFor();await page.locator('#speech-consent').check();
 await page.evaluate(()=>{navigator.mediaDevices.getUserMedia=async()=>{throw new DOMException('Denied','NotAllowedError');};});await page.locator('#record').click();await page.getByText('麦克风权限被拒绝，请在浏览器地址栏允许后重试。',{exact:true}).waitFor();if(await page.locator('#elapsed').textContent()!=='00:00')throw Error('failed recording counted time');
 await page.setViewportSize({width:390,height:844});if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('mobile overflow');await page.screenshot({path:fileURLToPath(new URL('artifacts/voice-mobile.png',import.meta.url)),fullPage:true});
 if(errors.length)throw Error(errors.join(';'));console.log('PASS: mocked microphone/transcription, click timer, consent, playback, transcript edit/save/reload, demo review, permission denial, 390px layout. Real microphone/recognition service not tested.');
} finally {await browser.close();}
