"""Exercise the customer Preview browser; requires a registered Vite service."""
import json, pathlib, subprocess, os, tempfile
out = pathlib.Path(os.environ.get('QA_OUTPUT') or tempfile.mkdtemp(prefix='knoux-desktop-qa-'))
out.mkdir(parents=True, exist_ok=True)

def browser(*args):
    result = subprocess.run(['coderabbit-agent-browser', *args], text=True, capture_output=True)
    if result.returncode: raise AssertionError(result.stderr or result.stdout)
    return result.stdout

def check(js):
    return browser('eval', '(()=>{'+js+';return "PASS"})()')

browser('open', 'http://localhost:3000/home')
for locale in ['en','ar']:
    browser('eval', f'localStorage.setItem("knoux.language", "{locale}")')
    for width,height in [(1280,800),(1440,900),(1920,1080)]:
        browser('set','viewport',str(width),str(height))
        for route,screen in [('home','HOME'),('file-cipher','FILE_CIPHER'),('vault','SHADOW_VAULT'),('notes','SECURE_NOTES')]:
            browser('open', 'http://localhost:3000/'+route)
            browser('wait', '.dw-page')
            check(f'if(document.documentElement.lang!=="{locale}")throw Error("locale");if(document.documentElement.scrollWidth>innerWidth)throw Error("document overflow"); const p=document.querySelector(".dw-page");if(p.scrollWidth>p.clientWidth+2)throw Error("page overflow "+p.scrollWidth+"/"+p.clientWidth);if(!document.querySelector("[data-screen={screen}]"))throw Error("wrong route")')
        browser('screenshot', str(out/f'notes-{locale}-{width}.png'))
    browser('open','http://localhost:3000/home')
    browser('wait','.dw-home')
    check('if(document.querySelectorAll(".dw-home .hub-service").length!==8)throw Error("home cardinality");window.__qaAtmosphere=document.querySelector("[data-persistent-atmosphere]")')
    browser('press','Control+k')
    check('if(document.activeElement!==document.querySelector(".dw-command-search input"))throw Error("command focus")')
    browser('fill','.dw-command-search input','HMAC')
    check('if(![...document.querySelectorAll("#desktop-command-results a")].some(a=>a.pathname==="/tools/hmac"))throw Error("search result")')
    browser('press','Escape')
    check('if(document.querySelector(".dw-command-results"))throw Error("escape did not dismiss")')
    browser('click','a.hub-service-notes')
    browser('wait','.dw-notes')
    check('if(window.__qaAtmosphere!==document.querySelector("[data-persistent-atmosphere]"))throw Error("atmosphere remounted")')
    browser('click','.dw-note-list>.dw-primary')
    browser('fill','.dw-note-editor>label input','Synthetic desktop QA draft')
    browser('fill','.dw-note-editor textarea','Synthetic content. No real secrets.')
    check('if(document.querySelector(".dw-note-editor header h1").textContent!=="Synthetic desktop QA draft")throw Error("draft edit")')
    browser('click','.dw-note-editor header button')
    check('if(document.querySelector(".dw-note-editor header button").getAttribute("aria-pressed")!=="true")throw Error("pin")')
    browser('open','http://localhost:3000/file-cipher')
    browser('wait','.dw-dropzone')
    fixture=out/'synthetic-fixture.txt';fixture.write_text('synthetic file metadata QA')
    browser('upload','.dw-main-column input[type=file]',str(fixture))
    check('if(!document.querySelector(".dw-file-row").textContent.includes("synthetic-fixture.txt"))throw Error("file queue");if(!document.querySelector(".dw-selected-file").textContent.includes("synthetic-fixture.txt"))throw Error("inspector");if(!document.querySelector(".dw-inspector .dw-primary").disabled)throw Error("unavailable engine enabled")')
    browser('upload','.dw-main-column input[type=file]',str(fixture))
    check('if(document.querySelectorAll(".dw-file-row").length!==1)throw Error("duplicate queued")')
    browser('click','.dw-file-row>button:last-child')
    check('if(document.querySelector(".dw-selected-file"))throw Error("stale inspector after duplicate removal")')
    check('if(document.querySelector(".dw-file-row"))throw Error("clear queue")')
    browser('set','viewport','390','844')
    browser('open','http://localhost:3000/home')
    browser('wait','.hub-services')
    check('if(document.querySelector(".dw-page"))throw Error("desktop screen at mobile width");if(document.documentElement.scrollWidth>innerWidth)throw Error("mobile overflow")')
print('PASS: 24 desktop viewport/locale/route checks; command search, Escape, eight Home cards, persistent atmosphere, note CRUD draft/pin, file metadata queue/clear, unavailable engine, mobile fallback in EN/AR.')
