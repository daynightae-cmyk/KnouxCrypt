import { useLanguage } from "../../i18n/Language";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { SCREENS } from "../../config/screens";
import { Fingerprint } from "./SplashEntry";
import valley from "../../assets/auth-landscape.webp";
import { StagEmblem } from "./StagEmblem";
import "./access.css";
import { useKnouxAudio } from "../shell/KnouxAudioProvider";
import { useVault, VAULT_STATE } from "../../hooks/useVault";

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
    shield: <><path d="M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6Z"/><path d="m9 12 2 2 4-4"/></>,
    alert: <><path d="M12 3 2 20h20Z"/><path d="M12 10v4m0 3v.5"/></>,
  };
  if (name === "github") return <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M12 .8a11.2 11.2 0 0 0-3.54 21.83c.56.1.77-.24.77-.54v-2.1c-3.12.68-3.78-1.33-3.78-1.33-.51-1.3-1.25-1.64-1.25-1.64-1.02-.7.08-.68.08-.68 1.13.08 1.72 1.16 1.72 1.16 1 1.71 2.62 1.22 3.26.93.1-.73.39-1.22.71-1.5-2.49-.28-5.1-1.25-5.1-5.54 0-1.22.44-2.22 1.15-3-.12-.28-.5-1.42.11-2.96 0 0 .94-.3 3.08 1.15a10.7 10.7 0 0 1 5.6 0c2.14-1.45 3.08-1.15 3.08-1.15.61 1.54.23 2.68.11 2.96.71.78 1.15 1.78 1.15 3 0 4.3-2.62 5.25-5.12 5.53.4.35.76 1.03.76 2.08v3.09c0 .3.2.65.77.54A11.2 11.2 0 0 0 12 .8Z"/></svg>;
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

const ERROR_COPY = {
  AUTH_FAILED: "Incorrect password.",
  LOCKED_OUT: "Too many failed attempts. Try again shortly.",
  SESSION_REQUIRED: "Your session ended. Unlock again to continue.",
  SESSION_REVOKED: "This session was revoked. Unlock again to continue.",
  BAD_INPUT: "Check your input and try again.",
  NOT_ENROLLED: "No vault exists on this device yet.",
  ALREADY_ENROLLED: "A vault is already enrolled on this device.",
  INTEGRITY_FAILED: "The stored vault data failed its integrity check.",
  UNAVAILABLE: "The secure vault engine is unavailable in this preview.",
};

export function SecureAccess() {
  const { cue } = useKnouxAudio();
  const { t, locale, dir } = useLanguage();

  const navigate = useNavigate();
  const location = useLocation();
  const vault = useVault();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [reveal, setReveal] = useState(false);
  const [errors, setErrors] = useState({});
  const [method, setMethod] = useState(null);
  const [selected, setSelected] = useState(null);
  const passwordInput = useRef(null);
  const backTo = location.state?.returnTo === SCREENS.HOME ? SCREENS.HOME : SCREENS.SPLASH_ENTRY;

  const enrolled = !!vault.status?.enrolled;
  const engineReady = vault.available;
  const unlockMode = enrolled;

  const errorMessage = useMemo(() => {
    if (!vault.error) return null;
    return ERROR_COPY[vault.error.code] || vault.error.message || "Vault operation failed.";
  }, [vault.error]);

  useEffect(() => {
    if (vault.state === VAULT_STATE.UNLOCKED) navigate(SCREENS.HOME);
  }, [vault.state, navigate]);

  async function submit(e) {
    e.preventDefault();
    const nextErrors = {};
    if (!password) nextErrors.password = "Enter your vault password.";
    if (!unlockMode && password && password.length < 8) {
      nextErrors.password = "Use at least 8 characters for a new vault.";
    }
    if (!unlockMode && password !== confirm) {
      nextErrors.confirm = "The two passwords do not match.";
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      cue("warning");
      passwordInput.current?.focus();
      return;
    }
    cue("open");
    const res = unlockMode ? await vault.unlock(password) : await vault.enroll(password);
    if (res?.ok) {
      setPassword("");
      setConfirm("");
      navigate(SCREENS.HOME);
    } else {
      cue("warning");
    }
  }

  async function continueAsGuest() {
    setPassword("");
    setConfirm("");
    const res = await vault.startGuest();
    navigate(SCREENS.HOME, { state: { guestPreview: true, guest: !!res?.ok } });
  }

  const primaryLabel = unlockMode ? "Unlock Vault" : "Create Local Vault";

  return <main className="crypt-entry crypt-auth" dir={dir} lang={locale} data-screen="SECURE_ACCESS_LOGIN" data-vault-state={vault.state} aria-labelledby="access-title">
    <div className="crypt-atmosphere" aria-hidden="true"><i className="crypt-horizon crypt-horizon-top"/><i className="crypt-horizon crypt-horizon-bottom"/><i className="crypt-ember"/><i className="crypt-ember"/></div>
    <div className="access-composition">
      <Link className="access-back" to={backTo} aria-label={t(backTo === SCREENS.HOME ? "Back to Home" : "Back to Splash")}><Icon name="back"/></Link>
      <header className="access-hero">
        <div className="access-art"><img className="access-valley" src={valley} width="882" height="373" alt=""/><StagEmblem className="access-new-stag"/></div>
        <div className="access-brand">{t("Knoux ")}<span>{t("Crypt")}</span></div>
        <p className="access-caption">{t("Private Encryption Suite")}</p>
      </header>
      <section className="access-content">
        <div className="access-heading"><h1 id="access-title">{t("Secure ")}<span>{t("Access")}</span></h1><p>{t(unlockMode ? "Your keys stay protected." : "Set up protection on this device.")}</p></div>

        {!engineReady && <p className="access-notice" role="status" data-vault-unavailable>
          <Icon name="alert"/>{t("Secure vault engine unavailable. Open the desktop app to enroll or unlock a real vault.")}
        </p>}

        {engineReady && <p className="access-notice" role="status" data-vault-status={vault.state}>
          <Icon name="shield"/>{t(unlockMode ? "Local vault detected. Enter your password to unlock." : "No vault on this device yet. Create one to enable real encryption.")}
        </p>}

        <form className="access-form" onSubmit={submit} noValidate autoComplete="off" aria-label={t(unlockMode ? "Unlock the local vault" : "Create a local vault")}>
          <div className="access-field-group">
            <label className={`access-field ${errors.password ? "access-invalid" : ""}`}><Icon name="lock"/><span className="access-sr-only">{t("Vault password")}</span>
              <input ref={passwordInput} value={password} onChange={e => { setPassword(e.target.value); setErrors({}); }} type={reveal ? "text" : "password"} dir="ltr" placeholder={t("Vault password")} autoComplete="off" aria-invalid={!!errors.password} aria-describedby={errors.password ? "password-error" : undefined} disabled={!engineReady}/>
              <button type="button" className="access-reveal" onClick={() => setReveal(!reveal)} aria-label={t(reveal ? "Hide password" : "Show password")} aria-pressed={reveal}><Icon name={reveal ? "eye" : "hidden"}/></button>
            </label>
            {errors.password && <p className="access-error" id="password-error" role="alert">{t(errors.password)}</p>}
          </div>
          {!unlockMode && <div className="access-field-group">
            <label className={`access-field ${errors.confirm ? "access-invalid" : ""}`}><Icon name="lock"/><span className="access-sr-only">{t("Confirm password")}</span>
              <input value={confirm} onChange={e => { setConfirm(e.target.value); setErrors({}); }} type={reveal ? "text" : "password"} dir="ltr" placeholder={t("Confirm password")} autoComplete="off" aria-invalid={!!errors.confirm} aria-describedby={errors.confirm ? "confirm-error" : undefined} disabled={!engineReady}/>
            </label>
            {errors.confirm && <p className="access-error" id="confirm-error" role="alert">{t(errors.confirm)}</p>}
          </div>}
          {errorMessage && <p className="access-error" role="alert" data-vault-error={vault.error?.code}>{t(errorMessage)}</p>}
          <button type="submit" data-sound="none" className="access-submit" disabled={!engineReady || vault.busy} aria-busy={vault.busy}>{t(primaryLabel)}{" "}<Icon name="arrow"/></button>
        </form>

        <div className="access-divider"><span>{t("OR CONTINUE WITH")}</span></div>
        <div className="access-methods" aria-label={t("Provider capability")}>
          {[["GitHub", "Not configured", "github"], ["Passkey", "Not configured", "key"], ["Fingerprint", "Not configured", "fingerprint"]].map(([name, description, icon]) => <button key={name} type="button" className="access-method access-method-unavailable" aria-disabled="true" data-provider={name.toLowerCase()} onClick={() => { setSelected(name); setMethod(name); }}>
            <span className={icon === "fingerprint" ? "access-biometric" : ""}>{icon === "fingerprint" ? <Fingerprint/> : <Icon name={icon}/>}</span><span>{t(name)}</span><small>{t(description)}</small>
          </button>)}
        </div>
        <button type="button" className="access-guest" onClick={continueAsGuest}>{t("Continue as Guest ")}<Icon name="arrow"/></button>
        <p className="access-guest-caption">{t("Guest mode is a non-privileged preview. It cannot encrypt, decrypt, or access vault keys.")}</p>
        <footer className="access-footer">{t("Privacy by design. Always yours.")}</footer>
      </section>
    </div>
    {method && <ProviderDialog method={method} onClose={() => setMethod(null)}/>}
  </main>;
}

function ProviderDialog({ method, onClose }) {
  const { t } = useLanguage();
  const dialog = useRef(null);
  const close = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    dialog.current?.showModal();
    close.current?.focus();
    return () => previous?.focus();
  }, []);
  return <dialog ref={dialog} className="access-dialog" onCancel={onClose} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }} aria-labelledby="provider-title" aria-describedby="provider-description">
    <div className="access-sheet">
      <button ref={close} type="button" className="access-close" onClick={onClose} aria-label={t("Close")}>{t("×")}</button>
      <p className="access-demo-label">{t("NOT CONFIGURED")}</p>
      <h2 id="provider-title">{t(`${method} sign-in`)}</h2>
      <p id="provider-description">{t(`${method} sign-in is not configured on this device. No provider connection, device scan, or authentication is running, and this button does not unlock the vault.`)}</p>
      <button className="access-dismiss" type="button" onClick={onClose}>{t("Back to Secure Access")}</button>
    </div>
  </dialog>;
}
