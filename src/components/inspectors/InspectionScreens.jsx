import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { SCREENS } from "../../config/screens";
import { useLanguage } from "../../i18n/Language";
import { Mark, PreviewSheet, CapabilityCard } from "../security/ScreenUI";
import { useVault, VAULT_STATE } from "../../hooks/useVault";
import "./inspectors.css";

export const DIGEST_ALGORITHMS = Object.freeze(["SHA-256", "SHA-384", "SHA-512", "SHA3-256", "SHA3-512"]);

const ERROR_COPY = {
  BAD_INPUT: "Check the input and try again.",
  NOT_FOUND: "The selected file was not found.",
  IO_FAILED: "The file could not be read.",
  INTEGRITY_FAILED: "The value could not be parsed.",
  SESSION_REQUIRED: "Unlock the vault to use this operation.",
  SESSION_REVOKED: "Your session was revoked. Unlock again to continue.",
  UNAVAILABLE: "The vault engine is unavailable in this preview.",
};

function errorText(error) {
  if (!error) return "";
  return ERROR_COPY[error.code] || error.message || "The operation failed.";
}

function Frame({ title, icon, children, parent = SCREENS.TOOLS, motion = "", live = false }) {
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
        <p className="inspection-demo">{t(live ? "REAL SERVICE" : "VISUAL DEMO")}</p>
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
function Sample({ name, onClick, caption = "Fictional sample only" }) {
  const { t } = useLanguage();
  return (
    <button className="inspection-sample" type="button" onClick={onClick}>
      <Mark name="file" />
      <span dir="ltr">{name}</span>
      <small>{t(caption)}</small>
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
function CopyValue({ value, label = "Copy" }) {
  const { t } = useLanguage();
  const [status, setStatus] = useState("");
  async function copy() {
    try {
      if (!navigator.clipboard?.writeText) throw new Error();
      await navigator.clipboard.writeText(value);
      setStatus("Copied");
    } catch {
      setStatus("Clipboard unavailable");
    }
  }
  return (
    <div className="inspection-copy">
      <button type="button" onClick={copy}>
        {t(label)}
      </button>
      <small role="status">{t(status)}</small>
    </div>
  );
}

export function HashIntegrity() {
  const { t } = useLanguage();
  const vault = useVault();
  const [algorithm, setAlgorithm] = useState("SHA-256");
  const [text, setText] = useState("");
  const [filePath, setFilePath] = useState(null);
  const [result, setResult] = useState(null);
  const [compare, setCompare] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const busy = vault.busy;

  async function chooseFile() {
    const res = await vault.pickInputFile();
    if (res?.ok && !res.data.cancelled && res.data.path) {
      setFilePath(res.data.path);
      setText("");
      setResult(null);
      setStatus("");
      setError("");
    }
  }

  async function generate() {
    setError("");
    setStatus("");
    setResult(null);
    const request = filePath ? { algorithm, inputPath: filePath } : { algorithm, text };
    const res = await vault.hashCompute(request);
    if (res?.ok) setResult(res.data);
    else setError(errorText(res?.error));
  }

  async function compareDigests() {
    if (!result) return;
    const res = await vault.hashCompare(result.digest, compare.trim());
    if (res?.ok) {
      setStatus(
        res.data.equal
          ? "The two digests are identical."
          : res.data.lengthMatch
            ? "The digests differ. The inputs are not the same."
            : "The digests differ in length, so the inputs cannot match.",
      );
    } else {
      setStatus(errorText(res?.error));
    }
  }

  const hasInput = Boolean(filePath || text.trim());

  return (
    <Frame
      title="HASH & INTEGRITY"
      icon="shield"
      live
      motion={result ? "inspection-hash-active" : ""}
    >
      <Sample
        name={filePath || "Choose a file to hash"}
        caption={filePath ? "Real file selected" : "Or hash the text below"}
        onClick={chooseFile}
      />
      <Tabs values={DIGEST_ALGORITHMS} value={algorithm} onChange={(v) => { setAlgorithm(v); setResult(null); }} />
      <label className="inspection-text-panel">
        {t("Text to hash")}
        <textarea
          dir="auto"
          value={text}
          maxLength={4000}
          disabled={Boolean(filePath)}
          onChange={(e) => {
            setText(e.target.value);
            setResult(null);
            setStatus("");
          }}
          placeholder={filePath ? t("A file is selected instead.") : t("Type text to hash…")}
        />
      </label>
      <button
        className="security-primary"
        type="button"
        disabled={!hasInput || busy}
        onClick={generate}
      >
        {t("Generate Hash")}
        <Mark name="arrow" />
      </button>
      {error && <p role="alert" className="inspection-warning">{t(error)}</p>}
      {result && (
        <section className="inspection-output">
          <code dir="ltr">{result.digest}</code>
          <small>{t(`${result.algorithm} · ${result.size} bytes hashed`)}</small>
          <CopyValue value={result.digest} label="Copy digest" />
        </section>
      )}
      <section className="inspection-panel">
        <h2>{t("Compare Digest")}</h2>
        <label>
          {t("Paste a digest to compare")}
          <input
            dir="ltr"
            value={compare}
            onChange={(e) => {
              setCompare(e.target.value.slice(0, 256));
              setStatus("");
            }}
            placeholder="sha256 hex…"
          />
        </label>
        <button
          className="inspection-secondary"
          type="button"
          disabled={!result || !compare.trim()}
          onClick={compareDigests}
        >
          {t("Compare digests")}
        </button>
        <p role="status">{t(status)}</p>
      </section>
      <CapabilityCard id="HASH_INTEGRITY" />
      <Link className="inspection-link" to={SCREENS.FILE_INTEGRITY}>
        {t("Detailed file integrity preview")}
      </Link>
    </Frame>
  );
}
export function TextCipher() {
  const { t } = useLanguage();
  const vault = useVault();
  const [mode, setMode] = useState("ENCRYPT");
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [meta, setMeta] = useState(null);
  const unlocked = vault.state === VAULT_STATE.UNLOCKED;
  const busy = vault.busy;

  function reset() {
    setOutput("");
    setStatus("");
    setError("");
    setMeta(null);
  }

  async function run() {
    setError("");
    setStatus("");
    setOutput("");
    setMeta(null);
    if (!unlocked) {
      setError("Unlock the vault before encrypting or decrypting text.");
      return;
    }
    if (mode === "ENCRYPT") {
      const res = await vault.encryptText(input);
      if (res?.ok) {
        setOutput(res.data.container);
        setMeta(res.data.meta);
        setStatus("Text encrypted with the vault key. Copy the container to store or send it.");
      } else {
        setError(errorText(res?.error));
      }
    } else {
      const res = await vault.decryptText(input.trim());
      if (res?.ok) {
        setOutput(res.data.text);
        setMeta(res.data.meta);
        setStatus("Container decrypted and authenticated. The content matched its recorded digest.");
      } else {
        setError(errorText(res?.error));
      }
    }
  }

  return (
    <Frame title="TEXT CIPHER" icon="lock" live>
      <Tabs
        values={["ENCRYPT", "DECRYPT"]}
        value={mode}
        onChange={(v) => {
          setMode(v);
          reset();
          setInput("");
        }}
      />
      {!unlocked && (
        <p className="inspection-warning">
          {t("Unlock the vault to encrypt or decrypt text.")}
        </p>
      )}
      <div className="inspection-text-panels">
        <label>
          {t(mode === "ENCRYPT" ? "Plaintext input" : "Encrypted container")}
          <textarea
            dir="auto"
            value={input}
            maxLength={4000}
            onChange={(e) => {
              setInput(e.target.value);
              reset();
            }}
            placeholder={t(mode === "ENCRYPT" ? "Type text to encrypt…" : "Paste a base64 vault container…")}
          />
        </label>
        <label>
          {t(mode === "ENCRYPT" ? "Encrypted container" : "Recovered plaintext")}
          <textarea className={output ? "inspection-wipe" : ""} dir="ltr" value={output} readOnly />
        </label>
      </div>
      <button
        className="inspection-secondary"
        type="button"
        disabled={!output || mode === "DECRYPT"}
        onClick={() => {
          setInput(output);
          setOutput("");
          setMeta(null);
          setMode("DECRYPT");
        }}
      >
        {t("Use container as input")}
      </button>
      <Row label="Algorithm" value="AES-256-GCM" onClick={() => {}} />
      <Row label="Key" value={unlocked ? "Vault key in memory" : "Vault locked"} onClick={() => {}} />
      <button className="security-primary" type="button" disabled={!input.trim() || busy} onClick={run}>
        {t(mode === "ENCRYPT" ? "Encrypt Text" : "Decrypt Text")}
        <Mark name="arrow" />
      </button>
      {error && <p role="alert" className="inspection-warning">{t(error)}</p>}
      {output && (
        <section className="inspection-output">
          {meta && <small>{t(`${meta.origSize} bytes · ${meta.algorithm || "AES-256-GCM"}`)}</small>}
          <CopyValue value={output} label="Copy output" />
        </section>
      )}
      <p role="status" className="inspection-notice">{t(status)}</p>
      <CapabilityCard id="TEXT_CIPHER" />
    </Frame>
  );
}
export function DigitalSignature() {
  const { t } = useLanguage();
  const vault = useVault();
  const [mode, setMode] = useState("Sign");
  const [text, setText] = useState("");
  const [filePath, setFilePath] = useState(null);
  const [keys, setKeys] = useState([]);
  const [keyId, setKeyId] = useState(null);
  const [signature, setSignature] = useState("");
  const [verifyResult, setVerifyResult] = useState(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [sheet, setSheet] = useState(null);
  const unlocked = vault.state === VAULT_STATE.UNLOCKED;
  const busy = vault.busy;

  const signingKeys = keys.filter((k) => k.publicPem && k.hasPrivate);
  const selectedKey = keys.find((k) => k.id === keyId) || null;

  const loadKeys = useCallback(async () => {
    if (!unlocked) {
      setKeys([]);
      return;
    }
    const res = await vault.keyList();
    if (res?.ok) setKeys(res.data.keys || []);
  }, [unlocked, vault]);

  useEffect(() => {
    loadKeys();
  }, [loadKeys]);

  async function chooseFile() {
    const res = await vault.pickInputFile();
    if (res?.ok && !res.data.cancelled && res.data.path) {
      setFilePath(res.data.path);
      setText("");
      setSignature("");
      setVerifyResult(null);
      setError("");
    }
  }

  async function sign() {
    setError("");
    setStatus("");
    setVerifyResult(null);
    if (!selectedKey) {
      setError("Choose a signing key.");
      return;
    }
    const request = { keyId: selectedKey.id };
    if (filePath) request.inputPath = filePath;
    else request.text = text;
    const res = await vault.sign(request);
    if (res?.ok) {
      setSignature(res.data.signature);
      setStatus(`Signed ${res.data.size} bytes with a ${res.data.algorithm} key.`);
    } else {
      setError(errorText(res?.error));
    }
  }

  async function verify() {
    setError("");
    setStatus("");
    setVerifyResult(null);
    if (!selectedKey || !signature.trim()) {
      setError("Choose a key and paste a signature to verify.");
      return;
    }
    const request = { keyId: selectedKey.id, signature: signature.trim() };
    if (filePath) request.inputPath = filePath;
    else request.text = text;
    const res = await vault.signVerify(request);
    if (res?.ok) {
      setVerifyResult(res.data.valid);
      setStatus(res.data.valid ? "The signature is valid for this input." : "The signature does not match this input.");
    } else {
      setError(errorText(res?.error));
    }
  }

  return (
    <Frame
      title="DIGITAL SIGNATURE"
      icon="file"
      parent={SCREENS.KEY_FORGE}
      live
      motion={mode === "Verify" ? "inspection-verify" : ""}
    >
      <Tabs
        values={["Sign", "Verify"]}
        value={mode}
        onChange={(v) => {
          setMode(v);
          setSignature("");
          setVerifyResult(null);
          setError("");
          setStatus("");
        }}
      />
      <Sample
        name={filePath || "Choose a file to sign"}
        caption={filePath ? "Real file selected" : "Or sign the text below"}
        onClick={chooseFile}
      />
      <label className="inspection-text-panel">
        {t(mode === "Sign" ? "Text to sign" : "Signed text")}
        <textarea
          dir="auto"
          value={text}
          maxLength={4000}
          disabled={Boolean(filePath)}
          onChange={(e) => {
            setText(e.target.value);
            setVerifyResult(null);
          }}
          placeholder={filePath ? t("A file is selected instead.") : t("Type text to sign…")}
        />
      </label>
      <Row
        label={mode === "Sign" ? "Signing key" : "Verification key"}
        value={selectedKey ? `${selectedKey.name} · ${selectedKey.algorithm}` : "Choose a key"}
        onClick={() => setSheet("keys")}
      />
      {mode === "Verify" && (
        <label className="inspection-text-panel">
          {t("Signature (base64)")}
          <textarea
            dir="ltr"
            value={signature}
            maxLength={4096}
            onChange={(e) => {
              setSignature(e.target.value);
              setVerifyResult(null);
            }}
            placeholder="base64 signature…"
          />
        </label>
      )}
      <button
        className="security-primary"
        type="button"
        disabled={busy || (!filePath && !text.trim()) || !selectedKey}
        onClick={mode === "Sign" ? sign : verify}
      >
        {t(mode === "Sign" ? "Create Signature" : "Verify Signature")}
        <Mark name="arrow" />
      </button>
      {error && <p role="alert" className="inspection-warning">{t(error)}</p>}
      {signature && mode === "Sign" && (
        <section className="inspection-output">
          <code dir="ltr">{signature.slice(0, 120)}{signature.length > 120 ? "…" : ""}</code>
          <CopyValue value={signature} label="Copy signature" />
        </section>
      )}
      {verifyResult !== null && (
        <p role="status" className={verifyResult ? "inspection-ok" : "inspection-warning"}>
          {t(verifyResult ? "Signature verified" : "Signature invalid")}
        </p>
      )}
      <p role="status" className="inspection-notice">{t(status)}</p>
      <CapabilityCard id="SIGNATURE" />
      <Link className="inspection-link" to={SCREENS.CERTIFICATE_INSPECTOR}>
        {t("Certificate Inspector")}
      </Link>
      <Link className="inspection-link" to={SCREENS.SIGNATURE_STUDIO}>
        {t("Signature Studio preview")}
      </Link>
      {sheet === "keys" && (
        <PreviewSheet title="Choose a key" onClose={() => setSheet(null)}>
          {!unlocked && <p>{t("Unlock the vault to list your keys.")}</p>}
          {unlocked && signingKeys.length === 0 && (
            <p>{t("No signing key yet. Generate one in Key Forge.")}</p>
          )}
          {signingKeys.map((k) => (
            <button
              className="security-choice"
              type="button"
              key={k.id}
              aria-pressed={k.id === keyId}
              onClick={() => {
                setKeyId(k.id);
                setSheet(null);
              }}
            >
              {k.name} · {k.algorithm}
            </button>
          ))}
        </PreviewSheet>
      )}
    </Frame>
  );
}
export function CertificateInspector() {
  const { t } = useLanguage();
  const vault = useVault();
  const [pem, setPem] = useState("");
  const [info, setInfo] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function chooseFile() {
    const res = await vault.pickInputFile();
    if (!res?.ok || res.data.cancelled || !res.data.path) return;
    // The renderer cannot read files, so the main process reads and parses the
    // chosen certificate in one step.
    setBusy(true);
    setError("");
    setInfo(null);
    const parsed = await vault.certInspectFile(res.data.path);
    if (parsed?.ok) setInfo(parsed.data);
    else setError(errorText(parsed?.error));
    setBusy(false);
  }

  async function inspectPasted() {
    setBusy(true);
    setError("");
    setInfo(null);
    const res = await vault.certInspect(pem);
    if (res?.ok) setInfo(res.data);
    else setError(errorText(res?.error));
    setBusy(false);
  }

  const rows = info
    ? [
        ["Subject", info.subject],
        ["Issuer", info.issuer],
        ["Serial", info.serialNumber],
        ["Valid from", info.validFrom],
        ["Valid to", info.validTo],
        ["Public key", `${info.keyType}${info.keySize ? ` ${info.keySize}-bit` : ""}`],
        ["SHA-256 fingerprint", info.fingerprint256],
        ["Subject Alternative Names", info.subjectAltName.join(", ") || "—"],
      ]
    : [];

  return (
    <Frame title="CERTIFICATE INSPECTOR" icon="search" live>
      <Sample
        name={info ? info.subject : "Choose a PEM certificate"}
        caption={info ? "Real certificate parsed" : "Or paste PEM text below"}
        onClick={chooseFile}
      />
      <label className="inspection-text-panel">
        {t("Paste a PEM certificate")}
        <textarea
          dir="ltr"
          value={pem}
          maxLength={65536}
          onChange={(e) => {
            setPem(e.target.value);
            setInfo(null);
            setError("");
          }}
          placeholder="-----BEGIN CERTIFICATE-----"
        />
      </label>
      <button
        className="security-primary"
        type="button"
        disabled={!pem.trim() || busy}
        onClick={inspectPasted}
      >
        {t("Inspect Certificate")}
        <Mark name="arrow" />
      </button>
      {error && <p role="alert" className="inspection-warning">{t(error)}</p>}
      {info && (
        <>
          <p
            role="status"
            className={info.expired || info.notYetValid ? "inspection-warning" : "inspection-ok"}
          >
            {t(
              info.expired
                ? "This certificate has expired."
                : info.notYetValid
                  ? "This certificate is not yet valid."
                  : "This certificate is within its validity window.",
            )}{" "}
            {t(
              info.selfSigned
                ? "It is self-signed, so no external issuer vouches for it."
                : "It is issued by another party.",
            )}{" "}
            {t("KnouxCrypt has no CA trust store and does not claim trust.")}
          </p>
          <section className="inspection-panel">
            <h2>{t("X.509 Summary")}</h2>
            {rows.map(([label, value]) => (
              <div key={label}>
                <Row
                  label={label}
                  value={value}
                  expanded={expanded === label}
                  onClick={() => setExpanded(expanded === label ? null : label)}
                />
                {expanded === label && (
                  <p dir="ltr" className="inspection-value-full">{value}</p>
                )}
              </div>
            ))}
          </section>
          <CapabilityCard id="CERTIFICATE_INSPECTOR" />
        </>
      )}
    </Frame>
  );
}
