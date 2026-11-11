import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { SCREENS } from "../../config/screens";
import { useLanguage } from "../../i18n/Language";
import { useVault, VAULT_STATE } from "../../hooks/useVault";
import { ScreenFrame, ScreenHeader, Mark, IconButton, PreviewSheet, CapabilityCard } from "./ScreenUI";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const categoryIcon = { Photos: "photo", Videos: "video", Audio: "audio", Files: "file" };
const ALL_CATS = Object.keys(categoryIcon);

// Reference artwork for the gallery background tiles (unchanged visuals).
const artwork = import.meta.glob("../../assets/vault-thumb-*.webp", { eager: true, import: "default" });
const refSamples = [
  ["Photos", 24], ["Photos", 8], ["Videos", 6], ["Photos", 12],
  ["Photos", 18], ["Audio", 4], ["Files", 7], ["Videos", 9],
].map(([category, count], id) => ({ id, category, count }));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function formatBytes(n) {
  if (!Number.isFinite(n) || n <= 0) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function short(isoString) {
  if (!isoString) return "—";
  try { return new Date(isoString).toLocaleDateString(); } catch { return "—"; }
}

function errorMsg(err) {
  if (!err) return "";
  if (err.code === "SESSION_REQUIRED") return "Unlock the vault to access Shadow Vault.";
  if (err.code === "UNAVAILABLE") return "Shadow Vault is not available in this preview.";
  if (err.code === "CONSENT_REQUIRED") return "Confirmation required.";
  if (err.code === "BAD_INPUT") return err.message || "Invalid input.";
  if (err.code === "PATH_CONFLICT") return "A file already exists at that location.";
  if (err.code === "IO_FAILED") return "A disk operation failed.";
  if (err.code === "CANCELLED") return "Cancelled.";
  return err.message || "An error occurred.";
}

// ---------------------------------------------------------------------------
// Reference tile (existing demo layout — unchanged visual)
// ---------------------------------------------------------------------------
function RefTile({ sample }) {
  const { t } = useLanguage();
  return (
    <article className={`vault-tile vault-tile-${sample.id} vault-tile-ref`} aria-label={t(`Demo ${sample.category} collection`)}>
      <div className="vault-tile-main">
        <img
          src={artwork[`../../assets/vault-thumb-${sample.id}.webp`]}
          alt=""
          draggable="false"
        />
        <span className="vault-shutter" aria-hidden="true" />
        <span className="vault-lock"><Mark name="lock" /></span>
        <span className="vault-tile-count"><Mark name={categoryIcon[sample.category]} />{t(sample.count)}</span>
      </div>
      <span className="vault-tile-ref-label">{t("Demo")}</span>
    </article>
  );
}

// ---------------------------------------------------------------------------
// Real imported item tile
// ---------------------------------------------------------------------------
function RealTile({ record, onAction }) {
  const { t } = useLanguage();
  const icon = categoryIcon[record.category] || "file";
  return (
    <article className="vault-tile vault-tile-real" data-category={record.category}>
      <button
        className="vault-tile-main vault-tile-real-main"
        aria-label={t(`Encrypted ${record.category} item: ${record.originalName}`)}
        onClick={() => onAction("details", record)}
      >
        <span className="vault-real-icon" aria-hidden="true"><Mark name={icon} /></span>
        <span className="vault-shutter vault-shutter-real" aria-hidden="true" />
        <span className="vault-lock vault-lock-green"><Mark name="lock" /></span>
        <span className="vault-tile-count"><Mark name={icon} /></span>
      </button>
      <button
        className="vault-tile-menu"
        aria-label={t(`Actions for ${record.originalName}`)}
        onClick={() => onAction("menu", record)}
      >
        <Mark name="dots" />
      </button>
    </article>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export function ShadowVault() {
  const { t, locale, dir } = useLanguage();
  const vault = useVault();
  const persisted = vault.state === VAULT_STATE.UNLOCKED;
  const sessionId = vault.session?.sessionId ?? null;

  // The vault object changes identity on every render; use a ref for effects.
  const vaultRef = useRef(vault);
  vaultRef.current = vault;

  // ---- media records -------------------------------------------------------
  const [records, setRecords] = useState(null);   // null = not yet loaded
  const [loadError, setLoadError] = useState(null);
  const [busy, setBusy] = useState(false);

  const loadRecords = useCallback(async () => {
    if (!persisted) { setRecords(null); setLoadError(null); return; }
    const requestedSessionId = vaultRef.current.session?.sessionId;
    const res = await vaultRef.current.mediaList();
    // A lock or session switch can occur while the IPC request is pending.
    // Never rehydrate previous-session filenames into renderer state.
    if (vaultRef.current.state !== VAULT_STATE.UNLOCKED ||
        vaultRef.current.session?.sessionId !== requestedSessionId) return;
    if (res?.ok) {
      setRecords(Array.isArray(res.data) ? res.data : []);
      setLoadError(null);
    } else {
      setLoadError(res?.error || null);
      setRecords([]);
    }
  }, [persisted]);

  useEffect(() => { loadRecords(); }, [loadRecords, sessionId]);

  // ---- category filter -----------------------------------------------------
  const [activeCategory, setActiveCategory] = useState("All");
  const categories = ["All", ...ALL_CATS];

  const visibleRecords = records
    ? activeCategory === "All"
      ? records
      : records.filter((r) => r.category === activeCategory)
    : [];

  // ---- sheet (action panel) ------------------------------------------------
  const [sheet, setSheet] = useState(null);   // { kind, record? }
  const [sheetError, setSheetError] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [importResults, setImportResults] = useState(null);

  // Clear sensitive media names and open detail sheets on lock/session change.
  useEffect(() => {
    if (!persisted) {
      setRecords(null);
      setLoadError(null);
      setSheet(null);
      setImportResults(null);
    }
  }, [persisted, sessionId]);

  function openSheet(kind, record = null) {
    setSheet({ kind, record });
    setSheetError(null);
    setConfirmDelete(false);
    setImportResults(null);
  }
  function closeSheet() {
    setSheet(null);
    setSheetError(null);
    setConfirmDelete(false);
    setImportResults(null);
  }

  // ---- import --------------------------------------------------------------
  const handleImport = useCallback(async () => {
    setSheetError(null);
    setImportResults(null);
    setBusy(true);
    const res = await vaultRef.current.mediaImport();
    setBusy(false);
    if (!res) return;
    if (res.ok === false) { setSheetError(res.error); return; }
    const data = res.data;
    if (data?.cancelled) { closeSheet(); return; }
    setImportResults(data?.results || []);
    await loadRecords();
  }, [loadRecords]);

  // ---- export --------------------------------------------------------------
  const handleExport = useCallback(async (record) => {
    setSheetError(null);
    setBusy(true);
    const res = await vaultRef.current.mediaExport(record.id);
    setBusy(false);
    if (!res) return;
    if (res.ok === false) { setSheetError(res.error); return; }
    if (res.data?.cancelled) return;
    closeSheet();
  }, []);

  // ---- delete --------------------------------------------------------------
  const handleDelete = useCallback(async (record) => {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    setSheetError(null);
    setBusy(true);
    const res = await vaultRef.current.mediaRemove(record.id, true);
    setBusy(false);
    if (!res) return;
    if (res.ok === false) { setSheetError(res.error); return; }
    closeSheet();
    await loadRecords();
  }, [confirmDelete, loadRecords]);

  // ---- search --------------------------------------------------------------
  const [search, setSearch] = useState("");
  const searchResults = records
    ? records.filter((r) => r.originalName.toLowerCase().includes(search.toLowerCase()) || t(r.category).toLowerCase().includes(search.toLowerCase()))
    : [];

  // ---- render --------------------------------------------------------------
  return (
    <ScreenFrame type="vault-screen">
      <ScreenHeader title={t("SHADOW")} accent="VAULT" caption="BY KNOUX CRYPT">
        <IconButton icon="search" label={t("Search vault")} onClick={() => openSheet("search")} />
        <IconButton icon="dots" label={t("Vault tools")} onClick={() => openSheet("tools")} />
      </ScreenHeader>

      <p className="vault-tagline">{t("YOUR SECRETS. YOUR SPACE.")}</p>

      <CapabilityCard id="SHADOW_VAULT" />

      {/* Category tabs */}
      <div className="vault-tabs" role="tablist" aria-label={t("Media category")}>
        {categories.map((c, i) => (
          <button
            key={c}
            role="tab"
            aria-selected={activeCategory === c}
            tabIndex={activeCategory === c ? 0 : -1}
            data-category={c}
            className={activeCategory === c ? "active" : ""}
            onClick={() => setActiveCategory(c)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight") setActiveCategory(categories[(i + 1) % categories.length]);
              else if (e.key === "ArrowLeft") setActiveCategory(categories[(i - 1 + categories.length) % categories.length]);
            }}
          >
            {c !== "All" && <Mark name={categoryIcon[c]} />}
            {t(c)}
          </button>
        ))}
      </div>

      {/* Gallery */}
      <section
        className={`vault-gallery ${activeCategory !== "All" ? "vault-filtered" : ""}`}
        aria-label={t(persisted ? "Encrypted vault items" : "Reference demo collections")}
      >
        {/* Real imported items — shown only when unlocked */}
        {persisted && visibleRecords.map((r) => (
          <RealTile key={r.id} record={r} onAction={openSheet} />
        ))}

        {/* Reference tiles (always visible — clearly labelled as demo) */}
        {(!persisted || visibleRecords.length === 0) &&
          refSamples
            .filter((s) => activeCategory === "All" || s.category === activeCategory)
            .map((s) => <RefTile key={s.id} sample={s} />)
        }
      </section>

      {/* Error / empty state */}
      {persisted && loadError && (
        <p className="vault-warning" role="alert">{errorMsg(loadError)}</p>
      )}
      {persisted && records !== null && records.length === 0 && !loadError && (
        <p className="vault-empty">{t("No files imported yet. Use Import Securely to add files.")}</p>
      )}

      {/* Stats bar */}
      <section className="vault-usage" data-persisted={persisted}>
        <Mark name="database" />
        <div>
          <strong>{t(persisted ? "Shadow Vault — encrypted storage" : "Shadow Vault")}</strong>
          {persisted ? (
            <p>
              {records === null
                ? t("Loading encrypted items…")
                : `${records.length} ${t(records.length === 1 ? "encrypted item" : "encrypted items")}`}
            </p>
          ) : (
            <p>{t("Unlock the vault to import and access your files.")}</p>
          )}
        </div>
        {persisted && records !== null && (
          <small>{t("Original source files are never modified.")}</small>
        )}
      </section>

      {/* Import button */}
      <button
        className="security-primary vault-import"
        disabled={!persisted || busy}
        onClick={persisted ? () => openSheet("import") : undefined}
        aria-disabled={!persisted}
      >
        <Mark name="upload" />
        {t(persisted ? "Import Securely" : "Unlock vault to import")}
        <Mark name="chevron" />
      </button>

      <p className="vault-disclaimer">
        <Mark name="info" />
        {t("Original files are never automatically removed from your device.")}
      </p>

      {/* Bottom nav */}
      <nav className="vault-bottom" aria-label={t("Vault navigation")}>
        <button aria-current="page" onClick={() => setActiveCategory("All")}>
          <Mark name="home" />{t("Vault")}
        </button>
        <Link to={SCREENS.TOOLS}>
          <Mark name="shield" />{t("Secure Tools")}
        </Link>
        <button onClick={() => openSheet("tools")}>
          <Mark name="settings" />{t("Settings")}
        </button>
      </nav>

      {/* ------------------------------------------------------------------ */}
      {/* Action sheets                                                        */}
      {/* ------------------------------------------------------------------ */}

      {/* Import sheet */}
      {persisted && sheet?.kind === "import" && (
        <PreviewSheet title={t("Import Securely")} onClose={closeSheet}>
          {!importResults ? (
            <>
              <p>{t("Select one or more files to encrypt and store in Shadow Vault. Original files are never moved or deleted.")}</p>
              {sheetError && <p className="device-warning" role="alert">{errorMsg(sheetError)}</p>}
              <button className="security-primary" disabled={busy} onClick={handleImport}>
                {t(busy ? "Importing…" : "Select files…")}
              </button>
            </>
          ) : (
            <>
              <p>{t(`${importResults.filter((r) => r.ok).length} of ${importResults.length} file(s) imported successfully.`)}</p>
              {importResults.map((r, i) => (
                <p key={i} className={r.ok ? "vault-import-ok" : "device-warning"}>
                  {r.ok ? "✓" : "✗"} {r.sourcePath.split(/[\\/]/).pop()}
                  {!r.ok && ` — ${errorMsg(r.error)}`}
                </p>
              ))}
              <button className="security-primary" onClick={closeSheet}>{t("Done")}</button>
            </>
          )}
        </PreviewSheet>
      )}

      {/* Item detail / actions sheet */}
      {persisted && sheet?.kind === "details" && sheet.record && (
        <PreviewSheet title={sheet.record.originalName} onClose={closeSheet}>
          <dl className="vault-detail">
            <dt>{t("Category")}</dt><dd>{t(sheet.record.category)}</dd>
            <dt>{t("Original size")}</dt><dd dir="ltr">{formatBytes(sheet.record.sizeBytes)}</dd>
            <dt>{t("Imported")}</dt><dd>{short(sheet.record.importedAt)}</dd>
            <dt>{t("SHA-256")}</dt><dd dir="ltr" className="vault-hash">{sheet.record.plaintextSha256?.slice(0, 32)}…</dd>
            <dt>{t("Encryption")}</dt><dd>AES-256-GCM</dd>
          </dl>
          {sheetError && <p className="device-warning" role="alert">{errorMsg(sheetError)}</p>}
          <button className="security-choice" disabled={busy} onClick={() => handleExport(sheet.record)}>
            <Mark name="upload" />{t(busy ? "Exporting…" : "Export (decrypt to disk)")}
          </button>
          <button
            className={`security-choice vault-delete${confirmDelete ? " vault-delete-confirm" : ""}`}
            disabled={busy}
            onClick={() => handleDelete(sheet.record)}
          >
            <Mark name="trash" />
            {t(confirmDelete ? "Tap again to confirm permanent deletion" : "Delete from vault")}
          </button>
          {confirmDelete && (
            <button className="security-choice" onClick={() => setConfirmDelete(false)}>
              {t("Cancel deletion")}
            </button>
          )}
        </PreviewSheet>
      )}

      {/* Item context menu */}
      {persisted && sheet?.kind === "menu" && sheet.record && (
        <PreviewSheet title={sheet.record.originalName} onClose={closeSheet}>
          <p dir="ltr" className="vault-hash">{sheet.record.originalName}</p>
          <p>{t(sheet.record.category)} · {formatBytes(sheet.record.sizeBytes)} · {short(sheet.record.importedAt)}</p>
          {sheetError && <p className="device-warning" role="alert">{errorMsg(sheetError)}</p>}
          <button className="security-choice" onClick={() => openSheet("details", sheet.record)}>
            {t("View details")}
          </button>
          <button className="security-choice" disabled={busy} onClick={() => handleExport(sheet.record)}>
            {t(busy ? "Exporting…" : "Export (decrypt)")}
          </button>
          <button
            className={`security-choice vault-delete${confirmDelete ? " vault-delete-confirm" : ""}`}
            disabled={busy}
            onClick={() => handleDelete(sheet.record)}
          >
            {t(confirmDelete ? "Tap again to confirm" : "Delete")}
          </button>
        </PreviewSheet>
      )}

      {/* Search sheet */}
      {persisted && sheet?.kind === "search" && (
        <PreviewSheet title={t("Search vault")} onClose={closeSheet}>
          <label className="security-search">
            {t("Search encrypted items")}
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("Filename or category")}
              autoFocus
            />
          </label>
          {persisted ? (
            search.length > 0 && searchResults.length === 0 ? (
              <p>{t("No matching items.")}</p>
            ) : (
              searchResults.map((r) => (
                <button
                  key={r.id}
                  className="security-choice"
                  onClick={() => { openSheet("details", r); }}
                >
                  <Mark name={categoryIcon[r.category] || "file"} />
                  {r.originalName}
                  <span className="vault-search-meta">{formatBytes(r.sizeBytes)} · {short(r.importedAt)}</span>
                </button>
              ))
            )
          ) : (
            <p>{t("Unlock the vault to search your encrypted items.")}</p>
          )}
        </PreviewSheet>
      )}

      {/* Tools / navigation sheet */}
      {sheet?.kind === "tools" && (
        <PreviewSheet title={t("Vault tools")} onClose={closeSheet}>
          <Link to={SCREENS.COLLECTIONS} onClick={closeSheet}>{t("Collections")}</Link>
          <Link to={SCREENS.DOCUMENT_VIEWER} onClick={closeSheet}>{t("Document viewer")}</Link>
          <Link to={SCREENS.VAULT_KEY_ROTATION} onClick={closeSheet}>{t("Key rotation")}</Link>
        </PreviewSheet>
      )}
    </ScreenFrame>
  );
}
