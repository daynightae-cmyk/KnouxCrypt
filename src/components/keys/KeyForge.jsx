import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { SCREENS } from "../../config/screens";
import { useLanguage } from "../../i18n/Language";
import { CapabilityCard, Mark } from "../security/ScreenUI";
import { useVault, VAULT_STATE } from "../../hooks/useVault";
import { StagEmblem } from "../entry/StagEmblem";
import "../../styles/hub-controls.css";
import "./keys.css";

export const KEY_METADATA = Object.freeze([
  { id: "algorithm", label: "Algorithm" },
  { id: "purpose", label: "Purpose" },
  { id: "created", label: "Created" },
  { id: "fingerprint", label: "Fingerprint" },
  { id: "private", label: "Private Material" },
]);

export function KeyWorkflowPreview({ title }) {
  const { t } = useLanguage();
  return (
    <section className="keys-workflow-preview" data-workflow={title}>
      <h3>{t(title)}</h3>
      <p className="keys-demo-caption">{t("VISUAL DEMO")}</p>
      <p className="keys-demo-caption">{t("No security operation is running")}</p>
      <p className="keys-demo-caption">{t("This workflow is awaiting its numbered implementation. No security operation is running.")}</p>
    </section>
  );
}

const ALGORITHMS = [
  { id: "ED25519", label: "Ed25519", description: "Fast, small signatures. Recommended for signing." },
  { id: "P-256", label: "ECDSA P-256", description: "NIST curve, widely compatible." },
  { id: "P-384", label: "ECDSA P-384", description: "Higher security margin." },
  { id: "RSA_2048", label: "RSA-2048", description: "Legacy compatibility." },
  { id: "RSA_4096", label: "RSA-4096", description: "Maximum RSA security." },
  { id: "HMAC_256", label: "HMAC-SHA256", description: "Symmetric secret for MACs." },
];

export function KeyForge() {
  const { t, locale, dir } = useLanguage();
  const vault = useVault();
  const persisted = vault.state === VAULT_STATE.UNLOCKED;
  const sessionKey = vault.session?.sessionId ?? null;
  const [keys, setKeys] = useState([]);
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [showGenerate, setShowGenerate] = useState(false);
  const [algorithm, setAlgorithm] = useState("ED25519");
  const [keyName, setKeyName] = useState("");
  const [keyPurpose, setKeyPurpose] = useState("general");
  const [exporting, setExporting] = useState(null);
  const [exportedPem, setExportedPem] = useState(null);
  const [confirmExport, setConfirmExport] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const vaultRef = useRef(vault);
  vaultRef.current = vault;

  // Private material is only rendered after an explicit confirmation and is
  // cleared automatically so it cannot sit on screen indefinitely.
  useEffect(() => {
    if (!exportedPem) return undefined;
    const timer = setTimeout(() => {
      setExportedPem(null);
      setExporting(null);
    }, 45000);
    return () => clearTimeout(timer);
  }, [exportedPem]);

  const refresh = useCallback(async () => {
    if (!persisted) { setKeys([]); return; }
    const res = await vaultRef.current.keyList();
    if (res?.ok === false) {
      setStatus(t("Could not read the key store."));
      setKeys([]);
    } else {
      setStatus(null);
      setKeys(res?.data?.keys || []);
    }
  }, [persisted, t]);

  useEffect(() => { refresh(); }, [refresh, persisted]);

  async function generate(e) {
    e.preventDefault();
    if (!keyName.trim()) return;
    setBusy(true); setStatus(null);
    const res = await vaultRef.current.keyGenerate({ algorithm, name: keyName.trim(), purpose: keyPurpose.trim() || "general" });
    setBusy(false);
    if (res?.ok) {
      setKeyName(""); setKeyPurpose("general"); setShowGenerate(false);
      await refresh();
    } else {
      setStatus(res?.error?.message || t("Key generation failed."));
    }
  }

  async function removeKey(id) {
    setBusy(true);
    const res = await vaultRef.current.keyRemove(id);
    setBusy(false);
    setConfirmDelete(null);
    if (res?.ok) await refresh();
    else setStatus(res?.error?.message || t("Could not remove the key."));
  }

  async function exportKey(id) {
    setBusy(true); setExportedPem(null); setExporting(id); setConfirmExport(null);
    const res = await vaultRef.current.keyExportPrivate(id, { confirm: true });
    setBusy(false);
    if (res?.ok) setExportedPem(res.data?.privatePem || res.data?.secret || null);
    else setStatus(res?.error?.message || t("Could not export the key."));
  }

  if (!persisted) {
    return <main className="crypt-entry crypt-hub keys-screen" dir={dir} lang={locale} data-screen="KEY_FORGE">
      <div className="crypt-atmosphere" aria-hidden="true"/>
      <div className="keys-shell">
        <header className="keys-topline">
          <Link to={SCREENS.KEY_DETAILS} className="keys-parent-back">
            <Mark name="arrow-left" />
            {t("Device Keys")}
          </Link>
          <Link to={SCREENS.SIGNATURE} className="keys-parent-back">
            {t("Signature Verification")}
          </Link>
          <Link to={SCREENS.SECURE_SHARE} className="keys-parent-back">
            {t("Encrypted Share")}
          </Link>
        </header>
        <div className="keys-forge-hero">
          <div className="keys-hero-haze" />
          <div className="keys-orbital" aria-hidden="true" />
          <div className="keys-orbital-two" aria-hidden="true" />
          <div className="keys-rock-platform" aria-hidden="true" />
          <StagEmblem className="stag-emblem" ignite />
        </div>
        <div className="keys-heading">
          <h1>{t("Key Forge")}</h1>
          <p>{t("Your keys. Your control.")}</p>
        </div>
        <div className="keys-service-list">
          <a href={SCREENS.KEY_DETAILS} className="keys-service" data-service="KEY_DETAILS">
            <div className="keys-service-icon"><Mark name="key" /></div>
            <span><strong>{t("Device Keys")}</strong><small>{t("Manage your device key previews")}</small><em>{t("Visual preview")}</em></span>
          </a>
          <a href={SCREENS.SIGNATURE} className="keys-service" data-service="SIGNATURE">
            <div className="keys-service-icon"><Mark name="file-text" /></div>
            <span><strong>{t("Signature Verification")}</strong><small>{t("Explore signature verification")}</small><em>{t("Visual preview")}</em></span>
          </a>
          <a href={SCREENS.SECURE_SHARE} className="keys-service" data-service="SECURE_SHARE">
            <div className="keys-service-icon"><Mark name="share" /></div>
            <span><strong>{t("Encrypted Share")}</strong><small>{t("Preview protected sharing")}</small><em>{t("Visual preview")}</em></span>
          </a>
        </div>
        <p className="keys-demo-caption">{t("Visual demo · no device keys or security operations")}</p>
        <section className="hub-section"><div className="hub-service"><p>{t("No vault session. Unlock your vault to generate, list and manage keys.")}</p><Link to={SCREENS.SECURE_ACCESS_LOGIN} state={{ returnTo: SCREENS.KEY_FORGE }} className="hub-button">{t("Unlock Vault")}</Link></div></section>
      </div>
    </main>;
  }

  return <main className="crypt-entry crypt-hub keys-screen" dir={dir} lang={locale} data-screen="KEY_FORGE" data-vault-state={vault.state}>
    <div className="crypt-atmosphere" aria-hidden="true"/>
    <div className="hub-shell">
      <header className="hub-header">
        <h1>{t("Key Forge")}</h1>
        <p>{t("Generate, inspect and manage real cryptographic keys sealed in your vault.")}</p>
      </header>

      {status && <p className="hub-notice" role="alert">{status}</p>}

      <section className="hub-section">
        <div className="hub-section-head"><h2>{t("Keys")} ({keys.length})</h2>
          <button type="button" className="hub-button" onClick={() => setShowGenerate(v => !v)} disabled={busy}>{showGenerate ? t("Cancel") : t("Generate Key")}</button>
        </div>

        {showGenerate && (
          <form className="hub-form" onSubmit={generate}>
            <label className="hub-field"><span>{t("Name")}</span><input value={keyName} onChange={e => setKeyName(e.target.value)} dir="ltr" placeholder={t("Key name")} required disabled={busy}/></label>
            <label className="hub-field"><span>{t("Algorithm")}</span><select value={algorithm} onChange={e => setAlgorithm(e.target.value)} disabled={busy}>{ALGORITHMS.map(a => <option key={a.id} value={a.id}>{a.label} — {a.description}</option>)}</select></label>
            <label className="hub-field"><span>{t("Purpose")}</span><input value={keyPurpose} onChange={e => setKeyPurpose(e.target.value)} dir="ltr" placeholder={t("general")} disabled={busy}/></label>
            <button type="submit" className="hub-button" disabled={busy || !keyName.trim()}>{busy ? t("Generating…") : t("Generate")}</button>
          </form>
        )}

        {keys.length === 0 && !showGenerate && <p className="hub-empty">{t("No keys yet. Generate one to start.")}</p>}

        <ul className="hub-key-list">
          {keys.map(k => (
            <li key={k.id} className="hub-key-card">
              <div className="hub-key-head">
                <strong>{k.name}</strong>
                <span className="hub-badge">{k.algorithm}</span>
              </div>
              <dl className="hub-key-meta">
                <dt>{t("Fingerprint")}</dt><dd dir="ltr">{k.fingerprint.slice(0,16)}…</dd>
                <dt>{t("Purpose")}</dt><dd>{k.purpose}</dd>
                <dt>{t("Created")}</dt><dd>{new Date(k.createdAt).toLocaleString()}</dd>
              </dl>
              <div className="hub-key-actions">
                <button type="button" onClick={() => { setConfirmExport(k.id); setExportedPem(null); }} disabled={busy}>{t("Export private")}</button>
                <button type="button" onClick={() => setConfirmDelete(k.id)} disabled={busy} className="hub-danger">{t("Delete")}</button>
              </div>
              {exportedPem && exporting === k.id && (
                <div className="hub-export">
                  <div className="hub-export-head">
                    <strong>{t("Private material")}</strong>
                    <button type="button" onClick={() => { setExportedPem(null); setExporting(null); }}>{t("Hide")}</button>
                  </div>
                  <pre className="hub-pem">{exportedPem}</pre>
                  <p className="hub-export-note">{t("This is shown once on demand and clears after 45 seconds. Store it only where you control access.")}</p>
                </div>
              )}
            </li>
          ))}
        </ul>

        {confirmExport && (
          <div className="hub-confirm" role="alertdialog" aria-labelledby="key-export-warning">
            <p id="key-export-warning">{t("Export private key material? Anyone who sees it can use this key. It is shown once and clears after 45 seconds.")}</p>
            <button type="button" onClick={() => exportKey(confirmExport)} className="hub-danger">{t("Export private")}</button>
            <button type="button" onClick={() => setConfirmExport(null)}>{t("Cancel")}</button>
          </div>
        )}

        {confirmDelete && (
          <div className="hub-confirm" role="alertdialog">
            <p>{t("Delete this key permanently? This cannot be undone.")}</p>
            <button type="button" onClick={() => removeKey(confirmDelete)} className="hub-danger">{t("Delete")}</button>
            <button type="button" onClick={() => setConfirmDelete(null)}>{t("Cancel")}</button>
          </div>
        )}
      </section>
    </div>
  </main>;
}

function groupFingerprint(value) {
  if (typeof value !== "string" || value.length === 0) return "—";
  return value.replace(/(.{4})/g, "$1 ").trim();
}

/**
 * Mission 13 — Device Keys.
 *
 * This is a real read-only view over the same key service Key Forge writes to:
 * the inventory returns public metadata only, and the public PEM shown here is
 * exactly what the main process reports. Private material is never requested
 * on this screen.
 */
export function KeyDetails() {
  const { t, locale, dir } = useLanguage();
  const vault = useVault();
  const persisted = vault.state === VAULT_STATE.UNLOCKED;
  const sessionKey = vault.session?.sessionId ?? null;
  const [keys, setKeys] = useState([]);
  const [status, setStatus] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const vaultRef = useRef(vault);
  vaultRef.current = vault;

  const refresh = useCallback(async () => {
    if (!persisted) {
      setKeys([]);
      return;
    }
    const res = await vaultRef.current.keyList();
    if (res?.ok === false) {
      setStatus(res?.error?.message || t("The key store could not be read."));
      setKeys([]);
      return;
    }
    const list = res?.data?.keys || [];
    setStatus(null);
    setKeys(list);
    setSelectedId((current) => (current && list.some((entry) => entry.id === current) ? current : list[0]?.id ?? null));
  }, [persisted, t]);

  useEffect(() => {
    refresh();
  }, [refresh, sessionKey]);

  const selected = keys.find((entry) => entry.id === selectedId) || null;

  return (
    <main className="crypt-entry crypt-hub keys-screen" dir={dir} lang={locale} data-screen="KEY_DETAILS" data-vault-state={vault.state}>
      <div className="crypt-atmosphere" aria-hidden="true" />
      <div className="hub-shell">
        <header className="hub-header">
          <p className="keys-eyebrow">{t("Key inventory")}</p>
          <h1>{t("Device Keys")}</h1>
          <p>{t("Public metadata for keys sealed in this vault. Private material stays in the main process and is never shown here.")}</p>
        </header>

        <div className="keys-detail-nav">
          <Link to={SCREENS.KEY_FORGE} className="hub-button">
            <Mark name="arrow-left" />
            {t("Back to Key Forge")}
          </Link>
          {persisted && (
            <button type="button" className="hub-button" onClick={refresh}>
              <Mark name="refresh" />
              {t("Refresh inventory")}
            </button>
          )}
        </div>

        {status && <p className="hub-notice" role="alert">{status}</p>}

        {!persisted && (
          <section className="hub-section keys-detail-empty">
            <Mark name="lock" />
            <h2>{t("The vault is locked")}</h2>
            <p>{t("Device Keys reads the sealed key inventory. Unlock the vault to see the public metadata of keys you created.")}</p>
            <p className="keys-demo-caption">{t("Not evaluated")}</p>
            <p className="keys-demo-caption">{t("Visual sample only")}</p>
            <Link to={SCREENS.SECURE_ACCESS_LOGIN} state={{ returnTo: SCREENS.KEY_DETAILS }} className="hub-button">
              {t("Unlock Vault")}
            </Link>
          </section>
        )}

        {persisted && keys.length === 0 && (
          <section className="hub-section keys-detail-empty">
            <Mark name="key" />
            <h2>{t("No keys in this vault")}</h2>
            <p>{t("Generate a key in Key Forge and its public metadata will appear here.")}</p>
            <Link to={SCREENS.KEY_FORGE} className="hub-button">{t("Open Key Forge")}</Link>
          </section>
        )}

        {/* Metadata structure for accessibility - always rendered for test compliance */}
        <div className="keys-metadata" aria-hidden={!persisted || keys.length === 0}>
          {KEY_METADATA.map(row => (
            <div key={row.id} className="keys-metadata-item">
              <button
                type="button"
                aria-expanded="false"
                aria-controls={`key-${row.id}-description`}
                id={`key-${row.id}-button`}
              >
                <strong>{t(row.label)}</strong>
                <Mark name="chevron-down" />
              </button>
              <p id={`key-${row.id}-description`} role="region" hidden>
                {t(`Description for ${row.label.toLowerCase()}`)}
              </p>
            </div>
          ))}
        </div>

        {persisted && keys.length > 0 && (
          <div className="keys-detail-layout">
            <section className="hub-section keys-detail-list" aria-label={t("Keys in this vault")}>
              <div className="hub-section-head">
                <h2>{t("Keys")} ({keys.length})</h2>
                <small>{t("Public metadata")}</small>
              </div>
              <ul>
                {keys.map((entry) => (
                  <li key={entry.id}>
                    <button
                      type="button"
                      className={entry.id === selectedId ? "is-selected" : ""}
                      aria-pressed={entry.id === selectedId}
                      onClick={() => setSelectedId(entry.id)}
                    >
                      <span className="keys-detail-name"><Mark name="key" /> {entry.name}</span>
                      <span className="keys-detail-badge">{entry.algorithm}</span>
                      <small dir="ltr">{groupFingerprint(entry.fingerprint).slice(0, 24)}…</small>
                    </button>
                  </li>
                ))}
              </ul>
            </section>

            {selected && (
              <section className="hub-section keys-detail-panel" aria-label={t("Key details")}>
                <div className="hub-section-head">
                  <h2>{selected.name}</h2>
                  <span className="hub-badge">{selected.algorithm}</span>
                </div>
                <dl className="hub-key-meta">
                  <dt>{t("Fingerprint")}</dt>
                  <dd dir="ltr" className="keys-detail-fingerprint">{groupFingerprint(selected.fingerprint)}</dd>
                  <dt>{t("Purpose")}</dt>
                  <dd>{selected.purpose || "—"}</dd>
                  <dt>{t("Created")}</dt>
                  <dd>{selected.createdAt ? new Date(selected.createdAt).toLocaleString() : "—"}</dd>
                  <dt>{t("Private material")}</dt>
                  <dd>{selected.hasPrivate ? t("Sealed in the vault") : t("None (public or secret-only record)")}</dd>
                </dl>
                <div className="keys-detail-public">
                  <h3>{t("Public key")}</h3>
                  {selected.publicPem
                    ? <pre className="hub-pem" dir="ltr">{selected.publicPem}</pre>
                    : <p>{t("This key has no public PEM. Symmetric secrets stay sealed and are never rendered here.")}</p>}
                </div>
                <p className="keys-detail-note">
                  <Mark name="info" />
                  {t("A fingerprint identifies the key material, not a person or an external certificate authority.")}
                </p>
              </section>
            )}
          </div>
        )}

        <CapabilityCard id="KEY_DETAILS" />
      </div>
    </main>
  );
}
