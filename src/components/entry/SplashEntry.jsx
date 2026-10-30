import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { SCREENS } from "../../config/screens";
import { StagEmblem } from "./StagEmblem";
import "./entry.css";

// In-memory only: Back and route revisits never replay the full ignition.
let introPlayed = false;

export function Fingerprint() {
  return (
    <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden="true">
      <path d="M10 23a14 14 0 0 1 28 0M6 23a18 18 0 0 1 36 0M15 41c5-5 5-11 5-18a4 4 0 0 1 8 0c0 10-1 16-4 21M10 36c4-4 6-8 6-13a8 8 0 0 1 16 0c0 9 0 14-3 20M6 30c3-2 4-5 4-7M24 23c0 8-1 15-5 21M37 30c1-2 1-5 1-7M35 40c2-4 3-7 3-10M42 23c0 5 0 8-2 12" />
    </svg>
  );
}

export function SplashEntry() {
  const navigate = useNavigate();
  const [playIntro] = useState(() => !introPlayed);
  const [entering, setEntering] = useState(false);
  const timer = useRef();

  useEffect(() => {
    introPlayed = true;
    return () => clearTimeout(timer.current);
  }, []);

  function enter() {
    if (entering) return;
    setEntering(true);
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    timer.current = setTimeout(() => navigate(SCREENS.SECURE_ACCESS_LOGIN), reducedMotion ? 0 : 480);
  }

  return (
    <main className={`crypt-entry ${playIntro ? "crypt-ignite" : ""}`} dir="ltr" lang="en" data-screen="SPLASH_ENTRY" aria-labelledby="crypt-brand">
      <div className="crypt-atmosphere" aria-hidden="true">
        <i className="crypt-horizon crypt-horizon-top" /><i className="crypt-horizon crypt-horizon-bottom" />
        <i className="crypt-ember" /><i className="crypt-ember" /><i className="crypt-ember" />
      </div>
      <div className="crypt-entry-group">
        <div className="crypt-emblem" aria-hidden="true">
          <StagEmblem ignite={playIntro}/>
        </div>
        <div className="crypt-branding">
          <h1 id="crypt-brand">Knoux <span>Crypt</span></h1>
          <p>Private Encryption Suite</p>
        </div>
        <button className={`crypt-gate ${entering ? "crypt-entering" : ""}`} type="button" onClick={enter} disabled={entering} aria-label="Touch to Enter — open Secure Access" aria-busy={entering}>
          <span className="crypt-fingerprint"><Fingerprint /></span>
          <span>Touch to Enter</span>
        </button>
      </div>
    </main>
  );
}
