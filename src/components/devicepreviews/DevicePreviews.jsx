import React, { useState } from "react";
import { Link } from "react-router-dom";
import { SCREENS } from "../../config/screens";
import { useLanguage } from "../../i18n/Language";
import { Mark, PreviewSheet } from "../security/ScreenUI";
import "./devices.css";
function Frame({ title, icon, parent = SCREENS.TOOLS, motion = "", children }) {
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
        <p className="device-notice">{t("VISUAL DEMO")}</p>
        {children}
      </div>
    </main>
  );
}
function Toggle({ label, value, onChange }) {
  const { t } = useLanguage();
  return (
    <label className="device-toggle">
      <span>{t(label)}</span>
      <input type="checkbox" checked={value} onChange={onChange} />
    </label>
  );
}
export function AndroidAutofill() {
  const { t } = useLanguage();
  const [options, setOptions] = useState({
    suggestions: false,
    mask: true,
    confirmation: true,
  });
  const [sheet, setSheet] = useState(null);
  return (
    <Frame
      title="ANDROID AUTOFILL CONTROL"
      icon="key"
      parent={SCREENS.PASSWORDS}
      motion="device-autofill"
    >
      <section className="device-panel">
        <h2>{t("Android Autofill")}</h2>
        {[
          ["suggestions", "Suggestion preview"],
          ["mask", "Mask demo suggestions"],
          ["confirmation", "Require visual confirmation"],
        ].map(([key, label]) => (
          <Toggle
            key={key}
            label={label}
            value={options[key]}
            onChange={() => setOptions((v) => ({ ...v, [key]: !v[key] }))}
          />
        ))}
        <p>
          {t(
            "These switches do not change Android permissions or enable autofill.",
          )}
        </p>
      </section>
      <button
        className="device-row"
        type="button"
        onClick={() => setSheet("Autofill guidance")}
      >
        {t("Autofill guidance")}
        <Mark name="chevron" />
      </button>
      <button
        className="security-primary"
        type="button"
        onClick={() => setSheet("Unavailable in demo")}
      >
        {t("Open Android Autofill Settings")}
        <Mark name="arrow" />
      </button>
      <p className="device-warning">
        {t("UNAVAILABLE IN DEMO · native settings are not opened")}
      </p>
      {sheet && (
        <PreviewSheet title={sheet} onClose={() => setSheet(null)}>
          <p>
            {t(
              "No system setting or credential provider is accessed. Consult your device settings independently; this preview performs no autofill.",
            )}
          </p>
        </PreviewSheet>
      )}
    </Frame>
  );
}
const GUIDANCE = [
  ["Device lock", "Access"],
  ["Updates", "System"],
  ["Recovery planning", "Access"],
];
export function OfflineAdvisor() {
  const { t } = useLanguage();
  const [filter, setFilter] = useState("All");
  const [sheet, setSheet] = useState(null);
  return (
    <Frame title="OFFLINE SECURITY ADVISOR" icon="shield" motion="device-radar">
      <section className="device-panel">
        <h2>{t("Local Readiness Review")}</h2>
        <p>
          {t(
            "Educational guidance only. No device data, permissions, vulnerabilities or security score are inspected.",
          )}
        </p>
      </section>
      <div
        className="device-choices"
        role="group"
        aria-label={t("Guidance filter")}
      >
        {["All", "Access", "System"].map((v) => (
          <button
            type="button"
            key={v}
            aria-pressed={filter === v}
            onClick={() => setFilter(v)}
          >
            {t(v)}
          </button>
        ))}
      </div>
      <section className="device-panel">
        <h2>{t("Recommended Checks")}</h2>
        {GUIDANCE.filter(
          ([, category]) => filter === "All" || category === filter,
        ).map(([title]) => (
          <button
            type="button"
            className="device-row"
            key={title}
            onClick={() => setSheet(title)}
          >
            {t(title)}
            <span>{t("Not evaluated")}</span>
            <Mark name="chevron" />
          </button>
        ))}
      </section>
      <button
        className="security-primary"
        type="button"
        onClick={() => setSheet("Inspect Device Setup")}
      >
        {t("Inspect Device Setup")}
        <Mark name="arrow" />
      </button>
      {sheet && (
        <PreviewSheet title={sheet} onClose={() => setSheet(null)}>
          <p>
            {t(
              "Review these topics manually on your device. This interface does not scan or verify any setting.",
            )}
          </p>
          <dl className="device-evidence">
            <dt>{t("Evidence source")}</dt>
            <dd>{t("None · educational example")}</dd>
            <dt>{t("Assessment")}</dt>
            <dd>{t("Not evaluated")}</dd>
          </dl>
        </PreviewSheet>
      )}
    </Frame>
  );
}
export function DevicePairing() {
  const { t } = useLanguage();
  const [step, setStep] = useState(0);
  const [confirmed, setConfirmed] = useState(false);
  const [sheet, setSheet] = useState(false);
  return (
    <Frame
      title="MULTI-DEVICE PAIRING"
      icon="upload"
      parent={SCREENS.SECURE_SHARE}
      motion={`device-pairing device-pairing-step-${step}`}
    >
      <section className="device-panel">
        <h2>{t("Pairing Session")}</h2>
        <p>{t("No active connection · fictional devices only")}</p>
        <div className="device-steps" aria-label={t("Pairing Steps")}>
          {[0, 1, 2].map((value) => (
            <button
              key={value}
              type="button"
              aria-current={step === value ? "step" : undefined}
              onClick={() => {
                setStep(value);
                setConfirmed(false);
              }}
            >
              {value + 1}
            </button>
          ))}
        </div>
        <h3>
          {t(
            [
              "Select fictional devices",
              "Review demo phrase",
              "Preview handshake",
            ][step],
          )}
        </h3>
        <p>
          {t("Demo Phone")} ↔ {t("Demo Tablet")}
        </p>
        <code dir="ltr">DEMO · VIOLET RIVER · 0000</code>
        <Toggle
          label="I compared the public demo phrase"
          value={confirmed}
          onChange={() => setConfirmed((v) => !v)}
        />
      </section>
      <button
        type="button"
        className="security-primary"
        disabled={!confirmed}
        onClick={() => setSheet(true)}
      >
        {t("Start Device Pairing")}
        <Mark name="arrow" />
      </button>
      <button
        type="button"
        className="device-secondary"
        onClick={() => {
          setStep(0);
          setConfirmed(false);
        }}
      >
        {t("Cancel preview")}
      </button>
      <Link className="device-link" to={SCREENS.LOCAL_TRANSFER}>
        {t("Local Transfer")}
      </Link>
      {sheet && (
        <PreviewSheet
          title="Pairing handshake preview"
          onClose={() => setSheet(false)}
        >
          <p>
            {t(
              "No pairing session, network connection, trusted device or authentication was created.",
            )}
          </p>
          {step < 2 && (
            <button
              className="security-choice"
              type="button"
              onClick={() => {
                setStep((v) => v + 1);
                setConfirmed(false);
                setSheet(false);
              }}
            >
              {t("Next visual step")}
            </button>
          )}
        </PreviewSheet>
      )}
    </Frame>
  );
}
export function demoPasswordHeuristics(value) {
  return {
    length: value.length >= 12,
    mixed: /[a-z]/.test(value) && /[A-Z]/.test(value),
    digits: /[0-9]/.test(value),
    symbols: /[^a-zA-Z0-9\s]/.test(value),
  };
}
export function PasswordAudit() {
  const { t } = useLanguage();
  const [text, setText] = useState("");
  const [result, setResult] = useState(null);
  const [reveal, setReveal] = useState(false);
  const [sheet, setSheet] = useState(false);
  const count = result ? Object.values(result).filter(Boolean).length : 0;
  return (
    <Frame title="PASSWORD AUDIT" icon="lock" parent={SCREENS.PASSWORDS}>
      <p className="device-warning">
        {t(
          "Fictional text only. Never enter a real password. No account or leaked-password database is scanned.",
        )}
      </p>
      <section className="device-panel">
        <label className="device-field">
          {t("Demo audit text")}
          <input
            dir="auto"
            type={reveal ? "text" : "password"}
            maxLength={200}
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
          {t(reveal ? "Hide demo text" : "Reveal demo text")}
        </button>
        <div
          className="device-audit-gauge"
          aria-label={t("Illustrative pattern gauge")}
        >
          <i style={{ width: `${count * 25}%` }} />
        </div>
        <p>
          {t("Pattern examples matched")} {result ? `${count}/4` : "—"}
        </p>
        {result && (
          <ul className="device-audit-list">
            {[
              ["length", "At least 12 characters"],
              ["mixed", "Both uppercase and lowercase"],
              ["digits", "Contains a digit"],
              ["symbols", "Contains a symbol"],
            ].map(([key, label]) => (
              <li key={key}>
                {t(label)}:{" "}
                {t(result[key] ? "Example present" : "Example absent")}
              </li>
            ))}
          </ul>
        )}
      </section>
      <button
        type="button"
        className="security-primary"
        disabled={!text.trim()}
        onClick={() => setResult(demoPasswordHeuristics(text))}
      >
        {t("Run Local Password Audit")}
        <Mark name="arrow" />
      </button>
      <button
        type="button"
        className="device-secondary"
        onClick={() => setSheet(true)}
      >
        {t("Estimate limitations")}
      </button>
      <p className="device-notice" role="status">
        {result
          ? t(
              "Illustrative string patterns only. This is not a strength, safety or breach assessment.",
            )
          : t("Gauge inactive until fictional input is reviewed.")}
      </p>
      {sheet && (
        <PreviewSheet
          title="Estimate limitations"
          onClose={() => setSheet(false)}
        >
          <p>
            {t(
              "Length and character patterns cannot establish password safety. No entropy, cracking-time or breach result is calculated. Text stays in component memory and is not sent or stored.",
            )}
          </p>
        </PreviewSheet>
      )}
    </Frame>
  );
}
