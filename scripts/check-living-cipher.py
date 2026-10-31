"""Real Preview DOM/SVG masks, Splash access boundary and PulseLink input QA."""
import json,pathlib,subprocess,os,tempfile
out=pathlib.Path(os.environ.get('QA_OUTPUT') or tempfile.mkdtemp(prefix='knoux-living-'));out.mkdir(parents=True,exist_ok=True)
def b(*args):
 r=subprocess.run(['coderabbit-agent-browser',*map(str,args)],capture_output=True,text=True)
 if r.returncode:raise AssertionError(r.stderr or r.stdout)
 return r.stdout
def check(js):return json.loads(b('eval','(async()=>{await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));'+js+';return "PASS"})()'))
b('set','media','light');b('set','viewport',1672,941);b('open','http://localhost:3000/');b('wait','.crypt-entry-group')
b('eval','localStorage.setItem("knoux.language","en");localStorage.setItem("knoux.audio",JSON.stringify({ambient:false}));localStorage.removeItem("knoux.motion");location.reload()');b('wait','.crypt-entry-group')
b('record','start',out/'splash-blink-pulselink.webm','--fps',20)
b('wait',2500);b('screenshot',out/'splash-en.png')
check('if(!document.querySelector(".splash-access-state").textContent.includes("authentication required"))throw Error("false authentication");if(document.querySelector(".app-sound-strip").dataset.audioState!=="off")throw Error("forced audio")')
b('focus','.crypt-gate');b('press','Enter');b('wait','.access-form')
check('if(location.pathname!=="/secure-access-login")throw Error("Splash bypassed access");if(!document.querySelector(".access-sample").textContent.includes("demo"))throw Error("access boundary hidden")')
# Explicit guest remains a visual demo; no fake successful authentication.
b('click','.access-guest');b('wait','.dw-home');b('wait',2200)
check('if(!document.querySelector(".app-guest-session"))throw Error("guest not labeled")')
# Observe a real automatic close/open over time across all mounted logo instances.
observations=json.loads(b('eval','''(async()=>{const logos=[...document.querySelectorAll('.stag-emblem')];const samples=[];for(let i=0;i<110;i++){samples.push(logos.map(e=>getComputedStyle(e.querySelector('.stag-eye-aperture')).transform));await new Promise(r=>setTimeout(r,100));}return {logos:logos.length,samples}})()'''))
assert all(any(float(sample[i].split(',')[3])<.1 for sample in observations['samples']) for i in range(observations['logos'])),observations
# Deterministic captures seek the same real CSS animation, not a replacement image.
for name,ms in [('eyes-open',1000),('eyes-closed',8670),('eyes-reopened',1000)]:
 b('eval',f'for(const e of document.querySelectorAll(".stag-eye-aperture"))for(const a of e.getAnimations()){{a.pause();a.currentTime={ms}}}')
 b('screenshot','.live-stag-stage .stag-emblem',out/f'{name}.png')
b('eval','for(const e of document.querySelectorAll(".stag-eye-aperture"))for(const a of e.getAnimations())a.play()')
b('focus','.service-quick-dock a[href="/notes"]')
check('const p=document.querySelector(".knoux-pulselink");if(!p||p.querySelectorAll("path").length!==2||getComputedStyle(p).pointerEvents!=="none")throw Error("keyboard eye-to-card pulse missing");if(location.pathname!=="/home")throw Error("focus navigated")')
b('screenshot',out/'pulselink-keyboard.png');b('press','Enter');b('wait','.dw-notes')
b('click','.dw-sidebar nav a[href="/home"]');b('wait','.dw-home')
b('scrollintoview','.hub-service');b('press','Tab');b('focus','.hub-service');
check('if(!document.querySelector(".hub-service:focus .energy-vein rect"))throw Error("energy border missing");if(!getComputedStyle(document.querySelector(".hub-service:focus .energy-vein rect")).animationName.includes("knoux-vein"))throw Error("energy not moving")')
b('screenshot',out/'energy-vein-card.png');b('record','stop')
for locale in ['en','ar']:
 b('eval',f'localStorage.setItem("knoux.language","{locale}")');b('open','http://localhost:3000/');b('wait','.crypt-entry-group')
 check(f'if(document.documentElement.dir!=="{("rtl" if locale=="ar" else "ltr")}")throw Error("direction");if(document.documentElement.scrollWidth>innerWidth)throw Error("overflow")')
 b('screenshot',out/f'splash-{locale}.png');b('click','.crypt-gate');b('wait','.access-form');b('screenshot',out/f'access-{locale}.png')
 b('click','.access-guest');b('wait','.dw-home')
 b('set','media','light','reduced-motion');b('focus','.service-quick-dock a[href="/notes"]')
 check('if(document.querySelector(".knoux-pulselink"))throw Error("reduced motion pulse");if([...document.querySelectorAll(".stag-eye-aperture")].some(e=>getComputedStyle(e).animationName!=="none"))throw Error("reduced blink")')
 b('open','http://localhost:3000/');b('wait','.crypt-gate');b('click','.crypt-gate');b('wait','.access-form');b('set','media','light')
# Pixel luminance uses the same standard-library PNG decoder as existing eye QA.
namespace={};decoder=pathlib.Path('scripts/check-eye-illumination.py').read_text().split("browser('set','viewport'")[0];exec(decoder,namespace)
bright=namespace['pixels'](out/'eyes-open.png');dark=namespace['pixels'](out/'eyes-closed.png');again=namespace['pixels'](out/'eyes-reopened.png')
for eye in ['leftEye','rightEye']:assert bright[eye]-dark[eye]>40 and again[eye]-dark[eye]>40,(bright,dark,again)
(out/'observations.json').write_text(json.dumps({'generatedBy':'CodeRabbit','logoInstances':observations['logos'],'automaticBlinkSamples':observations['samples'],'open':bright,'closed':dark,'reopened':again,'locales':['en','ar'],'limits':'Native shared Chromium CSS/DOM and pixels; video has no audio. No real authenticated session, Windows or subjective mix verification.'},indent=2))
print('PASS: Splash access boundary, real automatic eye closures on all logo instances, physical eye close/reopen pixels, two eye-to-card paths, keyboard routes, energy veins, EN/AR and reduced motion.')
