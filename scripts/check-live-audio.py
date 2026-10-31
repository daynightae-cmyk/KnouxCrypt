"""Actual shared Chromium Web Audio observations, with test-only graph probes.
Gain/RMS measurements verify running audio, not subjective listening quality.
"""
import json,pathlib,os,subprocess,tempfile
out=pathlib.Path(os.environ.get('QA_OUTPUT') or tempfile.mkdtemp(prefix='knoux-audio-qa-'));out.mkdir(parents=True,exist_ok=True)
def browser(*args):
    if args[0] in ['click','check','uncheck']:subprocess.run(['coderabbit-agent-browser','scrollintoview',args[1]],capture_output=True,check=True)
    r=subprocess.run(['coderabbit-agent-browser',*map(str,args)],capture_output=True,text=True)
    if r.returncode:raise AssertionError(r.stderr or r.stdout)
    return r.stdout

def evaluate(js):return json.loads(browser('eval',js))
def check(js):return browser('eval','(async()=>{await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));'+js+';return "PASS"})()')
def pending_startup_cancel():
    browser('open','http://localhost:3000/home');browser('wait','.dw-home')
    browser('eval','localStorage.removeItem("knoux.audio");location.reload()');browser('wait','.dw-home')
    browser('eval',"""(()=>{const Base=window.AudioContext;window.AudioContext=class extends Base{constructor(){super();this.__gains=[];window.__pendingContext=this}createGain(){const g=super.createGain();this.__gains.push(g);return g}resume(){return new Promise(resolve=>{window.__releasePending=()=>Base.prototype.resume.call(this).then(resolve)})}}})()""")
    browser('click','.app-sound-toggle');browser('click','.app-sound-toggle')
    check('if(JSON.parse(localStorage.getItem("knoux.audio")).ambient!==false)throw Error("cannot cancel pending startup");window.__releasePending()')
    browser('wait',250)
    check('if(document.querySelector(".app-sound-strip").dataset.audioState!=="off"||window.__pendingContext.__gains[0].gain.value!==0)throw Error("cancelled startup became audible")')
    print('PASS: pending audio startup cancelled through actual UI; preference off and native master gain zero after delayed resume.')
if os.environ.get('QA_PENDING_ONLY'):
    pending_startup_cancel();raise SystemExit(0)
browser('set','viewport',1672,941);browser('set','media','light');browser('open','http://localhost:3000/home');browser('wait','.dw-home')
browser('eval','localStorage.removeItem("knoux.audio");localStorage.setItem("knoux.language","en");location.reload()');browser('wait','.dw-home')
check('if(JSON.parse(localStorage.getItem("knoux.audio")).ambient!==false)throw Error("not muted by default")')
# Spy on the real native audio context without exposing any application secret.
browser('eval','''(()=>{const Base=window.AudioContext;window.__audioContexts=[];window.AudioContext=class extends Base{constructor(...a){super(...a);this.__gains=[];this.__osc=[];window.__audioContexts.push(this)}createGain(){const g=super.createGain();this.__gains.push(g);return g}createOscillator(){const o=super.createOscillator();o.__ended=false;o.addEventListener('ended',()=>o.__ended=true);this.__osc.push(o);return o}}})()''')
check('if(window.__audioContexts.length!==0)throw Error("default created audio resources")')
browser('click','.app-sound-toggle');browser('wait','[data-audio-state="running"]')
observations={'generatedBy':'CodeRabbit','environment':'Actual cloud Chromium Web Audio; synthetic procedural sound only','gains':[]}
for delay in [100,1100,2600]:
    browser('wait',delay)
    observations['gains'].append(evaluate('({time:window.__audioContexts[0].currentTime,master:window.__audioContexts[0].__gains[0].gain.value,ambient:window.__audioContexts[0].__gains[1].gain.value})'))
assert 0<observations['gains'][0]['master']<observations['gains'][-1]['master']<=.451, observations
check('''const c=window.__audioContexts[0];if(c.state!=='running')throw Error('context not running');window.__audioProbe=c.createAnalyser();window.__audioProbe.fftSize=2048;c.__gains[0].connect(window.__audioProbe);const sink=c.createGain();sink.gain.value=0;window.__audioProbe.connect(sink);sink.connect(c.destination);''')
browser('wait',100)
observations['ambientRms']=evaluate('(()=>{const data=new Float32Array(2048);window.__audioProbe.getFloatTimeDomainData(data);return Math.sqrt(data.reduce((sum,v)=>sum+v*v,0)/data.length)})()')
assert .0000001<observations['ambientRms']<.05,observations
browser('click','.dw-collapse');browser('wait',200)
observations['clickFrequencies']=evaluate('window.__audioContexts[0].__osc.slice(-2).map(o=>o.frequency.value)')
assert observations['clickFrequencies']==[780,1170],observations
browser('wait',200);browser('click','.service-quick-dock a[href="/notes"]');browser('wait','.dw-notes')
observations['navFrequencies']=evaluate('window.__audioContexts[0].__osc.slice(-2).map(o=>o.frequency.value)')
assert observations['navFrequencies']!=observations['clickFrequencies'], observations
check('window.__audioTime=window.__audioContexts[0].currentTime;window.__livePreview=document.querySelector(".live-security-preview")')
for route in ['passwords','authenticator','key-forge','privacy','backup','file-cipher','vault','notes']:
    browser('click',f'.service-quick-dock a[href="/{route}"]');browser('wait','.dw-page')
check('if(window.__audioContexts.length!==1)throw Error("duplicate audio context");if(window.__audioContexts[0].currentTime<=window.__audioTime)throw Error("audio clock restarted");if(window.__livePreview!==document.querySelector(".live-security-preview"))throw Error("preview remounted")')
browser('wait',2400)
observations['activeSourcesAfterNavigation']=evaluate('window.__audioContexts[0].__osc.filter(o=>!o.__ended).length')
assert observations['activeSourcesAfterNavigation']==6,observations
# Switching to a task-owned tab exercises actual document visibility/focus.
tabs=json.loads(browser('tab','list','--json'))['data']['tabs']
original_tab=next(t['tabId'] for t in tabs if t['active'])
browser('eval',"setTimeout(()=>{window.__hiddenAudio={hidden:document.hidden,focused:document.hasFocus(),master:window.__audioContexts[0].__gains[0].gain.value}},2600)")
try:
    browser('tab','new','--label','knoux-audio-focus-test','about:blank')
    browser('wait',3300)
    browser('tab',original_tab)
    observations['background']=evaluate('window.__hiddenAudio')
    assert observations['background']['hidden'] or not observations['background']['focused'],observations
    assert observations['background']['master']<.035,observations
finally:
    browser('tab','close','knoux-audio-focus-test')
    browser('tab',original_tab)
browser('click','.experience-settings-toggle');browser('select','.experience-audio select','silent')
browser('wait',3400)
check('if(document.querySelector(".app-sound-strip").dataset.audioState==="blocked")throw Error("silent mode reported failure")')
observations['silentMaster']=evaluate('window.__audioContexts[0].__gains[0].gain.value')
assert observations['silentMaster']<.03,observations
browser('select','.experience-audio select','subtle');browser('wait',200)
browser('check','[name=audio-master-mute]')
browser('wait',3400)
check('if(document.querySelector(".app-sound-strip").dataset.audioState==="blocked")throw Error("master mute reported failure")')
browser('uncheck','[name=audio-master-mute]');browser('wait',250);browser('wait','[data-audio-state="running"]')
check('if(window.__audioContexts[0].state!=="running")throw Error("unmute did not resume intentionally suspended context")')
browser('press','Escape');browser('wait',1400)
browser('click','.app-sound-toggle');browser('wait',2600)
observations['offMaster']=evaluate('window.__audioContexts[0].__gains[0].gain.value')
assert observations['offMaster']<.035,observations
browser('wait',750)
check('if(window.__audioContexts[0].state!=="suspended"||window.__audioContexts[0].__gains[0].gain.value!==0)throw Error("end-of-fade is not exact silence")')
observations['endOfFade']=evaluate('({state:window.__audioContexts[0].state,master:window.__audioContexts[0].__gains[0].gain.value,activeSources:window.__audioContexts[0].__osc.filter(o=>!o.__ended).length})')
check('if(JSON.parse(localStorage.getItem("knoux.audio")).ambient!==false)throw Error("opt-out not saved");window.__count=window.__audioContexts[0].__osc.length')
browser('click','.dw-collapse')
check('if(window.__audioContexts[0].__osc.length!==window.__count)throw Error("muted click made sound")')
# Recover an actually closed device context; only one live context may remain.
browser('click','.app-sound-toggle');browser('wait','[data-audio-state="running"]')
browser('eval','window.__audioContexts[0].close()');browser('wait','[data-audio-state="blocked"]')
browser('click','.app-sound-error button');browser('wait','[data-audio-state="running"]')
observations['closedDeviceRecovery']=evaluate('window.__audioContexts.map(c=>c.state)')
assert observations['closedDeviceRecovery']==['closed','running'], observations
browser('click','.app-sound-toggle')
# Failed playback cannot prevent navigation and explicit opt-out.
browser('reload');browser('wait','.dw-page')
browser('eval','(()=>{const Base=window.AudioContext;window.AudioContext=class extends Base{resume(){return Promise.reject(new Error("Synthetic device failure"))}}})()')
browser('click','.app-sound-toggle');browser('wait','[data-audio-state="blocked"]')
browser('click','.experience-settings-toggle');browser('select','.experience-audio select','silent')
check('if(document.querySelector(".app-sound-error"))throw Error("silent kept stale playback error")')
browser('select','.experience-audio select','subtle');browser('wait','[data-audio-state="blocked"]')
browser('check','[name=audio-master-mute]')
check('if(document.querySelector(".app-sound-error"))throw Error("mute kept stale playback error")')
browser('uncheck','[name=audio-master-mute]');browser('press','Escape')
browser('click','.service-quick-dock a[href="/file-cipher"]');browser('wait','.dw-dropzone')
check('if(!document.querySelector(".dw-inspector .dw-primary").disabled)throw Error("audio failure enabled crypto");if(location.pathname!=="/file-cipher")throw Error("audio failure blocked navigation")')
browser('click','.app-sound-toggle')
check('if(JSON.parse(localStorage.getItem("knoux.audio")).ambient!==false)throw Error("blocked playback prevented opt-out")')
browser('screenshot',out/'audio-preferences-and-workspace.png')
observations['limits']='Programmatic running audio and distinct frequency envelopes, not subjective audible mix acceptance. Actual browser background-tab fade checked; native minimize remains unverified. Windows unverified.'
(out/'audio-observations.json').write_text(json.dumps(observations,indent=2))
print('PASS: actual Web Audio fade-in/out, nonzero quiet waveform, distinct click/nav tones, continuous clock across routes, one context, six settled voices, silent/off suppression, playback failure isolation and persistent opt-out. Evidence:',out)

pending_startup_cancel()

# Independent native disposal of the actual graph verifies physical node cleanup.
browser('reload');browser('wait','.dw-page');browser('click','.dw-collapse')
observations['cleanup']=evaluate("(async()=>{const {KnouxAudioEngine}=await import('/src/components/shell/ambientAudio.js');const e=new KnouxAudioEngine(window.AudioContext);await e.enable();await e.dispose();return {...e.inspect(),nodes:e.nodes.size,envelopes:e.cueEnvelopes.size}})()")
assert observations['cleanup']['state']=='closed' and observations['cleanup']['voiceCount']==0 and observations['cleanup']['nodes']==0 and observations['cleanup']['envelopes']==0,observations
(out/'audio-observations.json').write_text(json.dumps(observations,indent=2))
print('PASS: exact zero end-of-fade gain and suspended context; actual native graph disposal closes context and clears sources/nodes/envelopes.')
