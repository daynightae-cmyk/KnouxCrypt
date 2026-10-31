import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { SCREENS } from "../../config/screens";
import { useLanguage } from "../../i18n/Language";
import { Mark, CapabilityCard, PreviewSheet } from "../security/ScreenUI";
import { useVault } from "../../hooks/useVault";
import "./devices.css";

const ERROR_COPY = {
  BAD_INPUT: "Check the input and try again.",
  NOT_FOUND: "The selected item was not found.",
  IO_FAILED: "The operation could not be completed on disk.",
  AUTH_FAILED: "The authentication phrase did not match.",
  SESSION_REQUIRED: "Unlock the vault to use this operation.",
  SESSION_REVOKED: "Your session was revoked. Unlock again to continue.",
  UNAVAILABLE: "The desktop vault bridge is unavailable in this preview.",
};

function errorText(error) {
  if (!error) return "";
  return ERROR_COPY[error.code] || error.message || "The operation failed.";
}

function Frame({ title, icon, parent = SCREENS.TOOLS, motion = "", live = false, children }) {
  const { t, locale, dir } = useLanguage();
  return (
    <main className={`device-preview ${motion}`} dir={dir} lang={locale}>
      <div className="device-shell">
        <Link className="device-back" to={parent}>
          ‹{" "}
          {t(
            parent === SCREENS.PASSWORDS
              ? "Back to Passwords"
              : parent === SCREENS.SECURE_SHARE
                ? "Back to Secure Share"
                : "Back to Tools",
          )}
        </Link>
        <div className="device-hero" aria-hidden="true">
          <span />
          <Mark name={icon} />
          <i />
        </div>
        <h1>{t(title)}</h1>
        <p className="device-notice">{t(live ? "REAL SERVICE" : "VISUAL DEMO")}</p>
        {children}
      </div>
    </main>
  );
}

function Error({ error }) {
  if (!error) return null;
  return (
    <p className="device-warning" role="alert">
      {errorText(error)}
    </p>
  );
}

function Toggle({ label, value, onChange, disabled }) {
  const { t } = useLanguage();
  return (
    <label className="device-toggle">
      <span>{t(label)}</span>
      <input type="checkbox" checked={value} disabled={disabled} onChange={onChange} />
    </label>
  );
}

// ---------------------------------------------------------------------------
// Task 33 — Android Autofill preview
// ---------------------------------------------------------------------------

export function AndroidAutofill() {
  const { t } = useLanguage();
  const vault = useVault();
  const [state, setState] = useState(null);
  const [error, setError] = useState(null);
  const [sheet, setSheet] = useState(false);

  const load = useCallback(async () => {
    const res = await vault.autofillGet();
    if (res?.ok) setState(res.data);
    else setError(res?.error);
  }, [vault]);

  useEffect(() => {
    load();
  }, [load]);

  const toggle = async (key) => {
    setError(null);
    const res = await vault.autofillUpdate({ [key]: !state?.values?.[key] });
    if (res?.ok) setState(res.data);
    else setError(res?.error);
  };

  const values = state?.values || { suggestions: false, mask: true, confirmation: true };
  const caps = state?.capabilities;

  return (
    <Frame title="ANDROID AUTOFILL CONTROL" icon="key" parent={SCREENS.PASSWORDS} motion="device-autofill" live>
      <section className="device-panel">
        <h2>{t("Android Autofill")}</h2>
        {[
          ["suggestions", "Suggestion preview"],
          ["mask", "Mask demo suggestions"],
          ["confirmation", "Require visual confirmation"],
        ].map(([key, label]) => (
          <Toggle key={key} label={label} value={values[key]} onChange={() => toggle(key)} disabled={!vault.available} />
        ))}
        <p>
          {t("These switches change only a local preview. They do not change Android permissions or enable autofill.")}
        </p>
      </section>
      <button className="device-row" type="button" onClick={() => setSheet(true)}>
        {t("Autofill guidance")}
        <Mark name="chevron" />
      </button>
      <button className="security-primary" type="button" disabled aria-disabled="true">
        {t("Open Android Autofill Settings")}
        <Mark name="arrow" />
      </button>
      <p className="device-warning">{t("UNAVAILABLE IN DEMO · native settings are not opened")}</p>
      {caps && (
        <dl className="device-evidence">
          <dt>{t("Native Autofill")}</dt>
          <dd>{t(caps.nativeAutofill ? "Available" : "Not available on this platform")}</dd>
          <dt>{t("Provider registration")}</dt>
          <dd>{t(caps.canRegisterProvider ? "Available" : "Not available")}</dd>
          <dt>{t("Settings CTA")}</dt>
          <dd>{t(caps.canOpenSettings ? "Available" : "Not available")}</dd>
        </dl>
      )}
      <Error error={error} />
      <CapabilityCard id="ANDROID_AUTOFILL" />
      {sheet && (
        <PreviewSheet title="Autofill guidance" onClose={() => setSheet(false)}>
          <p>
            {t(
              "Autofill is provided by the Android operating system. The desktop build cannot register a credential provider or open the device settings screen, so those actions stay disabled rather than pretending to succeed.",
            )}
          </p>
        </PreviewSheet>
      )}
    </Frame>
  );
}

// ---------------------------------------------------------------------------
// Task 34 — Offline Security Advisor
// ---------------------------------------------------------------------------

export function OfflineAdvisor() {
  const { t } = useLanguage();
  const vault = useVault();
  const [filter, setFilter] = useState("All");
  const [report, setReport] = useState(null);
  const [error, setError] = useState(null);
  const [open, setOpen] = useState(null);

  const review = useCallback(
    async (value) => {
      setError(null);
      const res = await vault.advisorReview(value);
      if (res?.ok) setReport(res.data);
      else setError(res?.error);
    },
    [vault],
  );

  useEffect(() => {
    review("All");
  }, [review]);

  const rows = (report?.rows || []).filter((r) => filter === "All" || r.category === filter);

  return (
    <Frame title="OFFLINE SECURITY ADVISOR" icon="shield" motion="device-radar" live>
      <section className="device-panel">
        <h2>{t("Local Readiness Review")}</h2>
        <p>
          {t(
            "This review reports only the state KnouxCrypt itself owns. It does not scan the operating system, installed software, permissions or the network.",
          )}
        </p>
      </section>
      <div className="device-choices" role="group" aria-label={t("Guidance filter")}>
        {["All", "Vault", "Privacy", "Recovery", "Device"].map((v) => (
          <button
            type="button"
            key={v}
            aria-pressed={filter === v}
            onClick={() => {
              setFilter(v);
              review(v);
            }}
          >
            {t(v)}
          </button>
        ))}
      </div>
      <section className="device-panel">
        <h2>{t("Recommended Checks")}</h2>
        {report?.counts && (
          <p>
            {report.counts.observed} {t("observed")} · {report.counts.manual} {t("manual")} · {report.counts.attention}{" "}
            {t("need attention")}
          </p>
        )}
        {rows.map((row) => (
          <button type="button" className="device-row" key={row.id} onClick={() => setOpen(row)}>
            {t(row.title)}
            <span>
              {t(row.kind === "OBSERVED" ? (row.status === "attention" ? "Needs attention" : "Observed") : "Manual check")}
            </span>
            <Mark name="chevron" />
          </button>
        ))}
      </section>
      <Error error={error} />
      <CapabilityCard id="OFFLINE_ADVISOR" />
      {open && (
        <PreviewSheet title={open.title} onClose={() => setOpen(null)} label="REAL SERVICE">
          <p>{t(open.guidance)}</p>
          <dl className="device-evidence">
            <dt>{t("Evidence source")}</dt>
            <dd dir="ltr">{open.evidence || "—"}</dd>
            <dt>{t("Kind")}</dt>
            <dd>{t(open.kind === "OBSERVED" ? "Observed locally" : "Manual, not evaluated")}</dd>
            {open.value && (
              <>
                <dt>{t("Value")}</dt>
                <dd dir="ltr">{String(open.value)}</dd>
              </>
            )}
          </dl>
        </PreviewSheet>
      )}
    </Frame>
  );
}

// ---------------------------------------------------------------------------
// Task 35 — Multi-Device Pairing (loopback only)
// ---------------------------------------------------------------------------

export function DevicePairing() {
  const { t } = useLanguage();
  const vault = useVault();
  const [session, setSession] = useState(null);
  const [step, setStep] = useState(0);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);

  const start = async () => {
    setError(null);
    setDone(false);
    const res = await vault.pairingStart({ label: "This device" });
    if (res?.ok) {
      setSession(res.data);
      setStep(1);
      setConfirmed(false);
    } else setError(res?.error);
  };

  const confirm = async () => {
    setError(null);
    const res = await vault.pairingConfirm(session.sessionId, { matches: true, phrase: session.sasText });
    if (res?.ok) {
      setDone(true);
      setStep(2);
    } else setError(res?.error);
  };

  const cancel = async () => {
    if (session) await vault.pairingCancel(session.sessionId);
    setSession(null);
    setStep(0);
    setConfirmed(false);
    setDone(false);
  };

  return (
    <Frame
      title="MULTI-DEVICE PAIRING"
      icon="upload"
      parent={SCREENS.SECURE_SHARE}
      motion={`device-pairing device-pairing-step-${step}`}
      live
    >
      <section className="device-panel">
        <h2>{t("Pairing Session")}</h2>
        <p>{t("Loopback key agreement only · no network connection is opened")}</p>
        <div className="device-steps" aria-label={t("Pairing Steps")}>
          {[0, 1, 2].map((value) => (
            <button
              key={value}
              type="button"
              aria-current={step === value ? "step" : undefined}
              onClick={() => setStep(value)}
            >
              {value + 1}
            </button>
          ))}
        </div>
        <h3>{t(["Select devices", "Compare phrase", "Confirm"][step])}</h3>
        {session ? (
          <>
            <p>
              {t("This device")} ↔ {t("Peer role")}
            </p>
            <code dir="ltr">{session.sasText}</code>
            <p className="device-hint">
              {t("Algorithm")}: <span dir="ltr">{session.algorithm}</span>
            </p>
            <p className="device-hint">
              {t("Local fingerprint")}: <span dir="ltr">{session.localFingerprint}</span>
            </p>
            <p className="device-hint">
              {t("Peer fingerprint")}: <span dir="ltr">{session.peerFingerprint}</span>
            </p>
            {step === 1 && (
              <Toggle
                label="I compared the authentication phrase"
                value={confirmed}
                onChange={() => setConfirmed((v) => !v)}
              />
            )}
          </>
        ) : (
          <p>{t("No pairing session is open yet.")}</p>
        )}
      </section>
      {!session && (
        <button type="button" className="security-primary" onClick={start} disabled={!vault.available}>
          {t("Start Device Pairing")}
          <Mark name="arrow" />
        </button>
      )}
      {session && !done && (
        <button type="button" className="security-primary" disabled={!confirmed} onClick={confirm}>
          {t("Confirm pairing phrase")}
          <Mark name="arrow" />
        </button>
      )}
      {session && (
        <button type="button" className="device-secondary" onClick={cancel}>
          {t("Cancel pairing")}
        </button>
      )}
      {done && (
        <p className="device-notice" role="status">
          {t("Phrase confirmed locally. This is a loopback demonstration, not a trusted remote device.")}
        </p>
      )}
      <Link className="device-link" to={SCREENS.LOCAL_TRANSFER}>
        {t("Local Transfer")}
      </Link>
      <Error error={error} />
      <CapabilityCard id="DEVICE_PAIRING" />
    </Frame>
  );
}

// ---------------------------------------------------------------------------
// Task 36 — Password Strength Audit
// ---------------------------------------------------------------------------

export function PasswordAudit() {
  const { t } = useLanguage();
  const vault = useVault();
  const [text, setText] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [reveal, setReveal] = useState(false);

  const run = async () => {
    setError(null);
    const res = await vault.passwordAudit(text);
    if (res?.ok) setResult(res.data);
    else setError(res?.error);
  };

  const score = result?.score ?? -1;
  const gauge = result ? `${(score + 1) * 20}%` : "0%";

  return (
    <Frame title="PASSWORD AUDIT" icon="lock" parent={SCREENS.PASSWORDS} live>
      <p className="device-warning">
        {t(
          "Offline heuristic estimate. No breach database is consulted and nothing is stored. Do not type a real password.",
        )}
      </p>
      <section className="device-panel">
        <label className="device-field">
          {t("Audit text")}
          <input
            dir="auto"
            type={reveal ? "text" : "password"}
            maxLength={256}
            value={text}
            autoComplete="off"
            onChange={(e) => {
              setText(e.target.value);
              setResult(null);
            }}
          />
        </label>
        <button
          className="device-secondary"
          type="button"
          aria-pressed={reveal}
          onClick={() => setReveal((v) => !v)}
        >
          {t(reveal ? "Hide text" : "Reveal text")}
        </button>
        <div className="device-audit-gauge" aria-label={t("Estimated strength")} data-score={result ? score : "idle"}>
          <i style={{ width: gauge }} />
        </div>
        <p>
          {result
            ? `${t(result.scoreLabel)} · ${result.entropyBits} ${t("bits")} · ${result.guessesLog10} log10 ${t("guesses")}`
            : t("Gauge inactive until you run an audit.")}
        </p>
        {result && (
          <ul className="device-audit-list">
            {result.feedback.warnings.map((w) => (
              <li key={w}>{t(w)}</li>
            ))}
            {result.feedback.suggestions.map((s) => (
              <li key={s}>{t(s)}</li>
            ))}
          </ul>
        )}
      </section>
      <button type="button" className="security-primary" disabled={!text.trim()} onClick={run}>
        {t("Run Local Password Audit")}
        <Mark name="arrow" />
      </button>
      {result && (
        <p className="device-notice" role="status">
          {t(result.limits.note)}
        </p>
      )}
      <Error error={error} />
      <CapabilityCard id="PASSWORD_AUDIT" />
    </Frame>
  );
}
