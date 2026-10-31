"""Motion/runtime assertions through the registered customer Chromium Preview.
No security engines or audio mix are certified by these checks.
"""
import json, os, pathlib, subprocess, tempfile
out=pathlib.Path(os.environ.get('QA_OUTPUT') or tempfile.mkdtemp(prefix='knoux-live-qa-'));out.mkdir(parents=True,exist_ok=True)
def browser(*args):
    r=subprocess.run(['coderabbit-agent-browser',*map(str,args)],capture_output=True,text=True)
    if r.returncode: raise AssertionError(r.stderr or r.stdout)
    return r.stdout

def check(js):
    return browser('eval','(async()=>{await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));'+js+';return "PASS"})()')

browser('set','media','light')
browser('set','viewport',1672,941)
browser('open','http://localhost:3000/home');browser('wait','.live-security-preview')
browser('eval','localStorage.setItem("knoux.language","en");localStorage.removeItem("knoux.motion");location.reload()')
browser('wait','.live-home')
check('if(document.querySelectorAll(".service-quick-dock a").length!==8)throw Error("dock cardinality");if(document.querySelectorAll("[data-persistent-atmosphere]").length!==1)throw Error("duplicate atmosphere");window.__live=document.querySelector(".live-security-preview");window.__atmosphere=document.querySelector("[data-persistent-atmosphere]");if(!window.__live.textContent.includes("no user files processed"))throw Error("unlabeled demo")')
# Choosing a demonstration cannot change route, authorize a vault, or run a job.
browser('select','.live-preview-controls select','VAULT')
check('if(location.pathname!=="/home"||!document.querySelector(".live-demo-vault").textContent.includes("Locked"))throw Error("demo isolation")')
browser('select','.live-preview-controls select','HOME')
# Measure actual animation transforms at separated times, then pause and compare.
check('const orbit=document.querySelector(".live-rear-orbit");const before=getComputedStyle(orbit).transform;await new Promise(r=>setTimeout(r,250));if(before===getComputedStyle(orbit).transform)throw Error("orbit not moving")')
browser('click','.live-preview-controls button:first-of-type')
check('const orbit=document.querySelector(".live-rear-orbit");const before=getComputedStyle(orbit).transform;await new Promise(r=>setTimeout(r,200));if(before!==getComputedStyle(orbit).transform)throw Error("pause ineffective")')
browser('click','.live-preview-controls button:first-of-type')
browser('click','.live-preview-controls button:last-of-type')
check('await new Promise(r=>setTimeout(r,1500));if(Number(getComputedStyle(document.querySelector(".live-stag-stage .stag-eye-envelope")).opacity)>.01)throw Error("extinction")')
browser('screenshot',out/'eyes-dormant.png')
frames=[]
for label in ['awakening','ignition','idle']:
    # Replay through actual controls for each capture, avoiding screenshot latency
    # changing the phase we intend to observe.
    browser('click','.live-preview-controls button:last-of-type')
    browser('wait',f'.live-security-preview[data-phase="{label}"]')
    frames.append(json.loads(browser('eval','({phase:document.querySelector(".live-security-preview").dataset.phase,opacity:getComputedStyle(document.querySelector(".live-stag-stage .stag-eye-envelope")).opacity,orbit:getComputedStyle(document.querySelector(".live-rear-orbit")).transform})')))
    assert frames[-1]['phase']==label, frames[-1]
    browser('screenshot',out/f'eyes-{label}.png')
    if label!='idle':
        browser('click','.live-preview-controls button:last-of-type');browser('wait',1500)
check('const stag=document.querySelector(".live-stag-stage .stag-emblem");const [left,right]=stag.querySelectorAll(".stag-eye-core");if(left.getBBox().y!==677||right.getBBox().y!==677)throw Error("eye geometry");if(stag.querySelectorAll(".stag-eye-core").length!==2)throw Error("missing eye");if(!stag.querySelector("img").src.includes("knoux-stag.png"))throw Error("source artwork replaced")')
# Real route navigation preserves preview/atmosphere and keeps the dock accessible.
browser('click','.service-quick-dock a[href="/notes"]');browser('wait','.dw-notes')
check('if(window.__live!==document.querySelector(".live-security-preview")||window.__atmosphere!==document.querySelector("[data-persistent-atmosphere]"))throw Error("persistent layers remounted");if(!document.querySelector(".live-compact"))throw Error("tool preview not compact");const dock=document.querySelector(".service-quick-dock");window.__dockTop=dock.getBoundingClientRect().top;document.querySelector(".dw-content").scrollTop=500')
check('const dock=document.querySelector(".service-quick-dock");if(dock.getBoundingClientRect().top!==window.__dockTop||dock.getBoundingClientRect().bottom>innerHeight)throw Error("dock moved with content")')
browser('screenshot',out/'sticky-dock-notes.png')
browser('focus','.service-quick-dock a[href="/file-cipher"]');browser('press','Enter');browser('wait','.dw-dropzone')
check('if(location.pathname!=="/file-cipher")throw Error("keyboard navigation");if(!document.querySelector(".dw-inspector .dw-primary").disabled)throw Error("demo enabled encryption")')
# Native modal keyboard behavior and persisted preferences.
browser('click','.experience-settings-toggle');browser('wait','dialog[open]')
browser('select','.experience-settings select','off')
check('if(document.querySelector(".crypt-app-shell").dataset.motionQuality!=="off")throw Error("motion preference");if(getComputedStyle(document.querySelector(".live-rear-orbit")).animationName!=="none")throw Error("off still animated")')
browser('press','Escape')
check('if(document.querySelector("dialog[open]"))throw Error("Escape did not close modal");if(document.activeElement!==document.querySelector(".experience-settings-toggle"))throw Error("modal focus not restored")')
browser('reload');browser('wait','.live-security-preview')
check('if(document.querySelector(".crypt-app-shell").dataset.motionQuality!=="off")throw Error("motion not persisted")')
browser('click','.experience-settings-toggle');browser('select','.experience-settings select','cinematic');browser('press','Escape')
browser('set','media','light','reduced-motion')
check('if(document.querySelector(".crypt-app-shell").dataset.motionQuality!=="off")throw Error("system reduction ignored");if(getComputedStyle(document.querySelector(".live-rear-orbit")).animationName!=="none")throw Error("system reduction animated")')
browser('set','media','light')
# All ten scene types and no clipping in either direction at supported widths.
for locale in ['en','ar']:
    browser('eval',f'localStorage.setItem("knoux.language","{locale}")');browser('reload');browser('wait','.live-security-preview')
    for width,height in [(1280,800),(1440,900),(1672,941),(1920,1080)]:
        browser('set','viewport',width,height)
        for route,kind in [('home','home'),('file-cipher','cipher'),('vault','vault'),('notes','notes'),('passwords','passwords'),('authenticator','authenticator'),('key-forge','keys'),('privacy','privacy'),('backup','backup'),('tools','tools')]:
            browser('open','http://localhost:3000/'+route);browser('wait','.live-security-preview')
            check(f'if(document.querySelector(".live-security-preview").dataset.liveScene!=="{kind}")throw Error("scene mapping");if(document.documentElement.scrollWidth>innerWidth)throw Error("document overflow");const box=document.querySelector(".live-security-preview").getBoundingClientRect();for(const e of document.querySelectorAll(".live-preview-controls select,.live-preview-controls button,.live-scene-panel>a")){{const b=e.getBoundingClientRect();if(b.left<box.left||b.right>box.right||b.top<box.top||b.bottom>box.bottom)throw Error("clipped preview control");}}if(document.querySelector(".service-quick-dock").getBoundingClientRect().bottom>innerHeight)throw Error("dock inaccessible");if(document.documentElement.dir!=="{("rtl" if locale=="ar" else "ltr")}")throw Error("direction")')
    browser('set','viewport',1672,941);browser('open','http://localhost:3000/home');browser('wait','.live-home');browser('screenshot',out/f'home-{locale}.png')
(out/'motion-observations.json').write_text(json.dumps({'generatedBy':'CodeRabbit','frames':frames,'matrixCases':80,'limits':'Browser motion/layout assertions; no Windows or cryptographic security certification.'},indent=2))
print('PASS: real orbit motion/pause, extinction/ignition frames, two calibrated eye layers, demo isolation, persistent layers, sticky dock, keyboard/modal, saved motion preference, OS reduction, 80 scene/viewport/locale cases. Evidence:',out)
