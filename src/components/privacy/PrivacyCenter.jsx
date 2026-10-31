import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useLanguage } from "../../i18n/Language";
import { SCREENS } from "../../config/screens";
import { StagEmblem } from "../entry/StagEmblem";
import { Mark, PreviewSheet, CapabilityCard } from "../security/ScreenUI";
import { useVault, VAULT_STATE } from "../../hooks/useVault";
import "./privacy.css";

const IDLE_OPTIONS = [60, 300, 600, 1800];
const RETENTION_OPTIONS = [7, 30, 90, 365];

export function PrivacyCenter() {
  const { t, locale, dir, setLocale } = useLanguage();
  const vault = useVault();
  const unlocked = vault.state === VAULT_STATE.UNLOCKED;
  const [biometric, setBiometric] = useState(false);
  const [sheet, setSheet] = useState(null);
  const [prefs, setPrefs] = useState(null);
  const [prefsError, setPrefsError] = useState(null);
  const [saved, setSaved] = useState(false);

  const loadPrefs = useCallback(async () => {
    const res = await vault.preferencesGet();
    if (res?.ok) {
      setPrefs(res.data.values);
      setPrefsError(null);
    } else {
      setPrefsError(res?.error?.message || "Preferences are unavailable");
    }
  }, [vault]);

  useEffect(() => {
    loadPrefs();
  }, [loadPrefs]);

  // Real, persisted settings. These only take effect when the vault is
  // unlocked, because changing them re-arms the live session idle timer.
  const applyPrefs = useCallback(
    async (patch) => {
      setSaved(false);
      const res = await vault.preferencesUpdate(patch);
      if (res?.ok) {
        setPrefs(res.data.values);
        setPrefsError(null);
        setSaved(true);
      } else {
        setPrefsError(res?.error?.message || "Could not save preferences");
      }
    },
    [vault],
  );
  return (
    <main
      className="privacy-screen"
      dir={dir}
      lang={locale}
      data-screen="PRIVACY"
    >
      <div className="privacy-shell">
        <Link className="privacy-back" to={SCREENS.HOME}>
          ‹ {t("Back to Home")}
        </Link>
        <header className="privacy-header">
          <StagEmblem />
          <h1>{t("Privacy Center")}</h1>
          <p>{t("Your privacy. Your control.")}</p>
        </header>
        <Link
          className="privacy-recovery"
          to={SCREENS.BACKUP}
          state={{ returnTo: SCREENS.PRIVACY }}
          aria-describedby="privacy-recovery-note"
        >
          <span className="privacy-recovery-art" aria-hidden="true">
            <Mark name="shield" />
            <i />
            <Mark name="key" />
          </span>
          <span className="privacy-recovery-copy">
            <strong>{t("Recovery & Backup")}</strong>
            <small>{t("Review your recovery options")}</small>
            <em>{t("Visual preview")}</em>
          </span>
          <Mark name="chevron" />
        </Link>
        <p id="privacy-recovery-note" className="privacy-demo-caption">
          {t("Encrypted backups are created on this device. No cloud destination is connected.")}
        </p>
        <CapabilityCard id="PRIVACY_CENTER" />
        <section
          className="privacy-group"
          aria-labelledby="privacy-local-title"
        >
          <h2 id="privacy-local-title">{t("Local Protection")}</h2>
          <div className="privacy-panel">
            <label className="privacy-row">
              <span className="privacy-row-icon">
                <Mark name="lock" />
              </span>
              <span>
                <strong>{t("Auto-lock when idle")}</strong>
                <small>
                  {prefs
                    ? `${Math.round(prefs.idleLockSeconds / 60)} ${t("minutes")}`
                    : t("Loading…")}
                </small>
              </span>
              <select
                dir="ltr"
                disabled={!unlocked || !prefs}
                value={prefs?.idleLockSeconds ?? ""}
                onChange={(e) => applyPrefs({ idleLockSeconds: Number(e.target.value) })}
                aria-label={t("Auto-lock when idle")}
              >
                {IDLE_OPTIONS.map((seconds) => (
                  <option key={seconds} value={seconds}>
                    {Math.round(seconds / 60)} {t("min")}
                  </option>
                ))}
              </select>
            </label>
            <div className="privacy-row">
              <span className="privacy-row-icon">
                <Mark name="shield" />
              </span>
              <span>
                <strong>{t("Lock when the device sleeps or locks")}</strong>
                <small>{t("Enforced through the operating system power events")}</small>
              </span>
              <button
                type="button"
                className="privacy-switch"
                role="switch"
                disabled={!unlocked || !prefs}
                aria-checked={Boolean(prefs?.lockOnSuspend)}
                aria-label={t("Lock when the device sleeps or locks")}
                onClick={() => applyPrefs({ lockOnSuspend: !prefs?.lockOnSuspend })}
              >
                <i />
              </button>
            </div>
            <label className="privacy-row">
              <span className="privacy-row-icon">
                <Mark name="settings" />
              </span>
              <span>
                <strong>{t("Keep activity history for")}</strong>
                <small>{prefs ? `${prefs.retentionDays} ${t("days")}` : t("Loading…")}</small>
              </span>
              <select
                dir="ltr"
                disabled={!unlocked || !prefs}
                value={prefs?.retentionDays ?? ""}
                onChange={(e) => applyPrefs({ retentionDays: Number(e.target.value) })}
                aria-label={t("Keep activity history for")}
              >
                {RETENTION_OPTIONS.map((days) => (
                  <option key={days} value={days}>
                    {days} {t("days")}
                  </option>
                ))}
              </select>
            </label>
            <p className="privacy-demo-caption" role="status">
              {prefsError
                ? prefsError
                : !unlocked
                  ? t("Unlock the vault to change these settings.")
                  : saved
                    ? t("Saved. The session auto-lock window was updated.")
                    : t("These settings are stored on this device only.")}
            </p>
          </div>
        </section>
        <section
          className="privacy-group"
          aria-labelledby="privacy-access-title"
        >
          <h2 id="privacy-access-title">{t("Security & Access")}</h2>
          <div className="privacy-panel">
            <div className="privacy-row">
              <span
                className="privacy-row-icon privacy-biometric-ring"
                key={String(biometric)}
              >
                <Mark name="lock" />
              </span>
              <span>
                <strong>{t("Biometric Unlock")}</strong>
                <small>{t("Visual switch only · no biometric access")}</small>
              </span>
              <button
                type="button"
                className="privacy-switch"
                role="switch"
                aria-label={t("Biometric Unlock visual preview")}
                aria-checked={biometric}
                onClick={() => setBiometric((value) => !value)}
              >
                <i />
              </button>
            </div>
            <button
              type="button"
              className="privacy-row"
              onClick={() => setSheet("Passkeys")}
            >
              <span className="privacy-row-icon">
                <Mark name="key" />
              </span>
              <span>
                <strong>{t("Passkeys")}</strong>
                <small>{t("Explore device sign-in options")}</small>
              </span>
              <Mark name="chevron" />
            </button>
            <button
              type="button"
              className="privacy-row"
              onClick={() => setSheet("GitHub Connections")}
            >
              <span className="privacy-row-icon">
                <Mark name="shield" />
              </span>
              <span>
                <strong>{t("GitHub Connections")}</strong>
                <small>{t("Review connection previews")}</small>
              </span>
              <Mark name="chevron" />
            </button>
          </div>
        </section>
        <section
          className="privacy-group"
          aria-labelledby="privacy-settings-title"
        >
          <h2 id="privacy-settings-title">{t("Privacy")}</h2>
          <div className="privacy-panel">
            <button
              type="button"
              className="privacy-row"
              onClick={() => setSheet("Privacy Checks")}
            >
              <span className="privacy-row-icon">
                <Mark name="shield" />
              </span>
              <span>
                <strong>{t("Privacy Checks")}</strong>
                <small>{t("Review the visual privacy checklist")}</small>
              </span>
              <Mark name="chevron" />
            </button>
            <button
              type="button"
              className="privacy-row"
              onClick={() => setSheet("Language")}
            >
              <span className="privacy-row-icon">
                <Mark name="settings" />
              </span>
              <span>
                <strong>{t("Language")}</strong>
                <small>{locale === "ar" ? "العربية" : "English"}</small>
              </span>
              <Mark name="chevron" />
            </button>
          </div>
        </section>
        <Link className="privacy-back" to={SCREENS.SECURITY_ACTIVITY}>{t("Security Activity")}</Link><Link className="privacy-back" to={SCREENS.SESSION_PRIVACY}>{t("Session Privacy")}</Link><p className="privacy-state" role="status">
          {t(
            biometric
              ? "Biometric animation enabled for this preview only."
              : "Biometric preview is off. Device security is unchanged.",
          )}
        </p>
      </div>
      {sheet && (
        <PreviewSheet title={sheet} onClose={() => setSheet(null)}>
          {sheet === "Language" ? (
            <div role="group" aria-label={t("Interface language")}>
              {[
                ["ar", "العربية"],
                ["en", "English"],
              ].map(([value, label]) => (
                <button
                  type="button"
                  key={value}
                  className="security-choice"
                  aria-pressed={locale === value}
                  lang={value}
                  onClick={() => setLocale(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          ) : sheet === "Privacy Checks" ? (
            <>
              <p>
                {t(
                  "This review is educational only. No device scan or security score is performed.",
                )}
              </p>
              <ul className="privacy-review-list">
                <li>{t("Use fictional information in this visual demo.")}</li>
                <li>
                  {t(
                    "No device backups or biometric credentials are connected.",
                  )}
                </li>
                <li>
                  {t(
                    "Keep private keys and recovery codes outside this prototype.",
                  )}
                </li>
              </ul>
              <Link to={SCREENS.BACKUP} state={{ returnTo: SCREENS.PRIVACY }}>
                {t("Recovery & Backup")}
              </Link>
            </>
          ) : (
            <p>
              {t(
                sheet === "Passkeys"
                  ? "Passkeys are a visual explanation only. No credential is created, read or verified."
                  : "No GitHub account is connected by this preview. No OAuth flow or account permission change is performed.",
              )}
            </p>
          )}
        </PreviewSheet>
      )}
    </main>
  );
}
