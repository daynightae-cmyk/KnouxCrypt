import React,{useEffect,useRef,useState} from 'react';
import {useLocation} from 'react-router-dom';
import {useMotionPreferences} from '../shell/MotionPreferences';

// Decorative light only: endpoints are viewport coordinates, never user data.
// Navigation is never delayed and no pulse represents authorization or a job.
export function PulseLink(){
  const motion=useMotionPreferences();const {pathname}=useLocation();
  const [pulse,setPulse]=useState(null);const serial=useRef(0);
  useEffect(()=>{
    setPulse(null);
    if(!motion.running||motion.preferences.performance)return;
    let timer;let last=0;
    const clear=()=>setPulse(null);
    const start=e=>{
      if(!(e.target instanceof Element))return;
      const card=e.target.closest('.hub-service,.service-quick-dock a');
      if(!card||card.contains(e.relatedTarget))return;
      if(performance.now()-last<150)return;
      const target=card.getBoundingClientRect();
      if(target.bottom<0||target.top>innerHeight||target.right<0||target.left>innerWidth)return;
      const images=[...document.querySelectorAll('.live-stag-stage .stag-emblem img,.dw-sidebar-brand .stag-emblem img')];
      const source=images.map(img=>img.getBoundingClientRect()).find(b=>b.width&&b.top>=0&&b.bottom<innerHeight);
      if(!source)return;
      last=performance.now();clearTimeout(timer);
      const end={x:target.left+target.width/2,y:target.top+target.height/2};
      const paths=[453,801].map(x=>{const sx=source.left+source.width*x/1254,sy=source.top+source.height*713/1254;return `M${sx} ${sy} C${sx} ${end.y},${end.x} ${sy},${end.x} ${end.y}`;});
      setPulse({id:++serial.current,paths});timer=setTimeout(clear,760);
    };
    document.addEventListener('pointerover',start);document.addEventListener('focusin',start);
    document.addEventListener('scroll',clear,true);window.addEventListener('resize',clear);
    return()=>{clearTimeout(timer);document.removeEventListener('pointerover',start);document.removeEventListener('focusin',start);document.removeEventListener('scroll',clear,true);window.removeEventListener('resize',clear);};
  },[pathname,motion.running,motion.preferences.performance]);
  return pulse?<svg key={pulse.id} className="knoux-pulselink" aria-hidden="true" data-visual-only="true">{pulse.paths.map((d,i)=><path key={i} d={d} pathLength="100"/>)}</svg>:null;
}
