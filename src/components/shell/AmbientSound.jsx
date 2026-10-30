import React, { useEffect, useRef, useState } from "react";
import { createAmbientAudio } from "./ambientAudio";

export function AmbientSound({ splash }) {
  const engine = useRef(null);
  const mounted = useRef(true);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => {
    mounted.current = true;
    const visibility = () => engine.current?.setVisible(!document.hidden);
    document.addEventListener('visibilitychange', visibility);
    return () => { mounted.current = false; document.removeEventListener('visibilitychange', visibility); engine.current?.dispose(); engine.current = null; };
  }, []);
  useEffect(() => { engine.current?.setScene(splash); }, [splash]);
  async function toggle() {
    if (busy) return;
    setError(false);
    if (enabled) { engine.current?.mute(); setEnabled(false); return; }
    setBusy(true);
    try {
      const Context = window.AudioContext || window.webkitAudioContext;
      if (!Context) throw new Error('unsupported');
      if (!engine.current) engine.current = createAmbientAudio(Context);
      engine.current.setScene(splash);
      engine.current.setVisible(!document.hidden);
      await engine.current.enable();
      if (mounted.current) setEnabled(true);
    } catch {
      engine.current?.dispose(); engine.current = null;
      if (mounted.current) setError(true);
    } finally { if (mounted.current) setBusy(false); }
  }
  return <div className="app-sound-strip" dir="ltr"><button type="button" className="app-sound-toggle" aria-pressed={enabled} disabled={busy} aria-label={enabled ? 'Mute ambient sound' : 'Enable ambient sound'} onClick={toggle}>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M3 9h4l5-5v16l-5-5H3Z"/>{enabled?<path d="M16 7a7 7 0 0 1 0 10m3-13a11 11 0 0 1 0 16"/>:<path d="m16 9 6 6m0-6-6 6"/>}</svg>
    {busy ? 'Starting…' : enabled ? 'Sound on' : 'Sound off'}
  </button>{error && <span role="status" className="app-sound-error">Audio unavailable in this browser</span>}</div>;
}
