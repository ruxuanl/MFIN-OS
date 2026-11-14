import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import {mkdir} from 'node:fs/promises';
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
await mkdir(new URL('./artifacts/',import.meta.url),{recursive:true});
try {
 await page.goto('http://127.0.0.1:3210');await page.getByRole('heading',{name:'知识库',exact:true}).waitFor();
 await page.screenshot({path:fileURLToPath(new URL('artifacts/home-desktop.png',import.meta.url)),fullPage:true});
 await page.getByRole('link').filter({has:page.getByRole('heading',{name:'知识库',exact:true})}).click();
 await page.getByRole('heading',{name:'中信建投实习'}).waitFor();
 await page.getByRole('link').filter({has:page.getByRole('heading',{name:'中信建投实习'})}).click();
 await page.getByRole('heading',{name:'导入项目材料'}).waitFor();
 await page.getByRole('button',{name:'知识问答'}).click();await page.locator('#query').fill('估值方法');await page.getByRole('button',{name:'检索证据'}).click();await page.getByText('现有材料不足以确认',{exact:false}).waitFor();
 await page.reload();await page.locator('#qa-form').waitFor();
 await page.goto('http://127.0.0.1:3210/interview/setup');await page.locator('#job').selectOption('demo-research');await page.locator('#resume').selectOption('demo-finance-v2');
 await page.screenshot({path:fileURLToPath(new URL('artifacts/setup-desktop.png',import.meta.url)),fullPage:true});
 await page.getByRole('button',{name:'确认并开始面试'}).click();await page.locator('#answer').waitFor();await page.locator('#answer').fill('我亲自整理了行业数据。');await page.getByRole('button',{name:'提交，进入下一题'}).click();await page.getByRole('heading',{name:/哪一步由你亲自完成/}).waitFor();await page.reload();await page.getByRole('heading',{name:/哪一步由你亲自完成/}).waitFor();
 await page.getByRole('button',{name:'结束并查看复盘'}).click();await page.getByRole('heading',{name:'本次完成 1 题'}).waitFor();await page.getByRole('link',{name:'重新练习'}).click();await page.locator('#setup-form').waitFor();if(await page.locator('#resume').inputValue()!=='demo-finance-v2')throw Error('retry selection lost');
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:fileURLToPath(new URL('artifacts/setup-mobile.png',import.meta.url)),fullPage:true});if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('mobile overflow');
 await page.goto('http://127.0.0.1:3210');await page.getByRole('heading',{name:'知识库',exact:true}).waitFor();await page.screenshot({path:fileURLToPath(new URL('artifacts/home-mobile.png',import.meta.url)),fullPage:true});
 await page.getByRole('button',{name:'隐私锁',exact:true}).click();await page.getByRole('heading',{name:'工作区已锁定'}).waitFor();await page.getByRole('button',{name:'解除隐私锁'}).click();await page.getByRole('heading',{name:'知识库',exact:true}).waitFor();if(errors.length)throw Error(errors.join(';'));
 console.log('PASS: home, three libraries, project QA, refresh, job/resume setup, follow-up, session recovery, review, retry selections, privacy lock, mobile overflow, browser errors');
}finally{await browser.close();}
