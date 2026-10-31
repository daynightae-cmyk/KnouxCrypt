"""Check all canonical routes in the registered cloud Chromium Preview."""
import pathlib,re,subprocess,json,tempfile
root=pathlib.Path(__file__).resolve().parents[1]
def browser(*args):
 p=subprocess.run(['coderabbit-agent-browser',*args],text=True,capture_output=True)
 if p.returncode:raise AssertionError(p.stderr or p.stdout)
 return p.stdout
paths=dict(re.findall(r'([A-Z_]+): "([^"]+)"',(root/'src/config/screens.js').read_text()))
entries=re.findall(r'id: "([A-Z_]+)", suffix: "([^"]*)"',(root/'src/config/missionRoutes.js').read_text())
assert len(entries)==44
browser('set','viewport','1440','900')
count=0
for locale in ['en','ar']:
 browser('open','http://localhost:3000/home')
 browser('eval',f'localStorage.setItem("knoux.language","{locale}")')
 for mission,suffix in entries:
  path=paths[mission]+('/project' if mission=='NOTES_EDITOR' else '/sample-1' if suffix else '')
  browser('open','http://localhost:3000'+path)
  browser('wait','main')
  browser('eval','(()=>{if(document.documentElement.scrollWidth>innerWidth)throw Error("document overflow");const main=document.querySelector("main");if(main.scrollWidth>main.clientWidth+3)throw Error("main overflow");if(document.querySelector(".app-load-error"))throw Error("route boundary error");for(const logo of document.querySelectorAll(".stag-emblem")){const a=logo.querySelector("img").getBoundingClientRect(),b=logo.querySelector("svg").getBoundingClientRect();for(const k of ["left","top","width","height"])if(Math.abs(a[k]-b[k])>.5)throw Error("logo overlay bounds "+k);}return "PASS"})()')
  count+=1
browser('open','http://localhost:3000/home')
browser('wait','.dw-home')
browser('set','media','reduced-motion')
browser('eval','(()=>{if(getComputedStyle(document.querySelector(".app-code-rain span")).animationName!=="none")throw Error("motion not reduced");return "PASS"})()')
print(f'PASS: {count} canonical routes at 1440x900 in EN/AR without main/document horizontal overflow; reduced-motion rain disabled. Not Windows runtime or visual approval.')
