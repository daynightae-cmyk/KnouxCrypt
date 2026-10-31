import {useEffect} from 'react';
import {useMotionPreferences} from '../shell/MotionPreferences';

export const BLINK_TIMING=Object.freeze({close:120,hold:110,reopen:200});
// One schedule for every logo. Writes inherited visual state only, never auth.
export function StagEyeBehavior(){
  const {running}=useMotionPreferences();
  useEffect(()=>{
    const root=document.querySelector('.crypt-app-shell');if(!root)return;
    let timer;let count=0;let disposed=false;
    const state=value=>{root.dataset.eyeBehavior=value;};
    const later=(fn,ms)=>{timer=setTimeout(()=>{if(!disposed)fn();},ms);};
    function blink(repeat=false){
      state('closing');later(()=>{state('closed');later(()=>{state('opening');later(()=>{
        state('open');if(repeat)later(()=>blink(false),180);else schedule();
      },BLINK_TIMING.reopen);},BLINK_TIMING.hold);},BLINK_TIMING.close);
    }
    function schedule(){const delay=6800+(count%4)*1050;count++;later(()=>blink(count%4===0),delay);}
    state('open');if(running)schedule();
    return()=>{disposed=true;clearTimeout(timer);state('open');};
  },[running]);
  return null;
}
