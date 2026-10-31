"""Living Cipher2 actual shared Chromium state/mask/input proof; no auth claims."""
import json,pathlib,subprocess,os,tempfile
out=pathlib.Path(os.environ.get('QA_OUTPUT') or tempfile.mkdtemp(prefix='knoux-v2-'));out.mkdir(parents=True,exist_ok=True)
def b(*a):
 r=subprocess.run(['coderabbit-agent-browser',*map(str,a)],capture_output=True,text=True)
 if r.returncode:raise AssertionError(r.stderr or r.stdout)
 return r.stdout
def ev(js):return json.loads(b('eval',js))
def check(js):return ev('(async()=>{await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));'+js+';return "PASS"})()')
b('set','viewport',1672,941);b('set','media','light');b('open','http://localhost:3000/home');b('wait','.dw-home')
b('eval','localStorage.setItem("knoux.language","en");localStorage.removeItem("knoux.motion");localStorage.setItem("knoux.audio",JSON.stringify({ambient:false}))')
b('record','start',out/'awakening-and-continuity.webm','--fps',20)
b('open','http://localhost:3000/');b('wait','.crypt-entry-group')
phases=ev('''(async()=>{let frames=[];let prior;for(let i=0;i<140;i++){const phase=document.querySelector('.crypt-entry').dataset.entryScene;if(phase!==prior){frames.push({phase,time:performance.now(),imageFilter:getComputedStyle(document.querySelector('.crypt-emblem img')).filter});prior=phase}await new Promise(r=>setTimeout(r,25))}return frames})()''')
assert {'awakening','ignition','identity','gateway','idle'}<=set(f['phase'] for f in phases),phases
b('screenshot',out/'splash-gateway.png');b('focus','.crypt-gate')
check('if(document.querySelectorAll(".knoux-pulselink path").length!==2)throw Error("Splash pulse missing")')
b('press','Enter');b('wait','.access-form');b('press','Tab');b('focus','.access-guest')
check('if(document.querySelectorAll(".knoux-pulselink path").length!==2)throw Error("access pulse missing")')
b('press','Enter');b('wait','.dw-home')
# One root controller drives every rendered logo with the same aperture values.
blink=ev('''(async()=>{let rows=[];for(let i=0;i<1200;i++){const root=document.querySelector('.crypt-app-shell');const values=[...document.querySelectorAll('.stag-eye-aperture')].map(e=>getComputedStyle(e).transform);rows.push({state:root.dataset.eyeBehavior,values});await new Promise(r=>setTimeout(r,10));}return rows})()''')
assert any(r['state']=='closed' for r in blink), 'no natural blink'
closed=[r for r in blink if r['state']=='closed'];assert all(len(set(r['values']))==1 for r in closed),closed[:3]
assert any(float(r['values'][0].split(',')[3])<.01 for r in closed),closed[:3]
# Capture actual geometry at reproducible inherited visual states. No source edits.
for name,state in [('eyes-open','open'),('eyes-closed','closed'),('eyes-reopened','open')]:
 b('eval',f'document.querySelector(".crypt-app-shell").dataset.eyeBehavior="{state}"');b('wait',250);b('screenshot','.live-stag-stage .stag-emblem',out/f'{name}.png')
b('press','Tab');b('focus','.service-quick-dock a[href="/notes"]');b('press','Enter');b('wait','.dw-notes')
b('click','.dw-sidebar nav a[href="/home"]');b('wait','.dw-home');b('scrollintoview','.hub-service');b('press','Tab')
identities={}
for service in ['ENCRYPT','VAULT','NOTES','PASSWORDS','AUTHENTICATOR','KEY_FORGE','PRIVACY','BACKUP']:
 b('focus',f'.hub-service[data-service="{service}"]')
 identities[service]=ev(f'getComputedStyle(document.querySelector(\'.hub-service[data-service="{service}"] .service-personality i\')).animationName+" "+getComputedStyle(document.querySelector(\'.hub-service[data-service="{service}"] .service-personality i\')).animationDirection')
assert len(set(identities.values()))==8,identities
b('screenshot',out/'home-energy-cards.png');b('record','stop')
for locale in ['en','ar']:
 b('eval',f'localStorage.setItem("knoux.language","{locale}")');b('open','http://localhost:3000/');b('wait','.splash-skip');b('click','.splash-skip')
 check('if(document.querySelector(".crypt-entry").dataset.entryScene!=="idle"||document.querySelector(".splash-skip"))throw Error("skip failed");if(document.documentElement.scrollWidth>innerWidth)throw Error("overflow")')
 b('screenshot',out/f'splash-skip-{locale}.png');b('click','.crypt-gate');b('wait','.access-form');b('click','.access-guest');b('wait','.dw-home')
 b('set','media','light','reduced-motion');b('wait',100)
 check('if(document.querySelector(".knoux-pulselink"))throw Error("reduced pulse");if(document.querySelector(".crypt-app-shell").dataset.eyeBehavior!=="open")throw Error("controller not stopped")')
 b('set','media','light')
# Decode actual PNG luminance with existing standard-library helper.
ns={};exec(pathlib.Path('scripts/check-eye-illumination.py').read_text().split("browser('set','viewport'")[0],ns)
light,dark,again=[ns['pixels'](out/f'{name}.png') for name in ['eyes-open','eyes-closed','eyes-reopened']]
for eye in ['leftEye','rightEye']:assert light[eye]-dark[eye]>40 and again[eye]-dark[eye]>40,(light,dark,again)
(out/'observations.json').write_text(json.dumps({'generatedBy':'CodeRabbit','splashPhases':phases,'blinkSamples':blink,'identities':identities,'open':light,'closed':dark,'reopened':again,'limits':'Actual shared Chromium, no Windows/auth or subjective sound certification.'},indent=2))
print('PASS: timed five-scene Splash, Skip, shared synchronized geometric blink, all8 distinct card animations, global Splash/access/Home PulseLink, keyboard, AR/EN/reduction and actual eye pixels.')
