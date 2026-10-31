import { LanguageToggle, useLanguage } from "../../i18n/Language";
import React, { memo, useEffect, useLayoutEffect, useRef, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { SCREENS } from "../../config/screens";
import "./shell.css";
import "./interaction.css";
import { NavigationEffects } from "./NavigationEffects";
import { DesktopChrome } from "../desktop/DesktopWorkspace";
import { AmbientSound } from "./AmbientSound";

export const CYBER_TERMS = Object.freeze(["AES-256", "ENCRYPTION", "CIPHER", "SHA-256", "ZERO TRUST", "KEY EXCHANGE", "HMAC", "AEAD", "NONCE", "PUBLIC KEY", "AUTH TAG", "0x7F A9"]);

// Fixed deterministic columns: never randomize/reseed on route changes.
export const CIPHER_COLUMNS = Object.freeze(Array.from({ length: 12 }, (_, index) => {
  const length = 12 + (index * 7) % 15;
  return Object.freeze({
    left: `${(index * 8.13 + 2.7).toFixed(2)}%`,
    delay: `${-(index * 3.7 + 4).toFixed(1)}s`,
    duration: `${28 + (index * 7) % 19}s`,
    height: `${length * 21}px`,
    opacity: String(index % 3 === 0 ? .11 : .16),
    fontSize: `${index % 3 === 0 ? 9 : 11}px`,
    glyphs: Array.from({length}, (_, row) => row % 5 === 0 ? CYBER_TERMS[(index + row) % CYBER_TERMS.length] : "01A7FΞC9λ3BΣ8D4"[(index * 5 + row * 7) % 15]).join("\n"),
  });
}));
export const CipherAtmosphere = memo(function CipherAtmosphere() {
  return <div className="app-atmosphere" data-persistent-atmosphere aria-hidden="true">
    <div className="app-code-rain">{CIPHER_COLUMNS.map((column,index) => <span key={index} style={{left:column.left,animationDelay:column.delay,animationDuration:column.duration,"--cipher-trail-height":column.height,"--cipher-depth-opacity":column.opacity,fontSize:column.fontSize}}>{column.glyphs}</span>)}</div>
    <div className="app-nebula app-nebula-one"/><div className="app-nebula app-nebula-two"/>
    <div className="app-starfield">{Array.from({length:14},(_,i)=><i key={i} style={{left:`${(i*37+11)%97}%`,top:`${(i*23+7)%94}%`,animationDelay:`${-i*1.7}s`,animationDuration:`${6+(i%5)}s`}}/>)}</div>
    <i className="app-energy app-energy-one"/><i className="app-energy app-energy-two"/>
    <i className="app-global-ember"/><i className="app-global-ember"/><i className="app-global-ember"/>
  </div>;
});
function NavIcon({ name }) {
  const { t, locale, dir } = useLanguage();

  return <svg viewBox="0 0 24 24" fill={name==='Home'?'currentColor':'none'} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{name==='Home'?<path d="m3 11 9-8 9 8v10h-6v-7H9v7H3Z"/>:name==='Tools'?<><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>:<><circle cx="12" cy="7" r="4"/><path d="M4 22v-3a8 8 0 0 1 16 0v3Z"/></>}</svg>;
}
export function AppBottomNav() {
  const { t, locale, dir } = useLanguage();

  return <nav className="app-bottom-nav" aria-label={t("Primary")} dir={dir}>
    {[['Home',SCREENS.HOME],['Tools',SCREENS.TOOLS],['Account',SCREENS.SECURE_ACCESS_LOGIN]].map(([label,to]) => <NavLink key={label} to={to} end state={label==='Account'?{returnTo:SCREENS.HOME}:undefined}><span><NavIcon name={label}/></span>{t(label)}</NavLink>)}
  </nav>;
}
export function AppShell({ children }) {
  const { t, locale, dir } = useLanguage();

  const {pathname, state} = useLocation();
  const [guestPreview,setGuestPreview] = useState(false);
  useLayoutEffect(() => { if (state?.guestPreview === true) setGuestPreview(true); },[state]);
  const scroll = useRef(null);
  const [pageHidden,setPageHidden] = useState(false);
  useEffect(() => {
    const sync = () => setPageHidden(document.hidden);
    sync();
    document.addEventListener('visibilitychange',sync);
    return () => document.removeEventListener('visibilitychange',sync);
  }, []);
  const primary = pathname===SCREENS.HOME || pathname===SCREENS.TOOLS || pathname===SCREENS.NOTES || pathname===SCREENS.KEY_FORGE || pathname===SCREENS.PRIVACY;
  useLayoutEffect(() => { scroll.current?.scrollTo?.(0,0); },[pathname]);
  return <div data-page-hidden={pageHidden ? "true" : "false"} data-scene={pathname===SCREENS.SPLASH_ENTRY?"splash":pathname===SCREENS.SECURE_ACCESS_LOGIN?"auth":"content"} className={`crypt-app-shell ${primary?'app-has-navigation':''}`}>
    <a className="app-skip-link" href="#app-content">{t("Skip to page content")}</a>
    <NavigationEffects/>
    <CipherAtmosphere/>
    <div className="app-utility-bar"><LanguageToggle/>{guestPreview && <span className="app-guest-session">{t("Guest · visual demo")}</span>}<AmbientSound splash={pathname===SCREENS.SPLASH_ENTRY}/></div>
    <div ref={scroll} className="app-scroll-region" id="app-content" tabIndex={0} role="region" aria-label={t("Page content")}><DesktopChrome>{children}</DesktopChrome></div>
    {primary && <AppBottomNav/>}
  </div>;
}
