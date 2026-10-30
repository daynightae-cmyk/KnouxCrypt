import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useLanguage } from "../../i18n/Language";
import { SCREENS } from "../../config/screens";
import { Mark, PreviewSheet } from "../security/ScreenUI";
import { StagEmblem } from "../entry/StagEmblem";
import "./labs.css";
export const CLIPBOARD_SAMPLE = "PUBLIC-CLIPBOARD-DEMO-ONLY";
export const HMAC_SAMPLE = "DEMO-HMAC-NOT-A-MAC";
export function randomPreview(type, length, revision = 0) {
  const size = Math.max(8, Math.min(64, Number(length) || 8));
  const chars =
    type === "Hex"
      ? "0123456789ABCDEF"
      : type === "Base64"
        ? "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
        : "violet-river-demo-";
  return (
    "DEMO:" +
    Array.from(
      { length: size },
      (_, i) => chars[(i * 7 + revision * 3) % chars.length],
    ).join("")
  );
}
function Frame({ title, icon, children, motion = "" }) {
  const { t, locale, dir } = useLanguage();
  return (
    <main className={`lab-screen ${motion}`} dir={dir} lang={locale}>
      <div className="lab-shell">
        <Link className="lab-back" to={SCREENS.TOOLS}>
          ‹ {t("Back to Tools")}
        </Link>
        <div className="lab-art" aria-hidden="true">
          <Mark name={icon} />
          <i />
        </div>
        <h1>{t(title)}</h1>
        <p className="lab-demo">{t("VISUAL DEMO")}</p>
        {children}
      </div>
    </main>
  );
}
function Choices({ values, value, onChange, label }) {
  const { t } = useLanguage();
  return (
    <div className="lab-choices" role="group" aria-label={t(label)}>
      {values.map((v) => (
        <button
          type="button"
          key={v}
          aria-pressed={v === value}
          onClick={() => onChange(v)}
        >
          {t(v)}
        </button>
      ))}
    </div>
  );
}
function Toggle({ label, value, onChange }) {
  const { t } = useLanguage();
  return (
    <label className="lab-toggle">
      <span>{t(label)}</span>
      <input type="checkbox" checked={value} onChange={onChange} />
    </label>
  );
}
function CopyPublic({ value }) {
  const { t } = useLanguage();
  const [status, setStatus] = useState("");
  async function copy() {
    try {
      if (!navigator.clipboard?.writeText) throw new Error();
      await navigator.clipboard.writeText(value);
      setStatus("Public demo copied");
    } catch {
      setStatus("Clipboard unavailable");
    }
  }
  return (
    <div>
      <button type="button" className="lab-secondary" onClick={copy}>
        {t("Copy public demo text")}
      </button>
      <p className="lab-notice" role="status">
        {t(status)}
      </p>
    </div>
  );
}
export function ClipboardGuard() {
  const { t } = useLanguage();
  const [timer, setTimer] = useState("30s");
  const [masked, setMasked] = useState(true);
  const [privateNotice, setPrivateNotice] = useState(true);
  const [sheet, setSheet] = useState(false);
  return (
    <Frame
      title="CLIPBOARD GUARD"
      icon="shield"
      motion={masked ? "lab-shutter" : ""}
    >
      <section className="lab-panel">
        <h2>{t("Clipboard protection")}</h2>
        <p>{t("Not active · visual configuration only")}</p>
        <h3>{t("Automatic clear preview")}</h3>
        <Choices
          values={["15s", "30s", "60s", "Off"]}
          value={timer}
          onChange={setTimer}
          label="Clear timer"
        />
        <Toggle
          label="Mask sample preview"
          value={masked}
          onChange={() => setMasked((v) => !v)}
        />
        <code className="lab-result" dir="ltr">
          {masked ? "••••••••••••" : CLIPBOARD_SAMPLE}
        </code>
        <Toggle
          label="Private notification preview"
          value={privateNotice}
          onChange={() => setPrivateNotice((v) => !v)}
        />
        <CopyPublic value={CLIPBOARD_SAMPLE} />
      </section>
      <p className="lab-warning">
        {t(
          "No clipboard is read, monitored or automatically cleared. Never copy real secrets for this demo.",
        )}
      </p>
      <button
        className="security-primary"
        type="button"
        onClick={() => setSheet(true)}
      >
        {t("Enable Protection")}
        <Mark name="arrow" />
      </button>
      <Link className="lab-link" to={SCREENS.SECURE_CLIPBOARD}>
        {t("Detailed clipboard preview")}
      </Link>
      {sheet && (
        <PreviewSheet
          title="Clipboard configuration preview"
          onClose={() => setSheet(false)}
        >
          <p>
            {t(
              "No protection was enabled. Timer and notification choices are local visual preferences only; no background clipboard permission is requested.",
            )}
          </p>
          <p dir="ltr">DEMO · {timer}</p>
        </PreviewSheet>
      )}
    </Frame>
  );
}
export function SecureRandom() {
  const { t } = useLanguage();
  const [type, setType] = useState("Hex");
  const [length, setLength] = useState(32);
  const [result, setResult] = useState("");
  const [revision, setRevision] = useState(0);
  return (
    <Frame
      title="Secure Random Studio"
      icon="key"
      motion={result ? "lab-entropy-preview" : ""}
    >
      <p className="lab-warning">
        {t("Deterministic public samples only · not secure randomness")}
      </p>
      <Choices
        values={["Hex", "Base64", "Passphrase sample"]}
        value={type}
        onChange={(v) => {
          setType(v);
          setResult("");
        }}
        label="Sample output type"
      />
      <section className="lab-panel">
        <label className="lab-field">
          {t("Preview size")} <output>{length}</output>
          <input
            type="range"
            aria-label={t("Preview size")}
            min="8"
            max="64"
            value={length}
            onChange={(e) => {
              setLength(Number(e.target.value));
              setResult("");
            }}
          />
        </label>
        <label className="lab-field">
          {t("Read-only public result")}
          <textarea readOnly dir="ltr" value={result} />
        </label>
        {result && <CopyPublic value={result} />}
      </section>
      <button
        className="security-primary"
        type="button"
        onClick={() => {
          setResult(randomPreview(type, length, revision + 1));
          setRevision((v) => v + 1);
        }}
      >
        {t("Generate Random Bytes")}
        <Mark name="arrow" />
      </button>
      <p className="lab-notice">
        {t(
          "The action changes a predictable visual sample. No random bytes or certified entropy are generated.",
        )}
      </p>
    </Frame>
  );
}
export function HmacAuthenticity() {
  const { t } = useLanguage();
  const [algorithm, setAlgorithm] = useState("SHA-256");
  const [rendering, setRendering] = useState("Hex");
  const [message, setMessage] = useState("");
  const [reveal, setReveal] = useState(false);
  const [result, setResult] = useState("");
  const [comparison, setComparison] = useState("");
  const [status, setStatus] = useState("");
  const reset = () => {
    setResult("");
    setStatus("");
  };
  return (
    <Frame
      title="HMAC AUTHENTICITY LAB"
      icon="lock"
      motion={result ? "lab-seal-preview" : ""}
    >
      <p className="lab-notice">
        {t("No real secret entry and no mathematical HMAC result")}
      </p>
      <Choices
        values={["SHA-256", "SHA-512"]}
        value={algorithm}
        onChange={(v) => {
          setAlgorithm(v);
          reset();
        }}
        label="Digest label"
      />
      <section className="lab-panel">
        <label className="lab-field">
          {t("Message · fictional only")}
          <textarea
            dir="auto"
            maxLength={2000}
            value={message}
            onChange={(e) => {
              setMessage(e.target.value);
              reset();
            }}
          />
        </label>
        <label className="lab-field">
          {t("Public demo key · read only")}
          <input
            type={reveal ? "text" : "password"}
            value="DEMO-NOT-A-SECRET"
            readOnly
            dir="ltr"
          />
        </label>
        <button
          className="lab-secondary"
          type="button"
          aria-pressed={reveal}
          onClick={() => setReveal((v) => !v)}
        >
          {t(reveal ? "Hide demo key" : "Reveal demo key")}
        </button>
      </section>
      <Choices
        values={["Hex", "Base64"]}
        value={rendering}
        onChange={(v) => {
          setRendering(v);
          reset();
        }}
        label="Digest display"
      />
      <button
        className="security-primary"
        type="button"
        disabled={!message.trim()}
        onClick={() => {
          setResult(`${HMAC_SAMPLE}:${algorithm}:${rendering}`);
          setStatus("");
        }}
      >
        {t("Compute HMAC")}
        <Mark name="arrow" />
      </button>
      {result && (
        <code className="lab-result" dir="ltr">
          {result}
        </code>
      )}
      <section className="lab-panel">
        <label className="lab-field">
          {t("Compare public placeholder")}
          <input
            dir="ltr"
            value={comparison}
            maxLength={160}
            onChange={(e) => {
              setComparison(e.target.value);
              setStatus("");
            }}
          />
        </label>
        <button
          className="lab-secondary"
          type="button"
          disabled={!result || !comparison.trim()}
          onClick={() =>
            setStatus(
              comparison.trim() === result
                ? "Demo strings match only. Authenticity was not checked."
                : "Demo strings differ. No authenticity conclusion.",
            )
          }
        >
          {t("Compare demo strings")}
        </button>
        <p className="lab-notice" role="status">
          {t(status)}
        </p>
      </section>
    </Frame>
  );
}
export function PublicKeyQr() {
  const { t } = useLanguage();
  const [mode, setMode] = useState("Display public data");
  const [sheet, setSheet] = useState(null);
  return (
    <Frame title="PUBLIC KEY QR EXCHANGE" icon="key">
      <Choices
        values={["Display public data", "Scanner preview"]}
        value={mode}
        onChange={setMode}
        label="QR mode"
      />
      <div
        className="lab-qr"
        aria-label={t("Decorative QR-like demo, not a scannable credential")}
      >
        <svg viewBox="0 0 21 21" aria-hidden="true">
          {Array.from({ length: 441 }, (_, i) => {
            const x = i % 21,
              y = Math.floor(i / 21);
            return (x * 13 + y * 7 + x * y) % 5 < 2 ? (
              <rect key={i} x={x} y={y} width="1" height="1" />
            ) : null;
          })}
        </svg>
        <StagEmblem />
        <i />
      </div>
      {mode === "Scanner preview" && (
        <p className="lab-warning">
          {t("Simulated scanner only. No camera or QR image is accessed.")}
        </p>
      )}
      <section className="lab-panel">
        <h2>{t("Public demo identity")}</h2>
        <p dir="ltr">DEMO-IDENTITY · example.invalid</p>
        <button
          className="lab-secondary"
          type="button"
          onClick={() => setSheet("Public fingerprint")}
        >
          {t("Public fingerprint")}
        </button>
        <p className="lab-notice">
          {t(
            "Decorative public QR artwork contains no secret and is not a working QR encoder.",
          )}
        </p>
      </section>
      <button
        className="security-primary"
        type="button"
        onClick={() => setSheet("Save Public Key")}
      >
        {t("Save Public Key")}
        <Mark name="arrow" />
      </button>
      {sheet && (
        <PreviewSheet title={sheet} onClose={() => setSheet(null)}>
          {sheet === "Public fingerprint" ? (
            <>
              <code className="lab-result" dir="ltr">
                DEMO-QR-PUBLIC-0000-1111-2222
              </code>
              <p>{t("Public fictional fingerprint only · not a real key")}</p>
            </>
          ) : (
            <p>
              {t(
                "Save preview only. No public key is exported, downloaded, stored or trusted.",
              )}
            </p>
          )}
        </PreviewSheet>
      )}
    </Frame>
  );
}
