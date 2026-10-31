import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { SCREENS } from "../../config/screens";
import { useLanguage } from "../../i18n/Language";
import { Mark, CapabilityCard } from "../security/ScreenUI";
import { useVault, VAULT_STATE } from "../../hooks/useVault";
import "./vaulttools.css";

const ERROR_COPY = {
  BAD_INPUT: "Check the input and try again.",
  NOT_FOUND: "The selected item was not found.",
  IO_FAILED: "The operation could not be completed on disk.",
  CONSENT_REQUIRED: "Confirm the action before continuing.",
  SESSION_REQUIRED: "Unlock the vault to use this operation.",
  SESSION_REVOKED: "Your session was revoked. Unlock again to continue.",
  AUTH_FAILED: "Authentication failed: the password or key is wrong.",
  INTEGRITY_FAILED: "Integrity check failed: the data is wrong, tampered or corrupt.",
  TRUNCATED: "The file is incomplete or was truncated.",
  NOT_A_VAULT: "This is not a KnouxCrypt container.",
  UNSUPPORTED_FORMAT: "This format is not supported here.",
  PATH_CONFLICT: "A file already exists at the destination.",
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
    <main className={`vaulttools-screen ${motion}`} dir={dir} lang={locale}>
      <div className="vaulttools-shell">
        <Link className="vt-back" to={parent}>
          ‹ {t("Back to Tools")}
        </Link>
        <div className="vt-art" aria-hidden="true">
          <Mark name={icon} />
          <i />
        </div>
        <h1>{t(title)}</h1>
        <p className="vt-notice">{t(live ? "REAL SERVICE" : "VISUAL DEMO")}</p>
        {children}
      </div>
    </main>
  );
}

function Error({ error }) {
  if (!error) return null;
  return (
    <p className="vt-error" role="alert">
      {errorText(error)}
    </p>
  );
}

function VaultGate({ state }) {
  const { t } = useLanguage();
  if (state === VAULT_STATE.UNLOCKED) return null;
  return (
    <p className="vt-warning" role="status">
      {t("Unlock the vault to run this operation.")}
    </p>
  );
}

function Consent({ value, onChange, label }) {
  const { t } = useLanguage();
  return (
    <label className="vt-check">
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />
      <span>{t(label)}</span>
    </label>
  );
}

// ---------------------------------------------------------------------------
// Task 29 — Private vault collections
// ---------------------------------------------------------------------------

export function VaultCollections() {
  const { t } = useLanguage();
  const vault = useVault();
  const [tree, setTree] = useState([]);
  const [query, setQuery] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (vault.state !== VAULT_STATE.UNLOCKED) {
      setTree([]);
      return;
    }
    const res = await vault.collectionsTree();
    if (res?.ok) setTree(res.data.collections || []);
    else setError(res?.error);
  }, [vault]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const act = async (fn) => {
    setError(null);
    setNotice("");
    setBusy(true);
    try {
      const res = await fn();
      if (!res?.ok) setError(res?.error);
      await refresh();
      return res;
    } finally {
      setBusy(false);
    }
  };

  const filtered = tree.filter((c) =>
    `${c.name} ${c.tags.join(" ")}`.toLowerCase().includes(query.trim().toLowerCase()),
  );

  const addItem = async (collectionId) => {
    const picked = await vault.pickInputFile();
    const inputPath = picked?.data?.path;
    if (!inputPath) return;
    const res = await act(() => vault.collectionsAddItem({ collectionId, inputPath }));
    if (res?.ok) setNotice(`${t("Encrypted item added:")} ${res.data.item?.name || ""}`);
  };

  const exportItem = async (itemId) => {
    const picked = await vault.pickOutputFile({ title: "Export decrypted copy" });
    const outputPath = picked?.data?.path;
    if (!outputPath) return;
    const res = await act(() => vault.collectionsExportItem({ itemId, outputPath, confirm: true }));
    if (res?.ok) setNotice(t("Decrypted copy written to the chosen location."));
  };

  return (
    <Frame title="VAULT COLLECTIONS" icon="database" parent={SCREENS.VAULT} live>
      <CapabilityCard id="COLLECTIONS" />
      <VaultGate state={vault.state} />
      <section className="vt-panel">
        <h2>{t("Create a collection")}</h2>
        <label className="vt-field">
          {t("Collection name")}
          <input value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
        </label>
        <button
          className="security-primary"
          type="button"
          disabled={busy || !name.trim() || vault.state !== VAULT_STATE.UNLOCKED}
          onClick={async () => {
            const res = await act(() => vault.collectionsCreate({ name: name.trim() }));
            if (res?.ok) setName("");
          }}
        >
          {t("Create encrypted collection")}
          <Mark name="arrow" />
        </button>
      </section>

      <label className="vt-field">
        {t("Filter collections")}
        <input value={query} maxLength={100} onChange={(e) => setQuery(e.target.value)} />
      </label>

      <section className="vt-list">
        {filtered.length === 0 && <p className="vt-notice">{t("No collections yet.")}</p>}
        {filtered.map((collection) => (
          <article className="vt-panel" key={collection.id}>
            <header className="vt-row">
              <Mark name="database" />
              <strong>{collection.name}</strong>
              <small>
                {collection.itemCount} {t("items")}
              </small>
            </header>
            <div className="vt-actions">
              <button className="vt-secondary" type="button" disabled={busy} onClick={() => addItem(collection.id)}>
                {t("Encrypt a file into this collection")}
              </button>
              <button
                className="vt-secondary"
                type="button"
                disabled={busy}
                onClick={() => act(() => vault.collectionsRemove(collection.id, { recursive: true, confirm: true }))}
              >
                {t("Delete (with contents)")}
              </button>
            </div>
            {collection.items.length > 0 && (
              <ul className="vt-list">
                {collection.items.map((item) => (
                  <li key={item.id}>
                    <span dir="ltr">{item.name}</span>
                    <button className="vt-secondary" type="button" disabled={busy} onClick={() => exportItem(item.id)}>
                      {t("Export decrypted copy")}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </article>
        ))}
      </section>

      {notice && <p className="vt-notice" role="status">{notice}</p>}
      <Error error={error} />
      <p className="vt-warning">
        {t(
          "Collection names, tags and item names are encrypted at rest. Deleting a collection removes its encrypted items and cannot be undone.",
        )}
      </p>
    </Frame>
  );
}

// ---------------------------------------------------------------------------
// Task 30 — Protected document viewer
// ---------------------------------------------------------------------------

export function DocumentViewer() {
  const { t } = useLanguage();
  const vault = useVault();
  const [doc, setDoc] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => () => {
    // Closing on unmount deletes the decrypted temp file.
    if (doc?.docId) vault.viewerClose(doc.docId);
  }, [doc, vault]);

  const open = async () => {
    setError(null);
    const picked = await vault.pickInputFile({ title: "Choose a vault container to view" });
    const inputPath = picked?.data?.path;
    if (!inputPath) return;
    const res = await vault.viewerOpen({ inputPath, displayName: inputPath.split(/[\\/]/).pop() });
    if (res?.ok) setDoc(res.data);
    else {
      setDoc(null);
      setError(res?.error);
    }
  };

  const close = async () => {
    if (doc?.docId) await vault.viewerClose(doc.docId);
    setDoc(null);
  };

  return (
    <Frame title="PROTECTED DOCUMENT VIEWER" icon="file" parent={SCREENS.VAULT} live>
      <CapabilityCard id="DOCUMENT_VIEWER" />
      <VaultGate state={vault.state} />
      <section className="vt-panel">
        <button className="security-primary" type="button" disabled={vault.state !== VAULT_STATE.UNLOCKED} onClick={open}>
          {t("Open a protected document")}
          <Mark name="arrow" />
        </button>
      </section>

      {doc && (
        <section className="vt-panel">
          <h2 dir="ltr">{doc.name}</h2>
          <p>
            {doc.kind} · {doc.size} {t("bytes")}
          </p>
          <p className="vt-notice" dir="ltr">
            SHA-256 {doc.sha256}
          </p>
          {doc.text !== null && <pre className="vt-document" dir="ltr">{doc.text}</pre>}
          {doc.dataUrl && <img className="vt-document" src={doc.dataUrl} alt={doc.name} />}
          {doc.truncated && <p>{t("This document is large; it is streamed in pages rather than shown whole.")}</p>}
          <button className="vt-secondary" type="button" onClick={close}>
            {t("Close and delete the decrypted copy")}
          </button>
        </section>
      )}

      <Error error={error} />
      <p className="vt-warning">
        {t(
          "While a document is open its plaintext exists in a private temporary file, which is deleted on close, on lock and on quit. Screen capture cannot be blocked from within the application.",
        )}
      </p>
    </Frame>
  );
}

// ---------------------------------------------------------------------------
// Task 31 — Vault key rotation
// ---------------------------------------------------------------------------

export function VaultKeyRotation() {
  const { t } = useLanguage();
  const vault = useVault();
  const [preflight, setPreflight] = useState(null);
  const [status, setStatus] = useState(null);
  const [mode, setMode] = useState("rewrap");
  const [password, setPassword] = useState("");
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const res = await vault.rotationStatus();
    if (res?.ok) setStatus(res.data);
  }, [vault]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const runPreflight = async () => {
    setError(null);
    const res = await vault.rotationPreflight();
    if (res?.ok) setPreflight(res.data);
    else setError(res?.error);
  };

  const rotate = async () => {
    setError(null);
    setNotice("");
    setBusy(true);
    try {
      const res = await vault.rotationStart({ newPassword: password, mode, confirm: true });
      if (res?.ok) {
        setNotice(`${t("Rotation complete:")} ${res.data.mode} · ${res.data.rotationCount}`);
        setPassword("");
        setConsent(false);
      } else setError(res?.error);
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Frame title="VAULT KEY ROTATION" icon="key" parent={SCREENS.KEY_DETAILS} live>
      <CapabilityCard id="VAULT_KEY_ROTATION" />
      <VaultGate state={vault.state} />
      <section className="vt-panel">
        <button className="vt-secondary" type="button" disabled={vault.state !== VAULT_STATE.UNLOCKED} onClick={runPreflight}>
          {t("Run preflight checks")}
        </button>
        {preflight && (
          <dl className="vt-list">
            <div><dt>{t("Enrolled")}</dt><dd>{String(preflight.enrolled)}</dd></div>
            <div><dt>{t("Stored records")}</dt><dd>{preflight.totalRecords}</dd></div>
            <div><dt>{t("Collection items")}</dt><dd>{preflight.collectionItems}</dd></div>
            <div><dt>{t("Pending rotation")}</dt><dd>{String(preflight.pendingRotation)}</dd></div>
          </dl>
        )}
      </section>

      {status?.inProgress && (
        <section className="vt-panel">
          <h2>{t("A rotation is in progress")}</h2>
          <p>
            {t("Stage")}: {status.stage} · {t("Mode")}: {status.mode}
          </p>
          {status.error && <p className="vt-warning">{status.error}</p>}
          <div className="vt-actions">
            <button
              className="vt-secondary"
              type="button"
              disabled={busy}
              onClick={async () => {
                const res = await vault.rotationResume({ newPassword: password, confirm: true });
                if (!res?.ok) setError(res?.error);
                else setNotice(t("Rotation resumed and verified."));
                await refresh();
              }}
            >
              {t("Resume")}
            </button>
            <button
              className="vt-secondary"
              type="button"
              disabled={busy}
              onClick={async () => {
                const res = await vault.rotationRollback(true);
                if (!res?.ok) setError(res?.error);
                else setNotice(t("Rotation rolled back."));
                await refresh();
              }}
            >
              {t("Roll back")}
            </button>
          </div>
        </section>
      )}

      <section className="vt-panel">
        <h2>{t("Start a rotation")}</h2>
        <div className="vt-actions">
          {["rewrap", "reencrypt"].map((value) => (
            <button
              type="button"
              key={value}
              aria-pressed={mode === value}
              onClick={() => setMode(value)}
            >
              {t(value === "rewrap" ? "Rewrap key only" : "Re-encrypt all data")}
            </button>
          ))}
        </div>
        <label className="vt-field">
          {t("New vault password")}
          <input
            type="password"
            value={password}
            maxLength={256}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <Consent
          value={consent}
          onChange={setConsent}
          label="I understand rotation changes how my vault key is protected and that I must remember the new password."
        />
        <button
          className="security-primary"
          type="button"
          disabled={busy || !consent || password.length < 8 || vault.state !== VAULT_STATE.UNLOCKED}
          onClick={rotate}
        >
          {t("Rotate the vault key")}
          <Mark name="arrow" />
        </button>
      </section>

      {notice && <p className="vt-notice" role="status">{notice}</p>}
      <Error error={error} />
      <p className="vt-warning">
        {t(
          "Rewrap changes only how the key is protected. Re-encrypt rewrites every stored container under a new key, so the old key can no longer open them.",
        )}
      </p>
    </Frame>
  );
}

// ---------------------------------------------------------------------------
// Task 32 — Ciphertext package inspector
// ---------------------------------------------------------------------------

export function PackageInspector() {
  const { t } = useLanguage();
  const vault = useVault();
  const [path, setPath] = useState("");
  const [info, setInfo] = useState(null);
  const [verdict, setVerdict] = useState(null);
  const [error, setError] = useState(null);

  const pick = async () => {
    const picked = await vault.pickInputFile({ title: "Choose a ciphertext package" });
    const chosen = picked?.data?.path;
    if (chosen) {
      setPath(chosen);
      setInfo(null);
      setVerdict(null);
    }
  };

  const inspect = async () => {
    setError(null);
    setVerdict(null);
    const res = await vault.packageInspect(path);
    if (res?.ok) setInfo(res.data);
    else {
      setInfo(null);
      setError(res?.error);
    }
  };

  const verify = async () => {
    setError(null);
    const res = await vault.packageVerify(path);
    if (res?.ok) setVerdict(res.data);
    else setVerdict(null);
    if (!res?.ok) setError(res?.error);
  };

  return (
    <Frame title="CIPHERTEXT PACKAGE INSPECTOR" icon="database" live>
      <CapabilityCard id="PACKAGE_INSPECTOR" />
      <VaultGate state={vault.state} />
      <section className="vt-panel">
        <button className="vt-secondary" type="button" onClick={pick}>
          {t("Choose a package")}
        </button>
        {path && <p className="vt-notice" dir="ltr">{path}</p>}
        <div className="vt-actions">
          <button className="vt-secondary" type="button" disabled={!path} onClick={inspect}>
            {t("Inspect header")}
          </button>
          <button
            className="security-primary"
            type="button"
            disabled={!path || vault.state !== VAULT_STATE.UNLOCKED}
            onClick={verify}
          >
            {t("Verify with the vault key")}
            <Mark name="arrow" />
          </button>
        </div>
      </section>

      {info && (
        <section className="vt-panel">
          <h2>{t("Unauthenticated header claims")}</h2>
          <dl className="vt-list">
            <div><dt>{t("Version")}</dt><dd>{info.version}</dd></div>
            <div><dt>{t("Cipher")}</dt><dd>{info.cipherId}</dd></div>
            <div><dt>{t("Chunk size")}</dt><dd>{info.chunkSize}</dd></div>
            <div><dt>{t("Declared size")}</dt><dd>{info.declaredOrigSize}</dd></div>
            <div><dt>{t("Header authenticated")}</dt><dd>{String(info.headerAuthenticated)}</dd></div>
          </dl>
        </section>
      )}

      {verdict && (
        <section className="vt-panel">
          <h2>{t("Authenticated verification")}</h2>
          <dl className="vt-list">
            <div><dt>{t("Verified")}</dt><dd>{String(verdict.verified)}</dd></div>
            <div><dt>{t("Frames")}</dt><dd>{verdict.frames}</dd></div>
            <div><dt>{t("Recovered size")}</dt><dd>{verdict.processed}</dd></div>
            <div><dt>{t("Plaintext SHA-256")}</dt><dd dir="ltr">{verdict.plaintextSha256}</dd></div>
          </dl>
        </section>
      )}

      <Error error={error} />
      <p className="vt-warning">
        {t(
          "A header is an unauthenticated claim until verification with the right key succeeds. Verification proves the container is intact; it does not decrypt or reveal content.",
        )}
      </p>
    </Frame>
  );
}
