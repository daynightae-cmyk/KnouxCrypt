import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { SCREENS } from "../../config/screens";
import { useLanguage } from "../../i18n/Language";
import { Mark, PreviewSheet, CapabilityCard } from "../security/ScreenUI";
import { useVault } from "../../hooks/useVault";
import "./advanced.css";

const ERROR_COPY = {
  BAD_INPUT: "Check the input and try again.",
  NOT_FOUND: "The selected item was not found.",
  IO_FAILED: "The operation could not be completed on disk.",
  AUTH_FAILED: "The authentication check did not match.",
  SESSION_REQUIRED: "Unlock the vault to use this operation.",
  SESSION_REVOKED: "Your session was revoked. Unlock again to continue.",
  CONSENT_REQUIRED: "This action needs explicit confirmation.",
  INTEGRITY_FAILED: "The integrity check failed.",
  CANCELLED: "The operation was cancelled.",
  UNAVAILABLE: "The desktop vault bridge is unavailable in this preview.",
};

function errorText(error) {
  if (!error) return "";
  return ERROR_COPY[error.code] || error.message || "The operation failed.";
}

function Frame({ title, parent, icon, children, motion = "", live = false }) {
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
        <p className="advanced-notice">{t(live ? "REAL SERVICE" : "VISUAL DEMO")}</p>
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

function Error({ error }) {
  if (!error) return null;
  return (
    <p className="advanced-warning" role="alert">
      {errorText(error)}
    </p>
  );
}

// ---------------------------------------------------------------------------
// Task 37 — Argon2id Key Derivation Studio
// ---------------------------------------------------------------------------

export function KeyDerivation() {
  const { t } = useLanguage();
  const vault = useVault();
  const [params, setParams] = useState(null);
  const [passphrase, setPassphrase] = useState("");
  const [profile, setProfile] = useState("INTERACTIVE");
  const [memoryKiB, setMemory] = useState(65536);
  const [iterations, setIterations] = useState(2);
  const [parallelism, setParallelism] = useState(1);
  const [reveal, setReveal] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const loadParams = useCallback(async () => {
    const res = await vault.argon2Params();
    if (res?.ok) {
      setParams(res.data);
      const base = res.data.profiles?.find((p) => p.id === "INTERACTIVE") || res.data.profiles?.[0];
      if (base) {
        setMemory(base.memoryKiB);
        setIterations(base.iterations);
        setParallelism(base.parallelism);
      }
    }
  }, [vault]);

  useEffect(() => {
    loadParams();
  }, [loadParams]);

  const applyProfile = (id) => {
    setProfile(id);
    const base = params?.profiles?.find((p) => p.id === id);
    if (base) {
      setMemory(base.memoryKiB);
      setIterations(base.iterations);
      setParallelism(base.parallelism);
    }
  };

  const derive = async () => {
    setError(null);
    setResult(null);
    setBusy(true);
    const res = await vault.argon2Derive({
      passphrase,
      params: { profile, memoryKiB, iterations, parallelism },
      reveal,
    });
    setBusy(false);
    if (res?.ok) setResult(res.data);
    else setError(res?.error);
  };

  const limits = params?.limits;

  return (
    <Frame title="KEY DERIVATION" parent={SCREENS.KEY_DETAILS} icon="key" motion="advanced-cube" live>
      <CapabilityCard id="KEY_DERIVATION" />
      <section className="advanced-panel">
        <h2>{t("Argon2id (RFC 9106)")}</h2>
        <label className="advanced-field">
          {t("Passphrase")}
          <input
            type="password"
            dir="auto"
            autoComplete="off"
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
          />
        </label>
        <Select
          label="Cost profile"
          value={profile}
          values={(params?.profiles || [{ id: "INTERACTIVE" }]).map((p) => p.id)}
          onChange={applyProfile}
        />
        <label className="advanced-field">
          {t("Memory (KiB)")}
          <input
            type="number"
            dir="ltr"
            min={limits?.minMemoryKiB || 8}
            max={limits?.maxMemoryKiB || 4194304}
            value={memoryKiB}
            onChange={(e) => setMemory(Number(e.target.value))}
          />
        </label>
        <label className="advanced-field">
          {t("Time cost (iterations)")}
          <input
            type="number"
            dir="ltr"
            min={limits?.minIterations || 1}
            max={limits?.maxIterations || 64}
            value={iterations}
            onChange={(e) => setIterations(Number(e.target.value))}
          />
        </label>
        <label className="advanced-field">
          {t("Parallelism")}
          <input
            type="number"
            dir="ltr"
            min={limits?.minParallelism || 1}
            max={limits?.maxParallelism || 64}
            value={parallelism}
            onChange={(e) => setParallelism(Number(e.target.value))}
          />
        </label>
        <label className="advanced-check">
          {t("Reveal the derived tag (otherwise only a fingerprint is shown)")}
          <input type="checkbox" checked={reveal} onChange={() => setReveal((v) => !v)} />
        </label>
        <Error error={error} />
        {result && (
          <dl className="advanced-summary">
            <dt>{t("Algorithm")}</dt>
            <dd dir="ltr">
              {result.algorithm} · v{result.version}
            </dd>
            <dt>{t("Salt")}</dt>
            <dd dir="ltr">
              {result.saltHex.slice(0, 16)}… {result.saltGenerated ? t("(random)") : t("(supplied)")}
            </dd>
            <dt>{t("Tag fingerprint")}</dt>
            <dd dir="ltr">{result.tagFingerprint}</dd>
            {result.tagHex && (
              <>
                <dt>{t("Derived tag")}</dt>
                <dd dir="ltr">{result.tagHex}</dd>
              </>
            )}
            <dt>{t("Duration")}</dt>
            <dd dir="ltr">{result.durationMs} ms</dd>
          </dl>
        )}
      </section>
      <button className="security-primary" type="button" disabled={!vault.available || busy || !passphrase} onClick={derive}>
        {t(busy ? "Deriving…" : "Run Derivation")}
        <Mark name="arrow" />
      </button>
      <p className="advanced-notice">
        {t(
          "Real Argon2id runs on a worker thread. The vault container keeps its PBKDF2/scrypt format; this studio does not change it. hash-wasm does not support Argon2 associated data.",
        )}
      </p>
    </Frame>
  );
}

// ---------------------------------------------------------------------------
// Task 38 — Signature Studio
// ---------------------------------------------------------------------------

export function SignatureStudio() {
  const { t } = useLanguage();
  const vault = useVault();
  const [mode, setMode] = useState("Sign");
  const [keys, setKeys] = useState([]);
  const [keyId, setKeyId] = useState("");
  const [message, setMessage] = useState("");
  const [publicPem, setPublicPem] = useState("");
  const [signature, setSignature] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const loadKeys = useCallback(async () => {
    const res = await vault.keyList();
    if (res?.ok) {
      const records = (res.data?.records || []).filter((r) => r.privatePem || r.publicPem);
      setKeys(records);
      if (records[0]) setKeyId(records[0].id);
    }
  }, [vault]);

  useEffect(() => {
    loadKeys();
  }, [loadKeys]);

  const run = async () => {
    setError(null);
    setResult(null);
    setBusy(true);
    if (mode === "Sign") {
      const res = await vault.sign({ keyId, text: message });
      if (res?.ok) {
        setResult(res.data);
        setSignature(res.data.signature);
      } else setError(res?.error);
    } else {
      const res = await vault.signVerify({
        keyId: publicPem ? undefined : keyId,
        publicPem: publicPem || undefined,
        signature,
        text: message,
      });
      if (res?.ok) setResult(res.data);
      else setError(res?.error);
    }
    setBusy(false);
  };

  const saveRecord = async () => {
    if (!result) return;
    const pick = await vault.pickOutputFile({ title: "Save signature record", defaultPath: "signature-record.json" });
    if (!pick?.ok || pick.data?.cancelled || !pick.data?.path) return;
    const res = await vault.reportExport({ report: result, outputPath: pick.data.path, kind: "signature" });
    if (!res?.ok) setError(res?.error);
  };

  const ready = mode === "Sign" ? Boolean(keyId && message) : Boolean(signature && message && (publicPem || keyId));

  return (
    <Frame
      title="SIGNATURE STUDIO"
      parent={SCREENS.SIGNATURE}
      icon="shield"
      motion={mode === "Verify" ? "advanced-seal-verify" : "advanced-seal"}
      live
    >
      <CapabilityCard id="SIGNATURE_STUDIO" />
      <div className="advanced-choices">
        {["Sign", "Verify"].map((v) => (
          <button
            type="button"
            key={v}
            aria-pressed={mode === v}
            onClick={() => {
              setMode(v);
              setResult(null);
              setError(null);
            }}
          >
            {t(v)}
          </button>
        ))}
      </div>
      <section className="advanced-panel">
        <label className="advanced-field">
          {t("Message")}
          <textarea dir="auto" value={message} maxLength={100000} onChange={(e) => setMessage(e.target.value)} />
        </label>
        {mode === "Sign" ? (
          <label className="advanced-field">
            {t("Signing key")}
            <select value={keyId} onChange={(e) => setKeyId(e.target.value)}>
              {keys.length === 0 && <option value="">{t("No stored keys")}</option>}
              {keys.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.name} · {k.algorithm}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <>
            <label className="advanced-field">
              {t("Public key (PEM, optional if a stored key is chosen)")}
              <textarea dir="ltr" value={publicPem} onChange={(e) => setPublicPem(e.target.value)} placeholder="-----BEGIN PUBLIC KEY-----" />
            </label>
            <label className="advanced-field">
              {t("Signature (base64)")}
              <input dir="ltr" value={signature} onChange={(e) => setSignature(e.target.value)} />
            </label>
            <label className="advanced-field">
              {t("Stored key (used when no PEM is pasted)")}
              <select value={keyId} onChange={(e) => setKeyId(e.target.value)}>
                <option value="">{t("None")}</option>
                {keys.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.name} · {k.algorithm}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
        <Error error={error} />
        {result && (
          <dl className="advanced-summary">
            {result.algorithm && (
              <>
                <dt>{t("Algorithm")}</dt>
                <dd dir="ltr">{result.algorithm}</dd>
              </>
            )}
            {mode === "Verify" ? (
              <>
                <dt>{t("Verdict")}</dt>
                <dd dir="ltr">{result.valid ? t("Valid signature") : t("Signature did not verify")}</dd>
              </>
            ) : (
              <>
                <dt>{t("Signature (base64)")}</dt>
                <dd dir="ltr">{result.signature}</dd>
              </>
            )}
            {result.fingerprint && (
              <>
                <dt>{t("Key fingerprint")}</dt>
                <dd dir="ltr">{result.fingerprint}</dd>
              </>
            )}
          </dl>
        )}
      </section>
      <button className="security-primary" type="button" disabled={!vault.available || busy || !ready} onClick={run}>
        {t(busy ? "Working…" : mode === "Sign" ? "Create Signature" : "Verify Signature")}
        <Mark name="arrow" />
      </button>
      {mode === "Sign" && result?.signature && (
        <button type="button" className="advanced-secondary" onClick={saveRecord}>
          {t("Save signature record")}
        </button>
      )}
      <p className="advanced-notice">
        {t("Real detached signatures over real stored keys. Verification reports the real result, not a demo verdict.")}
      </p>
    </Frame>
  );
}

// ---------------------------------------------------------------------------
// Task 39 — Security Activity Journal
// ---------------------------------------------------------------------------

const OUTCOMES = ["All", "success", "rejected", "failed", "info"];

export function SecurityActivity() {
  const { t } = useLanguage();
  const vault = useVault();
  const [categories, setCategories] = useState(["All"]);
  const [category, setCategory] = useState("All");
  const [outcome, setOutcome] = useState("All");
  const [query, setQuery] = useState("");
  const [entries, setEntries] = useState([]);
  const [integrity, setIntegrity] = useState(null);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [sheet, setSheet] = useState(false);

  const load = useCallback(async () => {
    const [cats, integ, list] = await Promise.all([
      vault.journalCategories(),
      vault.journalIntegrity(),
      vault.journalList({ category, outcome, query, limit: 200 }),
    ]);
    if (cats?.ok) setCategories(["All", ...(cats.data?.categories || [])]);
    if (integ?.ok) setIntegrity(integ.data);
    if (list?.ok) setEntries(list.data?.entries || []);
    else setError(list?.error);
  }, [vault, category, outcome, query]);

  useEffect(() => {
    load();
  }, [load]);

  const clear = async () => {
    setError(null);
    const res = await vault.journalClear(true);
    if (!res?.ok) setError(res?.error);
    setSheet(false);
    await load();
  };

  const exportJournal = async () => {
    setError(null);
    const pick = await vault.pickOutputFile({ title: "Export security journal", defaultPath: "security-journal.json" });
    if (!pick?.ok || pick.data?.cancelled || !pick.data?.path) return;
    const res = await vault.journalExport(pick.data.path, true);
    if (!res?.ok) setError(res?.error);
    else await load();
  };

  const tampered = integrity && integrity.status !== "intact";

  return (
    <Frame title="SECURITY ACTIVITY" parent={SCREENS.PRIVACY} icon="lock" motion="advanced-activity" live>
      <CapabilityCard id="SECURITY_ACTIVITY" />
      <p className="advanced-warning">
        {t(
          "Local, chained journal only. It records this app's events; it is not OS-wide intrusion detection and has no external trust anchor.",
        )}
      </p>
      {integrity && (
        <dl className="advanced-summary">
          <dt>{t("Integrity")}</dt>
          <dd dir="ltr" data-status={integrity.status}>
            {integrity.status === "intact"
              ? t("Chain intact")
              : integrity.status === "tampered"
                ? t("Tampering detected")
                : t("Evidence unavailable")}
          </dd>
          <dt>{t("Entries")}</dt>
          <dd dir="ltr">
            {integrity.entries} {integrity.droppedCount ? `(+${integrity.droppedCount} ${t("dropped")})` : ""}
          </dd>
        </dl>
      )}
      {tampered && (
        <p className="advanced-warning" role="alert">
          {t("The journal chain does not verify. Treat the entries below as untrusted.")}
        </p>
      )}
      <div className="advanced-choices">
        <Select label="Category" value={category} values={categories} onChange={setCategory} />
        <Select label="Outcome" value={outcome} values={OUTCOMES} onChange={setOutcome} />
      </div>
      <label className="advanced-field">
        {t("Search")}
        <input dir="auto" value={query} onChange={(e) => setQuery(e.target.value)} />
      </label>
      <Error error={error} />
      <section className="advanced-panel">
        <h2>{t("Event History")}</h2>
        {entries.length === 0 && <p role="status">{t("No matching entries.")}</p>}
        {entries.map((e) => (
          <div key={`${e.seq}-${e.mac}`}>
            <button
              type="button"
              className="advanced-row"
              aria-expanded={expanded === e.seq}
              onClick={() => setExpanded(expanded === e.seq ? null : e.seq)}
            >
              <span dir="auto">
                {e.action} · {e.category}
              </span>
              <Mark name="chevron" />
            </button>
            {expanded === e.seq && (
              <p dir="auto">
                {new Date(e.at).toLocaleString()} · {e.outcome}
                {e.subject ? ` · ${e.subject}` : ""}
                {e.detail ? ` · ${JSON.stringify(e.detail)}` : ""}
              </p>
            )}
          </div>
        ))}
      </section>
      <div className="advanced-choices">
        <button type="button" className="advanced-secondary" onClick={() => setSheet(true)}>
          {t("Clear journal")}
        </button>
        <button type="button" className="advanced-secondary" onClick={exportJournal} disabled={!vault.available}>
          {t("Export journal")}
        </button>
        <button type="button" className="advanced-secondary" onClick={load}>
          {t("Refresh")}
        </button>
      </div>
      {sheet && (
        <PreviewSheet title="Clear the security journal" onClose={() => setSheet(false)} label="CONFIRM" dismissLabel="Cancel">
          <p>{t("This deletes all recorded entries on this device. It cannot be undone.")}</p>
          <button type="button" className="security-primary" onClick={clear}>
            {t("Clear journal")}
          </button>
        </PreviewSheet>
      )}
    </Frame>
  );
}

// ---------------------------------------------------------------------------
// Task 40 — Secure Transfer Wizard
// ---------------------------------------------------------------------------

export function TransferWizard() {
  const { t } = useLanguage();
  const vault = useVault();
  const [files, setFiles] = useState([]);
  const [host, setHost] = useState("127.0.0.1");
  const [port, setPort] = useState("");
  const [label, setLabel] = useState("Peer device");
  const [wizard, setWizard] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [selfTest, setSelfTest] = useState(null);

  const pick = async () => {
    const res = await vault.pickInputFiles({ title: "Select files to send" });
    if (res?.ok && !res.data?.cancelled) setFiles(res.data.paths || []);
  };

  const begin = async () => {
    setError(null);
    setSelfTest(null);
    setBusy(true);
    const res = await vault.wizardBegin({
      files,
      recipientHost: host,
      recipientPort: Number(port),
      label,
    });
    setBusy(false);
    if (res?.ok) setWizard(res.data);
    else setError(res?.error);
  };

  const consent = async () => {
    setError(null);
    const res = await vault.wizardConsent(wizard.wizardId, true);
    if (res?.ok) setWizard(res.data);
    else setError(res?.error);
  };

  const runTransfer = async () => {
    setError(null);
    setBusy(true);
    const res = await vault.wizardRun(wizard.wizardId);
    setBusy(false);
    if (res?.ok) setWizard(res.data);
    else setError(res?.error);
  };

  const runSelfTest = async () => {
    setError(null);
    setSelfTest(null);
    setBusy(true);
    const res = await vault.wizardSelfTest(vault.session?.sessionId, files);
    setBusy(false);
    if (res?.ok) setSelfTest(res.data);
    else setError(res?.error);
  };

  return (
    <Frame
      title="SECURE TRANSFER"
      parent={SCREENS.LOCAL_TRANSFER}
      icon="upload"
      live
      motion={wizard?.stage === "complete" ? "advanced-endpoints-reviewed" : ""}
    >
      <CapabilityCard id="TRANSFER_WIZARD" />
      <section className="advanced-panel">
        <button type="button" className="advanced-secondary" onClick={pick}>
          {t("Select files")}
        </button>
        <p dir="auto">
          {files.length ? files.map((f) => f.split(/[\\/]/).pop()).join(", ") : t("No files selected")}
        </p>
        <label className="advanced-field">
          {t("Recipient host")}
          <input dir="ltr" value={host} onChange={(e) => setHost(e.target.value)} />
        </label>
        <label className="advanced-field">
          {t("Recipient port")}
          <input dir="ltr" type="number" value={port} onChange={(e) => setPort(e.target.value)} />
        </label>
        <label className="advanced-field">
          {t("Recipient label")}
          <input dir="auto" value={label} onChange={(e) => setLabel(e.target.value)} />
        </label>
        <Error error={error} />
        {wizard && (
          <dl className="advanced-summary">
            <dt>{t("Stage")}</dt>
            <dd dir="ltr">{wizard.stage}</dd>
            <dt>{t("Pairing code")}</dt>
            <dd dir="ltr">{wizard.code}</dd>
            <dt>{t("Total bytes")}</dt>
            <dd dir="ltr">{wizard.totalBytes}</dd>
            {wizard.files.map((f) => (
              <React.Fragment key={f.name}>
                <dt>{f.name}</dt>
                <dd dir="ltr">{f.sha256.slice(0, 32)}…</dd>
              </React.Fragment>
            ))}
            {wizard.receipt && (
              <>
                <dt>{t("Delivered")}</dt>
                <dd dir="ltr">
                  {wizard.receipt.files} {t("file(s)")} · {wizard.receipt.bytes} {t("bytes")} · {t("verified")}
                </dd>
              </>
            )}
          </dl>
        )}
        {selfTest && (
          <dl className="advanced-summary">
            <dt>{t("Self-test")}</dt>
            <dd dir="ltr">
              {selfTest.allMatched ? t("All files matched") : t("Mismatch detected")} · {selfTest.transport}
            </dd>
          </dl>
        )}
      </section>
      <div className="advanced-choices">
        <button className="security-primary" type="button" disabled={!vault.available || busy || files.length === 0 || !port} onClick={begin}>
          {t("Review package")}
          <Mark name="arrow" />
        </button>
        {wizard && wizard.stage === "review" && (
          <button type="button" className="advanced-secondary" onClick={consent}>
            {t("Confirm recipient")}
          </button>
        )}
        {wizard && wizard.consented && wizard.stage !== "complete" && (
          <button type="button" className="advanced-secondary" onClick={runTransfer} disabled={busy}>
            {t("Send now")}
          </button>
        )}
        <button type="button" className="advanced-secondary" onClick={runSelfTest} disabled={!vault.available || busy || files.length === 0}>
          {t("Loopback self-test")}
        </button>
      </div>
      <p className="advanced-notice">
        {t(
          "Real authenticated transfer over a real socket. The recipient must be a KnouxCrypt peer; no nearby devices are invented. The self-test sends to this device's own listener.",
        )}
      </p>
    </Frame>
  );
}
