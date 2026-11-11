import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { SCREENS } from "../../config/screens";
import { useLanguage } from "../../i18n/Language";
import { useVault, VAULT_STATE } from "../../hooks/useVault";
import { useMaintenance } from "../../hooks/useMaintenance";
import { Mark } from "../security/ScreenUI";
import "../../styles/hub-controls.css";
import "./systemcare.css";

/**
 * Repair — ten local services, each wired end-to-end.
 *
 * Every card reads a real value (device metrics, app-owned temp folders, the
 * vault service, the encrypted journal) and every action calls a real API:
 * selective temp cleanup, vault lock, clipboard clear, live session-privacy
 * policy updates, and the genuine Windows maintenance pages. The screen never
 * pretends to uninstall programs, change OS settings or run an OS repair.
 */
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
    description: "Idle auto-lock, lock on sleep and clipboard clearing policy — applied live",
    icon: "eye",
    scope: "vault",
    wide: true,
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
    description: "Open the real Windows pages for programs, updates, storage, security and recovery",
    icon: "settings",
    scope: "system",
    wide: true,
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
  { id: "recovery", label: "Recovery options", detail: "Reset and advanced startup tools", icon: "zap" },
]);

const IDLE_CHOICES = Object.freeze([
  { seconds: 60, label: "1 minute" },
  { seconds: 300, label: "5 minutes" },
  { seconds: 600, label: "10 minutes" },
  { seconds: 900, label: "15 minutes" },
  { seconds: 1800, label: "30 minutes" },
  { seconds: 3600, label: "1 hour" },
]);

const RETENTION_CHOICES = Object.freeze([30, 90, 180, 365]);

function formatBytes(bytes) {
  if (typeof bytes !== "number" || !Number.isFinite(bytes)) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function formatDuration(seconds, t) {
  if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds < 0) return "—";
  const totalMinutes = Math.floor(seconds / 60);
  if (totalMinutes < 60) return `${totalMinutes} ${t("min")}`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours < 24) return `${hours} ${t("h")} ${minutes} ${t("m")}`;
  const days = Math.floor(hours / 24);
  return `${days} ${t("d")} ${hours % 24} ${t("h")}`;
}

function resultFor(promise) {
  return promise.then(
    (res) => (res?.ok
      ? { ok: true, data: res.data }
      : { ok: false, error: res?.error || { code: "UNKNOWN", message: "The check failed." } }),
    (err) => ({ ok: false, error: { code: "UNKNOWN", message: err?.message || "The check failed." } }),
  );
}

/** Animated radial gauge used for the score ring and the device vitals. */
function Gauge({ size = 64, stroke = 5, progress = 0, tone = "ok", children, running = false, reduced = false }) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(1, progress));
  return (
    <div className={`sc-gauge sc-gauge-${tone}${running ? " is-running" : ""}`} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle className="sc-gauge-track" cx={size / 2} cy={size / 2} r={radius} strokeWidth={stroke} fill="none" />
        <motion.circle
          className="sc-gauge-fill"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={false}
          animate={{ strokeDashoffset: circumference * (1 - clamped) }}
          transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 120, damping: 24 }}
        />
      </svg>
      <div className="sc-gauge-center">{children}</div>
    </div>
  );
}

function Switch({ checked, disabled, onChange, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`sc-switch${checked ? " is-on" : ""}`}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      <span className="sc-switch-thumb" />
    </button>
  );
}

export function SystemCare() {
  const { t, locale, dir } = useLanguage();
  const reduceMotion = useReducedMotion();
  const vault = useVault();
  const maintenance = useMaintenance();
  const unlocked = vault.state === VAULT_STATE.UNLOCKED;

  const vaultRef = useRef(vault);
  vaultRef.current = vault;
  const maintenanceRef = useRef(maintenance);
  maintenanceRef.current = maintenance;

  const [results, setResults] = useState({});
  const [probes, setProbes] = useState({ privacy: null, clipboard: null, rotation: null });
  const [scan, setScan] = useState(null);
  const [platform, setPlatform] = useState(null);
  const [running, setRunning] = useState(false);
  const [lastRun, setLastRun] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [action, setAction] = useState(null);
  const [selectedFolders, setSelectedFolders] = useState([]);
  const [busyAction, setBusyAction] = useState(null);

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
          `${device.cpuCount} ${t(device.cpuCount === 1 ? "logical CPU" : "logical CPUs")}`,
          `${t("RAM")} ${formatBytes(device.memoryUsed)} / ${formatBytes(device.memoryTotal)}`,
          disk ? `${formatBytes(disk.freeBytes)} ${t("free of")} ${formatBytes(disk.totalBytes)}` : t("Disk free space unavailable"),
          `${t("Up")} ${formatDuration(device.uptimeSeconds, t)}`,
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
          if (!res.ok) return { status: "warning", detail: res.error.message || t("Rotation preflight unavailable."), data: null };
          const data = res.data || {};
          if (data.pendingRotation) {
            return { status: "warning", detail: `${t("An unfinished rotation is pending")}: ${data.pendingRotationId || t("unknown id")}.`, data };
          }
          return {
            status: "healthy",
            detail: `${data.totalRecords || 0} ${t("stored records ready")} · ${data.activeSessions || 0} ${t("active session(s)")} · ${data.kdfId || "PBKDF2-SHA256"}`,
            data,
          };
        }
        case "clipboard": {
          const res = await resultFor(v.clipboardStatus());
          if (!res.ok) return { status: "warning", detail: res.error.message || t("Clipboard status unavailable."), data: null };
          const data = res.data || {};
          if (!data.supported) {
            return { status: "warning", detail: t("No clipboard adapter is available in this environment."), data };
          }
          return {
            status: "healthy",
            detail: `${data.armed ? t("Lease armed") : t("Idle")} · ${data.activeLeases || 0} ${t("active lease(s)")} · ${t("timers")}: ${(data.timerChoices || []).join(", ") || "—"}`,
            data,
          };
        }
        case "privacy": {
          const res = await resultFor(v.sessionPrivacyPolicy());
          if (!res.ok) return { status: "warning", detail: res.error.message || t("Session privacy policy unavailable."), data: null };
          const values = res.data?.values || {};
          const warnings = [];
          if (!values.lockOnSuspend) warnings.push(t("sleep lock off"));
          if (!values.clearClipboard) warnings.push(t("clipboard clearing off"));
          const detail = `${t("Idle lock")} ${formatDuration(values.idleLockSeconds, t)} · ${t("Sleep lock")}: ${values.lockOnSuspend ? t("on") : t("off")} · ${t("Clipboard")}: ${values.clearClipboard ? t("clear") : t("keep")} · ${t("Retention")} ${values.retentionDays || 0} ${t("days")}`;
          return { status: warnings.length ? "warning" : "healthy", detail, data: values };
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
      if (scanData) {
        // Default the selection to every cleanable folders that holds data, so
        // the first cleanup is one confirmed click; the user can narrow it.
        setSelectedFolders((current) => {
          const known = new Set(scanData.locations.map((entry) => entry.id));
          const kept = current.filter((id) => known.has(id));
          if (kept.length) return kept;
          return scanData.locations.filter((entry) => entry.cleanable && entry.bytes > 0).map((entry) => entry.id);
        });
      }
      const next = {};
      const nextProbes = { privacy: null, clipboard: null, rotation: null };
      for (const check of CHECKS) {
        try {
          const outcome = await runCheck(check.id, scanData, info);
          next[check.id] = { status: outcome.status, detail: outcome.detail };
          if (check.id === "privacy") nextProbes.privacy = outcome.data || null;
          if (check.id === "clipboard") nextProbes.clipboard = outcome.data || null;
          if (check.id === "rotation") nextProbes.rotation = outcome.data || null;
        } catch (err) {
          // A single failing probe must not blank the whole dashboard.
          next[check.id] = { status: "error", detail: err?.message || t("This check could not run.") };
        }
      }
      setResults(next);
      setProbes(nextProbes);
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

  const selectedBytes = useMemo(() => {
    if (!scan) return 0;
    const selected = new Set(selectedFolders);
    return scan.locations
      .filter((entry) => selected.has(entry.id) && entry.cleanable)
      .reduce((sum, entry) => sum + entry.bytes, 0);
  }, [scan, selectedFolders]);

  const toggleFolder = useCallback((id) => {
    setSelectedFolders((current) => (current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id]));
  }, []);

  const persistClean = useCallback(async () => {
    const ids = selectedFolders.length ? [...selectedFolders] : undefined;
    setCleaning(true);
    setAction(null);
    const res = await resultFor(maintenanceRef.current.clean(true, ids));
    setCleaning(false);
    setConfirmOpen(false);
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
  }, [selectedFolders, t]);

  const openPanel = useCallback(async (panel) => {
    setAction(null);
    setBusyAction(`panel:${panel}`);
    const res = await resultFor(maintenanceRef.current.openPanel(panel));
    setBusyAction(null);
    if (!res.ok) {
      setAction({ tone: "err", text: res.error.message || t("The Windows page could not be opened.") });
      return;
    }
    setAction({ tone: "ok", text: t("Opened the native Windows maintenance page.") });
  }, [t]);

  const lockVault = useCallback(async () => {
    setBusyAction("lock");
    setAction(null);
    try {
      await vaultRef.current.lock();
      await vaultRef.current.refresh();
      // Re-scan first: runAll clears the action banner, so the confirmation
      // must be set afterwards or it would be wiped immediately.
      await runAll();
      setAction({ tone: "ok", text: t("Vault locked. Encrypted data stays sealed on this machine.") });
    } finally {
      setBusyAction(null);
    }
  }, [runAll, t]);

  const clearClipboard = useCallback(async () => {
    setBusyAction("clipboard");
    setAction(null);
    const res = await resultFor(vaultRef.current.clipboardClearNow());
    if (!res.ok) {
      setBusyAction(null);
      const text = res.error.code === "NOT_FOUND"
        ? t("No active clipboard lease to clear. Copy a secret with Clipboard Guard first.")
        : res.error.message || t("The clipboard could not be cleared.");
      setAction({ tone: "warn", text });
      return;
    }
    const status = await resultFor(vaultRef.current.clipboardStatus());
    if (status.ok) {
      setProbes((current) => ({ ...current, clipboard: status.data }));
      setResults((current) => ({
        ...current,
        clipboard: {
          status: "healthy",
          detail: `${status.data.armed ? t("Lease armed") : t("Idle")} · ${status.data.activeLeases || 0} ${t("active lease(s)")} · ${t("timers")}: ${(status.data.timerChoices || []).join(", ") || "—"}`,
        },
      }));
    }
    setBusyAction(null);
    setAction({ tone: "ok", text: t("Clipboard cleared. The leased value was removed from the system clipboard.") });
  }, [t]);

  const updatePrivacy = useCallback(async (patch) => {
    setBusyAction("privacy");
    setAction(null);
    const res = await resultFor(vaultRef.current.sessionPrivacyUpdate(patch));
    setBusyAction(null);
    if (!res.ok) {
      setAction({ tone: "err", text: res.error.message || t("The privacy policy could not be updated.") });
      return;
    }
    const values = res.data?.values || {};
    setProbes((current) => ({ ...current, privacy: values }));
    const warnings = [];
    if (!values.lockOnSuspend) warnings.push(t("sleep lock off"));
    if (!values.clearClipboard) warnings.push(t("clipboard clearing off"));
    setResults((current) => ({
      ...current,
      privacy: {
        status: warnings.length ? "warning" : "healthy",
        detail: `${t("Idle lock")} ${formatDuration(values.idleLockSeconds, t)} · ${t("Sleep lock")}: ${values.lockOnSuspend ? t("on") : t("off")} · ${t("Clipboard")}: ${values.clearClipboard ? t("clear") : t("keep")} · ${t("Retention")} ${values.retentionDays || 0} ${t("days")}`,
      },
    }));
    setAction({ tone: "ok", text: t("Privacy policy updated and applied to the live session.") });
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

  const device = scan?.device || null;
  const memoryPercent = device && device.memoryTotal > 0 ? device.memoryUsed / device.memoryTotal : 0;
  const diskPercent = device?.disk && device.disk.totalBytes > 0 ? device.disk.usedBytes / device.disk.totalBytes : null;
  const gaugeTone = (percent) => (percent === null ? "idle" : percent >= 0.92 ? "err" : percent >= 0.75 ? "warn" : "ok");
  const privacyValues = probes.privacy;
  const clipboardData = probes.clipboard;
  const rotationData = probes.rotation;
  const pendingRotation = Boolean(rotationData?.pendingRotation);
  const canClearClipboard = unlocked && Boolean(clipboardData?.supported) && (clipboardData?.activeLeases > 0 || clipboardData?.armed);

  const cardVariants = reduceMotion
    ? { hidden: {}, show: {} }
    : {
        hidden: { opacity: 0, y: 16 },
        show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 260, damping: 26 } },
      };

  const renderAction = (check) => {
    switch (check.id) {
      case "device":
        return (
          <button type="button" className="sc-button sc-button-small" onClick={runAll} disabled={running || cleaning}>
            <Mark name="refresh" />
            {running ? t("Scanning…") : t("Re-scan device")}
          </button>
        );
      case "storage":
        return (
          <div className="sc-storage-controls">
            <ul className="sc-folder-picker" aria-label={t("App temp folders")}>
              {(scan?.locations || []).filter((entry) => entry.cleanable).map((entry) => (
                <li key={entry.id}>
                  <label className={entry.bytes > 0 ? "has-data" : ""}>
                    <input
                      type="checkbox"
                      checked={selectedFolders.includes(entry.id)}
                      onChange={() => toggleFolder(entry.id)}
                      disabled={cleaning || !maintenance.available}
                    />
                    <span className="sc-folder-name"><Mark name="folder" /> {t(entry.label)}</span>
                    <small>{entry.files} {t("files")} · {formatBytes(entry.bytes)}</small>
                  </label>
                </li>
              ))}
              {!scan && <li className="sc-folder-empty">{t("Waiting for the first scan.")}</li>}
            </ul>
            <button
              type="button"
              className="sc-button sc-button-small sc-button-danger"
              onClick={() => setConfirmOpen(true)}
              disabled={!maintenance.available || running || cleaning || selectedFolders.length === 0 || selectedBytes === 0}
            >
              <Mark name="trash" />
              {t("Clean selected")} ({selectedFolders.length}) · {formatBytes(selectedBytes)}
            </button>
          </div>
        );
      case "vault":
        return unlocked ? (
          <button type="button" className="sc-button sc-button-small" onClick={lockVault} disabled={busyAction === "lock" || vault.busy}>
            <Mark name="lock" />
            {busyAction === "lock" ? t("Locking…") : t("Lock Vault Now")}
          </button>
        ) : (
          <Link to={SCREENS.SECURE_ACCESS_LOGIN} state={{ returnTo: SCREENS.SYSTEM_CARE }} className="sc-button sc-button-small sc-button-primary">
            <Mark name="unlock" />
            {t("Unlock Vault")}
          </Link>
        );
      case "keys":
        return (
          <Link to={SCREENS.KEY_FORGE} className="sc-button sc-button-small">
            <Mark name="key" />
            {t("Open Key Forge")}
          </Link>
        );
      case "rotation":
        return (
          <Link
            to={SCREENS.VAULT_KEY_ROTATION}
            state={{ fromRepair: true, resume: pendingRotation }}
            className={`sc-button sc-button-small${pendingRotation ? " sc-button-primary" : ""}`}
          >
            <Mark name="refresh" />
            {pendingRotation ? t("Resume rotation") : t("Open Key Rotation")}
          </Link>
        );
      case "clipboard":
        return (
          <button
            type="button"
            className="sc-button sc-button-small"
            onClick={clearClipboard}
            disabled={!canClearClipboard || busyAction === "clipboard"}
            title={canClearClipboard ? t("Clear the leased value from the system clipboard") : t("No active clipboard lease")}
          >
            <Mark name="trash" />
            {busyAction === "clipboard" ? t("Clearing…") : t("Clear clipboard now")}
          </button>
        );
      case "privacy":
        return (
          <div className="sc-privacy-controls" aria-busy={busyAction === "privacy"}>
            <div className="sc-privacy-row">
              <span className="sc-privacy-label">{t("Idle auto-lock")}</span>
              <select
                className="sc-select"
                value={privacyValues?.idleLockSeconds ?? 600}
                disabled={!unlocked || busyAction === "privacy"}
                onChange={(event) => updatePrivacy({ idleLockSeconds: Number(event.target.value) })}
                aria-label={t("Idle auto-lock")}
              >
                {IDLE_CHOICES.map((choice) => (
                  <option key={choice.seconds} value={choice.seconds}>{t(choice.label)}</option>
                ))}
                {privacyValues && !IDLE_CHOICES.some((choice) => choice.seconds === privacyValues.idleLockSeconds) && (
                  <option value={privacyValues.idleLockSeconds}>{formatDuration(privacyValues.idleLockSeconds, t)}</option>
                )}
              </select>
            </div>
            <div className="sc-privacy-row">
              <span className="sc-privacy-label">{t("Lock on sleep / screen lock")}</span>
              <Switch
                checked={Boolean(privacyValues?.lockOnSuspend)}
                disabled={!unlocked || busyAction === "privacy"}
                onChange={(next) => updatePrivacy({ lockOnSuspend: next })}
                label={t("Lock on sleep / screen lock")}
              />
            </div>
            <div className="sc-privacy-row">
              <span className="sc-privacy-label">{t("Clear clipboard when the timer fires")}</span>
              <Switch
                checked={Boolean(privacyValues?.clearClipboard)}
                disabled={!unlocked || busyAction === "privacy"}
                onChange={(next) => updatePrivacy({ clearClipboard: next })}
                label={t("Clear clipboard when the timer fires")}
              />
            </div>
            <div className="sc-privacy-row">
              <span className="sc-privacy-label">{t("Journal retention")}</span>
              <select
                className="sc-select"
                value={privacyValues?.retentionDays ?? 90}
                disabled={!unlocked || busyAction === "privacy"}
                onChange={(event) => updatePrivacy({ retentionDays: Number(event.target.value) })}
                aria-label={t("Journal retention")}
              >
                {RETENTION_CHOICES.map((days) => (
                  <option key={days} value={days}>{days} {t("days")}</option>
                ))}
                {privacyValues && !RETENTION_CHOICES.includes(privacyValues.retentionDays) && (
                  <option value={privacyValues.retentionDays}>{privacyValues.retentionDays} {t("days")}</option>
                )}
              </select>
            </div>
            {!unlocked && <small className="sc-privacy-note">{t("Unlock the vault to change the live policy.")}</small>}
          </div>
        );
      case "integrity":
        return (
          <Link to={SCREENS.HASH_INTEGRITY} className="sc-button sc-button-small">
            <Mark name="layers" />
            {t("Open Hash & Integrity")}
          </Link>
        );
      case "journal":
        return (
          <Link to={SCREENS.SECURITY_ACTIVITY} className="sc-button sc-button-small">
            <Mark name="activity" />
            {t("Open Security Activity")}
          </Link>
        );
      case "windows":
        return (
          <div className="sc-panel-grid sc-panel-grid-inline">
            {WINDOWS_PANELS.map((panel) => (
              <button
                key={panel.id}
                type="button"
                className="sc-panel"
                onClick={() => openPanel(panel.id)}
                disabled={!maintenance.available || !platform?.windows || busyAction === `panel:${panel.id}`}
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
        );
      default:
        return null;
    }
  };

  return (
    <main className="crypt-entry crypt-hub systemcare-screen" dir={dir} lang={locale} data-screen="SYSTEM_CARE" data-section="repair" data-vault-state={vault.state}>
      <div className="crypt-atmosphere" aria-hidden="true" />
      <div className="hub-shell">
        <header className="sc-header">
          <div>
            <p className="sc-eyebrow">{t("Local repair & maintenance")}</p>
            <h1>{t("Repair")}</h1>
            <p>{t("Ten real services to check this device, clean app temp files and repair your vault session. Nothing leaves this machine.")}</p>
          </div>
          <div className={`sc-score${summary.attention ? " has-attention" : ""}${running ? " is-running" : ""}`} aria-label={t("Repair score")}>
            <Gauge size={92} stroke={6} progress={summary.total ? summary.healthy / summary.total : 0} tone={summary.attention ? "warn" : "ok"} running={running} reduced={reduceMotion}>
              <strong>{summary.healthy}</strong>
              <span>/{summary.total}</span>
            </Gauge>
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
              <p>{t("Repair needs the desktop app to measure temp files and open Windows maintenance pages.")}</p>
            </div>
          </div>
        )}

        {action && (
          <div className={`sc-banner sc-banner-${action.tone === "ok" ? "ok" : action.tone === "warn" ? "warn" : "err"}`} role="status">
            <Mark name={action.tone === "ok" ? "badge" : "alert"} />
            <p>{action.text}</p>
          </div>
        )}

        <section className="sc-summary" aria-label={t("Repair summary")}>
          {device && (
            <div className="sc-vitals">
              <div className="sc-vital">
                <Gauge size={62} stroke={5} progress={memoryPercent} tone={gaugeTone(memoryPercent)} reduced={reduceMotion}>
                  <strong>{Math.round(memoryPercent * 100)}%</strong>
                </Gauge>
                <div className="sc-vital-copy">
                  <span>{t("Memory")}</span>
                  <small>{formatBytes(device.memoryUsed)} / {formatBytes(device.memoryTotal)}</small>
                </div>
              </div>
              <div className="sc-vital">
                <Gauge size={62} stroke={5} progress={diskPercent ?? 0} tone={gaugeTone(diskPercent)} reduced={reduceMotion}>
                  <strong>{diskPercent === null ? "—" : `${Math.round(diskPercent * 100)}%`}</strong>
                </Gauge>
                <div className="sc-vital-copy">
                  <span>{t("Disk")}</span>
                  <small>{device.disk ? `${formatBytes(device.disk.freeBytes)} ${t("free")}` : t("Disk free space unavailable")}</small>
                </div>
              </div>
              <div className="sc-vital-facts">
                <span className="sc-chip"><Mark name="chip" /> {device.cpuCount}× {t("CPU")}</span>
                <span className="sc-chip"><Mark name="clock" /> {t("Up")} {formatDuration(device.uptimeSeconds, t)}</span>
                <span className="sc-chip" title={device.cpuModel}><Mark name="monitor" /> {device.cpuModel.length > 34 ? `${device.cpuModel.slice(0, 34)}…` : device.cpuModel}</span>
              </div>
            </div>
          )}
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
              onClick={() => setConfirmOpen(true)}
              disabled={!maintenance.available || running || cleaning || selectedFolders.length === 0 || selectedBytes === 0}
            >
              <Mark name="trash" />
              {t("Clean selected")} ({selectedFolders.length})
            </button>
          </div>
          <p className="sc-timestamp">
            {lastRun ? `${t("Last run")}: ${new Date(lastRun).toLocaleString()}` : t("Not run yet")}
            {platform ? ` · ${t("Platform")}: ${platform.platform}${platform.windows ? " (Windows)" : ""}` : ""}
          </p>
        </section>

        {confirmOpen && (
          <div className="sc-confirm" role="alertdialog" aria-labelledby="sc-confirm-title">
            <div>
              <h2 id="sc-confirm-title">{t("Clean the selected app temp folders?")}</h2>
              <p>
                {t("This removes only KnouxCrypt's own decrypted-document temp files, cache folders and logs. Your vault, encrypted files and Windows files are not touched. The next scan will show the result.")}
                {` ${t("Selected")}: ${selectedFolders.length} ${t("folder(s)")} · ${formatBytes(selectedBytes)}.`}
              </p>
            </div>
            <div className="sc-confirm-actions">
              <button type="button" className="sc-button" onClick={() => setConfirmOpen(false)} disabled={cleaning}>
                {t("Cancel")}
              </button>
              <button type="button" className="sc-button sc-button-danger" onClick={persistClean} disabled={cleaning}>
                <Mark name="trash" />
                {cleaning ? t("Cleaning…") : t("Clean now")}
              </button>
            </div>
          </div>
        )}

        <section className="sc-checks" aria-label={t("Repair services")}>
          <div className="sc-section-head">
            <h2>{t("Repair services")}</h2>
            <small>{summary.answered} / {summary.total} {t("answered")}</small>
          </div>
          <motion.div
            className="sc-check-grid"
            variants={reduceMotion ? undefined : { hidden: {}, show: { transition: { staggerChildren: 0.05 } } }}
            initial={reduceMotion ? false : "hidden"}
            animate="show"
          >
            {CHECKS.map((check) => {
              const result = results[check.id];
              const status = result?.status || "pending";
              const tone = toneFor(status);
              return (
                <motion.article
                  key={check.id}
                  variants={cardVariants}
                  className={`sc-check-card sc-tone-${tone}${check.wide ? " sc-check-wide" : ""}`}
                  data-check={check.id}
                  data-status={status}
                >
                  <span className="sc-check-icon"><Mark name={check.icon} /></span>
                  <div className="sc-check-copy">
                    <div className="sc-check-title">
                      <strong>{t(check.label)}</strong>
                      <span className="sc-check-badge">{t(STATUS_COPY[status] || "Pending")}</span>
                    </div>
                    <p>{t(check.description)}</p>
                    <small className="sc-check-detail">{result?.detail || t("Waiting for the first run.")}</small>
                    <div className="sc-check-actions">{renderAction(check)}</div>
                  </div>
                </motion.article>
              );
            })}
          </motion.div>
        </section>

        <p className="sc-fineprint">
          {t("The Windows buttons open the real Windows 10/11 settings pages. KnouxCrypt does not uninstall programs, change OS settings or run a system repair on your behalf. Cleaning is limited to this app's own temporary and cache folders, and every cleanup needs explicit confirmation.")}
        </p>
      </div>
    </main>
  );
}

export default SystemCare;