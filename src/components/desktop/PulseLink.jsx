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
    const shell=document.querySelector('.crypt-app-shell');let recipient;
    const clear=()=>{setPulse(null);if(shell)delete shell.dataset.pulseFocus;if(recipient)delete recipient.dataset.pulseReceived;};
    const start=e=>{
      if(!(e.target instanceof Element))return;
      const card=e.target.closest('.hub-service,.service-quick-dock a,.dw-sidebar nav a,.hub-extra-tools a,.crypt-gate,.access-submit,.access-guest,.access-method,[data-pulselink]');
      if(!card||card.matches(':disabled,[aria-disabled="true"]')||(e.relatedTarget instanceof Node&&card.contains(e.relatedTarget)))return;
      if(e.type!=='click'&&performance.now()-last<150)return;
      const target=card.getBoundingClientRect();
      if(target.bottom<0||target.top>innerHeight||target.right<0||target.left>innerWidth)return;
      const images=[...document.querySelectorAll('.crypt-emblem .stag-emblem img,.access-art .stag-emblem img,.live-stag-stage .stag-emblem img,.dw-sidebar-brand .stag-emblem img,.hub-stag-hero .stag-emblem img')];
      const source=images.map(img=>img.getBoundingClientRect()).find(b=>b.width&&b.top>=0&&b.bottom<innerHeight);
      if(!source)return;
      last=performance.now();clearTimeout(timer);clear();recipient=card;recipient.dataset.pulseReceived='true';if(shell)shell.dataset.pulseFocus='true';
      const end={x:target.left+target.width/2,y:target.top+target.height/2};
      const paths=[453,801].map(x=>{const sx=source.left+source.width*x/1254,sy=source.top+source.height*713/1254;return `M${sx} ${sy} C${sx} ${end.y},${end.x} ${sy},${end.x} ${end.y}`;});
      setPulse({id:++serial.current,paths});timer=setTimeout(clear,760);
    };
    document.addEventListener('click',start,true);document.addEventListener('pointerover',start);document.addEventListener('focusin',start);
    document.addEventListener('scroll',clear,true);window.addEventListener('resize',clear);
    return()=>{clearTimeout(timer);clear();document.removeEventListener('click',start,true);document.removeEventListener('pointerover',start);document.removeEventListener('focusin',start);document.removeEventListener('scroll',clear,true);window.removeEventListener('resize',clear);};
  },[motion.running,motion.preferences.performance]);
  useEffect(()=>{const shell=document.querySelector('.crypt-app-shell');if(!shell||!motion.running)return;shell.dataset.pulseArrival='true';const timer=setTimeout(()=>delete shell.dataset.pulseArrival,600);return()=>{clearTimeout(timer);delete shell.dataset.pulseArrival;};},[pathname,motion.running]);
  return pulse?<svg key={pulse.id} className="knoux-pulselink" aria-hidden="true" data-visual-only="true">{pulse.paths.map((d,i)=><path key={i} d={d} pathLength="100"/>)}</svg>:null;
}
