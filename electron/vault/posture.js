"use strict";

/**
 * Offline Security Advisor (task 34).
 *
 * This module does not scan the device. It cannot: the application has no
 * privileged access to OS settings, firmware, patch levels or antivirus state,
 * and inventing a "security score" from nothing would be a fabricated claim.
 *
 * What it does instead is real and verifiable: it reads the *actual* local
 * state this application owns — whether the vault is enrolled, whether a
 * session is live, the real privacy preferences, whether backups exist, whether
 * a transfer listener is bound, whether clipboard leases are armed — and maps
 * that to a checklist where each row is either OBSERVED (backed by a real
 * value) or MANUAL (a topic the user must check on the device themselves).
 *
 * Every row carries its own evidence string. A row is never marked as "passed"
 * by a scan that did not happen.
 */
const { badInput } = require("./errors");

const CHECK_KINDS = Object.freeze({ OBSERVED: "OBSERVED", MANUAL: "MANUAL" });
const FILTERS = Object.freeze(["All", "Vault", "Privacy", "Recovery", "Device"]);

// Topics that are genuinely outside this process's reach. They are presented as
// a reading list, never as an automated assessment.
const MANUAL_TOPICS = Object.freeze([
  {
    id: "os-updates",
    category: "Device",
    title: "Operating system updates",
    guidance:
      "Open your system settings and confirm the OS and firmware are up to date. KnouxCrypt cannot read your patch level.",
  },
  {
    id: "disk-encryption",
    category: "Device",
    title: "Full-disk encryption",
    guidance:
      "Check whether the whole disk is encrypted (BitLocker, FileVault, LUKS). KnouxCrypt protects individual files, not the whole volume.",
  },
  {
    id: "screen-lock",
    category: "Device",
    title: "Screen lock and idle timeout",
    guidance:
      "Confirm a short screen-lock delay is set. KnouxCrypt locks its own vault on idle but cannot lock the operating system.",
  },
  {
    id: "account-integrity",
    category: "Device",
    title: "Account and login review",
    guidance:
      "Review local accounts and remove ones you do not recognise. KnouxCrypt has no visibility into OS accounts.",
  },
  {
    id: "network-exposure",
    category: "Device",
    title: "Network exposure",
    guidance:
      "Review open ports and firewall rules yourself. KnouxCrypt only ever binds a loopback port when you start a local transfer.",
  },
]);

class SecurityAdvisor {
  /**
   * @param {object} options
   * @param {() => Promise<object>} options.status            vault status snapshot
   * @param {() => object}          options.preferences       privacy preferences snapshot
   * @param {() => object}          options.runtimeSignals    live signals (transfer, clipboard, backups)
   */
  constructor(options = {}) {
    if (typeof options.status !== "function") throw badInput("SecurityAdvisor needs a status provider");
    this.getStatus = options.status;
    this.getPreferences = options.preferences || (() => ({ values: {} }));
    this.getSignals = options.runtimeSignals || (() => ({}));
  }

  filters() {
    return [...FILTERS];
  }

  manualTopics() {
    return MANUAL_TOPICS.map((t) => ({ ...t, kind: CHECK_KINDS.MANUAL, status: "manual" }));
  }

  /**
   * Build the review. Every OBSERVED row quotes the real value it read, so a
   * reader can tell an observation from a manual reminder at a glance.
   */
  async review({ filter = "All" } = {}) {
    if (!FILTERS.includes(filter)) throw badInput(`Unknown filter "${filter}"`);
    const status = (await this.getStatus()) || {};
    const prefs = (this.getPreferences() || {}).values || {};
    const signals = this.getSignals() || {};

    const observed = [];

    observed.push({
      id: "vault-enrolled",
      category: "Vault",
      title: "Vault enrollment",
      kind: CHECK_KINDS.OBSERVED,
      status: status.enrolled ? "pass" : "attention",
      value: status.enrolled ? "Enrolled" : "Not enrolled",
      evidence: "vault:status -> enrolled",
      guidance: status.enrolled
        ? "A vault exists on this device and is protected by your password."
        : "No vault exists yet. Enroll to protect files with a real key.",
    });

    observed.push({
      id: "vault-locked",
      category: "Vault",
      title: "Session state",
      kind: CHECK_KINDS.OBSERVED,
      status: status.locked === false ? "attention" : "pass",
      value: status.locked === false ? "Unlocked" : "Locked",
      evidence: "vault:status -> locked / activeSessions",
      guidance:
        status.locked === false
          ? "An unlocked session is live. Lock it when you step away."
          : "The vault is locked, so no key is held in memory.",
    });

    observed.push({
      id: "idle-lock",
      category: "Vault",
      title: "Idle auto-lock",
      kind: CHECK_KINDS.OBSERVED,
      status: prefs.lockOnSuspend ? "pass" : "attention",
      value: `Idle lock ${prefs.idleLockSeconds ?? "—"}s · lock on suspend ${prefs.lockOnSuspend ? "on" : "off"}`,
      evidence: "privacy-preferences.json -> idleLockSeconds, lockOnSuspend",
      guidance: prefs.lockOnSuspend
        ? "The vault locks on suspend and after the idle window you chose."
        : "Lock-on-suspend is off. Consider enabling it in Privacy preferences.",
    });

    observed.push({
      id: "clipboard-clear",
      category: "Privacy",
      title: "Clipboard clearing preference",
      kind: CHECK_KINDS.OBSERVED,
      status: prefs.clearClipboard ? "pass" : "attention",
      value: prefs.clearClipboard ? "Preferred on" : "Preferred off",
      evidence: "privacy-preferences.json -> clearClipboard",
      guidance: prefs.clearClipboard
        ? "Clipboard Guard prefers to clear leased values when the preference allows it."
        : "Clipboard clearing is off. Timed leases still require per-copy confirmation.",
    });

    observed.push({
      id: "activity-retention",
      category: "Privacy",
      title: "Activity log retention",
      kind: CHECK_KINDS.OBSERVED,
      status: "pass",
      value: `Keep ${prefs.retentionDays ?? "—"} day(s)`,
      evidence: "privacy-preferences.json -> retentionDays",
      guidance: "The local activity log is kept for the window you configured.",
    });

    observed.push({
      id: "backups",
      category: "Recovery",
      title: "Encrypted backups",
      kind: CHECK_KINDS.OBSERVED,
      status: (signals.backups || 0) > 0 ? "pass" : "attention",
      value: `${signals.backups || 0} backup file(s)`,
      evidence: "vault-store/backups listing",
      guidance:
        (signals.backups || 0) > 0
          ? "Encrypted backups exist. Verify you can restore one before you need it."
          : "No encrypted backup exists yet. Create one from Recovery.",
    });

    observed.push({
      id: "transfer-listener",
      category: "Privacy",
      title: "Local transfer listener",
      kind: CHECK_KINDS.OBSERVED,
      status: signals.transferListening ? "attention" : "pass",
      value: signals.transferListening ? `Listening on ${signals.transferAddress || "loopback"}` : "Not listening",
      evidence: "vault:transfer-state -> listening",
      guidance: signals.transferListening
        ? "A local transfer listener is open. Stop it when the transfer is done."
        : "No transfer listener is bound, so nothing is waiting for a peer.",
    });

    observed.push({
      id: "clipboard-leases",
      category: "Privacy",
      title: "Armed clipboard leases",
      kind: CHECK_KINDS.OBSERVED,
      status: (signals.clipboardLeases || 0) > 0 ? "attention" : "pass",
      value: `${signals.clipboardLeases || 0} armed`,
      evidence: "ClipboardGuard status -> leases",
      guidance:
        (signals.clipboardLeases || 0) > 0
          ? "One or more clipboard leases are armed and will clear on expiry."
          : "No clipboard lease is armed.",
    });

    const manual = this.manualTopics();
    const rows = [...observed, ...manual].filter((r) => filter === "All" || r.category === filter);
    const attention = observed.filter((r) => r.status === "attention").length;

    return {
      filter,
      generatedAt: new Date().toISOString(),
      rows,
      counts: {
        observed: observed.length,
        manual: manual.length,
        attention,
      },
      // The report explicitly states that nothing was scanned, so a reader
      // cannot mistake the checklist for an automated device audit.
      disclaimer:
        "This review reports only the state KnouxCrypt itself owns. It does not scan the operating system, installed software, permissions or the network.",
    };
  }
}

module.exports = { SecurityAdvisor, CHECK_KINDS, FILTERS, MANUAL_TOPICS };
