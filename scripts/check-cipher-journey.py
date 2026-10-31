"""Eight conceptual contracts and actual nonsecret metadata, without fake jobs."""
import pathlib
exec(pathlib.Path('scripts/check-living-v2.py').read_text().split("b('set','viewport'")[0])
b('set','media','light');b('set','viewport',1672,941);b('open','http://localhost:3000/home');b('wait','.dw-home')
b('eval','localStorage.setItem("knoux.language","en");localStorage.setItem("knoux.audio",JSON.stringify({ambient:false}));location.reload()');b('wait','.dw-home');b('wait',1700)
check('window.__preview=document.querySelector(".live-security-preview");window.__root=document.querySelector(".crypt-app-shell");window.__phases=[];window.__phaseObserver=new MutationObserver(rs=>{for(const r of rs)if(r.attributeName==="data-phase")window.__phases.push(window.__preview.dataset.phase)});window.__phaseObserver.observe(window.__preview,{attributes:true})')
b('record','start',out/'journeys-and-navigation.webm','--fps',20)
cases=[]
for route,service in [('file-cipher','ENCRYPT'),('vault','VAULT'),('notes','NOTES'),('passwords','PASSWORDS'),('key-forge','KEY_FORGE'),('authenticator','AUTHENTICATOR'),('privacy','PRIVACY'),('backup','BACKUP')]:
 b('click',f'.service-quick-dock a[href="/{route}"]');b('wait',f'[data-journey="{service}"]')
 check('const j=document.querySelector(".cipher-journey");if(j.dataset.mode!=="demo"||j.querySelector("[role=progressbar],.success,[data-stage=complete]"))throw Error("fake operation state");if([...j.querySelectorAll("li")].some(e=>e.dataset.stage!=="concept"))throw Error("fake progress");if(document.documentElement.scrollWidth>innerWidth)throw Error("overflow");if(document.querySelector(".crypt-app-shell")!==window.__root||document.querySelector(".live-security-preview")!==window.__preview)throw Error("orchestration remounted")')
 cases.append(service);b('screenshot',out/f'journey-{service.lower()}.png')
b('wait',1800)
check('window.__phaseObserver.disconnect();if(window.__phases.includes("ignition")||window.__phases.includes("dormant"))throw Error("route replayed ignition")')
b('record','stop')
b('click','.service-quick-dock a[href="/file-cipher"]');b('wait','.dw-dropzone')
fixture=out/'synthetic-queue.txt';fixture.write_text('Synthetic metadata only')
check('if(!document.querySelector(".cipher-journey small").textContent.includes("Queued files: 0"))throw Error("nonempty initial queue")')
b('upload','.dw-main-column input[type=file]',fixture)
check('if(!document.querySelector(".cipher-journey small").textContent.includes("Queued files: 1"))throw Error("queue count missing");if(document.querySelector(".cipher-journey").textContent.includes("synthetic-queue"))throw Error("filename in journey");if(!document.querySelector(".dw-inspector .dw-primary").disabled)throw Error("engine gate removed")')
for locale in ['en','ar']:
 b('eval',f'localStorage.setItem("knoux.language","{locale}")');b('reload');b('wait','.cipher-journey')
 for width in [1280,1672]:
  b('set','viewport',width,900)
  check('const j=document.querySelector(".cipher-journey");if(j.scrollWidth>j.clientWidth||document.documentElement.scrollWidth>innerWidth)throw Error("journey clipped");if(j.querySelectorAll("li").length!==5)throw Error("wrong cipher contract")')
 b('screenshot',out/f'journey-{locale}.png')
# Every newly introduced stage must translate, including non-cipher journeys.
for route in ['file-cipher','vault','notes','passwords','key-forge','authenticator','privacy','backup']:
 b('click',f'.service-quick-dock a[href="/{route}"]');b('wait','.cipher-journey')
 check('if([...document.querySelectorAll(".cipher-journey li span")].some(e=>/[A-Za-z]/.test(e.textContent)))throw Error("English journey stage in Arabic")')
b('set','media','light','reduced-motion');b('wait',100)
check('if(document.querySelector(".crypt-app-shell").dataset.motionRunning!=="false")throw Error("reduction failed");if(document.querySelector(".knoux-pulselink"))throw Error("pulse under reduction")')
b('set','media','light');b('set','viewport',1672,941)
(out/'journey-observations.json').write_text(json.dumps({'generatedBy':'CodeRabbit','services':cases,'locales':['en','ar'],'viewports':[1280,1672],'mode':'demo','queue':'actual metadata count only','routeIgnitionReplayed':False,'limits':'No actual backend progress or authenticated result is available; all stages conceptual.'},indent=2))
print('PASS: all8 distinct conceptual contracts, no fake progress/results, actual queue count, persistent roots/no repeated ignition, EN/AR, responsive and reduced motion.')
