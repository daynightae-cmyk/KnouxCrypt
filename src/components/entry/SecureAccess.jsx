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

const GITHUB_APPS_URL = "https://github.com/settings/developers";
const GITHUB_DEVICE_DOCS = "https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps#device-flow";

/** The real main-process GitHub bridge. Absent in a plain browser preview. */
function githubBridge() {
  if (typeof window === "undefined") return null;
  return window.electronAPI?.auth?.github || null;
}

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
  const [githubStatus, setGithubStatus] = useState(null);
  const passwordInput = useRef(null);
  const backTo = location.state?.returnTo === SCREENS.HOME ? SCREENS.HOME : SCREENS.SPLASH_ENTRY;

  const github = useMemo(() => githubBridge(), []);
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

  // Read the real provider state so the GitHub card reports what is actually
  // possible on this device instead of a hardcoded label.
  useEffect(() => {
    let live = true;
    if (!github) return undefined;
    github.status().then((res) => {
      if (live && res?.ok) setGithubStatus(res.data);
    }).catch(() => {});
    return () => { live = false; };
  }, [github]);

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

  const githubHint = !github
    ? t("Desktop only")
    : githubStatus?.authenticated
      ? t("Connected")
      : githubStatus?.configured
        ? t("Sign in")
        : t("Set up");

  const providers = [
    {
      name: "GitHub",
      icon: "github",
      hint: githubHint,
      ready: !!github,
    },
    { name: "Passkey", icon: "key", hint: t("Unavailable"), ready: false },
    { name: "Fingerprint", icon: "fingerprint", hint: t("Unavailable"), ready: false },
  ];

  return <main className="crypt-entry crypt-auth" dir={dir} lang={locale} data-screen="SECURE_ACCESS_LOGIN" data-vault-state={vault.state} data-github-ready={github ? "true" : "false"} aria-labelledby="access-title">
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
          {providers.map(({ name, icon, hint, ready }) => <button key={name} type="button"
            className={`access-method ${ready ? "access-method-ready" : "access-method-unavailable"}`}
            aria-disabled={ready ? undefined : "true"}
            data-provider={name.toLowerCase()}
            data-provider-ready={ready ? "true" : "false"}
            onClick={() => setMethod(name)}>
            <span className={icon === "fingerprint" ? "access-biometric" : ""}>{icon === "fingerprint" ? <Fingerprint/> : <Icon name={icon}/>}</span><span>{t(name)}</span><small>{hint}</small>
          </button>)}
        </div>
        <button type="button" className="access-guest" onClick={continueAsGuest}>{t("Continue as Guest ")}<Icon name="arrow"/></button>
        <p className="access-guest-caption">{t("Guest mode is a non-privileged preview. It cannot encrypt, decrypt, or access vault keys.")}</p>
        <footer className="access-footer">{t("Privacy by design. Always yours.")}</footer>
      </section>
    </div>
    {method && <ProviderDialog method={method} github={github} githubStatus={githubStatus} onGithubStatus={setGithubStatus} onClose={() => setMethod(null)}/>}
  </main>;
}

function ProviderDialog({ method, github, githubStatus, onGithubStatus, onClose }) {
  const { t } = useLanguage();
  const dialog = useRef(null);
  const close = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    dialog.current?.showModal();
    close.current?.focus();
    return () => previous?.focus();
  }, []);
  return <dialog ref={dialog} className="access-dialog" dir="ltr" onCancel={onClose} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }} aria-labelledby="provider-title" aria-describedby="provider-description">
    <div className="access-sheet">
      <button ref={close} type="button" className="access-close" onClick={onClose} aria-label={t("Close")}>{t("×")}</button>
      {method === "GitHub"
        ? <GitHubPanel bridge={github} initialStatus={githubStatus} onStatus={onGithubStatus} onClose={onClose}/>
        : <UnavailablePanel method={method}/>}
    </div>
  </dialog>;
}

function UnavailablePanel({ method }) {
  const { t } = useLanguage();
  const detail = method === "Passkey"
    ? "This build has no WebAuthn credential store and no PRF-based key wrapping, so a passkey cannot unlock the vault. KnouxCrypt will not show a simulated passkey prompt."
    : "This build does not connect a native Windows Hello or biometric API to the vault key, so a fingerprint cannot unlock the vault. KnouxCrypt will not show a simulated scan.";
  return <>
    <p className="access-demo-label">{t("NOT AVAILABLE")}</p>
    <h2 id="provider-title">{t(`${method} sign-in`)}</h2>
    <p id="provider-description">{t(detail)}</p>
    <p className="access-fineprint">{t("The vault password remains the only unlock method in this build. No provider connection or device scan is running.")}</p>
  </>;
}

function GitHubPanel({ bridge, initialStatus, onStatus, onClose }) {
  const { t } = useLanguage();
  const { cue } = useKnouxAudio();
  const [status, setStatus] = useState(initialStatus || null);
  const [device, setDevice] = useState(initialStatus?.pending || null);
  const [showSetup, setShowSetup] = useState(false);
  const [clientId, setClientId] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const deviceRef = useRef(device);
  const copyTimer = useRef(null);

  const applyStatus = (next) => {
    setStatus(next);
    onStatus?.(next);
  };

  useEffect(() => { deviceRef.current = device; }, [device]);

  useEffect(() => {
    let live = true;
    if (!bridge) return undefined;
    bridge.status().then((res) => {
      if (!live) return;
      if (res?.ok) {
        applyStatus(res.data);
        if (res.data.pending) setDevice(res.data.pending);
      } else if (res?.error) {
        setError(res.error);
      }
    }).catch(() => {});
    return () => {
      live = false;
      if (copyTimer.current) clearTimeout(copyTimer.current);
      // Closing the panel must stop a real device authorization that is still
      // waiting, not leave it running invisibly.
      const current = deviceRef.current;
      if (current) bridge.cancel(current.id).catch(() => {});
    };
    // The bridge is a stable object for the lifetime of the window.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bridge]);

  // One poll per interval, driven from the renderer but executed in the main
  // process. The main process owns the device code and applies slow_down.
  useEffect(() => {
    if (!bridge || !device) return undefined;
    let cancelled = false;
    let timer = null;
    let interval = Math.max(3, device.interval || 5);

    const schedule = (seconds) => {
      timer = setTimeout(tick, Math.max(3, seconds) * 1000);
    };

    const tick = async () => {
      const current = deviceRef.current;
      if (!current) return;
      const res = await bridge.poll(current.id).catch(() => null);
      if (cancelled) return;
      if (!res?.ok) {
        setDevice(null);
        setError(res?.error || { code: "GH_NETWORK", message: "GitHub sign-in could not continue. Start again." });
        return;
      }
      const data = res.data;
      if (data.status === "complete") {
        setDevice(null);
        setCopied(false);
        cue("open");
        const refreshed = await bridge.status().catch(() => null);
        if (refreshed?.ok) applyStatus(refreshed.data);
        return;
      }
      interval = Math.max(3, data.interval || interval);
      setDevice((d) => d ? { ...d, interval, expiresIn: data.expiresIn } : d);
      schedule(interval);
    };

    schedule(interval);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
    // Re-arm only for a new device authorization, not on every interval update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bridge, device?.id]);

  async function startFlow() {
    if (!bridge) return;
    setBusy(true);
    setError(null);
    setShowSetup(false);
    let res;
    try {
      res = await bridge.begin();
    } catch {
      res = { ok: false, error: { code: "GH_NETWORK", message: "GitHub sign-in could not start. Try again." } };
    }
    setBusy(false);
    if (!res?.ok) {
      setError(res?.error || { code: "GH_PROVIDER", message: "GitHub sign-in could not start." });
      if (res?.error?.code === "GH_NOT_CONFIGURED") setShowSetup(true);
      return;
    }
    setDevice(res.data);
    setStatus((s) => s ? { ...s, pending: res.data } : s);
  }

  async function saveClientId(e) {
    e.preventDefault();
    if (!bridge) return;
    const value = clientId.trim();
    if (!value) {
      setError({ code: "GH_BAD_INPUT", message: "Paste the Client ID from your OAuth App settings." });
      return;
    }
    setBusy(true);
    setError(null);
    let configured;
    try {
      configured = await bridge.configure(value);
    } catch {
      configured = { ok: false, error: { code: "GH_PROVIDER", message: "The client ID could not be saved." } };
    }
    if (!configured?.ok) {
      setBusy(false);
      setError(configured?.error || { code: "GH_PROVIDER", message: "The client ID could not be saved." });
      return;
    }
    applyStatus(configured.data);
    setClientId("");
    setBusy(false);
    await startFlow();
  }

  async function cancelFlow() {
    const current = deviceRef.current;
    setDevice(null);
    setCopied(false);
    setError(null);
    if (current && bridge) await bridge.cancel(current.id).catch(() => {});
  }

  async function signOut() {
    if (!bridge) return;
    setBusy(true);
    let res;
    try {
      res = await bridge.signOut();
    } catch {
      res = null;
    }
    setBusy(false);
    if (res?.ok) applyStatus({ ...(status || {}), authenticated: false, user: null, pending: null });
    else setError({ code: "GH_PROVIDER", message: "GitHub sign-out did not complete. Try again." });
  }

  async function copyCode() {
    if (!device) return;
    try {
      await navigator.clipboard.writeText(device.userCode);
      setCopied(true);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 2500);
    } catch {
      setError({ code: "CLIPBOARD", message: "Copy failed. Select the code and copy it manually." });
    }
  }

  function openDevicePage() {
    const target = device?.verificationUriComplete || device?.verificationUri || status?.verificationUri;
    if (target && bridge) bridge.openVerification(target).catch(() => {});
  }

  if (!bridge) {
    return <>
      <p className="access-demo-label">{t("DESKTOP ONLY")}</p>
      <h2 id="provider-title">{t("GitHub sign-in")}</h2>
      <p id="provider-description">{t("GitHub's OAuth endpoints do not allow browser requests, so this web preview cannot start a real sign-in. Open the installed desktop app to connect GitHub.")}</p>
      <p className="access-fineprint">{t("Nothing is simulated here: no code is generated and no account is connected in this preview.")}</p>
      <a className="access-dismiss" href={GITHUB_DEVICE_DOCS} target="_blank" rel="noreferrer noopener">{t("How GitHub Device Flow works")}</a>
    </>;
  }

  if (error) {
    return <>
      <p className="access-demo-label">{t("GITHUB SIGN-IN")}</p>
      <h2 id="provider-title">{t("Could not continue")}</h2>
      <p id="provider-description" role="alert" data-github-error={error.code}>{error.message}</p>
      <button type="button" className="access-submit" onClick={() => { setError(null); if (status?.configured) startFlow(); else setShowSetup(true); }} disabled={busy}>{t("Try again")}</button>
      <button type="button" className="access-dismiss" onClick={onClose}>{t("Back to Secure Access")}</button>
    </>;
  }

  if (status?.authenticated && status.user) {
    const user = status.user;
    const initials = (user.name || user.login).slice(0, 2).toUpperCase();
    return <>
      <p className="access-demo-label">{t("CONNECTED")}</p>
      <h2 id="provider-title">{t("GitHub account")}</h2>
      <div className="access-identity">
        <span className="access-avatar" aria-hidden="true">{initials}</span>
        <div><strong>{user.name || user.login}</strong><span>@{user.login}</span></div>
      </div>
      <p id="provider-description">{t("GitHub confirmed this identity. It does not unlock your vault: your vault password is still required to decrypt anything on this device.")}</p>
      <a className="access-dismiss" href={user.htmlUrl} target="_blank" rel="noreferrer noopener">{t("Open GitHub profile")}</a>
      <button type="button" className="access-dismiss" onClick={signOut} disabled={busy}>{t("Disconnect GitHub")}</button>
      <button type="button" className="access-submit" onClick={onClose}>{t("Back to Secure Access")}</button>
    </>;
  }

  if (device) {
    const minutes = Math.max(1, Math.ceil((device.expiresIn || 0) / 60));
    return <>
      <p className="access-demo-label">{t("WAITING FOR GITHUB")}</p>
      <h2 id="provider-title">{t("Enter this code on GitHub")}</h2>
      <div className="access-code" data-device-code={device.userCode}>
        <span>{device.userCode}</span>
        <button type="button" onClick={copyCode} aria-label={t("Copy code")}>{copied ? t("Copied") : t("Copy")}</button>
      </div>
      <p id="provider-description">{t("Open the GitHub device page, sign in, and enter the code above. This panel checks automatically; the code expires in about ")}{minutes}{t(" minutes.")}</p>
      <button type="button" className="access-submit" onClick={openDevicePage}>{t("Open GitHub device page")}</button>
      <p className="access-wait">{t("Waiting for authorization")}{" · "}{t("checking every ")}{Math.max(3, device.interval || 5)}{t("s")}</p>
      <button type="button" className="access-dismiss" onClick={cancelFlow}>{t("Cancel sign-in")}</button>
    </>;
  }

  if (!status) {
    return <>
      <p className="access-demo-label">{t("GITHUB SIGN-IN")}</p>
      <h2 id="provider-title">{t("Checking configuration")}</h2>
      <p id="provider-description">{t("Reading the saved GitHub OAuth App settings on this device.")}</p>
    </>;
  }

  if (showSetup || !status.configured) {
    return <>
      <p className="access-demo-label">{t("SETUP REQUIRED")}</p>
      <h2 id="provider-title">{t("Connect GitHub")}</h2>
      <p id="provider-description">{t("GitHub sign-in uses an OAuth App with Device Flow. Create the app once, then paste its public Client ID here. No client secret is needed and none is stored.")}</p>
      <ol className="access-steps">
        <li>{t("Open ")}<a href={GITHUB_APPS_URL} target="_blank" rel="noreferrer noopener">{t("GitHub Developer Settings")}</a>{t(" and create an OAuth App.")}</li>
        <li>{t("Open the app settings and enable ")}<strong>{t("Device Flow")}</strong>{t(".")}</li>
        <li>{t("Copy the ")}<strong>{t("Client ID")}</strong>{t(" into the field below.")}</li>
      </ol>
      <form className="access-form" onSubmit={saveClientId} noValidate>
        <label className="access-field">
          <Icon name="key"/>
          <span className="access-sr-only">{t("OAuth App Client ID")}</span>
          <input value={clientId} onChange={(e) => { setClientId(e.target.value); setError(null); }} dir="ltr" placeholder={t("OAuth App Client ID")} autoComplete="off" spellCheck="false" disabled={busy}/>
        </label>
        <button type="submit" className="access-submit" disabled={busy} aria-busy={busy}>{t("Save and continue")}{" "}<Icon name="arrow"/></button>
      </form>
      <a className="access-fineprint access-docs-link" href={GITHUB_DEVICE_DOCS} target="_blank" rel="noreferrer noopener">{t("How GitHub Device Flow works")}</a>
    </>;
  }

  return <>
    <p className="access-demo-label">{t("READY")}</p>
    <h2 id="provider-title">{t("Connect GitHub")}</h2>
    <p id="provider-description">{t("When you continue, GitHub shows a one-time code. Enter it on github.com to approve this device.")}</p>
    <p className="access-fineprint">{t("KnouxCrypt never receives your GitHub password. The OAuth token is used once to read your public profile and is then discarded. Signing in does not unlock the vault.")}</p>
    <button type="button" className="access-submit" onClick={startFlow} disabled={busy} aria-busy={busy}>{t("Continue with GitHub")}</button>
    <button type="button" className="access-dismiss" onClick={() => { setShowSetup(true); setError(null); }}>{t("Use a different client ID")}</button>
  </>;
}
