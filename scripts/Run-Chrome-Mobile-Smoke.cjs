// KNOUX CRYPT: Real mobile CDP smoke. Node 24, existing Chrome, no third-party package.
const fs=require('node:fs'), path=require('node:path'), {spawn}=require('node:child_process');
const base='D:\\KnouxCrypt-Android-Ready', out=path.join(base,'qa-evidence');
const profile='D:\\KnouxChromeCDPQA_'+process.pid;
const chromePath='C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
fs.mkdirSync(out,{recursive:true});
const chrome=spawn(chromePath,['--headless=new','--no-first-run','--disable-gpu','--disable-extensions','--disable-background-networking','--remote-allow-origins=*','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:'ignore',windowsHide:true});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let ws, nextId=0;const pending=new Map();
function send(method,params={}){const id=++nextId;return new Promise((resolve,reject)=>{pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));setTimeout(()=>{if(pending.has(id)){pending.delete(id);reject(new Error('CDP timeout '+method))}},10000)})}
(async()=>{
  let port;
  for(let i=0;i<60;i++){
    const f=path.join(profile,'DevToolsActivePort');
    if(fs.existsSync(f)){port=Number(fs.readFileSync(f,'utf8').split(/\r?\n/)[0]);break}
    await sleep(250);
  }
  if(!port)throw Error('Chrome DevTools port unavailable');
  const pages=await (await fetch('http://127.0.0.1:'+port+'/json/list')).json();
  const page=pages.find(x=>x.type==='page');if(!page)throw Error('No CDP page');
  ws=new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject});
  ws.onmessage=e=>{const v=JSON.parse(e.data);if(v.id&&pending.has(v.id)){const p=pending.get(v.id);pending.delete(v.id);v.error?p.reject(Error(v.error.message)):p.resolve(v.result)}};
  await send('Page.enable');await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});
  const routes=[['01_SPLASH','/'],['02_AUTH','/secure-access-login'],['03_HOME','/home']];
  const report={host:'127.0.0.1:3839',deviceViewport:{width:390,height:844},engine:'installed Chrome CDP',time:new Date().toISOString(),results:[]};
  for(const [name,route] of routes){
    await send('Page.navigate',{url:'http://127.0.0.1:3839'+route});
    await sleep(1600);
    const expr='({width:innerWidth,height:innerHeight,clientWidth:document.documentElement.clientWidth,docScrollWidth:document.documentElement.scrollWidth,bodyScrollWidth:document.body.scrollWidth,title:document.title,h1:document.querySelector("main h1")?.textContent?.trim()||"",bodyTextLen:document.body.innerText.length,hasMain:!!document.querySelector("main"),horizontalOverflow:document.documentElement.scrollWidth>innerWidth})';
    const evalr=await send('Runtime.evaluate',{expression:expr,returnByValue:true});
    const screenshot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
    const imagefile=path.join(out,name+'_MOBILE_390x844.png');
    fs.writeFileSync(imagefile,Buffer.from(screenshot.data,'base64'));
    report.results.push({screen:name,route,metrics:evalr.result.value,file:imagefile,bytes:fs.statSync(imagefile).size});
    process.stdout.write(name+' '+JSON.stringify(evalr.result.value)+'\n');
  }
  fs.writeFileSync(path.join(out,'mobile-cdp-report.json'),JSON.stringify(report,null,2));
  console.log('REPORT='+path.join(out,'mobile-cdp-report.json'));
})().catch(e=>{console.error(e.stack||e);process.exitCode=1}).finally(async()=>{try{ws?.close()}catch{};chrome.kill();});
