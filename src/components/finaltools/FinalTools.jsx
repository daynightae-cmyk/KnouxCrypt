import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { SCREENS } from "../../config/screens";
import { useLanguage } from "../../i18n/Language";
import { Mark, PreviewSheet, CapabilityCard } from "../security/ScreenUI";
import { useVault } from "../../hooks/useVault";
import "./finaltools.css";

const ERROR_COPY = {
  BAD_INPUT: "Check the input and try again.",
  NOT_FOUND: "The selected item was not found.",
  IO_FAILED: "The operation could not be completed on disk.",
  AUTH_FAILED: "The authentication check did not match.",
  NOT_A_VAULT: "That is not a KnouxCrypt container.",
  INTEGRITY_FAILED: "The integrity check failed.",
  SESSION_REQUIRED: "Unlock the vault to use this operation.",
  SESSION_REVOKED: "Your session was revoked. Unlock again to continue.",
  CONSENT_REQUIRED: "This action needs explicit confirmation.",
  UNAVAILABLE: "The desktop vault bridge is unavailable in this preview.",
};

function errorText(error) {
  if (!error) return "";
  return ERROR_COPY[error.code] || error.message || "The operation failed.";
}

function Frame({ title, icon, parent, children, motion = "", live = false }) {
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
        <p className="ft-notice">{t(live ? "REAL SERVICE" : "VISUAL DEMO")}</p>
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
        <button type="button" key={option} aria-pressed={value === option} onClick={() => onChange(option)}>
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

function Error({ error }) {
  if (!error) return null;
  return (
    <p className="ft-warning" role="alert">
      {errorText(error)}
    </p>
  );
}

// ---------------------------------------------------------------------------
// Task 41 — Expiring Secret Capsule
// ---------------------------------------------------------------------------

export function SecretCapsule() {
  const { t } = useLanguage();
  const vault = useVault();
  const [choices, setChoices] = useState(null);
  const [mode, setMode] = useState("Create");
  const [secret, setSecret] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [expiry, setExpiry] = useState("1h");
  const [maxAccess, setMaxAccess] = useState(1);
  const [label, setLabel] = useState("Capsule");
  const [envelope, setEnvelope] = useState("");
  const [info, setInfo] = useState(null);
  const [opened, setOpened] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const loadChoices = useCallback(async () => {
    const res = await vault.capsuleChoices();
    if (res?.ok) {
      setChoices(res.data);
      if (res.data.expiry?.[0]) setExpiry(res.data.expiry[0].id);
    }
  }, [vault]);

  useEffect(() => {
    loadChoices();
  }, [loadChoices]);

  const create = async () => {
    setError(null);
    setOpened(null);
    setBusy(true);
    const res = await vault.capsuleCreate({ secret, passphrase, expiry, maxAccess, label });
    setBusy(false);
    if (res?.ok) {
      setEnvelope(res.data.envelopeText);
      setInfo(await vault.capsuleInspect(res.data.envelopeText).then((r) => (r?.ok ? r.data : null)));
    } else setError(res?.error);
  };

  const inspect = async () => {
    setError(null);
    const res = await vault.capsuleInspect(envelope);
    if (res?.ok) setInfo(res.data);
    else setError(res?.error);
  };

  const open = async () => {
    setError(null);
    setOpened(null);
    setBusy(true);
    const res = await vault.capsuleOpen(envelope, passphrase);
    setBusy(false);
    if (res?.ok) {
      setOpened(res.data);
      setEnvelope(res.data.envelopeText);
    } else setError(res?.error);
  };

  const save = async () => {
    setError(null);
    const pick = await vault.pickOutputFile({ title: "Save capsule", defaultPath: "secret.capsule.json" });
    if (!pick?.ok || pick.data?.cancelled || !pick.data?.path) return;
    const res = await vault.capsuleSave(envelope, pick.data.path);
    if (!res?.ok) setError(res?.error);
  };

  return (
    <Frame title="EXPIRING SECRET" icon="lock" parent={SCREENS.TOOLS} motion={`ft-capsule expiry-${expiry}`} live>
      <CapabilityCard id="SECRET_CAPSULE" />
      <div className="ft-choices">
        {["Create", "Open"].map((v) => (
          <button
            type="button"
            key={v}
            aria-pressed={mode === v}
            onClick={() => {
              setMode(v);
              setError(null);
              setOpened(null);
            }}
          >
            {t(v)}
          </button>
        ))}
      </div>
      <section className="ft-panel">
        {mode === "Create" ? (
          <>
            <label className="ft-field">
              {t("Secret")}
              <textarea dir="auto" value={secret} maxLength={60000} onChange={(e) => setSecret(e.target.value)} />
            </label>
            <label className="ft-field">
              {t("Label")}
              <input dir="auto" value={label} maxLength={64} onChange={(e) => setLabel(e.target.value)} />
            </label>
            <h2>{t("Expiration")}</h2>
            <Choices
              label="Expiration"
              values={(choices?.expiry || [{ id: "1h" }]).map((c) => c.id)}
              value={expiry}
              onChange={setExpiry}
            />
            <label className="ft-field">
              {t("Access limit")}
              <select value={maxAccess} onChange={(e) => setMaxAccess(Number(e.target.value))}>
                {(choices?.accessLimits || [1]).map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
          </>
        ) : null}
        <label className="ft-field">
          {t("Capsule passphrase")}
          <input type="password" dir="auto" autoComplete="off" value={passphrase} onChange={(e) => setPassphrase(e.target.value)} />
        </label>
        {mode === "Open" && (
          <label className="ft-field">
            {t("Capsule envelope")}
            <textarea dir="ltr" value={envelope} onChange={(e) => setEnvelope(e.target.value)} />
          </label>
        )}
        <Error error={error} />
        {info && (
          <dl className="ft-summary">
            <dt>{t("Label")}</dt>
            <dd dir="auto">{info.label}</dd>
            <dt>{t("Expires")}</dt>
            <dd dir="ltr">{new Date(info.expiresAt).toLocaleString()}</dd>
            <dt>{t("Access")}</dt>
            <dd dir="ltr">
              {info.accessCount}/{info.maxAccess} {info.expired ? `· ${t("expired")}` : ""} {info.exhausted ? `· ${t("exhausted")}` : ""}
            </dd>
            <dt>{t("KDF / cipher")}</dt>
            <dd dir="ltr">
              {info.kdf} · {info.cipher}
            </dd>
          </dl>
        )}
        {opened && (
          <dl className="ft-summary">
            <dt>{t("Secret")}</dt>
            <dd dir="auto">{opened.secret}</dd>
            <dt>{t("Remaining access")}</dt>
            <dd dir="ltr">{opened.remainingAccess}</dd>
          </dl>
        )}
      </section>
      <div className="ft-choices">
        {mode === "Create" ? (
          <button className="security-primary" type="button" disabled={!vault.available || busy || !secret || !passphrase} onClick={create}>
            {t("Create capsule")}
            <Mark name="arrow" />
          </button>
        ) : (
          <button className="security-primary" type="button" disabled={!vault.available || busy || !envelope || !passphrase} onClick={open}>
            {t("Open capsule")}
            <Mark name="arrow" />
          </button>
        )}
        <button type="button" className="ft-secondary" onClick={inspect} disabled={!envelope}>
          {t("Inspect")}
        </button>
        <button type="button" className="ft-secondary" onClick={save} disabled={!envelope}>
          {t("Save")}
        </button>
      </div>
      <p className="ft-notice">
        {t(
          "Real AES-256-GCM capsule with PBKDF2-HMAC-SHA256 key derivation. It is local only: once the envelope leaves this device it cannot be revoked, and a holder of the passphrase can keep a copy.",
        )}
      </p>
    </Frame>
  );
}

// ---------------------------------------------------------------------------
// Task 42 — Session Privacy Controls
// ---------------------------------------------------------------------------

export function SessionPrivacy() {
  const { t } = useLanguage();
  const vault = useVault();
  const [policy, setPolicy] = useState(null);
  const [redacted, setRedacted] = useState(null);
  const [error, setError] = useState(null);
  const [sheet, setSheet] = useState(false);

  const load = useCallback(async () => {
    const [pol, red] = await Promise.all([vault.sessionPrivacyPolicy(), vault.sessionPrivacyRedacted()]);
    if (pol?.ok) setPolicy(pol.data);
    else setError(pol?.error);
    if (red?.ok) setRedacted(red.data);
  }, [vault]);

  useEffect(() => {
    load();
  }, [load]);

  const update = async (patch) => {
    setError(null);
    const res = await vault.sessionPrivacyUpdate(patch);
    if (res?.ok) {
      setPolicy(res.data);
      await load();
    } else setError(res?.error);
  };

  const values = policy?.values || {};

  return (
    <Frame title="SESSION SECURITY" icon="lock" parent={SCREENS.PRIVACY} motion="ft-radar" live>
      <CapabilityCard id="SESSION_PRIVACY" />
      <section className="ft-panel">
        <h2>{t("Inactivity timeout")}</h2>
        <Choices
          label="Inactivity timeout"
          values={["60", "300", "900", "3600"]}
          value={String(values.idleLockSeconds ?? "300")}
          onChange={(v) => update({ idleLockSeconds: Number(v) })}
        />
        <Toggle label="Lock on sleep / screen lock" value={Boolean(values.lockOnSuspend)} onChange={() => update({ lockOnSuspend: !values.lockOnSuspend })} />
        <Toggle label="Clear clipboard after use" value={Boolean(values.clearClipboard)} onChange={() => update({ clearClipboard: !values.clearClipboard })} />
        <h2>{t("Activity retention (days)")}</h2>
        <Choices
          label="Activity retention"
          values={["7", "30", "90", "365"]}
          value={String(values.retentionDays ?? "30")}
          onChange={(v) => update({ retentionDays: Number(v) })}
        />
        <Error error={error} />
        {redacted && (
          <dl className="ft-summary">
            <dt>{t("Locked")}</dt>
            <dd dir="ltr">{redacted.locked ? t("Yes") : t("No")}</dd>
            <dt>{t("Active sessions")}</dt>
            <dd dir="ltr">{redacted.activeSessions}</dd>
            <dt>{t("Guest active")}</dt>
            <dd dir="ltr">{redacted.guestActive ? t("Yes") : t("No")}</dd>
          </dl>
        )}
      </section>
      <button type="button" className="security-primary" onClick={() => setSheet(true)}>
        {t("Review enforcement")}
        <Mark name="arrow" />
      </button>
      {sheet && policy && (
        <PreviewSheet title="How each control is enforced" onClose={() => setSheet(false)} label="ENFORCEMENT" dismissLabel="Close">
          <ul>
            {policy.controls.map((c) => (
              <li key={c.id}>
                <strong>{t(c.label)}</strong> — {t(c.enforced ? "enforced" : "not enforced")}: {c.mechanism}
              </li>
            ))}
          </ul>
          <p>{t("These controls are app-scoped. They are not OS-wide policy and do not claim system-level enforcement.")}</p>
        </PreviewSheet>
      )}
      <p className="ft-notice">
        {t("Real policy over the session manager, preferences and clipboard guard. Screenshot or notification privacy is not claimed.")}
      </p>
    </Frame>
  );
}

// ---------------------------------------------------------------------------
// Task 43 — File Integrity Baselines
// ---------------------------------------------------------------------------

export function FileIntegrity() {
  const { t } = useLanguage();
  const vault = useVault();
  const [files, setFiles] = useState([]);
  const [algorithm, setAlgorithm] = useState("SHA-256");
  const [manifest, setManifest] = useState(null);
  const [manifestPath, setManifestPath] = useState("");
  const [report, setReport] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const pickFiles = async () => {
    const res = await vault.pickInputFiles({ title: "Select files to baseline" });
    if (res?.ok && !res.data?.cancelled) setFiles(res.data.paths || []);
  };

  const createBaseline = async () => {
    setError(null);
    setReport(null);
    setBusy(true);
    const res = await vault.integrityCreate({ files, algorithm, label: "Baseline" });
    setBusy(false);
    if (res?.ok) setManifest(res.data);
    else setError(res?.error);
  };

  const saveBaseline = async () => {
    setError(null);
    const pick = await vault.pickOutputFile({ title: "Save integrity manifest", defaultPath: "integrity.manifest.json" });
    if (!pick?.ok || pick.data?.cancelled || !pick.data?.path) return;
    const res = await vault.integritySave(manifest, pick.data.path);
    if (!res?.ok) setError(res?.error);
    else setManifestPath(pick.data.path);
  };

  const loadManifest = async () => {
    setError(null);
    const pick = await vault.pickInputFile({ title: "Open integrity manifest" });
    if (!pick?.ok || pick.data?.cancelled || !pick.data?.path) return;
    const res = await vault.integrityLoad(pick.data.path);
    if (res?.ok) {
      setManifest(res.data);
      setManifestPath(pick.data.path);
    } else setError(res?.error);
  };

  const compare = async () => {
    setError(null);
    setBusy(true);
    const res = await vault.integrityCompare({ manifest, extraFiles: files });
    setBusy(false);
    if (res?.ok) setReport(res.data);
    else setError(res?.error);
  };

  return (
    <Frame title="FILE INTEGRITY" icon="shield" parent={SCREENS.HASH_INTEGRITY} motion={report && !report.verified ? "ft-checksum-edited" : ""} live>
      <CapabilityCard id="FILE_INTEGRITY" />
      <button type="button" className="ft-file" onClick={pickFiles}>
        <Mark name="file" />
        <span dir="ltr">{files.length ? `${files.length} ${t("file(s) selected")}` : t("Select files")}</span>
        <Mark name="chevron" />
      </button>
      <section className="ft-panel">
        <h2>{t("Hash algorithm")}</h2>
        <Choices label="Hash algorithm" values={["SHA-256", "SHA-512"]} value={algorithm} onChange={setAlgorithm} />
        <Error error={error} />
        {manifest && (
          <dl className="ft-summary">
            <dt>{t("Manifest")}</dt>
            <dd dir="ltr">
              {manifest.count} {t("entries")} · {manifest.algorithm}
            </dd>
            <dt>{t("Created")}</dt>
            <dd dir="ltr">{new Date(manifest.createdAt).toLocaleString()}</dd>
          </dl>
        )}
        {report && (
          <dl className="ft-summary" data-status={report.verified ? "verified" : "changed"}>
            <dt>{t("Verdict")}</dt>
            <dd dir="ltr">{report.verified ? t("All files unchanged") : t("Changes detected")}</dd>
            <dt>{t("Summary")}</dt>
            <dd dir="ltr">
              {report.summary.unchanged} {t("unchanged")} · {report.summary.changed} {t("changed")} · {report.summary.missing} {t("missing")} · {report.summary.added} {t("added")}
            </dd>
          </dl>
        )}
      </section>
      <div className="ft-choices">
        <button className="security-primary" type="button" disabled={!vault.available || busy || files.length === 0} onClick={createBaseline}>
          {t("Create baseline")}
          <Mark name="arrow" />
        </button>
        <button type="button" className="ft-secondary" onClick={saveBaseline} disabled={!manifest}>
          {t("Save manifest")}
        </button>
        <button type="button" className="ft-secondary" onClick={loadManifest}>
          {t("Open manifest")}
        </button>
        <button type="button" className="ft-secondary" onClick={compare} disabled={!manifest || busy}>
          {t("Compare")}
        </button>
      </div>
      <p className="ft-notice">
        {t(
          "Real streamed SHA-256/SHA-512 baselines. The manifest is a local record only: it detects that a file differs from the baseline, not who changed it, and it is not signed.",
        )}
      </p>
    </Frame>
  );
}

// ---------------------------------------------------------------------------
// Task 44 — Secure Clipboard
// ---------------------------------------------------------------------------

export function SecureClipboard() {
  const { t } = useLanguage();
  const vault = useVault();
  const [status, setStatus] = useState(null);
  const [text, setText] = useState("");
  const [seconds, setSeconds] = useState(30);
  const [lease, setLease] = useState(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(null);
  const [sheet, setSheet] = useState(false);

  const load = useCallback(async () => {
    const res = await vault.secureClipboardStatus();
    if (res?.ok) setStatus(res.data);
    else setError(res?.error);
  }, [vault]);

  useEffect(() => {
    load();
  }, [load]);

  const copy = async () => {
    setError(null);
    const res = await vault.clipboardCopy({ text, seconds, confirm: true });
    if (res?.ok) {
      setLease(res.data);
      setMessage("Lease armed for the value this app wrote.");
      await load();
    } else setError(res?.error);
  };

  const clearNow = async () => {
    setError(null);
    const res = await vault.clipboardClearNow(lease?.leaseId);
    if (res?.ok) setMessage(res.data?.cleared ? "Clipboard cleared." : "Clipboard content changed; nothing was cleared.");
    else setError(res?.error);
    await load();
  };

  return (
    <Frame title="Secure Clipboard" icon="file" parent={SCREENS.CLIPBOARD_GUARD} motion={lease ? "ft-internal-copy" : ""} live>
      <CapabilityCard id="SECURE_CLIPBOARD" />
      <p className="ft-warning">
        {t("The guard only clears a value this app wrote, and only if it is still there. It cannot guarantee OS-wide clipboard erasure.")}
      </p>
      <section className="ft-panel">
        {status && (
          <dl className="ft-summary">
            <dt>{t("Clipboard adapter")}</dt>
            <dd dir="ltr">{status.supported ? t("Available") : t("Unavailable in this environment")}</dd>
            <dt>{t("Armed lease")}</dt>
            <dd dir="ltr">
              {status.armed ? `${status.secondsRemaining}s ${t("remaining")}` : t("None")}
            </dd>
            <dt>{t("Active leases")}</dt>
            <dd dir="ltr">{status.activeLeases}</dd>
          </dl>
        )}
        <label className="ft-field">
          {t("Value to lease")}
          <input type="password" dir="auto" autoComplete="off" value={text} onChange={(e) => setText(e.target.value)} />
        </label>
        <Choices label="Clear timer" values={["15", "30", "60", "120"]} value={String(seconds)} onChange={(v) => setSeconds(Number(v))} />
        <Error error={error} />
        {message && (
          <p className="ft-notice" role="status">
            {t(message)}
          </p>
        )}
      </section>
      <div className="ft-choices">
        <button className="security-primary" type="button" disabled={!vault.available || !text} onClick={copy}>
          {t("Copy with lease")}
          <Mark name="arrow" />
        </button>
        <button type="button" className="ft-secondary" onClick={clearNow} disabled={!lease}>
          {t("Clear now")}
        </button>
        <button type="button" className="ft-secondary" onClick={() => setSheet(true)}>
          {t("Limits")}
        </button>
      </div>
      {sheet && status && (
        <PreviewSheet title="Clipboard limits" onClose={() => setSheet(false)} label="HONEST LIMITS" dismissLabel="Close">
          <p>{status.note}</p>
          <p>{t("Timer choices:")} {(status.timerChoices || []).join(", ")}</p>
        </PreviewSheet>
      )}
    </Frame>
  );
}
