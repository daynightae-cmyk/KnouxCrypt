// Optional QA tool: install Playwright outside app dependencies, then:
// NODE_PATH=/path/to/qa/node_modules node scripts/check-visual-browser.cjs
// Run Vite locally first. Never points to a remote/production URL.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const esbuild = require('esbuild');
const root = path.resolve(__dirname, '..');
const base = process.env.QA_URL || 'http://127.0.0.1:4174';
assert.ok(/^http:\/\/127\.0\.0\.1:\d+$/.test(base), 'local QA only');
const out = process.env.QA_OUTPUT || path.join(root, 'qa-evidence/pr15');
fs.mkdirSync(out, { recursive: true });
const m = new Module('registry');
m._compile(esbuild.buildSync({entryPoints:[path.join(root,'src/config/screens.js')],bundle:true,write:false,platform:'node',format:'cjs'}).outputFiles[0].text,'registry.cjs');
const {SCREENS}=m.exports;
const missions=[...fs.readFileSync(path.join(root,'src/config/missionRoutes.js'),'utf8').matchAll(/id: "([^"]+)", suffix: "([^"]*)"/g)].map(x=>({id:x[1],route:SCREENS[x[1]]+(x[2]?'/sample-1':'')}));
const queries=[['Vault','/vault'],['Secure Notes','/notes'],['Passwords','/passwords'],['Encrypt Files','/file-cipher'],['Authenticator','/authenticator'],['Privacy','/privacy'],['Recovery','/backup'],['Backup','/backup']];
const report={browser:null,checks:[],screens:[],warnings:[],errors:[]};
let activeBrowser;
async function run(){
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});activeBrowser=browser;report.browser=browser.version();
 const context=await browser.newContext();
 await context.addInitScript(()=>localStorage.setItem('knoux.language', location.search.includes('qa-ar')?'ar':'en'));
 const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
 async function open(route,locale){await page.goto(`${base}${route}?qa-${locale}`);await page.locator('main').waitFor();await page.evaluate(()=>document.fonts.ready);}
 async function shot(name){await page.screenshot({path:path.join(out,name+'.png')});}
 async function metrics(){return page.evaluate(()=>{const main=document.querySelector('main');const region=document.querySelector('.app-scroll-region');return {width:innerWidth,docWidth:document.documentElement.scrollWidth,mainWidth:main.scrollWidth,mainClient:main.clientWidth,scroll:region.scrollHeight,client:region.clientHeight,logo:document.querySelector('.hub-final-stag')?.getBoundingClientRect().toJSON()};});}
 // Original PR head runtime captures (no mocks / screenshot substitutes).
 for(const route of ['home','tools']){await page.setViewportSize({width:390,height:844});await page.goto(`http://127.0.0.1:4173/${route}?qa-en`);await page.locator('main').waitFor();await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(1600);await shot('before-'+route+'-390-en');if(route==='tools'){assert.equal(await page.locator('[data-tools-results] a').count(),27);}}
 report.checks.push('Archived db55af9 regression baseline reproduced: 27 tools.');
 for(const [w,h] of [[360,800],[390,844],[412,915],[768,1024],[1440,900]])for(const locale of ['en','ar']){
  await page.setViewportSize({width:w,height:h});
  await open('/tools',locale);
  assert.equal(await page.locator('[data-tools-results] a').count(),8);
  await page.locator('[data-tool-category=all]').click();
  assert.equal(await page.locator('[data-tools-results] a').count(),34);
  const inventory=await page.locator('[data-tools-results] a').evaluateAll(els=>els.map(el=>({title:el.innerText,href:el.getAttribute('href')})));
  assert.equal(new Set(inventory.map(x=>x.href)).size,34);
  if(w===390)fs.writeFileSync(path.join(out,`inventory-${locale}.json`),JSON.stringify(inventory,null,2));
  for(const [query,href]of queries){await page.locator('.hub-tools-search input').fill(query);assert.ok(await page.locator(`[data-tools-results] a[href="${href}"]`).count(),query+' '+locale);}
  for(const [key,href]of queries.slice(0,7)){
   // Search the translated name even from the English interface.
   const arabic={Vault:'الخزنة','Secure Notes':'ملاحظات','Passwords':'المرور','Encrypt Files':'تشفير','Authenticator':'المصادِق',Privacy:'الخصوصية',Recovery:'الاسترداد'}[key];
   await page.locator('.hub-tools-search input').fill(arabic);assert.ok(await page.locator(`[data-tools-results] a[href="${href}"]`).count(),arabic+' '+locale);
  }
  await page.locator('.hub-tools-search input').fill('no-results-zzzz');assert.equal(await page.locator('[data-tools-results] a').count(),0);assert.ok((await page.locator('.hub-no-results').innerText()).length>0);assert.ok((await page.locator('[role="status"]').allTextContents()).some(t=>t.includes('0')));
  if(w===390)await shot('empty-tools-'+locale);
  await page.locator('.hub-tools-search input').fill('');
  const navBefore=await page.locator('.app-bottom-nav').boundingBox();
  await page.locator('.app-scroll-region').evaluate(el=>el.scrollTop=el.scrollHeight);await page.waitForTimeout(30);
  const last=await page.locator('[data-tools-results] a').last().boundingBox();const navAfter=await page.locator('.app-bottom-nav').boundingBox();
  assert.ok(Math.abs(navBefore.y-navAfter.y)<1,'footer fixed');assert.ok(last.y+last.height<=navAfter.y,'last tool clears footer');
  await page.locator('.app-scroll-region').evaluate(el=>el.scrollTop=0);
  await shot(`tools-${w}-${h}-${locale}`);report.screens.push({route:'/tools',locale,w,h,...await metrics()});
  for(const route of ['/','/secure-access-login','/home']){await open(route,locale);await page.waitForTimeout(1500);await shot(`${route==='/'?'splash':route.slice(1)}-${w}-${h}-${locale}`);const g=await metrics();report.screens.push({route,locale,w,h,...g});assert.equal(g.docWidth,w);assert.ok(g.mainWidth<=g.mainClient+1,'primary screen inner overflow');if(route==='/home'){assert.equal(await page.locator('.hub-services a').count(),8);await page.locator('.app-scroll-region').evaluate(el=>el.scrollTop=el.scrollHeight);const last=await page.locator('.hub-services a').last().boundingBox(),footer=await page.locator('.app-bottom-nav').boundingBox();assert.ok(last.y+last.height<=footer.y,'Home footer clearance');assert.ok(await page.locator('.hub-service-copy >span').evaluateAll(els=>els.every(el=>el.scrollWidth<=el.clientWidth+1)),'Home title width');}if(g.mainWidth>g.mainClient+1)report.warnings.push({route,locale,w,reason:'inner content overflow',g});}
 }
 // Navigate every displayed Tools destination using the actual links, both languages.
 for(const locale of ['en','ar']){await open('/tools',locale);await page.locator('[data-tool-category=all]').click();const destinations=await page.locator('[data-tools-results] a').evaluateAll(els=>els.map(el=>el.getAttribute('href')));for(const href of destinations){await open('/tools',locale);await page.locator('[data-tool-category=all]').click();await page.locator(`[data-tools-results] a[href="${href}"]`).click();await page.locator('main:not([data-screen="TOOLS"])').waitFor();assert.equal(new URL(page.url()).pathname,href);}}
 report.checks.push('All 34 Tools destinations clicked in AR and EN (68 link navigations); all viewport query/empty/footer assertions passed.');
 // Inspect all existing screen routes at a real 390x844 viewport, both locales.
 await page.setViewportSize({width:390,height:844});
 for(const locale of ['en','ar'])for(const mission of missions){await open(mission.route,locale);const g=await metrics();assert.equal(g.docWidth,390);assert.ok(g.mainWidth<=g.mainClient+1,'mission inner overflow '+mission.id+' '+locale);if(g.mainWidth>g.mainClient+1)report.warnings.push({id:mission.id,locale,reason:'inner content overflow',g});await shot(`mission-${mission.id}-${locale}`);}
 report.checks.push('44 routes opened in each locale; real screenshots, horizontal document checks (88 pages). Not pixel acceptance of all pages.');
 await open('/home','en');await page.evaluate(()=>window.__rain=document.querySelector('[data-persistent-atmosphere]'));
 const frame=()=>page.locator('.app-code-rain span').evaluateAll(els=>els.map(el=>({transform:getComputedStyle(el).transform,y:el.getBoundingClientRect().y,opacity:getComputedStyle(el).opacity})));
 const a=await frame();await shot('rain-home-frame-a');await page.waitForTimeout(1000);const b=await frame();await shot('rain-home-frame-b');assert.ok(b.some((el,i)=>el.y>a[i].y),'positive Y movement');
 await page.locator('.app-bottom-nav a[href="/tools"]').click();await page.locator('[data-tools-results]').waitFor();assert.ok(await page.evaluate(()=>window.__rain===document.querySelector('[data-persistent-atmosphere]')));
 report.motion={rainFrames:[a,b],persistentAcrossNavigation:true};
 await open('/','en');
 const eyes=await page.locator('.stag-emblem').first().evaluate(el=>{const svg=el.querySelector('svg'),img=el.querySelector('img');return {image:img.getBoundingClientRect().toJSON(),overlay:svg.getBoundingClientRect().toJSON(),paths:[...svg.querySelectorAll('.stag-light-left,.stag-light-right')].map(p=>({d:p.getAttribute('d'),delay:getComputedStyle(p).animationDelay}))};});
 assert.deepEqual(eyes.image,eyes.overlay);
 await page.locator('.stag-eye-light').first().evaluate(el=>el.getAnimations({subtree:true}).forEach(a=>{a.pause();a.currentTime=300;}));await shot('eyes-0300ms');const eyeA=await page.locator('.stag-light-left').first().evaluate(el=>getComputedStyle(el).opacity);
 await page.locator('.stag-eye-light').first().evaluate(el=>el.getAnimations({subtree:true}).forEach(a=>a.currentTime=1700));await shot('eyes-1700ms');const eyeB=await page.locator('.stag-light-left').first().evaluate(el=>getComputedStyle(el).opacity);assert.notEqual(eyeA,eyeB);report.motion.eyes={...eyes,opacityFrames:[eyeA,eyeB],note:'overlay bounds and timing verified, exact contour-to-art alignment requires image review'};
 await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await page.locator('.app-code-rain span').first().evaluate(el=>getComputedStyle(el).animationName),'none');await shot('reduced-motion-splash');
 report.checks.push('Rain moves down, same host across navigation, eye opacity changes with independent delays, image/SVG bounds coincide, reduced-motion disables rain.');
 assert.equal(report.errors.length,0,'browser JS errors');await browser.close();
}
run().then(()=>{report.status='PASS asserted browser interactions; visual acceptance still requires comparison';fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(report.status,report.checks);}).catch(async e=>{await activeBrowser?.close();report.status='FAIL';report.failure=e.stack;fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));console.error(e);process.exitCode=1;});
