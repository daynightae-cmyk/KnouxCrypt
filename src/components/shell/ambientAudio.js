// Original KNOUX procedural score. No recordings, remote media, microphone,
// copyrighted music or restartable short loops. Oscillators run continuously.
export const SONIC_CATALOG = Object.freeze({
  click: {frequencies:[780,1170],duration:.12,level:.025},
  hover: {frequencies:[1320,1760],duration:.18,level:.009},
  nav: {frequencies:[220,440],duration:.28,level:.022,sweep:1.7},
  open: {frequencies:[164.81,329.63,493.88],duration:.4,level:.02,sweep:1.15},
  vault: {frequencies:[65.41,130.81,196],duration:.65,level:.025,verified:true},
  key: {frequencies:[659.25,987.77,1318.51],duration:.36,level:.02,verified:true},
  process: {frequencies:[110,165],duration:.8,level:.012,operation:true},
  success: {frequencies:[392,587.33,783.99],duration:.5,level:.022,verified:true},
  warning: {frequencies:[293.66,311.13],duration:.32,level:.022},
  error: {frequencies:[130.81,155.56],duration:.28,level:.026,sweep:.7},
  lock: {frequencies:[261.63,196,130.81],duration:.65,level:.023,sweep:.55},
  ignition: {frequencies:[82.41,164.81,329.63,659.25],duration:1.1,level:.023,sweep:1.3},
});
const clamp=(n,fallback)=>typeof n==='number'&&Number.isFinite(n)?Math.max(0,Math.min(1,n)):fallback;
const ROOTS={'home':55,'file-cipher':58.27,'vault':49,'notes':65.41,'passwords':51.91,'authenticator':61.74,'key-forge':55,'privacy':51.91,'backup':49,'tools':58.27};

export class KnouxAudioEngine {
  constructor(Context) {
    this.context=new Context();
    this.nodes=new Set();this.sources=new Set();this.cues=new Set();this.cueEnvelopes=new Map();
    this.enabled=false;this.visible=true;this.disposed=false;this.generation=0;this.lastCue=-Infinity;this.lastKinds=new Map();
    this.config={ambient:true,ambientVolume:.35,effectsVolume:.35,profile:'subtle',masterMute:false,reducedSensory:false,hover:false};
    try {
    this.master=this.node(this.context.createGain());this.master.gain.value=0;this.master.connect(this.context.destination);
    this.ambient=this.node(this.context.createGain());this.ambient.gain.value=0;this.ambient.connect(this.master);
    this.effects=this.node(this.context.createGain());this.effects.gain.value=0;this.effects.connect(this.master);
    this.filter=this.node(this.context.createBiquadFilter());this.filter.type='lowpass';this.filter.frequency.value=420;this.filter.Q.value=.4;this.filter.connect(this.ambient);
    this.voices=[];
    for(const [ratio,level,detune,pan] of [[1,.18,-4,-.2],[1.5,.07,3,.25],[2,.035,-2,-.4],[16,.009,5,.6],[24,.006,-6,-.65]]){
      const osc=this.node(this.context.createOscillator());const gain=this.node(this.context.createGain());
      osc.type='sine';osc.frequency.value=55*ratio;osc.detune.value=detune;gain.gain.value=level;osc.connect(gain);
      if(this.context.createStereoPanner){const panner=this.node(this.context.createStereoPanner());panner.pan.value=pan;gain.connect(panner);panner.connect(ratio>=16?this.ambient:this.filter);}else gain.connect(ratio>=16?this.ambient:this.filter);
      osc.start();this.sources.add(osc);this.voices.push({osc,ratio});
    }
    // Very slow harmonic evolution supplies airy motion without repeated impacts.
    const lfo=this.node(this.context.createOscillator());const depth=this.node(this.context.createGain());
    lfo.frequency.value=.047;depth.gain.value=115;lfo.connect(depth);depth.connect(this.filter.frequency);lfo.start();this.sources.add(lfo);
    } catch(error) {Promise.resolve(this.dispose()).catch(()=>{});throw error;}
  }
  get shouldPlay(){return this.enabled&&this.visible&&!this.config.masterMute&&this.config.profile!=='silent';}
  node(n){this.nodes.add(n);return n;}
  ramp(parameter,value,time=1.15){const now=this.context.currentTime;parameter.cancelScheduledValues(now);parameter.setTargetAtTime(value,now,time);}
  fade(){
    if(this.disposed)return;
    const active=this.shouldPlay;
    clearTimeout(this.suspendTimer);
    if(!active&&typeof this.context.suspend==='function')this.suspendTimer=setTimeout(()=>{
      if(this.disposed||this.shouldPlay)return;
      try{Promise.resolve(this.context.suspend()).catch(()=>{});}catch{/* Device failure cannot block a service. */}
    },3000);
    const profile=this.config.profile==='immersive'?.14:.085;
    this.ramp(this.master.gain,active?.45:0,active?1.15:.8);
    this.ramp(this.ambient.gain,this.config.ambient?clamp(this.config.ambientVolume,.35)*profile*(this.config.reducedSensory?.45:1):0);
    this.ramp(this.effects.gain,clamp(this.config.effectsVolume,.35)*(this.config.reducedSensory?.35:1),.18);
  }
  configure(patch){if(this.disposed)return;this.config={...this.config,...patch};this.fade();}
  async enable(){
    if(this.disposed)return false;
    const generation=++this.generation;await this.context.resume();
    if(this.disposed||generation!==this.generation)return false;
    if(this.context.state!=='running')throw new Error('Audio playback requires interaction');
    this.enabled=true;this.fade();return true;
  }
  mute(){this.generation++;this.enabled=false;this.fade();}
  setVisible(value){this.visible=Boolean(value);this.fade();}
  setScene(scene){
    if(this.disposed)return;
    // Preserve the legacy boolean scene API used by the entry screen.
    this.scene=typeof scene==='string'?scene.split('/').filter(Boolean)[0]||'home':scene?'home':'tools';
    const root=Object.hasOwn(ROOTS,this.scene)?ROOTS[this.scene]:55;
    for(const {osc,ratio} of this.voices)this.ramp(osc.frequency,root*ratio,1.2);
    this.ramp(this.filter.frequency,this.scene==='vault'?320:this.scene==='notes'?560:420,1.2);
  }
  cue(kind='click',evidence={}){
    if(this.disposed||!this.enabled||!this.visible||this.config.masterMute||this.config.profile==='silent'||this.context.state!=='running'||!this.config.effectsVolume)return false;
    kind=({tap:'click',navigate:'nav',toggle:'click'})[kind]||kind;
    const spec=Object.hasOwn(SONIC_CATALOG,kind)?SONIC_CATALOG[kind]:null;
    if(!spec||(spec.verified&&evidence.verified!==true)||(spec.operation&&evidence.activeOperation!==true)||(kind==='hover'&&!this.config.hover))return false;
    const now=this.context.currentTime;
    if(now-this.lastCue<.12||now-(this.lastKinds.get(kind)??-Infinity)<(kind==='process'?5:kind==='hover'?1:.18)||this.cues.size>20)return false;
    this.lastCue=now;this.lastKinds.set(kind,now);
    spec.frequencies.forEach((frequency,i)=>{
      const oscillator=this.context.createOscillator(),envelope=this.context.createGain();
      const start=now+i*.018;oscillator.type='sine';oscillator.frequency.setValueAtTime(frequency,start);
      if(spec.sweep)oscillator.frequency.exponentialRampToValueAtTime(frequency*spec.sweep,start+spec.duration);
      envelope.gain.setValueAtTime(0,start);envelope.gain.linearRampToValueAtTime(spec.level/spec.frequencies.length,start+.025);
      envelope.gain.exponentialRampToValueAtTime(.00001,start+spec.duration);
      oscillator.connect(envelope);envelope.connect(this.effects);this.cues.add(oscillator);this.cueEnvelopes.set(oscillator,envelope);
      oscillator.onended=()=>{this.cues.delete(oscillator);this.cueEnvelopes.delete(oscillator);oscillator.disconnect();envelope.disconnect();};
      oscillator.start(start);oscillator.stop(start+spec.duration+.03);
    });
    return true;
  }
  inspect(){return {state:this.context.state,enabled:this.enabled,visible:this.visible,scene:this.scene,ambientGain:this.ambient.gain.value,masterGain:this.master.gain.value,activeCues:this.cues.size,voiceCount:this.sources.size};}
  dispose(){
    if(this.disposed)return;
    this.disposed=true;this.generation++;clearTimeout(this.suspendTimer);this.context.onstatechange=null;
    for(const node of [...this.sources,...this.cues]){try{node.stop();}catch{/* Already ended. */}}
    for(const node of this.nodes){try{node.disconnect();}catch{/* Device already gone. */}}
    for(const [oscillator,envelope] of this.cueEnvelopes){oscillator.disconnect();envelope.disconnect();}
    this.cueEnvelopes.clear();this.cues.clear();this.nodes.clear();this.sources.clear();this.voices=[];this.lastKinds.clear();return this.context.close();
  }
}
export function createAmbientAudio(Context){return new KnouxAudioEngine(Context);}
