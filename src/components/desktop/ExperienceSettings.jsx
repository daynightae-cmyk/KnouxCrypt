import React, { useEffect, useRef, useState } from 'react';
import { useLanguage } from '../../i18n/Language';
import { useMotionPreferences } from '../shell/MotionPreferences';

export function ExperienceSettings() {
  const {t}=useLanguage();
  const {preferences:p,update,reduced}=useMotionPreferences();
  const [open,setOpen]=useState(false);
  const dialog=useRef(null);
  useEffect(()=>{if(open)dialog.current?.showModal();else dialog.current?.close();},[open]);
  return <><button className="experience-settings-toggle" onClick={()=>setOpen(true)} aria-haspopup="dialog">{t('Experience')}</button><dialog className="experience-settings" ref={dialog} onCancel={()=>setOpen(false)} onClose={()=>setOpen(false)} aria-labelledby="experience-title"><header><h2 id="experience-title">{t('Immersive quality')}</h2><button onClick={()=>setOpen(false)} aria-label={t('Close')}>×</button></header><label>{t('Motion Quality')}<select value={p.quality} onChange={e=>update({quality:e.target.value})}>{['off','balanced','cinematic'].map(x=><option key={x} value={x}>{t(x)}</option>)}</select></label><label>{t('Eye-glow intensity')}<input type="range" min="0" max="1" step=".05" value={p.eyes} onChange={e=>update({eyes:Number(e.target.value)})}/></label><label>{t('Particle intensity')}<input type="range" min="0" max="1" step=".1" value={p.particles} onChange={e=>update({particles:Number(e.target.value)})}/></label><label className="experience-check"><input type="checkbox" checked={p.performance} onChange={e=>update({performance:e.target.checked})}/>{t('Performance-friendly mode')}</label><label className="experience-check"><input type="checkbox" checked={p.reducedSensory} onChange={e=>update({reducedSensory:e.target.checked})}/>{t('Reduced sensory stimulation')}</label><p>{t(reduced?'System reduced motion is active.':'Only nonsecret experience preferences are stored.')}</p></dialog></>;
}
