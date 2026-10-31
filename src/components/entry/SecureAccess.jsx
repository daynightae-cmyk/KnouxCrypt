import { useLanguage } from "../../i18n/Language";
import React, { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { SCREENS } from "../../config/screens";
import { Fingerprint } from "./SplashEntry";
import valley from "../../assets/auth-landscape.webp";
import { StagEmblem } from "./StagEmblem";
import "./access.css";
import {useKnouxAudio} from "../shell/KnouxAudioProvider";

function Icon({ name }) {
  const { t, locale, dir } = useLanguage();

  const paths = {
    mail: <><rect x="3" y="5" width="18" height="14" rx="1"/><path d="m3 6 9 7 9-7"/></>,
    lock: <><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4M12 15v2"/></>,
    eye: <><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></>,
    hidden: <><path d="m3 3 18 18M9 5a10 10 0 0 1 3 0c6 0 10 7 10 7a19 19 0 0 1-4 4M6 6a21 21 0 0 0-4 6s4 7 10 7a12 12 0 0 0 5-1M10 10a3 3 0 0 0 4 4"/></>,
    key: <><path d="M14 3a7 7 0 0 0-6 11l-6 6v3h4v-3h3v-3l2-2A7 7 0 1 0 14 3Z"/><circle cx="16" cy="8" r="1"/></>,
    arrow: <path d="M4 12h16m-6-6 6 6-6 6"/>,
    back: <path d="M20 12H4m6-6-6 6 6 6"/>,
  };
  if (name === "github") return <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M12 .8a11.2 11.2 0 0 0-3.54 21.83c.56.1.77-.24.77-.54v-2.1c-3.12.68-3.78-1.33-3.78-1.33-.51-1.3-1.25-1.64-1.25-1.64-1.02-.7.08-.68.08-.68 1.13.08 1.72 1.16 1.72 1.16 1 1.71 2.62 1.22 3.26.93.1-.73.39-1.22.71-1.5-2.49-.28-5.1-1.25-5.1-5.54 0-1.22.44-2.22 1.15-3-.12-.28-.5-1.42.11-2.96 0 0 .94-.3 3.08 1.15a10.7 10.7 0 0 1 5.6 0c2.14-1.45 3.08-1.15 3.08-1.15.61 1.54.23 2.68.11 2.96.71.78 1.15 1.78 1.15 3 0 4.3-2.62 5.25-5.12 5.53.4.35.76 1.03.76 2.08v3.09c0 .3.2.65.77.54A11.2 11.2 0 0 0 12 .8Z"/></svg>;
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

function DemoSheet({ method, onClose, onContinue }) {
  const { t, locale, dir } = useLanguage();

  const dialog = useRef(null);
  const close = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    dialog.current.showModal();
    close.current.focus();
    return () => previous?.focus();
  }, []);
  return <dialog ref={dialog} className="access-dialog" onCancel={onClose} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }} aria-labelledby="demo-title" aria-describedby="demo-description">
    <div className="access-sheet">
      <button ref={close} type="button" className="access-close" onClick={onClose} aria-label={t("Close visual demo")}>{t("×")}</button>
      <p className="access-demo-label">{t("VISUAL DEMO")}</p>
      <h2 id="demo-title">{t(`${method} preview`)}</h2>
      <p id="demo-description">{t(method === "Sign In" ? "This is an offline interface preview. Nothing has been authenticated. Continue to explore the existing Home demo." : `${method} is a visual preview only. No provider connection, device scan, or authentication is running.`)}</p>
      {method === "Sign In" && <button className="access-submit" type="button" onClick={onContinue}>{t("Continue to Home demo ")}<Icon name="arrow"/></button>}
      <button className="access-dismiss" type="button" onClick={onClose}>{t("Back to Secure Access")}</button>
    </div>
  </dialog>;
}

export function SecureAccess() {
  const {cue}=useKnouxAudio();
  const { t, locale, dir } = useLanguage();

  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [reveal, setReveal] = useState(false);
  const [errors, setErrors] = useState({});
  const [method, setMethod] = useState(null);
  const [selected, setSelected] = useState(null);
  const userInput = useRef(null);
  const passwordInput = useRef(null);
  const backTo = location.state?.returnTo === SCREENS.HOME ? SCREENS.HOME : SCREENS.SPLASH_ENTRY;

  function submit(e) {
    e.preventDefault();
    const nextErrors = {};
    if (!username.trim()) nextErrors.username = "Enter a fictional username, such as demo.";
    if (!password) nextErrors.password = "Enter a fictional password, such as preview.";
    if (username.trim() && password && (username !== "demo" || password !== "preview")) nextErrors.password = "Use only the sample values: demo / preview. Do not enter real credentials.";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      cue("warning");
      (nextErrors.username ? userInput : passwordInput).current.focus();
      return;
    }
    cue("open");
    setMethod("Sign In");
  }

  return <main className="crypt-entry crypt-auth" dir={dir} lang={locale} data-screen="SECURE_ACCESS_LOGIN" aria-labelledby="access-title">
    <div className="crypt-atmosphere" aria-hidden="true"><i className="crypt-horizon crypt-horizon-top"/><i className="crypt-horizon crypt-horizon-bottom"/><i className="crypt-ember"/><i className="crypt-ember"/></div>
    <div className="access-composition">
      <Link className="access-back" to={backTo} aria-label={t(backTo === SCREENS.HOME ? "Back to Home" : "Back to Splash")}><Icon name="back"/></Link>
      <header className="access-hero">
        <div className="access-art"><img className="access-valley" src={valley} width="882" height="373" alt=""/><StagEmblem className="access-new-stag"/></div>
        <div className="access-brand">{t("Knoux ")}<span>{t("Crypt")}</span></div>
        <p className="access-caption">{t("Private Encryption Suite")}</p>
      </header>
      <section className="access-content">
        <div className="access-heading"><h1 id="access-title">{t("Secure ")}<span>{t("Access")}</span></h1><p>{t("Your keys stay protected.")}</p></div>
        <form className="access-form" onSubmit={submit} noValidate autoComplete="off" aria-label={t("Offline sign-in visual demo")}>
          <div className="access-field-group">
            <label className={`access-field ${errors.username ? "access-invalid" : ""}`}><Icon name="mail"/><span className="access-sr-only">{t("Email or username (fictional demo only)")}</span><input ref={userInput} value={username} onChange={e => { setUsername(e.target.value); setErrors({}); }} dir="auto" placeholder={t("Email or username")} autoComplete="off" autoCapitalize="none" spellCheck="false" aria-invalid={!!errors.username} aria-describedby={errors.username ? "username-error" : "access-demo-hint"}/></label>
            {errors.username && <p className="access-error" id="username-error" role="alert">{t(errors.username)}</p>}
          </div>
          <div className="access-field-group">
            <label className={`access-field ${errors.password ? "access-invalid" : ""}`}><Icon name="lock"/><span className="access-sr-only">{t("Password (fictional demo only)")}</span><input ref={passwordInput} value={password} onChange={e => { setPassword(e.target.value); setErrors({}); }} type={reveal ? "text" : "password"} dir="ltr" placeholder={t("Password")} autoComplete="off" aria-invalid={!!errors.password} aria-describedby={errors.password ? "password-error" : "access-demo-hint"}/><button type="button" className="access-reveal" onClick={() => setReveal(!reveal)} aria-label={t(reveal ? "Hide password" : "Show password")} aria-pressed={reveal}><Icon name={reveal ? "eye" : "hidden"}/></button></label>
            {errors.password && <p className="access-error" id="password-error" role="alert">{t(errors.password)}</p>}
          </div>
          <p id="access-demo-hint" className="access-sample">{t("Offline preview · Use ")}<strong><bdi dir="ltr">demo / preview</bdi></strong>{t(" only")}</p>
          <button type="submit" data-sound="none" className="access-submit">{t("Sign In ")}<Icon name="arrow"/></button>
        </form>
        <div className="access-divider"><span>{t("OR CONTINUE WITH")}</span></div>
        <div className="access-methods" aria-label={t("Visual preview methods")}>
          {[['GitHub', 'Continue securely', 'github'], ['Passkey', 'Use your device', 'key'], ['Fingerprint', 'Quick unlock', 'fingerprint']].map(([name, description, icon]) => <button key={name} type="button" data-sound="open" className={`access-method ${selected === name ? "access-selected" : ""}`} aria-pressed={selected === name} onClick={() => { setSelected(name); setMethod(name); }}>
            <span className={icon === "fingerprint" ? "access-biometric" : ""}>{icon === "fingerprint" ? <Fingerprint/> : <Icon name={icon}/>}</span><span>{t(name)}</span><small>{t(description)}</small>
          </button>)}
        </div>
        <button type="button" className="access-guest" onClick={() => { setUsername(""); setPassword(""); navigate(SCREENS.HOME, { state: { guestPreview: true } }); }}>{t("Continue as Guest ")}<Icon name="arrow"/></button>
        <p className="access-guest-caption">{t("Explore the offline visual demo")}</p>
        <footer className="access-footer">{t("Privacy by design. Always yours.")}</footer>
      </section>
    </div>
    {method && <DemoSheet method={method} onClose={() => setMethod(null)} onContinue={() => { setUsername(""); setPassword(""); navigate(SCREENS.HOME); }}/ >}
  </main>;
}
