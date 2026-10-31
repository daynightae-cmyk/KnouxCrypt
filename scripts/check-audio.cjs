// Web Audio lifecycle/sonic contract tests. Audible mix quality is runtime QA.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),esbuild=require('esbuild');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'knoux-audio-'));
const parameter=()=>({value:0,calls:[],cancelScheduledValues(){},setTargetAtTime(v,t,constant){assert.ok(Number.isFinite(v),"finite audio parameter");this.target=v;this.calls.push({v,t,constant});},setValueAtTime(v){this.value=v;},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}});
class Context{
 constructor(){Context.last=this;this.currentTime=0;this.destination={};this.oscs=[];this.gains=[];this.state='running';}
 createGain(){const n={gain:parameter(),connect(){},disconnect(){this.disconnected=true;}};this.gains.push(n);return n;}
 createBiquadFilter(){return{frequency:parameter(),Q:parameter(),connect(){},disconnect(){}};}
 createStereoPanner(){return{pan:parameter(),connect(){},disconnect(){}};}
 createOscillator(){const n={frequency:parameter(),detune:parameter(),connect(){},disconnect(){this.disconnected=true;},start(time){this.startTime=time;},stop(){this.stopped=true;}};this.oscs.push(n);return n;}
 async resume(){}async close(){this.closed=true;this.state='closed';}
}
(async()=>{
 const result=esbuild.buildSync({entryPoints:[path.resolve(__dirname,'../src/components/shell/ambientAudio.js')],bundle:true,write:false,platform:'node',format:'cjs'});const file=path.join(dir,'audio.cjs');fs.writeFileSync(file,result.outputFiles[0].contents);
 const {createAmbientAudio,KnouxAudioEngine,SONIC_CATALOG}=require(file);
 const engine=createAmbientAudio(Context),c=Context.last;assert.ok(engine instanceof KnouxAudioEngine);assert.equal(engine.cue(),false);assert.equal(engine.master.gain.value,0);
 const ambientVoices=c.oscs.length;assert.ok(ambientVoices>0);await engine.enable();await engine.enable();assert.equal(c.oscs.length,ambientVoices,'enable must not duplicate sources');
 assert.equal(engine.master.gain.target,.45);assert.equal(engine.master.gain.calls.at(-1).constant,1.15,'quiet fade-in');
 assert.equal(engine.cue('tap'),true);assert.equal(engine.cue(),false,'global throttle');
 c.currentTime=.3;assert.equal(engine.cue('hover'),false,'hover off by default');assert.equal(engine.cue('success'),false);assert.equal(engine.cue('key'),false);assert.equal(engine.cue('vault'),false);assert.equal(engine.cue('process'),false);
 assert.equal(engine.cue('key',{verified:true}),true);c.currentTime=.6;assert.equal(engine.cue('process',{activeOperation:true}),true);
 engine.setVisible(false);assert.equal(engine.cue('nav'),false);assert.equal(engine.master.gain.target,0);assert.equal(engine.master.gain.calls.at(-1).constant,.8,'gradual fade-out');
 engine.setVisible(true);c.currentTime=1;assert.equal(engine.cue('navigate'),true);
 for(const route of ['/constructor','/toString','/__proto__']){engine.setScene(route);assert.equal(engine.voices[0].osc.frequency.target,55);}
 assert.equal(engine.cue('constructor'),false);assert.equal(engine.cue('__proto__'),false);
 const accents=[];for(const service of ['ENCRYPT','VAULT','NOTES','PASSWORDS','KEY_FORGE','AUTHENTICATOR','PRIVACY','BACKUP']){c.currentTime+=1;for(const voice of [...engine.cues])voice.onended();assert.equal(engine.cue('nav',{service}),true);accents.push(c.oscs.at(-2).frequency.value);}assert.equal(new Set(accents).size,8,'each service has a distinct navigation accent');
 const sourcesBefore=c.oscs.length;engine.setScene('/vault/collections');engine.setScene('/notes');assert.equal(c.oscs.length,sourcesBefore,'scene crossfade reuses voices');assert.equal(engine.inspect().scene,'notes');
 engine.configure({profile:'silent'});assert.equal(engine.shouldPlay,false);assert.equal(engine.master.gain.target,0);c.currentTime=2;assert.equal(engine.cue('error'),false);
 engine.configure({profile:'immersive',masterMute:true});assert.equal(engine.cue('error'),false);engine.configure({masterMute:false,effectsVolume:0});assert.equal(engine.cue('error'),false);
 engine.configure({effectsVolume:.35,reducedSensory:true});assert.ok(engine.effects.gain.target<.35);engine.mute();assert.equal(engine.cue(),false);
 assert.equal(Object.keys(SONIC_CATALOG).length,12);assert.equal(new Set(Object.values(SONIC_CATALOG).map(s=>JSON.stringify(s.frequencies))).size,12,'distinct sound signatures');
 await engine.dispose();assert.ok(c.closed&&c.oscs.every(n=>n.stopped));assert.equal(engine.cue(),false);engine.dispose();assert.equal(engine.nodes.size,0);assert.equal(engine.cues.size,0);
 const signature=createAmbientAudio(Context);await signature.enable();assert.equal(signature.cue('ignition'),true);assert.deepEqual(Context.last.oscs.slice(-4).map(o=>o.startTime),[0,.08,.2,.28],'low impulse precedes crystalline response');await signature.dispose();
 class Blocked extends Context{async resume(){throw new Error('Device unavailable');}}
 const blocked=createAmbientAudio(Blocked);await assert.rejects(()=>blocked.enable());assert.equal(blocked.enabled,false);await blocked.dispose();
 let release;class Pending extends Context{resume(){return new Promise(r=>{release=r;});}}
 const pending=createAmbientAudio(Pending);const enable=pending.enable();pending.mute();release();assert.equal(await enable,false,'mute cancels pending opt-in');await pending.dispose();
 class Broken extends Context{createOscillator(){throw new Error('No device');}}
 assert.throws(()=>createAmbientAudio(Broken));assert.equal(Context.last.closed,true,'partial constructor cleans up');
 console.log('PASS: silent default, no duplicate voices, twelve distinct signatures, opt-in, verified-result gates, throttling, hidden/silent/master/volume suppression, scene crossfades, fade scheduling, failed/pending playback and cleanup. Not an audible mix test.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>fs.rmSync(dir,{recursive:true,force:true}));
