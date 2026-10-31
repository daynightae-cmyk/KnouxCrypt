"""Natural shared rhythm, occasional double blink and actual background suspension."""
import pathlib
exec(pathlib.Path('scripts/check-living-v2.py').read_text().split("b('set','viewport'")[0])
b('set','media','light');b('open','http://localhost:3000/home');b('wait','.dw-home')
b('record','start',out/'natural-double-blink.webm','--fps',20)
b('eval',"window.__eyeEvents=[];window.__eyeRoot=document.querySelector('.crypt-app-shell');window.__eyeObserver=new MutationObserver(records=>{for(const r of records)if(r.attributeName==='data-eye-behavior')window.__eyeEvents.push({state:window.__eyeRoot.dataset.eyeBehavior,time:performance.now()})});window.__eyeObserver.observe(window.__eyeRoot,{attributes:true})")
b('wait',40000)
events=ev('window.__eyeEvents');b('record','stop')
starts=[e['time'] for e in events if e['state']=='closing'];gaps=[t-s for s,t in zip(starts,starts[1:])]
assert any(400<gap<1100 for gap in gaps),gaps
assert any(6000<gap<11500 for gap in gaps),gaps
# A real route switch cannot replace the shared controller root or restart it.
b('click','.service-quick-dock a[href="/notes"]');b('wait','.dw-notes')
check('if(window.__eyeRoot!==document.querySelector(".crypt-app-shell"))throw Error("brand root remounted")')
tabs=json.loads(b('tab','list','--json'))['data']['tabs'];active=next(t['tabId'] for t in tabs if t['active'])
b('eval','setTimeout(()=>{window.__hiddenEye={state:window.__eyeRoot.dataset.eyeBehavior,count:window.__eyeEvents.length};setTimeout(()=>{window.__hiddenEye.after=window.__eyeEvents.length},11500)},600)')
try:
 b('tab','new','--label','knoux-eye-hidden-test','about:blank');b('wait',13500);b('tab',active)
 hidden=ev('window.__hiddenEye');assert hidden['state']=='open' and hidden['after']==hidden['count'],hidden
finally:
 b('tab','close','knoux-eye-hidden-test');b('tab',active)
b('eval','window.__eyeObserver.disconnect()')
(out/'eye-lifecycle.json').write_text(json.dumps({'generatedBy':'CodeRabbit','events':events,'closingGapsMs':gaps,'hidden':hidden,'limits':'Actual cloud Chromium timing; not Windows minimize or device smoothness certification.'},indent=2))
print('PASS: natural6–11s rhythm, occasional double blink, stable route root and hidden-tab scheduler suspension.')
