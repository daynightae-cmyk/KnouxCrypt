import React, {createContext,useCallback,useContext,useEffect,useMemo,useRef,useState} from 'react';
import {useLocation} from 'react-router-dom';
import {createAmbientAudio} from './ambientAudio';
import {useMotionPreferences} from './MotionPreferences';

const wantsAudio=p=>p.ambient&&!p.masterMute&&p.profile!=='silent';
const DEFAULTS={ambient:false,ambientVolume:.35,effectsVolume:.35,masterMute:false,profile:'subtle',hover:false,reduceOnBlur:true};
export function audioPreferences(value){
  const p=value&&typeof value==='object'?value:{};
  const volume=(v)=>typeof v==='number'&&Number.isFinite(v)?Math.max(0,Math.min(1,v)):.35;
  return {ambient:p.ambient===true,ambientVolume:volume(p.ambientVolume),effectsVolume:volume(p.effectsVolume),masterMute:p.masterMute===true,profile:['silent','subtle','immersive'].includes(p.profile)?p.profile:'subtle',hover:p.hover===true,reduceOnBlur:p.reduceOnBlur!==false};
}
function load(){try{return audioPreferences(JSON.parse(localStorage.getItem('knoux.audio')||'{}'));}catch{return DEFAULTS;}}
const fallback={preferences:DEFAULTS,update:()=>{},toggle:()=>{},cue:()=>false,status:'off',busy:false,resume:()=>{}};
const AudioContext=createContext(fallback);
export function KnouxAudioProvider({children}){
  const {pathname}=useLocation();
  const motion=useMotionPreferences();
  const [preferences,setPreferences]=useState(load);
  const [status,setStatus]=useState('off');const [busy,setBusy]=useState(false);
  const engine=useRef(null),mounted=useRef(false),starting=useRef(false),prefs=useRef(preferences),path=useRef(pathname),reduced=useRef(false);
  prefs.current=preferences;path.current=pathname;reduced.current=motion.preferences.reducedSensory;
  const update=useCallback(patch=>{const next=audioPreferences({...prefs.current,...patch});prefs.current=next;setPreferences(next);},[]);
  const cue=useCallback((kind,evidence)=>{try{return engine.current?.cue(kind,evidence)||false;}catch{return false;}},[]);
  const start=useCallback(async()=>{
    if(starting.current||!wantsAudio(prefs.current))return;
    starting.current=true;if(mounted.current)setBusy(true);
    let timer;
    try{
      const Context=window.AudioContext||window.webkitAudioContext;if(!Context)throw new Error('Unavailable');
      if(engine.current?.context.state==='closed'){Promise.resolve(engine.current.dispose()).catch(()=>{});engine.current=null;}
      if(!engine.current){
        const active=createAmbientAudio(Context);engine.current=active;
        active.context.onstatechange=()=>{if(mounted.current&&engine.current===active&&prefs.current.ambient&&active.shouldPlay&&active.context.state!=='running')setStatus('blocked');};
      }
      engine.current.configure({...prefs.current,reducedSensory:reduced.current});engine.current.setScene(path.current);
      engine.current.setVisible(!document.hidden&&(!prefs.current.reduceOnBlur||document.hasFocus()));
      const started=await Promise.race([engine.current.enable(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Playback blocked')),1500);})]);
      if(mounted.current&&started)setStatus('running');
    }catch{try{engine.current?.mute();}catch{/* Best-effort audio cleanup. */}if(mounted.current)setStatus(wantsAudio(prefs.current)?'blocked':'off');}
    finally{clearTimeout(timer);starting.current=false;if(mounted.current)setBusy(false);}
  },[]);
  const toggle=useCallback(()=>{
    if(prefs.current.ambient){update({ambient:false});try{engine.current?.mute();}catch{/* Preference still turns off. */}setStatus('off');}
    else{if(starting.current)return;update({ambient:true});start();}
  },[start,update]);
  useEffect(()=>{
    mounted.current=true;
    const visibility=()=>{const visible=!document.hidden&&(!prefs.current.reduceOnBlur||document.hasFocus());try{engine.current?.setVisible(visible);}catch{if(mounted.current)setStatus(wantsAudio(prefs.current)?'blocked':'off');}if(visible&&prefs.current.ambient&&engine.current?.context.state!=='running')start();};
    const resume=event=>{if(event.target instanceof Element&&event.target.closest('.app-sound-strip,.experience-audio button'))return;if(event.isTrusted&&prefs.current.ambient&&(!engine.current?.enabled||engine.current?.context.state!=='running'))start();};
    const interaction=event=>{
      if(!event.isTrusted||document.hidden||!(event.target instanceof Element))return;
      const control=event.target.closest('button,a,input[type="checkbox"],input[type="radio"]');
      if(!control||!control.closest('.crypt-app-shell')||control.closest('.app-sound-strip')||control.matches(':disabled,[aria-disabled="true"]'))return;
      cue(control.dataset.sound||(control.matches('a')?'nav':'click'));
    };
    const hover=event=>{if(event.isTrusted&&event.target instanceof Element&&event.target.closest('.service-quick-dock a'))cue('hover');};
    document.addEventListener('visibilitychange',visibility);window.addEventListener('blur',visibility);window.addEventListener('focus',visibility);
    document.addEventListener('pointerdown',resume);document.addEventListener('keydown',resume);document.addEventListener('click',interaction);document.addEventListener('pointerover',hover);
    if(prefs.current.ambient)start();
    return()=>{mounted.current=false;document.removeEventListener('visibilitychange',visibility);window.removeEventListener('blur',visibility);window.removeEventListener('focus',visibility);document.removeEventListener('pointerdown',resume);document.removeEventListener('keydown',resume);document.removeEventListener('click',interaction);document.removeEventListener('pointerover',hover);const previous=engine.current;engine.current=null;try{Promise.resolve(previous?.dispose()).catch(()=>{});}catch{/* Native device already gone. */}};
  },[cue,start]);
  useEffect(()=>{
    try{localStorage.setItem('knoux.audio',JSON.stringify(preferences));}catch{/* Nonsecret in-memory fallback. */}
    try {
    engine.current?.configure({...preferences,reducedSensory:motion.preferences.reducedSensory});
    engine.current?.setVisible(!document.hidden&&(!preferences.reduceOnBlur||document.hasFocus()));
    if(!preferences.ambient){engine.current?.mute();setStatus('off');}
    else if(!wantsAudio(preferences))setStatus('off');
    }catch{setStatus(wantsAudio(preferences)?'blocked':'off');}
  },[preferences,motion.preferences.reducedSensory]);
  useEffect(()=>{try{engine.current?.setScene(pathname);}catch{setStatus(wantsAudio(prefs.current)?'blocked':'off');}},[pathname]);
  const value=useMemo(()=>({preferences,update,toggle,cue,status,busy,resume:start}),[preferences,update,toggle,cue,status,busy,start]);
  return <AudioContext.Provider value={value}>{children}</AudioContext.Provider>;
}
export function useKnouxAudio(){return useContext(AudioContext);}
