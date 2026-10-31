import React, { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { SCREENS, SERVICES } from '../../config/screens';
import { useLanguage } from '../../i18n/Language';
import { StagEmblem } from '../entry/StagEmblem';
import { useMotionPreferences } from '../shell/MotionPreferences';
import { Mark } from '../security/ScreenUI';
import { useWorkspaceActivity } from './WorkspaceActivity';
import { useKnouxAudio } from '../shell/KnouxAudioProvider';
import './live-security.css';

export const SCENES = [
  {id:'HOME',title:'Home Command Center',kind:'home'},
  {id:'ENCRYPT',title:'File Cipher Workbench',kind:'cipher'},
  {id:'VAULT',title:'Shadow Vault Explorer',kind:'vault'},
  {id:'NOTES',title:'Secure Notes Studio',kind:'notes'},
  {id:'PASSWORDS',title:'Password Manager',kind:'passwords'},
  {id:'AUTHENTICATOR',title:'Authenticator Dashboard',kind:'authenticator'},
  {id:'KEY_FORGE',title:'Key Forge Lab',kind:'keys'},
  {id:'PRIVACY',title:'Privacy Center',kind:'privacy'},
  {id:'BACKUP',title:'Backup & Recovery Studio',kind:'backup'},
  {id:'TOOLS',title:'Tools & Security Labs',kind:'tools'},
];
export function sceneForPath(path) {
  return SCENES.find(s => s.id !== 'HOME' && (path === SCREENS[s.id] || path.startsWith(`${SCREENS[s.id]}/`))) || SCENES[0];
}
const art = import.meta.glob('../../assets/service-*.webp',{eager:true,import:'default'});
export function ServiceQuickDock({onPreview}) {
  const {t}=useLanguage();
  return <nav className="service-quick-dock" aria-label={t('Quick services')} onMouseLeave={()=>onPreview(null)} onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget))onPreview(null);}}>
    {SERVICES.map(s=><NavLink key={s.id} to={SCREENS[s.id]} data-service={s.id} title={t(s.title)} onPointerEnter={()=>onPreview(s.id)} onFocus={()=>onPreview(s.id)}>
      <img src={art[`../../assets/service-${s.art}.webp`]} alt=""/><span>{t(s.title)}</span>
    </NavLink>)}
  </nav>;
}

// All diagrams are explicitly isolated visual demonstrations. No jobs, secrets,
// authorization, persistent service records or success callbacks enter this model.
function SceneDiagram({kind}) {
  const {t}=useLanguage();
  if(kind==='vault') return <div className="live-demo-vault"><Mark name="lock"/><strong>{t('Locked')}</strong><small>{t('Authorization required')}</small><i/><i/><i/></div>;
  if(kind==='notes') return <div className="live-demo-notes"><span>{t('Fictional draft')}</span><i/><i/><i/><small>{t('Memory only')}</small></div>;
  if(kind==='passwords') return <div className="live-demo-identities"><Mark name="lock"/><span>•••• •••• ••••</span><span>•••• •••• ••••</span><small>{t('Synthetic identities')}</small></div>;
  if(kind==='authenticator') return <div className="live-demo-clock"><svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="42"/><circle className="live-clock-arc" cx="50" cy="50" r="42"/></svg><span>DEMO<small>{t('No live codes')}</small></span></div>;
  if(kind==='keys') return <div className="live-demo-key"><Mark name="key"/><code>7A:31:DE:09</code><small>{t('Illustrative fingerprint')}</small></div>;
  if(kind==='privacy') return <div className="live-demo-matrix">{['Session','Clipboard','Permissions'].map(x=><div key={x}><i/><span>{t(x)}</span><small>{t('Not verified')}</small></div>)}</div>;
  if(kind==='tools') return <div className="live-demo-labs">{['SHA-256','HMAC','Argon2id','AEAD'].map(x=><code key={x}>{x}</code>)}<small>{t('Explore tool routes')}</small></div>;
  const stages=kind==='cipher'?['Source','Validate','Encrypt','Authenticate','Verify']:kind==='backup'?['Scope','Destination','Authorize','Export','Verify']:['Local workspace','Choose a service','Inspect capabilities'];
  return <ol className={`live-pipeline live-pipeline-${kind}`}>{stages.map((stage,i)=><li key={stage}><i>{String(i+1).padStart(2,'0')}</i><span>{t(stage)}</span></li>)}</ol>;
}
export function LiveSecurityPreview({previewId}) {
  const {pathname}=useLocation();
  const {t}=useLanguage();
  const motion=useMotionPreferences();
  const {cue}=useKnouxAudio();
  const [chosen,setChosen]=useState(null);
  const [dimmed,setDimmed]=useState(false);
  const [phase,setPhase]=useState('dormant');
  const root=useRef(null);
  const workspace=useWorkspaceActivity();
  const route=sceneForPath(pathname);
  const scene=SCENES.find(s=>s.id===(previewId||chosen||route.id))||route;
  const home=pathname===SCREENS.HOME;
  useEffect(()=>{setChosen(null);},[pathname]);
  useEffect(()=>{
    if(dimmed){setPhase('extinguishing');return;}
    if(!motion.running){setPhase('idle');return;}
    setPhase('dormant');
    const timers=[[80,'awakening'],[650,'ignition'],[1500,'idle']].map(([ms,next])=>setTimeout(()=>setPhase(next),ms));
    return()=>timers.forEach(clearTimeout);
  },[dimmed,motion.running]);
  useEffect(()=>{if(phase==='ignition')cue('ignition');if(phase==='extinguishing')cue('lock');},[phase,cue]);
  function pointer(e){
    if(!motion.running || motion.preferences.performance || e.pointerType==='touch')return;
    const box=e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty('--pointer-x',`${((e.clientX-box.left)/box.width*100).toFixed(1)}%`);
    e.currentTarget.style.setProperty('--pointer-y',`${((e.clientY-box.top)/box.height*100).toFixed(1)}%`);
  }
  return <section ref={root} className={`live-security-preview ${home?'live-home':'live-compact'}`} data-live-scene={scene.kind} data-phase={phase} data-dimmed={dimmed} aria-label={t('Live security visual preview')} onPointerMove={pointer} onPointerLeave={()=>{root.current?.style.removeProperty('--pointer-x');root.current?.style.removeProperty('--pointer-y');}}>
    <div className="live-circuitry" aria-hidden="true"><svg viewBox="0 0 1200 280" preserveAspectRatio="none"><path d="M0 65H210L280 135H550 M0 220H300L380 145H550 M1200 65H990L920 135H650 M1200 220H900L820 145H650"/><path className="live-data-flow" d="M0 65H210L280 135H550 M0 220H300L380 145H550 M1200 65H990L920 135H650 M1200 220H900L820 145H650"/></svg>{Array.from({length:24},(_,i)=><i key={i} style={{left:`${(i*37)%100}%`,top:`${(i*23)%95}%`,animationDelay:`-${i*.7}s`}}/>)}</div>
    <div className="live-preview-copy"><span className="live-preview-label">{t('VISUAL PREVIEW')}</span><h2>{t(scene.title)}</h2><p>{t('Preview mode — no user files processed')}</p><div className="live-preview-controls"><label><span className="live-sr-only">{t('Preview scene')}</span><select aria-label={t('Preview scene')} value={scene.id} onChange={e=>setChosen(e.target.value)}>{SCENES.map(s=><option key={s.id} value={s.id}>{t(s.title)}</option>)}</select></label><button aria-pressed={motion.paused} onClick={()=>motion.setPaused(v=>!v)}>{t(motion.paused?'Resume motion':'Pause motion')}</button><button aria-pressed={dimmed} onClick={()=>setDimmed(v=>!v)}>{t(dimmed?'Awaken preview':'Dim preview')}</button></div></div>
    <div className="live-stag-stage" aria-hidden="true"><div className="live-rear-orbit"/><div className="live-rear-orbit live-orbit-secondary"/><div className="live-ignition-wave"/><StagEmblem phase={phase} intensity={motion.preferences.eyes}/></div>
    <div className="live-scene-panel" key={scene.id}><SceneDiagram kind={scene.kind}/>{scene.kind==='cipher'&&<small className="live-real-context">{t('Queued files')}: {workspace.queued} · {t('Engine unavailable')}</small>}{scene.kind==='notes'&&<small className="live-real-context">{t('Fictional notes in memory')}: {workspace.notes}</small>}<Link to={SCREENS[scene.id]}>{t('Open workspace')} <span aria-hidden="true">↗</span></Link></div>
  </section>;
}
