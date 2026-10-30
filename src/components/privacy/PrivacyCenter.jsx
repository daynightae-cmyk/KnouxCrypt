import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useLanguage } from "../../i18n/Language";
import { SCREENS } from "../../config/screens";
import { StagEmblem } from "../entry/StagEmblem";
import { Mark, PreviewSheet } from "../security/ScreenUI";
import "./privacy.css";

export function PrivacyCenter() {
  const { t, locale, dir, setLocale } = useLanguage();
  const [biometric, setBiometric] = useState(false);
  const [sheet, setSheet] = useState(null);
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
          {t("Visual demo only. No backup or device protection is active.")}
        </p>
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
