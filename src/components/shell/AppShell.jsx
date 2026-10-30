import React, { memo, useLayoutEffect, useRef } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { SCREENS } from "../../config/screens";
import "./shell.css";

// Fixed deterministic columns: never randomize/reseed on route changes.
export const CIPHER_COLUMNS = Object.freeze(Array.from({ length: 12 }, (_, index) => Object.freeze({
  left: `${(index * 8.13 + 2.7).toFixed(2)}%`,
  delay: `${-(index * 3.7 + 4).toFixed(1)}s`,
  duration: `${28 + (index * 7) % 19}s`,
  glyphs: Array.from({length: 22}, (_, row) => "01A7FΞC9λ3BΣ8D4"[(index * 5 + row * 7) % 15]).join("\n"),
})));
export const CipherAtmosphere = memo(function CipherAtmosphere() {
  return <div className="app-atmosphere" data-persistent-atmosphere aria-hidden="true">
    <div className="app-code-rain">{CIPHER_COLUMNS.map((column,index) => <span key={index} style={{left:column.left,animationDelay:column.delay,animationDuration:column.duration}}>{column.glyphs}</span>)}</div>
    <i className="app-energy app-energy-one"/><i className="app-energy app-energy-two"/>
    <i className="app-global-ember"/><i className="app-global-ember"/><i className="app-global-ember"/>
  </div>;
});
function NavIcon({ name }) {
  return <svg viewBox="0 0 24 24" fill={name==='Home'?'currentColor':'none'} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{name==='Home'?<path d="m3 11 9-8 9 8v10h-6v-7H9v7H3Z"/>:name==='Tools'?<><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>:<><circle cx="12" cy="7" r="4"/><path d="M4 22v-3a8 8 0 0 1 16 0v3Z"/></>}</svg>;
}
export function AppBottomNav() {
  return <nav className="app-bottom-nav" aria-label="Primary" dir="ltr">
    {[['Home',SCREENS.HOME],['Tools',SCREENS.TOOLS],['Account',SCREENS.SECURE_ACCESS_LOGIN]].map(([label,to]) => <NavLink key={label} to={to} end state={label==='Account'?{returnTo:SCREENS.HOME}:undefined}><span><NavIcon name={label}/></span>{label}</NavLink>)}
  </nav>;
}
export function AppShell({ children }) {
  const {pathname} = useLocation();
  const scroll = useRef(null);
  const primary = pathname===SCREENS.HOME || pathname===SCREENS.TOOLS;
  useLayoutEffect(() => { scroll.current?.scrollTo?.(0,0); },[pathname]);
  return <div className={`crypt-app-shell ${primary?'app-has-navigation':''}`}>
    <CipherAtmosphere/>
    <div ref={scroll} className="app-scroll-region" id="app-content" tabIndex={0} role="region" aria-label="Page content">{children}</div>
    {primary && <AppBottomNav/>}
  </div>;
}
