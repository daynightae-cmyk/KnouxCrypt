import React, { useState } from "react";
import { Link } from "react-router-dom";
import { SCREENS } from "../../config/screens";
import { useLanguage } from "../../i18n/Language";
import { Mark, PreviewSheet } from "../security/ScreenUI";
import "./inspectors.css";

export const SAMPLE_DIGESTS = Object.freeze({
  "SHA-256": "DEMO-SHA256-0000111122223333",
  "SHA-512": "DEMO-SHA512-4444555566667777",
  SHA3: "DEMO-SHA3-88889999AAAABBBB",
});
function Frame({ title, icon, children, parent = SCREENS.TOOLS, motion = "" }) {
  const { t, locale, dir } = useLanguage();
  return (
    <main className={`inspection-screen ${motion}`} dir={dir} lang={locale}>
      <div className="inspection-shell">
        <Link className="inspection-back" to={parent}>
          ‹{" "}
          {t(
            parent === SCREENS.KEY_FORGE
              ? "Back to Key Forge"
              : "Back to Tools",
          )}
        </Link>
        <div className="inspection-art" aria-hidden="true">
          <Mark name={icon} />
          <i />
        </div>
        <h1>{t(title)}</h1>
        <p className="inspection-demo">{t("VISUAL DEMO")}</p>
        {children}
      </div>
    </main>
  );
}
function Tabs({ values, value, onChange }) {
  const { t } = useLanguage();
  return (
    <div
      className="inspection-tabs"
      role="group"
      aria-label={t("Preview mode")}
    >
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
function Sample({ name, onClick }) {
  const { t } = useLanguage();
  return (
    <button className="inspection-sample" type="button" onClick={onClick}>
      <Mark name="file" />
      <span dir="ltr">{name}</span>
      <small>{t("Fictional sample only")}</small>
      <Mark name="chevron" />
    </button>
  );
}
function Row({ label, value, onClick, expanded }) {
  const { t } = useLanguage();
  return (
    <button
      type="button"
      className="inspection-row"
      onClick={onClick}
      aria-expanded={expanded}
    >
      <span>{t(label)}</span>
      <strong>{t(value)}</strong>
      <Mark name="chevron" />
    </button>
  );
}
function CopyDemo({ value }) {
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
    <div className="inspection-copy">
      <button type="button" onClick={copy}>
        {t("Copy public demo text")}
      </button>
      <small role="status">{t(status)}</small>
    </div>
  );
}
export function HashIntegrity() {
  const { t } = useLanguage();
  const [algorithm, setAlgorithm] = useState("SHA-256");
  const [sample, setSample] = useState("sample-document.pdf");
  const [result, setResult] = useState("");
  const [compare, setCompare] = useState("");
  const [status, setStatus] = useState("");
  const [sheet, setSheet] = useState(null);
  function reset() {
    setResult("");
    setStatus("");
  }
  return (
    <Frame
      title="HASH & INTEGRITY"
      icon="shield"
      motion={result ? "inspection-hash-active" : ""}
    >
      <Sample name={sample} onClick={() => setSheet("Choose sample file")} />
      <Tabs
        values={Object.keys(SAMPLE_DIGESTS)}
        value={algorithm}
        onChange={(v) => {
          setAlgorithm(v);
          reset();
        }}
      />
      <button
        className="security-primary"
        type="button"
        onClick={() => {
          setResult(SAMPLE_DIGESTS[algorithm]);
          setStatus("");
        }}
      >
        {t("Generate Hash")}
        <Mark name="arrow" />
      </button>
      <p className="inspection-notice">
        {t(
          "No file is hashed. Output is a public DEMO placeholder, not a digest.",
        )}
      </p>
      {result && (
        <section className="inspection-output">
          <code dir="ltr">{result}</code>
          <CopyDemo value={result} />
        </section>
      )}
      <section className="inspection-panel">
        <h2>{t("Compare Digest")}</h2>
        <label>
          {t("Paste a public demo placeholder")}
          <input
            dir="ltr"
            value={compare}
            onChange={(e) => {
              setCompare(e.target.value.slice(0, 160));
              setStatus("");
            }}
            placeholder="DEMO-…"
          />
        </label>
        <button
          className="inspection-secondary"
          type="button"
          disabled={!result || !compare.trim()}
          onClick={() =>
            setStatus(
              compare.trim() === result
                ? "Demo strings match only. File integrity was not checked."
                : "Demo strings differ. No file integrity conclusion.",
            )
          }
        >
          {t("Compare demo strings")}
        </button>
        <p role="status">{t(status)}</p>
      </section>
      <Row
        label="File Metadata"
        value={sample}
        onClick={() => setSheet("File Metadata")}
      />
      <Link className="inspection-link" to={SCREENS.FILE_INTEGRITY}>
        {t("Detailed file integrity preview")}
      </Link>
      {sheet && (
        <PreviewSheet title={sheet} onClose={() => setSheet(null)}>
          {sheet === "Choose sample file" ? (
            <>
              {["sample-document.pdf", "sample-archive.zip"].map((name) => (
                <button
                  className="security-choice"
                  type="button"
                  key={name}
                  onClick={() => {
                    setSample(name);
                    reset();
                    setSheet(null);
                  }}
                >
                  {name} · DEMO
                </button>
              ))}
              <p>{t("No device file access")}</p>
            </>
          ) : (
            <p>
              {t(
                "Metadata is fictional. No device file or real digest has been inspected.",
              )}
            </p>
          )}
        </PreviewSheet>
      )}
    </Frame>
  );
}
export function TextCipher() {
  const { t } = useLanguage();
  const [mode, setMode] = useState("ENCRYPT");
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [sheet, setSheet] = useState(null);
  const [method, setMethod] = useState("AES-256-GCM");
  function reset() {
    setOutput("");
  }
  return (
    <Frame title="TEXT CIPHER" icon="lock">
      <Tabs
        values={["ENCRYPT", "DECRYPT"]}
        value={mode}
        onChange={(v) => {
          setMode(v);
          reset();
        }}
      />
      <p className="inspection-notice">
        {t(
          "Fictional text only. This screen performs no encryption or decryption.",
        )}
      </p>
      <div className="inspection-text-panels">
        <label>
          {t("Input text")}
          <textarea
            dir="auto"
            value={input}
            maxLength={4000}
            onChange={(e) => {
              setInput(e.target.value);
              reset();
            }}
            placeholder={t("Write fictional sample text only…")}
          />
        </label>
        <label>
          {t("Protected output · demo only")}
          <textarea
            className={output ? "inspection-wipe" : ""}
            dir="ltr"
            value={output}
            readOnly
          />
        </label>
      </div>
      <button
        className="inspection-secondary"
        type="button"
        disabled={!output}
        onClick={() => {
          setInput(output);
          setOutput("");
          setMode(mode === "ENCRYPT" ? "DECRYPT" : "ENCRYPT");
        }}
      >
        {t("Swap panels")}
      </button>
      <Row
        label="Algorithm"
        value={method}
        onClick={() => setSheet("Algorithm")}
      />
      <Row
        label="Key policy"
        value="Demo policy only"
        onClick={() => setSheet("Key policy")}
      />
      <button
        className="security-primary"
        type="button"
        disabled={!input.trim()}
        onClick={() =>
          setOutput(
            mode === "ENCRYPT"
              ? "DEMO-CIPHERTEXT-NO-ENCRYPTION"
              : "DEMO-PLAINTEXT-NO-DECRYPTION",
          )
        }
      >
        {t(mode === "ENCRYPT" ? "Encrypt Text" : "Decrypt Text")}
        <Mark name="arrow" />
      </button>
      {output && (
        <p role="status" className="inspection-notice">
          {t(
            "Placeholder revealed only. Input was not cryptographically processed.",
          )}
        </p>
      )}
      {sheet && (
        <PreviewSheet title={sheet} onClose={() => setSheet(null)}>
          {sheet === "Algorithm" ? (
            <>
              <p>
                {t(
                  "Reference algorithm label only. No cryptographic implementation is invoked.",
                )}
              </p>
              <button
                className="security-choice"
                type="button"
                aria-pressed={method === "AES-256-GCM"}
                onClick={() => {
                  setMethod("AES-256-GCM");
                  reset();
                  setSheet(null);
                }}
              >
                AES-256-GCM · DEMO
              </button>
            </>
          ) : (
            <p>
              {t(
                "No password, private key, device credential or secret is accepted. All state is in memory.",
              )}
            </p>
          )}
        </PreviewSheet>
      )}
    </Frame>
  );
}
export function DigitalSignature() {
  const { t } = useLanguage();
  const [mode, setMode] = useState("Sign");
  const [file, setFile] = useState(false);
  const [key, setKey] = useState(false);
  const [sheet, setSheet] = useState(null);
  return (
    <Frame
      title="DIGITAL SIGNATURE"
      icon="file"
      parent={SCREENS.KEY_FORGE}
      motion={mode === "Verify" ? "inspection-verify" : ""}
    >
      <Tabs
        values={["Sign", "Verify"]}
        value={mode}
        onChange={(v) => {
          setMode(v);
          setKey(false);
        }}
      />
      <Sample
        name={file ? "sample-contract.pdf" : "Choose demo signing file"}
        onClick={() => setSheet("Sample file")}
      />
      <Row
        label="Algorithm"
        value="Ed25519 · reference only"
        onClick={() => setSheet("Algorithm")}
      />
      <Row
        label={mode === "Sign" ? "Signing key" : "Verification key"}
        value={key ? "Public fictional key selected" : "Not configured"}
        onClick={() => setSheet("Key selection preview")}
      />
      {mode === "Verify" && (
        <Sample
          name="DEMO-SIGNATURE.txt"
          onClick={() => setSheet("Signature sample")}
        />
      )}
      <button
        className="security-primary"
        type="button"
        disabled={!file || !key}
        onClick={() => setSheet("Signature workflow preview")}
      >
        {t(mode === "Sign" ? "Create Signature" : "Verify Signature")}
        <Mark name="arrow" />
      </button>
      <p className="inspection-notice">
        {t("No signature is created and no verification result is produced.")}
      </p>
      <Link className="inspection-link" to={SCREENS.CERTIFICATE_INSPECTOR}>
        {t("Certificate Inspector")}
      </Link>
      <Link className="inspection-link" to={SCREENS.SIGNATURE_STUDIO}>
        {t("Signature Studio preview")}
      </Link>
      {sheet && (
        <PreviewSheet title={sheet} onClose={() => setSheet(null)}>
          {sheet === "Sample file" ? (
            <button
              type="button"
              className="security-choice"
              onClick={() => {
                setFile(true);
                setKey(false);
                setSheet(null);
              }}
            >
              sample-contract.pdf · DEMO
            </button>
          ) : sheet === "Key selection preview" ? (
            <>
              <p>
                {t(
                  "No private key is read or generated. Select a public fictional label only.",
                )}
              </p>
              <button
                type="button"
                className="security-choice"
                onClick={() => {
                  setKey(true);
                  setSheet(null);
                }}
              >
                {t("Use fictional sample key")}
              </button>
            </>
          ) : (
            <p>
              {t(
                sheet === "Signature workflow preview"
                  ? "Explanation only. No file was signed, no key was used, and no signature was verified."
                  : sheet === "Algorithm"
                    ? "Reference algorithm label only. No cryptographic implementation is invoked."
                    : "Signature placeholder only. No signature bytes or device files are read.",
              )}
            </p>
          )}
        </PreviewSheet>
      )}
    </Frame>
  );
}
export const CERTIFICATE_ROWS = Object.freeze([
  ["Issuer", "CN=DEMO-ROOT.invalid"],
  ["Validity", "Illustrative dates only"],
  ["Subject Alternative Names", "example.invalid, demo.invalid"],
]);
export function CertificateInspector() {
  const { t } = useLanguage();
  const [file, setFile] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [sheet, setSheet] = useState(null);
  const [scanning, setScanning] = useState(false);
  return (
    <Frame
      title="CERTIFICATE INSPECTOR"
      icon="search"
      motion={scanning ? "inspection-scanning" : ""}
    >
      <Sample
        name={file ? "sample-certificate.pem" : "Choose demo certificate"}
        onClick={() => setSheet("Choose demo certificate")}
      />
      <p className="inspection-warning">
        {t(
          "Illustrative X.509 data only. Trust, validity and chain integrity are not verified.",
        )}
      </p>
      <section className="inspection-panel">
        <h2>{t("X.509 Summary")}</h2>
        {CERTIFICATE_ROWS.map(([label, value]) => (
          <div key={label}>
            <Row
              label={label}
              value={value}
              expanded={expanded === label}
              onClick={() => setExpanded(expanded === label ? null : label)}
            />
            {expanded === label && (
              <p>
                {t(
                  "Sample metadata only. No certificate was parsed or validated.",
                )}
              </p>
            )}
          </div>
        ))}
      </section>
      <section className="inspection-panel">
        <h2>{t("Certificate Chain")}</h2>
        {["Demo leaf", "Demo intermediate", "Demo root"].map((title) => (
          <Row
            key={title}
            label={title}
            value="Not evaluated"
            onClick={() => setSheet(title)}
          />
        ))}
      </section>
      <button
        className="inspection-secondary"
        type="button"
        disabled={!file}
        onClick={() => {
          setScanning(true);
          setSheet("Inspect preview");
        }}
      >
        {t("Inspect preview")}
      </button>
      <button
        className="security-primary"
        type="button"
        disabled={!file}
        onClick={() => setSheet("Import Certificate")}
      >
        {t("Import Certificate")}
        <Mark name="arrow" />
      </button>
      {sheet && (
        <PreviewSheet
          title={sheet}
          onClose={() => {
            setSheet(null);
            setScanning(false);
          }}
        >
          {sheet === "Choose demo certificate" ? (
            <button
              className="security-choice"
              type="button"
              onClick={() => {
                setFile(true);
                setSheet(null);
              }}
            >
              sample-certificate.pem · DEMO
            </button>
          ) : (
            <p>
              {t(
                sheet === "Import Certificate"
                  ? "Import explanation only. No certificate is installed, trusted, uploaded or written to a store."
                  : "Certificate preview only. No certificate parsing, signature validation or chain trust evaluation is performed.",
              )}
            </p>
          )}
        </PreviewSheet>
      )}
    </Frame>
  );
}
