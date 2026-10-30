import React, { useState } from "react";
import { Link } from "react-router-dom";
import { SCREENS } from "../../config/screens";
import { useLanguage } from "../../i18n/Language";
import { Mark, PreviewSheet } from "../security/ScreenUI";
import "./advanced.css";
function Frame({ title, parent, icon, children, motion = "" }) {
  const { t, dir, locale } = useLanguage();
  return (
    <main className={`advanced-screen ${motion}`} dir={dir} lang={locale}>
      <div className="advanced-shell">
        <Link className="advanced-back" to={parent}>
          ‹{" "}
          {t(
            parent === SCREENS.KEY_DETAILS
              ? "Back to Key Details"
              : parent === SCREENS.SIGNATURE
                ? "Back to Signature"
                : parent === SCREENS.PRIVACY
                  ? "Back to Privacy Center"
                  : "Back to Local Transfer",
          )}
        </Link>
        <div className="advanced-art" aria-hidden="true">
          <span />
          <Mark name={icon} />
          <i />
        </div>
        <h1>{t(title)}</h1>
        <p className="advanced-notice">{t("VISUAL DEMO")}</p>
        {children}
      </div>
    </main>
  );
}
function Select({ label, value, values, onChange }) {
  const { t } = useLanguage();
  return (
    <label className="advanced-field">
      {t(label)}
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {values.map((v) => (
          <option key={v} value={v}>
            {t(v)}
          </option>
        ))}
      </select>
    </label>
  );
}
export function KeyDerivation() {
  const { t } = useLanguage();
  const [memory, setMemory] = useState("64");
  const [time, setTime] = useState("3");
  const [parallel, setParallel] = useState("1");
  const [sheet, setSheet] = useState(false);
  return (
    <Frame
      title="KEY DERIVATION"
      parent={SCREENS.KEY_DETAILS}
      icon="key"
      motion="advanced-cube"
    >
      <section className="advanced-panel">
        <h2>Argon2id · {t("Reference label only")}</h2>
        <label className="advanced-field">
          {t("Public key-source placeholder")}
          <input readOnly dir="ltr" value="DEMO-NOT-A-PASSPHRASE" />
        </label>
        <Select
          label="Memory preview (MiB)"
          value={memory}
          values={["16", "32", "64", "128"]}
          onChange={setMemory}
        />
        <Select
          label="Time cost preview"
          value={time}
          values={["1", "2", "3", "4"]}
          onChange={setTime}
        />
        <Select
          label="Parallelism preview"
          value={parallel}
          values={["1", "2", "4"]}
          onChange={setParallel}
        />
        <p>
          {t(
            "Resource choices are labels only; no memory allocation or key derivation runs.",
          )}
        </p>
      </section>
      <button
        type="button"
        className="security-primary"
        onClick={() => setSheet(true)}
      >
        {t("Run Local Derivation")}
        <Mark name="arrow" />
      </button>
      {sheet && (
        <PreviewSheet
          title="Derivation profile preview"
          onClose={() => setSheet(false)}
        >
          <p>
            {t(
              "No KDF computation, derived key, password processing or secure output was produced.",
            )}
          </p>
          <code dir="ltr">
            DEMO · {memory} MiB / {time} / {parallel}
          </code>
        </PreviewSheet>
      )}
    </Frame>
  );
}
export function SignatureStudio() {
  const { t } = useLanguage();
  const [mode, setMode] = useState("Sign");
  const [message, setMessage] = useState("");
  const [alias, setAlias] = useState("No sample selected");
  const [format, setFormat] = useState("Hex");
  const [sheet, setSheet] = useState(false);
  return (
    <Frame
      title="SIGNATURE STUDIO"
      parent={SCREENS.SIGNATURE}
      icon="shield"
      motion={mode === "Verify" ? "advanced-seal-verify" : "advanced-seal"}
    >
      <div className="advanced-choices">
        {["Sign", "Verify"].map((v) => (
          <button
            type="button"
            key={v}
            aria-pressed={mode === v}
            onClick={() => {
              setMode(v);
              setAlias("No sample selected");
            }}
          >
            {t(v)}
          </button>
        ))}
      </div>
      <section className="advanced-panel">
        <label className="advanced-field">
          {t("Message · fictional only")}
          <textarea
            dir="auto"
            value={message}
            maxLength={2000}
            onChange={(e) => setMessage(e.target.value)}
          />
        </label>
        <Select
          label="Sample key alias"
          value={alias}
          values={[
            "No sample selected",
            "Public demo alias A",
            "Public demo alias B",
          ]}
          onChange={setAlias}
        />
        <Select
          label="Output format preview"
          value={format}
          values={["Hex", "Base64"]}
          onChange={setFormat}
        />
      </section>
      <button
        type="button"
        className="security-primary"
        disabled={!message.trim() || alias === "No sample selected"}
        onClick={() => setSheet(true)}
      >
        {t("Configure Signing")}
        <Mark name="arrow" />
      </button>
      <p className="advanced-notice">
        {t("No signature is created and no verification result is produced.")}
      </p>
      {sheet && (
        <PreviewSheet
          title="Signing configuration preview"
          onClose={() => setSheet(false)}
        >
          <p>
            {t(
              "Configuration only. No private key, signature or identity check is used. Input stays in memory.",
            )}
          </p>
          <code dir="ltr">DEMO-SIGNATURE-FORMAT · {format}</code>
        </PreviewSheet>
      )}
    </Frame>
  );
}
const EVENTS = Object.freeze([
  { id: 1, label: "Fictional vault opened", category: "Vault", day: 1 },
  { id: 2, label: "Fictional key review", category: "Keys", day: 3 },
  { id: 3, label: "Fictional privacy review", category: "Privacy", day: 10 },
]);
export function SecurityActivity() {
  const { t } = useLanguage();
  const [range, setRange] = useState("30");
  const [category, setCategory] = useState("All");
  const [expanded, setExpanded] = useState(null);
  const [sheet, setSheet] = useState(false);
  const visible = EVENTS.filter(
    (e) =>
      e.day <= Number(range) && (category === "All" || category === e.category),
  );
  return (
    <Frame
      title="SECURITY ACTIVITY"
      parent={SCREENS.PRIVACY}
      icon="lock"
      motion={`advanced-activity range-${range}`}
    >
      <p className="advanced-warning">
        {t(
          "Fictional event history only. This app does not record system security activity.",
        )}
      </p>
      <Select
        label="Demo date range"
        value={range}
        values={["1", "7", "30"]}
        onChange={(v) => {
          setRange(v);
          setExpanded(null);
        }}
      />
      <Select
        label="Event category"
        value={category}
        values={["All", "Vault", "Keys", "Privacy"]}
        onChange={setCategory}
      />
      <section className="advanced-panel">
        <h2>{t("Event History")}</h2>
        {visible.map((e) => (
          <div key={e.id}>
            <button
              type="button"
              className="advanced-row"
              aria-expanded={expanded === e.id}
              onClick={() => setExpanded(expanded === e.id ? null : e.id)}
            >
              {t(e.label)}
              <Mark name="chevron" />
            </button>
            {expanded === e.id && (
              <p>
                {t(
                  "Illustrative entry only. No device, identity, event timestamp or security outcome was observed.",
                )}
              </p>
            )}
          </div>
        ))}
        {!visible.length && (
          <p role="status">{t("No fictional events in this filter.")}</p>
        )}
      </section>
      <button
        type="button"
        className="security-primary"
        onClick={() => setSheet(true)}
      >
        {t("Configure Activity Logging")}
        <Mark name="arrow" />
      </button>
      {sheet && (
        <PreviewSheet
          title="Activity logging preview"
          onClose={() => setSheet(false)}
        >
          <p>
            {t(
              "Logging is not enabled. No system audit, telemetry or event persistence is configured.",
            )}
          </p>
        </PreviewSheet>
      )}
    </Frame>
  );
}
export function TransferWizard() {
  const { t } = useLanguage();
  const [sender, setSender] = useState("Demo Phone");
  const [recipient, setRecipient] = useState("Demo Tablet");
  const [content, setContent] = useState(true);
  const [review, setReview] = useState(false);
  const [sheet, setSheet] = useState(false);
  const ready = sender !== recipient && content && review;
  return (
    <Frame
      title="SECURE TRANSFER"
      parent={SCREENS.LOCAL_TRANSFER}
      icon="upload"
      motion={ready ? "advanced-endpoints-reviewed" : ""}
    >
      <section className="advanced-panel">
        <Select
          label="Sender"
          value={sender}
          values={["Demo Phone", "Demo Tablet"]}
          onChange={(v) => {
            setSender(v);
            setReview(false);
          }}
        />
        <Select
          label="Recipient"
          value={recipient}
          values={["Demo Phone", "Demo Tablet"]}
          onChange={(v) => {
            setRecipient(v);
            setReview(false);
          }}
        />
        <label className="advanced-check">
          transfer-demo.pdf · DEMO
          <input
            type="checkbox"
            checked={content}
            onChange={() => {
              setContent((v) => !v);
              setReview(false);
            }}
          />
        </label>
        <code dir="ltr">DEMO-FINGERPRINT-0000</code>
        <label className="advanced-check">
          {t("I reviewed the fictional recipient fingerprint")}
          <input
            type="checkbox"
            checked={review}
            onChange={() => setReview((v) => !v)}
          />
        </label>
      </section>
      <p className="advanced-notice" role="status">
        {t(
          ready
            ? "Demo review filled. Final sending remains unavailable."
            : "Choose distinct demo devices, content and fingerprint review.",
        )}
      </p>
      <button
        type="button"
        className="security-primary"
        disabled
        aria-describedby="transfer-no-send"
      >
        {t("Start Secure Transfer")}
        <Mark name="arrow" />
      </button>
      <p className="advanced-warning" id="transfer-no-send">
        {t("UNAVAILABLE IN DEMO · no data can be sent")}
      </p>
      <button
        type="button"
        className="advanced-secondary"
        onClick={() => setSheet(true)}
      >
        {t("Review transfer limitations")}
      </button>
      {sheet && (
        <PreviewSheet
          title="Transfer limitations"
          onClose={() => setSheet(false)}
        >
          <p>
            {t(
              "No network, device connection, file read, encryption, transfer or delivery acknowledgement occurs.",
            )}
          </p>
        </PreviewSheet>
      )}
    </Frame>
  );
}
