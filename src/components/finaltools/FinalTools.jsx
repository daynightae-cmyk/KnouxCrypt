import React, { useState } from "react";
import { Link } from "react-router-dom";
import { SCREENS } from "../../config/screens";
import { useLanguage } from "../../i18n/Language";
import { Mark, PreviewSheet } from "../security/ScreenUI";
import "./finaltools.css";
export const PUBLIC_CLIPBOARD_SNIPPET = "PUBLIC-DEMO-SNIPPET-NOT-A-SECRET";
export const EXPECTED_FILE_SAMPLE = "DEMO-EXPECTED-NOT-A-DIGEST";
function Frame({ title, icon, parent, children, motion = "" }) {
  const { t, dir, locale } = useLanguage();
  return (
    <main className={`finaltool-screen ${motion}`} dir={dir} lang={locale}>
      <div className="finaltool-shell">
        <Link className="ft-back" to={parent}>
          ‹{" "}
          {t(
            parent === SCREENS.PRIVACY
              ? "Back to Privacy Center"
              : parent === SCREENS.HASH_INTEGRITY
                ? "Back to Hash & Integrity"
                : parent === SCREENS.CLIPBOARD_GUARD
                  ? "Back to Clipboard Guard"
                  : "Back to Tools",
          )}
        </Link>
        <div className="ft-art" aria-hidden="true">
          <span />
          <Mark name={icon} />
          <i />
        </div>
        <h1>{t(title)}</h1>
        <p className="ft-notice">{t("VISUAL DEMO")}</p>
        {children}
      </div>
    </main>
  );
}
function Choices({ label, values, value, onChange }) {
  const { t } = useLanguage();
  return (
    <div className="ft-choices" role="group" aria-label={t(label)}>
      {values.map((option) => (
        <button
          type="button"
          key={option}
          aria-pressed={value === option}
          onClick={() => onChange(option)}
        >
          {t(option)}
        </button>
      ))}
    </div>
  );
}
function Toggle({ label, value, onChange }) {
  const { t } = useLanguage();
  return (
    <label className="ft-toggle">
      <span>{t(label)}</span>
      <input type="checkbox" checked={value} onChange={onChange} />
    </label>
  );
}
export function SecretCapsule() {
  const { t } = useLanguage();
  const [text, setText] = useState("");
  const [reveal, setReveal] = useState(false);
  const [expiry, setExpiry] = useState("1 hour");
  const [limit, setLimit] = useState("1");
  const [sheet, setSheet] = useState(null);
  return (
    <Frame
      title="EXPIRING SECRET"
      icon="lock"
      parent={SCREENS.TOOLS}
      motion={`ft-capsule expiry-${expiry.replaceAll(" ", "-")}`}
    >
      <p className="ft-warning">
        {t("Fictional text only. Do not enter private secrets.")}
      </p>
      <section className="ft-panel">
        <label className="ft-field">
          {t("Demo capsule text")}
          <input
            type={reveal ? "text" : "password"}
            dir="auto"
            maxLength={1000}
            autoComplete="off"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </label>
        <button
          type="button"
          className="ft-secondary"
          aria-pressed={reveal}
          onClick={() => setReveal((v) => !v)}
        >
          {t(reveal ? "Hide demo text" : "Reveal demo text")}
        </button>
        <h2>{t("Expiration preview")}</h2>
        <Choices
          label="Expiration preview"
          values={["15 minutes", "1 hour", "1 day"]}
          value={expiry}
          onChange={setExpiry}
        />
        <label className="ft-field">
          {t("Access count preview")}
          <select value={limit} onChange={(e) => setLimit(e.target.value)}>
            {["1", "3", "5"].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="ft-secondary"
          onClick={() => setSheet("Revocation limits")}
        >
          {t("Revocation limits")}
        </button>
      </section>
      <button
        className="security-primary"
        type="button"
        disabled={!text.trim()}
        onClick={() => setSheet("Configure Secret Capsule")}
      >
        {t("Configure Secret Capsule")}
        <Mark name="arrow" />
      </button>
      <p className="ft-notice">
        {t(
          "No remote secret, expiry enforcement, access tracking or share link exists.",
        )}
      </p>
      {sheet && (
        <PreviewSheet title={sheet} onClose={() => setSheet(null)}>
          <p>
            {t(
              sheet === "Revocation limits"
                ? "Revocation and expiry are educational options only. This interface cannot erase copies, revoke remote access or enforce an access count."
                : "Configuration preview only. No capsule was encrypted, hosted or scheduled for deletion. Text stays in page memory.",
            )}
          </p>
          <dl className="ft-summary">
            <dt>{t("Expiration preview")}</dt>
            <dd>{t(expiry)}</dd>
            <dt>{t("Access count preview")}</dt>
            <dd>{limit} · DEMO</dd>
          </dl>
        </PreviewSheet>
      )}
    </Frame>
  );
}
export function SessionPrivacy() {
  const { t } = useLanguage();
  const [timeout, setTimeoutLabel] = useState("5 minutes");
  const [options, setOptions] = useState({
    clipboard: false,
    screenshot: false,
    private: false,
  });
  const [sheet, setSheet] = useState(false);
  return (
    <Frame
      title="SESSION SECURITY"
      icon="lock"
      parent={SCREENS.PRIVACY}
      motion="ft-radar"
    >
      <section className="ft-panel">
        <h2>{t("Inactivity timeout preview")}</h2>
        <Choices
          label="Inactivity timeout preview"
          values={["1 minute", "5 minutes", "15 minutes"]}
          value={timeout}
          onChange={setTimeoutLabel}
        />
        {[
          ["clipboard", "Clipboard clearing preview"],
          ["screenshot", "Screenshot privacy preview"],
          ["private", "Private notification preview"],
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
            "No inactivity lock, clipboard clearing, screenshot restriction or system protection is enforced.",
          )}
        </p>
      </section>
      <button
        type="button"
        className="security-primary"
        onClick={() => setSheet(true)}
      >
        {t("Review Local Session Settings")}
        <Mark name="arrow" />
      </button>
      {sheet && (
        <PreviewSheet
          title="Session settings preview"
          onClose={() => setSheet(false)}
        >
          <p>
            {t(
              "These are local visual preferences only. No session security policy or system permission was changed.",
            )}
          </p>
          <p>{t(timeout)} · DEMO</p>
          <ul>
            {Object.entries(options).map(([key, value]) => (
              <li key={key}>
                {t(
                  {
                    clipboard: "Clipboard clearing preview",
                    screenshot: "Screenshot privacy preview",
                    private: "Private notification preview",
                  }[key],
                )}
                : {t(value ? "Preview on" : "Preview off")}
              </li>
            ))}
          </ul>
        </PreviewSheet>
      )}
    </Frame>
  );
}
export function FileIntegrity() {
  const { t } = useLanguage();
  const [file, setFile] = useState(false);
  const [algorithm, setAlgorithm] = useState("SHA-256");
  const [digest, setDigest] = useState("");
  const [edited, setEdited] = useState(false);
  const [sheet, setSheet] = useState(null);
  return (
    <Frame
      title="FILE INTEGRITY"
      icon="shield"
      parent={SCREENS.HASH_INTEGRITY}
      motion={edited ? "ft-checksum-edited" : ""}
    >
      <button
        type="button"
        className="ft-file"
        onClick={() => setSheet("Choose demo file")}
      >
        <Mark name="file" />
        <span dir="ltr">
          {file ? "integrity-demo.pdf" : "DEMO · choose sample"}
        </span>
        <Mark name="chevron" />
      </button>
      <section className="ft-panel">
        <h2>{t("Hash algorithm")}</h2>
        <Choices
          label="Hash algorithm"
          values={["SHA-256", "SHA-512"]}
          value={algorithm}
          onChange={(v) => {
            setAlgorithm(v);
            setEdited(false);
          }}
        />
        <label className="ft-field">
          {t("Expected public demo digest")}
          <input
            dir="ltr"
            maxLength={160}
            value={digest}
            onChange={(e) => {
              setDigest(e.target.value);
              setEdited((v) => !v);
            }}
            placeholder={EXPECTED_FILE_SAMPLE}
          />
        </label>
        <button
          type="button"
          className="ft-secondary"
          onClick={() => {
            setDigest(EXPECTED_FILE_SAMPLE);
            setEdited((v) => !v);
          }}
        >
          {t("Use public expected placeholder")}
        </button>
        <p className="ft-warning">
          {t(
            "No digest is computed. This screen cannot determine whether a file changed or is authentic.",
          )}
        </p>
      </section>
      <button
        className="security-primary"
        type="button"
        disabled={!file || !digest.trim()}
        onClick={() => setSheet("File comparison preview")}
      >
        {t("Compare Selected File")}
        <Mark name="arrow" />
      </button>
      {sheet && (
        <PreviewSheet title={sheet} onClose={() => setSheet(null)}>
          {sheet === "Choose demo file" ? (
            <button
              className="security-choice"
              type="button"
              onClick={() => {
                setFile(true);
                setSheet(null);
              }}
            >
              integrity-demo.pdf · DEMO
            </button>
          ) : (
            <>
              <p>
                {t(
                  "Neutral comparison preview only. No file bytes were read, no digest was generated and no integrity verdict is available.",
                )}
              </p>
              <code dir="ltr">{algorithm} · DEMO</code>
            </>
          )}
        </PreviewSheet>
      )}
    </Frame>
  );
}
export function SecureClipboard() {
  const { t } = useLanguage();
  const [text, setText] = useState("");
  const [masked, setMasked] = useState(true);
  const [buffer, setBuffer] = useState("");
  const [lifetime, setLifetime] = useState("30s");
  const [sheet, setSheet] = useState(null);
  const [revision, setRevision] = useState(0);
  const [status, setStatus] = useState("Internal demo buffer is empty.");
  return (
    <Frame
      title="Secure Clipboard"
      icon="file"
      parent={SCREENS.CLIPBOARD_GUARD}
      motion={revision ? "ft-internal-copy" : ""}
    >
      <p className="ft-warning">
        {t(
          "Fictional snippets only. System clipboard is never read or written.",
        )}
      </p>
      <section className="ft-panel">
        <label className="ft-field">
          {t("Internal demo snippet")}
          <input
            type={masked ? "password" : "text"}
            dir="auto"
            value={text}
            autoComplete="off"
            maxLength={1000}
            onChange={(e) => setText(e.target.value)}
          />
        </label>
        <Toggle
          label="Mask sample preview"
          value={masked}
          onChange={() => setMasked((v) => !v)}
        />
        <div className="ft-choices">
          <button
            type="button"
            disabled={!buffer}
            onClick={() => {
              setText(buffer);
              setStatus("Pasted from internal demo buffer only.");
            }}
          >
            {t("Paste internal sample")}
          </button>
          <button
            type="button"
            onClick={() => {
              setText(PUBLIC_CLIPBOARD_SNIPPET);
              setStatus("Public sample loaded.");
            }}
          >
            {t("Load public sample")}
          </button>
          <button
            type="button"
            onClick={() => {
              setText("");
              setBuffer("");
              setStatus("Internal demo buffer cleared only.");
            }}
          >
            {t("Clear internal buffer")}
          </button>
        </div>
        <Choices
          label="Clipboard lifetime preview"
          values={["15s", "30s", "60s"]}
          value={lifetime}
          onChange={setLifetime}
        />
        <button
          className="ft-secondary"
          type="button"
          onClick={() => setSheet("Clipboard options preview")}
        >
          {t("Options")}
        </button>
      </section>
      <button
        type="button"
        className="security-primary"
        disabled={!text.trim()}
        onClick={() => setSheet("Internal copy warning")}
      >
        {t("Copy Sensitive Text")}
        <Mark name="arrow" />
      </button>
      <p className="ft-notice" role="status">
        {t(status)}
      </p>
      {sheet && (
        <PreviewSheet title={sheet} onClose={() => setSheet(null)}>
          {sheet === "Internal copy warning" ? (
            <>
              <p>
                {t(
                  "This copies only to component memory. It does not copy to the system clipboard, schedule secure erasure or protect private text.",
                )}
              </p>
              <button
                type="button"
                className="security-choice"
                onClick={() => {
                  setBuffer(text);
                  setRevision((v) => v + 1);
                  setStatus(
                    "Copied into internal demo buffer only. No system clipboard change.",
                  );
                  setSheet(null);
                }}
              >
                {t("Confirm internal demo copy")}
              </button>
            </>
          ) : (
            <p>
              {t(
                "Lifetime is a visual label only. No timer clears the system clipboard and no background permission is requested.",
              )}
            </p>
          )}
        </PreviewSheet>
      )}
    </Frame>
  );
}
