import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

const DEFAULTS = { quality: 'balanced', eyes: .85, particles: .5, performance: false, reducedSensory: false };
const MotionContext = createContext(null);
function load() {
  try {
    const p = JSON.parse(localStorage.getItem('knoux.motion') || '{}');
    return { quality: ['off','balanced','cinematic'].includes(p.quality) ? p.quality : 'balanced',
      eyes: typeof p.eyes === 'number' && Number.isFinite(p.eyes) ? Math.max(0,Math.min(1,p.eyes)) : DEFAULTS.eyes,
      particles: typeof p.particles === 'number' && Number.isFinite(p.particles) ? Math.max(0,Math.min(1,p.particles)) : DEFAULTS.particles,
      performance: p.performance === true, reducedSensory: p.reducedSensory === true };
  } catch { return DEFAULTS; }
}
export function MotionProvider({children}) {
  const [preferences,setPreferences] = useState(load);
  const [paused,setPaused] = useState(false);
  const [reduced,setReduced] = useState(false);
  const [visible,setVisible] = useState(true);
  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReduced(media.matches);
    const visibility = () => setVisible(!document.hidden);
    sync(); visibility(); media.addEventListener('change',sync); document.addEventListener('visibilitychange',visibility);
    return () => {media.removeEventListener('change',sync);document.removeEventListener('visibilitychange',visibility);};
  },[]);
  useEffect(() => {try {localStorage.setItem('knoux.motion',JSON.stringify(preferences));} catch {/* Nonsecret in-memory fallback. */}},[preferences]);
  const value = useMemo(() => ({ preferences, update: patch => setPreferences(p=>({...p,...patch})), paused, setPaused, reduced,
    running: visible && !paused && !reduced && !preferences.reducedSensory && preferences.quality !== 'off',
    quality: reduced || preferences.reducedSensory ? 'off' : preferences.performance && preferences.quality==='cinematic' ? 'balanced' : preferences.quality,
  }),[preferences,paused,reduced,visible]);
  return <MotionContext.Provider value={value}>{children}</MotionContext.Provider>;
}
export function useMotionPreferences() {
  return useContext(MotionContext) || {preferences:DEFAULTS,update:()=>{},paused:false,setPaused:()=>{},reduced:false,running:false,quality:'off'};
}
