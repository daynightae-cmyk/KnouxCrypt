import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useLanguage } from "../../i18n/Language";
import { SCREENS } from "../../config/screens";
import { Mark, CapabilityCard } from "../security/ScreenUI";
import { useVault, VAULT_STATE } from "../../hooks/useVault";
import "./labs.css";

const ERROR_COPY = {
  BAD_INPUT: "Check the input and try again.",
  NOT_FOUND: "The selected item was not found.",
  IO_FAILED: "The file could not be read or written.",
  CONSENT_REQUIRED: "Confirm the action before continuing.",
  SESSION_REQUIRED: "Unlock the vault to use this operation.",
  SESSION_REVOKED: "Your session was revoked. Unlock again to continue.",
  UNSUPPORTED_FORMAT: "This platform does not expose that capability.",
  CANCELLED: "The operation was cancelled.",
  UNAVAILABLE: "The vault engine is unavailable in this preview.",
};

function errorText(error) {
  if (!error) return "";
  return ERROR_COPY[error.code] || error.message || "The operation failed.";
}

function Frame({ title, icon, children, parent = SCREENS.TOOLS, motion = "", live = false }) {
  const { t, locale, dir } = useLanguage();
  return (
    <main className={`lab-screen ${motion}`} dir={dir} lang={locale}>
      <div className="lab-shell">
        <Link className="lab-back" to={parent}>
          ‹ {t("Back to Tools")}
        </Link>
        <div className="lab-art" aria-hidden="true">
          <Mark name={icon} />
          <i />
        </div>
        <h1>{t(title)}</h1>
        <p className="lab-demo">{t(live ? "REAL SERVICE" : "VISUAL DEMO")}</p>
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
        <button type="button" key={v} aria-pressed={v === value} onClick={() => onChange(v)}>
          {t(v)}
        </button>
      ))}
    </div>
  );
}

function Consent({ value, onChange, label }) {
  const { t } = useLanguage();
  return (
    <label className="lab-consent">
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />
      <span>{t(label)}</span>
    </label>
  );
}

function Error({ error }) {
  if (!error) return null;
  return (
    <p className="lab-error" role="alert">
      {errorText(error)}
    </p>
  );
}

function VaultGate({ state }) {
  const { t } = useLanguage();
  if (state === VAULT_STATE.UNLOCKED) return null;
  return (
    <p className="lab-warning" role="status">
      {t("Unlock the vault to run this operation.")}
    </p>
  );
}

/**
 * Places a value on the clipboard under a real, time-limited lease. The
 * checkbox is the explicit consent the guard requires; without it the button
 * stays disabled, matching the service's own refusal.
 */
function LeaseCopy({ value, seconds = 30, clipboardCopy }) {
  const { t } = useLanguage();
  const [consent, setConsent] = useState(false);
  const [state, setState] = useState("");
  const [error, setError] = useState(null);
  const copy = async () => {
    setError(null);
    setState("");
    const res = await clipboardCopy({ text: value, seconds, confirm: true });
    if (res?.ok) setState(`${t("Copied under a lease that clears after")} ${seconds}s.`);
    else setError(res?.error);
  };
  return (
    <section className="lab-panel">
      <Consent
        value={consent}
        onChange={setConsent}
        label="I understand this value will be cleared after the lease expires."
      />
      <button className="lab-secondary" type="button" disabled={!value || !consent} onClick={copy}>
        {t("Copy under a lease")}
      </button>
      {state && <p className="lab-notice" role="status">{state}</p>}
      <Error error={error} />
    </section>
  );
}

// ---------------------------------------------------------------------------
// Task 25 — Clipboard Guard
// ---------------------------------------------------------------------------

export function ClipboardGuard() {
  const { t } = useLanguage();
  const vault = useVault();
  const [status, setStatus] = useState(null);
  const [text, setText] = useState("");
  const [seconds, setSeconds] = useState(30);
  const [consent, setConsent] = useState(false);
  const [lease, setLease] = useState(null);
  const [remaining, setRemaining] = useState(0);
  const [verdict, setVerdict] = useState(null);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    const res = await vault.clipboardStatus();
    if (res?.ok) setStatus(res.data);
  }, [vault]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // A local countdown mirrors the lease timer. It is display only; the service
  // owns the real timer and decides whether the clipboard may be cleared.
  useEffect(() => {
    if (!lease) {
      setRemaining(0);
      return undefined;
    }
    setRemaining(lease.seconds);
    const id = setInterval(() => setRemaining((v) => (v > 0 ? v - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, [lease]);

  const act = async (fn) => {
    setError(null);
    const res = await fn();
    if (!res?.ok) setError(res?.error);
    await refresh();
    return res;
  };

  const onCopy = async () => {
    const res = await act(() => vault.clipboardCopy({ text, seconds, confirm: true }));
    if (res?.ok) setLease(res.data);
  };

  const supported = status?.supported !== false;

  return (
    <Frame title="CLIPBOARD GUARD" icon="shield" live motion={lease ? "lab-shutter" : ""}>
      <CapabilityCard id="CLIPBOARD_GUARD" />
      <VaultGate state={vault.state} />
      {status && !supported && (
        <p className="lab-warning" role="status">
          {t("The clipboard is not available on this platform, so the guard is disabled.")}
        </p>
      )}
      <section className="lab-panel">
        <h2>{t("Clipboard protection")}</h2>
        <p>{status?.armed ? t("A lease is armed.") : t("No lease is armed.")}</p>
        <label className="lab-field">
          {t("Value to place on the clipboard")}
          <textarea dir="ltr" maxLength={4096} value={text} onChange={(e) => setText(e.target.value)} />
        </label>
        <Choices
          values={(status?.timerChoices || [15, 30, 60, 120]).map((v) => `${v}s`)}
          value={`${seconds}s`}
          onChange={(v) => setSeconds(Number(v.replace("s", "")))}
          label="Clear timer"
        />
        <Consent
          value={consent}
          onChange={setConsent}
          label="I understand the clipboard will be cleared after this timer, only if it still holds this exact value."
        />
        <button
          className="security-primary"
          type="button"
          disabled={!supported || !text.trim() || !consent}
          onClick={onCopy}
        >
          {t("Copy under a lease")}
          <Mark name="arrow" />
        </button>
        <Error error={error} />
      </section>

      {lease && (
        <section className="lab-panel">
          <h3>{t("Active lease")}</h3>
          <dl className="lab-meta">
            <div><dt>{t("Lease")}</dt><dd dir="ltr">{lease.leaseId}</dd></div>
            <div><dt>{t("Clear after")}</dt><dd>{remaining}s</dd></div>
            <div><dt>{t("Value length")}</dt><dd>{lease.length}</dd></div>
          </dl>
          <div className="lab-actions">
            <button
              className="lab-secondary"
              type="button"
              onClick={async () => {
                const res = await act(() => vault.clipboardVerify(lease.leaseId));
                if (res?.ok) setVerdict(res.data);
              }}
            >
              {t("Check ownership")}
            </button>
            <button
              className="lab-secondary"
              type="button"
              onClick={() => act(() => vault.clipboardClearNow(lease.leaseId))}
            >
              {t("Clear now")}
            </button>
            <button
              className="lab-secondary"
              type="button"
              onClick={async () => {
                await act(() => vault.clipboardDisarm(lease.leaseId));
                setLease(null);
              }}
            >
              {t("Disarm")}
            </button>
          </div>
          {verdict && (
            <p className="lab-notice" role="status">
              {verdict.present
                ? t("The clipboard still holds this lease's value.")
                : t("The clipboard no longer holds this lease's value; it will be left untouched.")}
            </p>
          )}
        </section>
      )}

      <p className="lab-warning">
        {t(
          "The guard clears only a value it placed itself, and only when the clipboard still matches. It cannot promise global erasure: other applications, clipboard history and clipboard managers are outside this app's control.",
        )}
      </p>
    </Frame>
  );
}

// ---------------------------------------------------------------------------
// Task 26 — Secure Random
// ---------------------------------------------------------------------------

const RANDOM_TYPES = [
  { label: "Hex", type: "hex" },
  { label: "Base64", type: "base64" },
  { label: "Passphrase", type: "passphrase" },
  { label: "Password", type: "password" },
];

export function SecureRandom() {
  const { t } = useLanguage();
  const vault = useVault();
  const [typeLabel, setTypeLabel] = useState("Hex");
  const [length, setLength] = useState(32);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const generate = async () => {
    setError(null);
    const type = RANDOM_TYPES.find((v) => v.label === typeLabel)?.type || "hex";
    const res = await vault.randomGenerate({ type, length });
    if (res?.ok) setResult(res.data);
    else {
      setResult(null);
      setError(res?.error);
    }
  };

  return (
    <Frame title="Secure Random Studio" icon="key" live>
      <CapabilityCard id="SECURE_RANDOM" />
      <Choices values={RANDOM_TYPES.map((v) => v.label)} value={typeLabel} onChange={setTypeLabel} label="Output type" />
      <section className="lab-panel">
        <label className="lab-field">
          {t("Length")} <output>{length}</output>
          <input
            type="range"
            aria-label={t("Length")}
            min="8"
            max="64"
            value={length}
            onChange={(e) => {
              setLength(Number(e.target.value));
              setResult(null);
            }}
          />
        </label>
        {result && (
          <>
            <label className="lab-field">
              {t("Generated value")}
              <textarea readOnly dir="ltr" value={result.value} />
            </label>
            <dl className="lab-meta">
              <div><dt>{t("Entropy")}</dt><dd>{result.entropyBits} bits</dd></div>
              <div><dt>{t("Source")}</dt><dd dir="ltr">{result.source}</dd></div>
            </dl>
          </>
        )}
      </section>
      <button className="security-primary" type="button" onClick={generate}>
        {t("Generate Random Bytes")}
        <Mark name="arrow" />
      </button>
      <Error error={error} />
      {result && <LeaseCopy value={result.value} clipboardCopy={vault.clipboardCopy} />}
      <p className="lab-notice">
        {t(
          "Values come from the operating-system CSPRNG with unbiased rejection sampling. The entropy figure is the generator's theoretical entropy, not a certification of the OS entropy source.",
        )}
      </p>
    </Frame>
  );
}

// ---------------------------------------------------------------------------
// Task 27 — HMAC Authenticity
// ---------------------------------------------------------------------------

export function HmacAuthenticity() {
  const { t } = useLanguage();
  const vault = useVault();
  const [algorithm, setAlgorithm] = useState("SHA-256");
  const [mode, setMode] = useState("Text");
  const [message, setMessage] = useState("");
  const [file, setFile] = useState(null);
  const [key, setKey] = useState("");
  const [keyEncoding, setKeyEncoding] = useState("utf8");
  const [rendering, setRendering] = useState("Hex");
  const [result, setResult] = useState(null);
  const [candidate, setCandidate] = useState("");
  const [verdict, setVerdict] = useState(null);
  const [error, setError] = useState(null);

  const pickFile = async () => {
    const res = await vault.pickInputFile();
    if (res?.ok && !res.data.cancelled) setFile(res.data.path);
  };

  const compute = async () => {
    setError(null);
    setVerdict(null);
    const request = { algorithm, key, keyEncoding, encoding: rendering === "Base64" ? "base64" : "hex" };
    if (mode === "File") request.inputPath = file;
    else request.message = message;
    const res = await vault.hmacCompute(request);
    if (res?.ok) setResult(res.data);
    else {
      setResult(null);
      setError(res?.error);
    }
  };

  const compare = async () => {
    setError(null);
    const res = await vault.hmacCompare(result.mac, candidate.trim());
    if (res?.ok) setVerdict(res.data);
    else setError(res?.error);
  };

  const ready = key.length > 0 && (mode === "File" ? Boolean(file) : message.trim().length > 0);

  return (
    <Frame title="HMAC AUTHENTICITY LAB" icon="lock" live>
      <CapabilityCard id="HMAC_AUTHENTICITY" />
      <Choices values={["SHA-256", "SHA-384", "SHA-512"]} value={algorithm} onChange={setAlgorithm} label="Algorithm" />
      <Choices values={["Text", "File"]} value={mode} onChange={setMode} label="Input mode" />
      <section className="lab-panel">
        {mode === "Text" ? (
          <label className="lab-field">
            {t("Message")}
            <textarea dir="auto" maxLength={2000} value={message} onChange={(e) => setMessage(e.target.value)} />
          </label>
        ) : (
          <div className="lab-field">
            <button className="lab-secondary" type="button" onClick={pickFile}>
              {t("Choose a file to stream")}
            </button>
            {file && <code className="lab-result" dir="ltr">{file}</code>}
          </div>
        )}
        <label className="lab-field">
          {t("Shared key · used and discarded, never stored")}
          <input type="password" dir="ltr" value={key} onChange={(e) => setKey(e.target.value)} />
        </label>
        <Choices values={["utf8", "hex", "base64"]} value={keyEncoding} onChange={setKeyEncoding} label="Key encoding" />
      </section>
      <Choices values={["Hex", "Base64"]} value={rendering} onChange={setRendering} label="Digest display" />
      <button className="security-primary" type="button" disabled={!ready} onClick={compute}>
        {t("Compute HMAC")}
        <Mark name="arrow" />
      </button>
      <Error error={error} />
      {result && (
        <section className="lab-panel">
          <code className="lab-result" dir="ltr">{result.mac}</code>
          <dl className="lab-meta">
            <div><dt>{t("Bytes hashed")}</dt><dd>{result.messageBytes}</dd></div>
            <div><dt>{t("Source")}</dt><dd>{t(result.source === "file" ? "Streamed file" : "Text")}</dd></div>
          </dl>
          <label className="lab-field">
            {t("Paste a tag to compare")}
            <input dir="ltr" value={candidate} maxLength={512} onChange={(e) => setCandidate(e.target.value)} />
          </label>
          <button className="lab-secondary" type="button" disabled={!candidate.trim()} onClick={compare}>
            {t("Compare tags")}
          </button>
          {verdict && (
            <p className="lab-notice" role="status">
              {verdict.equal
                ? t("The tags match: the data is unaltered and this comparison knows the key. That does not prove who sent it.")
                : t("The tags differ: the data or the key does not match.")}
            </p>
          )}
        </section>
      )}
      <p className="lab-notice">
        {t(
          "A matching tag proves integrity and knowledge of the key. It does not identify the sender, because anyone holding the key can produce the same tag.",
        )}
      </p>
    </Frame>
  );
}

// ---------------------------------------------------------------------------
// Task 28 — Public Key QR
// ---------------------------------------------------------------------------

function QrMatrix({ rows }) {
  const size = rows.length;
  return (
    <svg className="lab-qr-svg" viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Public key QR code">
      <rect x="0" y="0" width={size} height={size} fill="#fff" />
      {rows.map((row, y) =>
        row
          .split("")
          .map((cell, x) =>
            cell === "1" ? <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill="#000" /> : null,
          ),
      )}
    </svg>
  );
}

export function PublicKeyQr() {
  const { t } = useLanguage();
  const vault = useVault();
  const [mode, setMode] = useState("Stored key");
  const [keys, setKeys] = useState([]);
  const [keyId, setKeyId] = useState("");
  const [text, setText] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (mode !== "Stored key" || vault.state !== VAULT_STATE.UNLOCKED) return undefined;
    let active = true;
    vault.keyList().then((res) => {
      if (active && res?.ok) {
        setKeys(res.data.records || []);
        setKeyId((current) => current || res.data.records?.[0]?.id || "");
      }
    });
    return () => {
      active = false;
    };
  }, [mode, vault]);

  const render = async () => {
    setError(null);
    const request = mode === "Stored key" ? { keyId } : { text };
    const res = await vault.publicKeyQr(request);
    if (res?.ok) setResult(res.data);
    else {
      setResult(null);
      setError(res?.error);
    }
  };

  const ready = mode === "Stored key" ? Boolean(keyId) : text.trim().length > 0;

  return (
    <Frame title="PUBLIC KEY QR EXCHANGE" icon="key" live>
      <CapabilityCard id="PUBLIC_KEY_QR" />
      <Choices values={["Stored key", "Public text"]} value={mode} onChange={setMode} label="QR source" />
      {mode === "Stored key" && <VaultGate state={vault.state} />}
      <section className="lab-panel">
        {mode === "Stored key" ? (
          keys.length === 0 ? (
            <p className="lab-notice">{t("No stored keys yet. Generate one in Key Forge.")}</p>
          ) : (
            <div className="lab-choices" role="group" aria-label={t("Choose a key")}>
              {keys.map((k) => (
                <button type="button" key={k.id} aria-pressed={k.id === keyId} onClick={() => setKeyId(k.id)}>
                  {k.name || k.id}
                </button>
              ))}
            </div>
          )
        ) : (
          <label className="lab-field">
            {t("Public key text")}
            <textarea dir="ltr" maxLength={4096} value={text} onChange={(e) => setText(e.target.value)} />
          </label>
        )}
        <button className="security-primary" type="button" disabled={!ready} onClick={render}>
          {t("Render QR")}
          <Mark name="arrow" />
        </button>
        <Error error={error} />
      </section>

      {result && (
        <section className="lab-panel">
          <div className="lab-qr" aria-label={t("Scannable public key QR code")}>
            <QrMatrix rows={result.rows} />
          </div>
          <dl className="lab-meta">
            <div><dt>{t("Modules")}</dt><dd>{result.moduleCount}</dd></div>
            <div><dt>{t("Error correction")}</dt><dd>{result.errorCorrectionLevel}</dd></div>
            {result.fingerprint && <div><dt>{t("Fingerprint")}</dt><dd dir="ltr">{result.fingerprint}</dd></div>}
          </dl>
          <label className="lab-field">
            {t("Encoded payload")}
            <textarea readOnly dir="ltr" value={result.payload} />
          </label>
          <LeaseCopy value={result.payload} clipboardCopy={vault.clipboardCopy} />
        </section>
      )}

      <p className="lab-notice">
        {t(
          "The QR encodes public material only. Private keys are refused. A QR is not an identity claim: verify the fingerprint out of band before trusting the key.",
        )}
      </p>
    </Frame>
  );
}
