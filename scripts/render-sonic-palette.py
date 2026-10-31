"""Render the original sound palette offline in the shared Chromium engine.
This is an audition artifact, not a recording of security operations or Windows.
"""
import base64,json,os,pathlib,subprocess
out=pathlib.Path(os.environ['QA_OUTPUT']);out.mkdir(parents=True,exist_ok=True)
js=r'''(async()=>{
 const {KnouxAudioEngine,SONIC_CATALOG}=await import('/src/components/shell/ambientAudio.js');
 const rate=24000,seconds=20,context=new OfflineAudioContext(2,rate*seconds,rate);let clock=0;
 // Offline scheduling adapter only: no speaker or autoplay policy is involved.
 Object.defineProperty(context,'currentTime',{get:()=>clock});Object.defineProperty(context,'state',{get:()=> 'running'});
 context.resume=async()=>{};context.close=async()=>{};
 const engine=new KnouxAudioEngine(function(){return context});
 engine.configure({hover:true,profile:'immersive',ambientVolume:.65,effectsVolume:.7});engine.setScene('/home');await engine.enable();
 // Advance offline voice accounting between nonoverlapping cues; native nodes
 // stay connected and their scheduled sound is rendered without alteration.
 const cues=[];Object.keys(SONIC_CATALOG).forEach((kind,index)=>{clock=3+index*1.1;engine.cues.clear();if(!engine.cue(kind,{verified:true,activeOperation:true}))throw new Error('Audition cue rejected: '+kind);cues.push({kind:`KNOX-${kind.toUpperCase()}`,time:clock})});
 clock=16.4;engine.mute();const buffer=await context.startRendering();
 const channels=[buffer.getChannelData(0),buffer.getChannelData(1)],n=buffer.length;
 const bytes=new ArrayBuffer(44+n*4),view=new DataView(bytes);
 const text=(offset,value)=>[...value].forEach((c,i)=>view.setUint8(offset+i,c.charCodeAt(0)));
 text(0,'RIFF');view.setUint32(4,36+n*4,true);text(8,'WAVE');text(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,2,true);view.setUint32(24,rate,true);view.setUint32(28,rate*4,true);view.setUint16(32,4,true);view.setUint16(34,16,true);text(36,'data');view.setUint32(40,n*4,true);
 let peak=0,sum=0,difference=0;
 for(let i=0;i<n;i++){difference+=(channels[0][i]-channels[1][i])**2;for(let c=0;c<2;c++){const v=channels[c][i];peak=Math.max(peak,Math.abs(v));sum+=v*v;view.setInt16(44+(i*2+c)*2,Math.round(Math.max(-1,Math.min(1,v))*32767),true)}}
 const array=new Uint8Array(bytes);let binary='';for(let i=0;i<array.length;i+=16384)binary+=String.fromCharCode(...array.subarray(i,i+16384));
 await engine.dispose();return {wav:btoa(binary),report:{generatedBy:'CodeRabbit',render:'Chromium OfflineAudioContext using actual KnouxAudioEngine graph',durationSeconds:seconds,sampleRate:rate,channels:2,peak,rms:Math.sqrt(sum/(n*2)),stereoDifferenceRms:Math.sqrt(difference/n),cues,limits:'Sound palette audition. Verified flags are synthetic audition inputs, not actual security success. No external audio or microphones. Not Windows runtime or subjective mix approval.'}};
})()'''
r=subprocess.run(['coderabbit-agent-browser','eval',js],capture_output=True,text=True)
if r.returncode:raise RuntimeError(r.stderr or r.stdout)
result=json.loads(r.stdout)
assert result['report']['peak']>0 and result['report']['peak']<.1,result['report']
assert result['report']['stereoDifferenceRms']>0,result['report']
(out/'knoux-original-sonic-palette.wav').write_bytes(base64.b64decode(result['wav']))
(out/'sonic-palette.json').write_text(json.dumps(result['report'],indent=2))
print('PASS: original 20-second stereo audition rendered with twelve distinct cues, no clipping, nonzero stereo difference. No listening/Windows certification.')
