import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { SCREENS } from "../../config/screens";
import { useLanguage } from "../../i18n/Language";
import { useVault, VAULT_STATE } from "../../hooks/useVault";
import { useMaintenance } from "../../hooks/useMaintenance";
import { Mark } from "../security/ScreenUI";
import "../../styles/hub-controls.css";
import "./systemcare.css";

const CHECKS = Object.freeze([
  {
    id: "device",
    label: "Device Health",
    description: "CPU, memory, free disk space and uptime, read from this machine",
    icon: "monitor",
    scope: "system",
  },
  {
    id: "storage",
    label: "Temp & Cache",
    description: "Measure and clear only the temporary files that belong to KnouxCrypt",
    icon: "trash",
    scope: "system",
  },
  {
    id: "vault",
    label: "Vault Engine",
    description: "Enrollment, authenticated encryption and live session state",
    icon: "shield",
    scope: "vault",
  },
  {
    id: "keys",
    label: "Key Inventory",
    description: "Algorithms in use and whether private material is sealed",
    icon: "key",
    scope: "vault",
  },
  {
    id: "rotation",
    label: "Rotation Readiness",
    description: "Preflight the vault key rotation and detect an unfinished run",
    icon: "refresh",
    scope: "vault",
  },
  {
    id: "clipboard",
    label: "Clipboard Guard",
    description: "Adapter support, active leases and the ownership-checked timer",
    icon: "clipboard",
    scope: "vault",
  },
  {
    id: "privacy",
    label: "Session Privacy",
    description: "Idle auto-lock, lock on sleep and clipboard clearing policy",
    icon: "eye",
    scope: "vault",
  },
  {
    id: "integrity",
    label: "Integrity Engine",
    description: "Hash algorithms available for baseline manifests",
    icon: "layers",
    scope: "vault",
  },
  {
    id: "journal",
    label: "Activity Journal",
    description: "Hash-chain integrity, retained entries and external anchor state",
    icon: "clock",
    scope: "vault",
  },
  {
    id: "windows",
    label: "Windows Maintenance",
    description: "Open the real Windows pages for programs, updates, storage and security",
    icon: "settings",
    scope: "system",
  },
]);

const STATUS_COPY = Object.freeze({
  healthy: "Healthy",
  warning: "Attention",
  error: "Failed",
  locked: "Locked",
  unavailable: "Unavailable",
  pending: "Pending",
});

const WINDOWS_PANELS = Object.freeze([
  { id: "apps", label: "Installed apps", detail: "Review, repair or remove a program", icon: "grid" },
  { id: "updates", label: "Windows Update", detail: "Check for and install OS updates", icon: "refresh" },
  { id: "storage", label: "Storage Sense", detail: "Review drive space and cleanup rules", icon: "database" },
  { id: "security", label: "Windows Security", detail: "Open the native protection dashboard", icon: "shield" },
]);

function formatBytes(bytes) {
  if (typeof bytes !== "number" || !Number.isFinite(bytes)) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function formatDuration(seconds) {
  if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds < 0) return "—";
  const totalMinutes = Math.floor(seconds / 60);
  if (totalMinutes < 60) return `${totalMinutes} min`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours < 24) return `${hours}h ${minutes}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

function resultFor(promise) {
  return promise.then(
    (res) => (res?.ok
      ? { ok: true, data: res.data }
      : { ok: false, error: res?.error || { code: "UNKNOWN", message: "The check failed." } }),
    (err) => ({ ok: false, error: { code: "UNKNOWN", message: err?.message || "The check failed." } }),
  );
}

export function SystemCare() {
  const { t, locale, dir } = useLanguage();
  const vault = useVault();
  const maintenance = useMaintenance();
  const unlocked = vault.state === VAULT_STATE.UNLOCKED;
  const session = vault.session;

  const vaultRef = useRef(vault);
  vaultRef.current = vault;
  const maintenanceRef = useRef(maintenance);
  maintenanceRef.current = maintenance;

  const [results, setResults] = useState({});
  const [scan, setScan] = useState(null);
  const [platform, setPlatform] = useState(null);
  const [running, setRunning] = useState(false);
  const [lastRun, setLastRun] = useState(null);
  const [confirmClean, setConfirmClean] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [action, setAction] = useState(null);

  const runCheck = useCallback(
    async (id, scanData, info) => {
      const v = vaultRef.current;
      const m = maintenanceRef.current;
      const isUnlocked = v.state === VAULT_STATE.UNLOCKED;

      if (id === "device") {
        if (!m.available) return { status: "unavailable", detail: t("Open the desktop app to read device health.") };
        if (!scanData?.device) return { status: "error", detail: t("Device metrics could not be read.") };
        const device = scanData.device;
        const memoryPercent = device.memoryTotal > 0 ? (device.memoryUsed / device.memoryTotal) * 100 : 0;
        const disk = device.disk;
        const diskPercent = disk && disk.totalBytes > 0 ? (disk.usedBytes / disk.totalBytes) * 100 : null;
        const pressure = memoryPercent >= 92 || (diskPercent !== null && diskPercent >= 95);
        const detail = [
          `${device.cpuCount} logical CPU${device.cpuCount === 1 ? "" : "s"}`,
          `${formatBytes(device.memoryUsed)} / ${formatBytes(device.memoryTotal)} RAM`,
          disk ? `${formatBytes(disk.freeBytes)} free of ${formatBytes(disk.totalBytes)}` : t("Disk free space unavailable"),
          `${t("Up")} ${formatDuration(device.uptimeSeconds)}`,
        ].join(" · ");
        return { status: pressure ? "warning" : "healthy", detail };
      }

      if (id === "storage") {
        if (!m.available) return { status: "unavailable", detail: t("Open the desktop app to measure app temp files.") };
        if (!scanData) return { status: "error", detail: t("The app temp scan failed.") };
        const folders = scanData.locations.filter((entry) => entry.bytes > 0).length;
        const pressure = scanData.cleanableBytes > 250 * 1024 * 1024;
        return {
          status: pressure ? "warning" : "healthy",
          detail: `${formatBytes(scanData.cleanableBytes)} · ${scanData.totalFiles} ${t("files")} · ${folders} ${t("folders")}`,
        };
      }

      if (id === "windows") {
        if (!m.available) return { status: "unavailable", detail: t("Open the desktop app to reach Windows maintenance.") };
        if (!info) return { status: "unavailable", detail: t("Platform information is unavailable.") };
        if (!info.windows) return { status: "unavailable", detail: `${t("Native Windows pages are not available on")} ${info.platform}.` };
        return { status: "healthy", detail: t("Windows 10/11 maintenance pages are available from this screen.") };
      }

      if (!isUnlocked) {
        return { status: "locked", detail: t("Unlock the vault to run this check.") };
      }

      switch (id) {
        case "vault": {
          // `useVault` exposes `status` as the state object refreshed from the
          // main process; it is not an async call.
          const data = v.status;
          if (!data) return { status: "warning", detail: t("Vault status has not loaded yet.") };
          const detail = [
            data.enrolled ? t("Enrolled") : t("Not enrolled"),
            `${data.activeSessions || 0} ${t("active session(s)")}`,
            data.guestActive ? t("guest session open") : t("authenticated session"),
            data.engine?.algorithm || "AES-256-GCM",
          ].join(" · ");
          return { status: data.guestActive ? "warning" : "healthy", detail };
        }
        case "keys": {
          const res = await resultFor(v.keyList());
          if (!res.ok) return { status: "error", detail: res.error.message || t("The key store could not be read.") };
          const keys = res.data?.keys || [];
          const algorithms = [...new Set(keys.map((entry) => entry.algorithm).filter(Boolean))];
          return {
            status: "healthy",
            detail: keys.length
              ? `${keys.length} ${t("key(s)")} · ${algorithms.join(", ")}`
              : t("No keys yet. Generate one in Key Forge."),
          };
        }
        case "rotation": {
          const res = await resultFor(v.rotationPreflight());
          if (!res.ok) return { status: "warning", detail: res.error.message || t("Rotation preflight unavailable.") };
          const data = res.data || {};
          if (data.pendingRotation) {
            return { status: "warning", detail: `${t("An unfinished rotation is pending")}: ${data.pendingRotationId || t("unknown id")}.` };
          }
          return {
            status: "healthy",
            detail: `${data.totalRecords || 0} ${t("stored records ready")} · ${data.activeSessions || 0} ${t("active session(s)")} · ${data.kdfId || "PBKDF2-SHA256"}`,
          };
        }
        case "clipboard": {
          const res = await resultFor(v.clipboardStatus());
          if (!res.ok) return { status: "warning", detail: res.error.message || t("Clipboard status unavailable.") };
          const data = res.data || {};
          if (!data.supported) {
            return { status: "warning", detail: t("No clipboard adapter is available in this environment.") };
          }
          return {
            status: "healthy",
            detail: `${data.armed ? t("Lease armed") : t("Idle")} · ${data.activeLeases || 0} ${t("active lease(s)")} · ${t("timers")}: ${(data.timerChoices || []).join(", ") || "—"}`,
          };
        }
        case "privacy": {
          const res = await resultFor(v.sessionPrivacyPolicy());
          if (!res.ok) return { status: "warning", detail: res.error.message || t("Session privacy policy unavailable.") };
          const values = res.data?.values || {};
          const warnings = [];
          if (!values.lockOnSuspend) warnings.push(t("sleep lock off"));
          if (!values.clearClipboard) warnings.push(t("clipboard clearing off"));
          const detail = `${t("Idle lock")} ${formatDuration(values.idleLockSeconds)} · ${t("Sleep lock")}: ${values.lockOnSuspend ? t("on") : t("off")} · ${t("Clipboard")}: ${values.clearClipboard ? t("clear") : t("keep")} · ${t("Retention")} ${values.retentionDays || 0}d`;
          return { status: warnings.length ? "warning" : "healthy", detail };
        }
        case "integrity": {
          const res = await resultFor(v.integrityAlgorithms());
          if (!res.ok) return { status: "warning", detail: res.error.message || t("Integrity engine unavailable.") };
          const algorithms = res.data?.algorithms || [];
          return {
            status: algorithms.length ? "healthy" : "warning",
            detail: algorithms.length ? `${t("Algorithms")}: ${algorithms.join(", ")}` : t("No hashing algorithm reported."),
          };
        }
        case "journal": {
          const res = await resultFor(v.journalIntegrity());
          if (!res.ok) return { status: "warning", detail: res.error.message || t("Journal integrity unavailable.") };
          const data = res.data || {};
          // The journal reports "intact", "tampered" or "unavailable".
          const broken = data.status !== "intact";
          return {
            status: broken ? "warning" : "healthy",
            detail: `${t("Chain")}: ${data.status || t("unknown")} · ${data.entries || 0}/${data.retentionLimit || 0} ${t("entries")} · ${t("dropped")}: ${data.droppedCount || 0} · ${t("external anchor")}: ${data.externalTrustAnchor ? t("on") : t("off")}`,
          };
        }
        default:
          return { status: "error", detail: t("Unknown check.") };
      }
    },
    [t],
  );

  const runAll = useCallback(async () => {
    setRunning(true);
    setAction(null);
    try {
      const m = maintenanceRef.current;
      let scanData = null;
      let info = null;
      if (m.available) {
        const [scanRes, infoRes] = await Promise.all([resultFor(m.scan()), resultFor(m.info())]);
        if (scanRes.ok) scanData = scanRes.data;
        if (infoRes.ok) info = infoRes.data;
        if (!scanRes.ok) setAction({ tone: "err", text: scanRes.error.message || t("The app temp scan failed.") });
      }
      setScan(scanData);
      setPlatform(info);
      const next = {};
      for (const check of CHECKS) {
        try {
          next[check.id] = await runCheck(check.id, scanData, info);
        } catch (err) {
          // A single failing probe must not blank the whole dashboard.
          next[check.id] = {
            status: "error",
            detail: err?.message || t("This check could not run."),
          };
        }
      }
      setResults(next);
      setLastRun(new Date().toISOString());
    } finally {
      // `running` is cleared even if the scan itself throws, so the button can
      // never be stuck on "Running checks…".
      setRunning(false);
    }
  }, [runCheck, t]);

  useEffect(() => {
    runAll();
    // The initial scan is intentionally one-shot; re-running is explicit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const persistClean = useCallback(async () => {
    setCleaning(true);
    setAction(null);
    const res = await resultFor(maintenanceRef.current.clean(true));
    setCleaning(false);
    setConfirmClean(false);
    if (!res.ok) {
      setAction({ tone: "err", text: res.error.message || t("Cleanup failed.") });
      return;
    }
    const freed = formatBytes(res.data.freedBytes);
    setAction({
      tone: res.data.failedFiles > 0 ? "warn" : "ok",
      text: `${t("Cleaned")} ${freed} ${t("across")} ${res.data.removedFiles} ${t("file(s)")}${res.data.failedFiles ? ` · ${res.data.failedFiles} ${t("locked or skipped")}` : ""}.`,
    });
    // Re-measure so the score reflects the cleanup instead of the old scan.
    const scanRes = await resultFor(maintenanceRef.current.scan());
    if (scanRes.ok) {
      setScan(scanRes.data);
      setResults((current) => ({
        ...current,
        storage: {
          status: scanRes.data.cleanableBytes > 250 * 1024 * 1024 ? "warning" : "healthy",
          detail: `${formatBytes(scanRes.data.cleanableBytes)} · ${scanRes.data.totalFiles} ${t("files")} · ${scanRes.data.locations.filter((entry) => entry.bytes > 0).length} ${t("folders")}`,
        },
      }));
      setLastRun(new Date().toISOString());
    }
  }, [t]);

  const openPanel = useCallback(async (panel) => {
    setAction(null);
    const res = await resultFor(maintenanceRef.current.openPanel(panel));
    if (!res.ok) {
      setAction({ tone: "err", text: res.error.message || t("The Windows page could not be opened.") });
      return;
    }
    setAction({ tone: "ok", text: t("Opened the native Windows maintenance page.") });
  }, [t]);

  const summary = useMemo(() => {
    const values = Object.values(results);
    const healthy = values.filter((entry) => entry?.status === "healthy").length;
    const attention = values.filter((entry) => entry?.status === "warning" || entry?.status === "error").length;
    const locked = values.filter((entry) => entry?.status === "locked").length;
    return { healthy, attention, locked, total: CHECKS.length, answered: values.length };
  }, [results]);

  const toneFor = (status) =>
    status === "healthy" ? "ok" : status === "warning" ? "warn" : status === "error" ? "err" : status === "locked" ? "locked" : "idle";

  return (
    <main className="crypt-entry crypt-hub systemcare-screen" dir={dir} lang={locale} data-screen="SYSTEM_CARE" data-vault-state={vault.state}>
      <div className="crypt-atmosphere" aria-hidden="true" />
      <div className="hub-shell">
        <header className="sc-header">
          <div>
            <p className="sc-eyebrow">{t("Local maintenance")}</p>
            <h1>{t("System Care")}</h1>
            <p>{t("Real health checks for this device and your vault. Nothing leaves this machine.")}</p>
          </div>
          <div className={`sc-score ${summary.attention ? "has-attention" : ""}`} aria-label={t("System Care score")}>
            <strong>{summary.healthy}</strong>
            <span>/{summary.total}</span>
            <small>{t("healthy")}</small>
          </div>
        </header>

        {!unlocked && (
          <div className="sc-banner sc-banner-locked" role="status">
            <Mark name="lock" />
            <div>
              <strong>{t("The vault is locked")}</strong>
              <p>{t("Device and temp checks still run. Unlock the vault to complete the security checks.")}</p>
            </div>
            <Link to={SCREENS.SECURE_ACCESS_LOGIN} state={{ returnTo: SCREENS.SYSTEM_CARE }} className="sc-button sc-button-primary">
              {t("Unlock Vault")}
            </Link>
          </div>
        )}

        {!maintenance.available && (
          <div className="sc-banner sc-banner-warn" role="status">
            <Mark name="info" />
            <div>
              <strong>{t("Desktop features unavailable")}</strong>
              <p>{t("System Care needs the desktop app to measure temp files and open Windows maintenance pages.")}</p>
            </div>
          </div>
        )}

        {action && (
          <div className={`sc-banner sc-banner-${action.tone === "ok" ? "ok" : action.tone === "warn" ? "warn" : "err"}`} role="status">
            <Mark name={action.tone === "ok" ? "badge" : "alert"} />
            <p>{action.text}</p>
          </div>
        )}

        <section className="sc-summary" aria-label={t("System Care summary")}>
          <div className="sc-summary-facts">
            <div><span>{t("Healthy")}</span><strong className="sc-tone-ok">{summary.healthy}</strong></div>
            <div><span>{t("Attention")}</span><strong className="sc-tone-warn">{summary.attention}</strong></div>
            <div><span>{t("Locked")}</span><strong className="sc-tone-locked">{summary.locked}</strong></div>
            <div><span>{t("App temp")}</span><strong>{formatBytes(scan?.cleanableBytes || 0)}</strong></div>
          </div>
          <div className="sc-summary-actions">
            <button type="button" className="sc-button sc-button-primary" onClick={runAll} disabled={running || cleaning}>
              <Mark name="refresh" />
              {running ? t("Running checks…") : t("Run all checks")}
            </button>
            <button
              type="button"
              className="sc-button"
              onClick={() => setConfirmClean(true)}
              disabled={!maintenance.available || running || cleaning || (scan?.cleanableBytes || 0) === 0}
            >
              <Mark name="trash" />
              {t("Clean app temp")}
            </button>
          </div>
          <p className="sc-timestamp">
            {lastRun ? `${t("Last run")}: ${new Date(lastRun).toLocaleString()}` : t("Not run yet")}
            {platform ? ` · ${t("Platform")}: ${platform.platform}${platform.windows ? " (Windows)" : ""}` : ""}
          </p>
        </section>

        {confirmClean && (
          <div className="sc-confirm" role="alertdialog" aria-labelledby="sc-confirm-title">
            <div>
              <h2 id="sc-confirm-title">{t("Clean app temp files?")}</h2>
              <p>
                {t("This removes only KnouxCrypt's own decrypted-document temp files, cache folders and logs. Your vault, encrypted files and Windows files are not touched. The next scan will show the result.")}
                {scan ? ` ${t("Currently measured")}: ${formatBytes(scan.cleanableBytes)}.` : ""}
              </p>
            </div>
            <div className="sc-confirm-actions">
              <button type="button" className="sc-button" onClick={() => setConfirmClean(false)} disabled={cleaning}>
                {t("Cancel")}
              </button>
              <button type="button" className="sc-button sc-button-danger" onClick={persistClean} disabled={cleaning}>
                <Mark name="trash" />
                {cleaning ? t("Cleaning…") : t("Clean now")}
              </button>
            </div>
          </div>
        )}

        <section className="sc-checks" aria-label={t("Health checks")}>
          <div className="sc-section-head">
            <h2>{t("Health checks")}</h2>
            <small>{summary.answered} / {summary.total} {t("answered")}</small>
          </div>
          <div className="sc-check-grid">
            {CHECKS.map((check) => {
              const result = results[check.id];
              const status = result?.status || "pending";
              const tone = toneFor(status);
              return (
                <article key={check.id} className={`sc-check-card sc-tone-${tone}`} data-check={check.id} data-status={status}>
                  <span className="sc-check-icon"><Mark name={check.icon} /></span>
                  <div className="sc-check-copy">
                    <div className="sc-check-title">
                      <strong>{t(check.label)}</strong>
                      <span className="sc-check-badge">{t(STATUS_COPY[status] || "Pending")}</span>
                    </div>
                    <p>{t(check.description)}</p>
                    <small className="sc-check-detail">{result?.detail || t("Waiting for the first run.")}</small>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        {scan && scan.locations.length > 0 && (
          <section className="sc-locations" aria-label={t("Measured app folders")}>
            <div className="sc-section-head">
              <h2>{t("Measured app folders")}</h2>
              <small>{t("App-owned only")}</small>
            </div>
            <ul>
              {scan.locations.map((entry) => (
                <li key={entry.id} className={entry.bytes > 0 ? "has-data" : ""}>
                  <span><Mark name="folder" /> {t(entry.label)}</span>
                  <small>{entry.files} {t("files")} · {formatBytes(entry.bytes)}</small>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="sc-windows" aria-label={t("Windows maintenance")}>
          <div className="sc-section-head">
            <h2>{t("Device & Windows maintenance")}</h2>
            <small>{platform?.windows ? t("Native pages") : t("Windows only")}</small>
          </div>
          <div className="sc-panel-grid">
            {WINDOWS_PANELS.map((panel) => (
              <button
                key={panel.id}
                type="button"
                className="sc-panel"
                onClick={() => openPanel(panel.id)}
                disabled={!maintenance.available || !platform?.windows}
              >
                <span className="sc-panel-icon"><Mark name={panel.icon} /></span>
                <span className="sc-panel-copy">
                  <strong>{t(panel.label)}</strong>
                  <small>{t(panel.detail)}</small>
                </span>
                <Mark name="chevron" className="sc-panel-chevron" />
              </button>
            ))}
          </div>
          <p className="sc-fineprint">
            {t("These buttons open the real Windows 10/11 settings pages. KnouxCrypt does not uninstall programs, change OS settings or run a system repair on your behalf. Cleaning is limited to this app's own temporary and cache folders, and every cleanup needs explicit confirmation.")}
          </p>
        </section>
      </div>
    </main>
  );
}

export default SystemCare;
