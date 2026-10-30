import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useLanguage } from "../../i18n/Language";
import { SCREENS } from "../../config/screens";
import { StagEmblem } from "../entry/StagEmblem";
import { Mark, PreviewSheet } from "../security/ScreenUI";
import "./authenticator.css";
export const DEMO_ACCOUNTS = Object.freeze([
  "Example Git",
  "Mail",
  "Cloud",
  "Workspace",
]);
export function secondsRemaining(milliseconds) {
  return 30 - (Math.floor(milliseconds / 1000) % 30);
}
function Header({ importing = false }) {
  const { t } = useLanguage();
  return (
    <header className="authenticator-header">
      <Link
        to={importing ? SCREENS.AUTHENTICATOR : SCREENS.HOME}
        aria-label={t(importing ? "Back to Authenticator" : "Back to Home")}
      >
        <StagEmblem />
      </Link>
      <div>
        <h1>{t(importing ? "2FA IMPORT" : "Authenticator")}</h1>
        <p>
          {t(
            importing
              ? "Bring your accounts together."
              : "Your codes. Your control.",
          )}
        </p>
      </div>
    </header>
  );
}
function DemoRing({ remaining }) {
  const { t } = useLanguage();
  const circumference = 2 * Math.PI * 19;
  return (
    <span
      className="auth-demo-ring"
      aria-label={`${t("Demo countdown")}: ${remaining}`}
    >
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <circle cx="24" cy="24" r="19" />
        <circle
          className="auth-demo-ring-active"
          cx="24"
          cy="24"
          r="19"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - remaining / 30)}
        />
      </svg>
      <small>{remaining}</small>
    </span>
  );
}
export function Authenticator() {
  const { t, locale, dir } = useLanguage();
  const [now, setNow] = useState(() => Date.now());
  const [sheet, setSheet] = useState(null);
  const [account, setAccount] = useState(DEMO_ACCOUNTS[0]);
  const [label, setLabel] = useState("Example Account");
  const [hint, setHint] = useState(false);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const remaining = secondsRemaining(now);
  return (
    <main
      className="authenticator-screen"
      dir={dir}
      lang={locale}
      data-screen="AUTHENTICATOR"
    >
      <div className="authenticator-shell">
        <Header />
        <p className="auth-demo-banner">
          {t("DEMO · masked placeholders, not OTP codes")}
        </p>
        <section
          className="auth-account-list"
          aria-label={t("Fictional authenticator accounts")}
        >
          {DEMO_ACCOUNTS.map((title, index) => (
            <article className="auth-account" key={title}>
              <span className="auth-account-icon">
                <Mark name={index % 2 ? "shield" : "key"} />
              </span>
              <div className="auth-account-copy">
                <strong>{t(title)}</strong>
                <small>demo@example.invalid</small>
                <span
                  className="auth-masked-code"
                  dir="ltr"
                  aria-label={t("Masked demo placeholder")}
                >
                  ••• •••
                </span>
              </div>
              <DemoRing remaining={remaining} />
              <div className="auth-account-actions">
                <button
                  type="button"
                  disabled
                  aria-label={t("Copy unavailable for masked demo")}
                >
                  <Mark name="file" />
                </button>
                <button
                  type="button"
                  aria-label={`${t("Account details")}: ${t(title)}`}
                  onClick={() => {
                    setAccount(title);
                    setSheet("Account details");
                  }}
                >
                  <Mark name="dots" />
                </button>
              </div>
            </article>
          ))}
        </section>
        <button
          className="security-primary auth-scan"
          type="button"
          onClick={() => setSheet("Scan QR Code")}
        >
          <span className="auth-scan-icon" aria-hidden="true">
            ⌗
          </span>
          {t("Scan QR Code")}
          <Mark name="arrow" />
        </button>
        <div className="auth-secondary-actions">
          <button
            type="button"
            onClick={() => {
              setHint(false);
              setSheet("Add Manually");
            }}
          >
            <Mark name="key" />
            {t("Add Manually")}
          </button>
          <Link to={SCREENS.AUTH_IMPORT}>
            <Mark name="upload" />
            {t("Import Accounts")}
          </Link>
        </div>
        <p className="auth-demo-caption">
          {t("Offline visual demo. No secrets, scanning, or authentication.")}
        </p>
      </div>
      {sheet && (
        <PreviewSheet title={sheet} onClose={() => setSheet(null)}>
          {sheet === "Account details" ? (
            <>
              <h3>{t(account)}</h3>
              <p>
                {t(
                  "This is a fictional account. The timer is a visual 30-second cycle; it never generates or verifies a one-time code.",
                )}
              </p>
            </>
          ) : sheet === "Scan QR Code" ? (
            <>
              <div className="auth-scan-corners" aria-hidden="true">
                <Mark name="shield" />
              </div>
              <p>
                {t(
                  "Camera preview only. No camera, image, QR code, or secret seed is accessed.",
                )}
              </p>
            </>
          ) : (
            <>
              <p>
                {t(
                  "Use a fictional account label only. Do not enter a real secret or recovery code.",
                )}
              </p>
              <label className="auth-manual-label">
                {t("Sample account label")}
                <input
                  dir="auto"
                  value={label}
                  onChange={(e) => {
                    setLabel(e.target.value.slice(0, 80));
                    setHint(false);
                  }}
                />
              </label>
              <label className="auth-manual-label">
                {t("Secret key — disabled in demo")}
                <input value="DEMO-ONLY-NOT-A-SEED" readOnly dir="ltr" />
              </label>
              <button
                className="security-choice"
                type="button"
                disabled={!label.trim()}
                onClick={() => setHint(true)}
              >
                {t("Preview manual setup")}
              </button>
              {hint && (
                <p role="status">
                  {t(
                    "Setup preview only. No account was added and no code was generated.",
                  )}
                </p>
              )}
            </>
          )}
        </PreviewSheet>
      )}
    </main>
  );
}
export function AuthImport() {
  const { t, locale, dir } = useLanguage();
  const [source, setSource] = useState("Backup file");
  const [checked, setChecked] = useState([true, true, false, false]);
  const [file, setFile] = useState(false);
  const [sheet, setSheet] = useState(null);
  const selected = checked.filter(Boolean).length;
  return (
    <main
      className="authenticator-screen auth-import-screen"
      dir={dir}
      lang={locale}
      data-screen="AUTH_IMPORT"
    >
      <div className="authenticator-shell">
        <Header importing />
        <Link className="auth-parent-back" to={SCREENS.AUTHENTICATOR}>
          ‹ {t("Back to Authenticator")}
        </Link>
        <p className="auth-demo-banner">
          {t("Import preview · no real seeds")}
        </p>
        <section
          className="auth-import-sources"
          aria-label={t("Import source")}
        >
          {[
            ["Backup file", "folder"],
            ["QR preview", "shield"],
            ["Manual entry", "key"],
          ].map(([title, icon]) => (
            <button
              key={title}
              type="button"
              aria-pressed={source === title}
              onClick={() => setSource(title)}
            >
              <Mark name={icon} />
              <strong>{t(title)}</strong>
              <small>
                {t(
                  title === "Backup file"
                    ? "Supported export preview"
                    : title === "QR preview"
                      ? "No camera access"
                      : "Fictional sample only",
                )}
              </small>
            </button>
          ))}
        </section>
        <div
          className="auth-import-rail"
          aria-label={t("Visual import stages")}
        >
          <span className="active">{t("Source")}</span>
          <i />
          <span className={file ? "active" : ""}>{t("Review")}</span>
          <i />
          <span>{t("Preview")}</span>
        </div>
        <div className="auth-backup-hint">
          <Mark name="lock" />
          <span>{t("Encrypted backup indicator · reference copy only")}</span>
        </div>
        <button
          type="button"
          className="auth-import-file"
          onClick={() => setSheet("Choose mock file")}
        >
          <Mark name="file" />
          <span>
            {t(
              file
                ? "sample-export.json · fictional"
                : "Choose a sample export",
            )}
            <small>{t("No device file picker opens")}</small>
          </span>
          <Mark name="chevron" />
        </button>
        {source === "Manual entry" && (
          <p className="auth-demo-caption">
            {t(
              "Manual entry uses fictional account placeholders only. Real seed entry is disabled.",
            )}
          </p>
        )}
        <section
          className="auth-import-accounts"
          aria-label={t("Select sample accounts")}
        >
          <h2>{t("Sample accounts")}</h2>
          {DEMO_ACCOUNTS.map((title, index) => (
            <label key={title}>
              <span className="auth-account-icon">
                <Mark name={index % 2 ? "shield" : "key"} />
              </span>
              <span>
                <strong>{t(title)}</strong>
                <small>demo@example.invalid</small>
              </span>
              <input
                type="checkbox"
                checked={checked[index]}
                onChange={() =>
                  setChecked((current) =>
                    current.map((value, i) => (i === index ? !value : value)),
                  )
                }
              />
            </label>
          ))}
        </section>
        <button
          type="button"
          className="security-primary"
          disabled={!selected || !file}
          onClick={() => setSheet("Import Selected Accounts")}
        >
          <Mark name="upload" />
          {t("Import Selected Accounts")}
          <Mark name="arrow" />
        </button>
        <p className="auth-demo-caption" role="status">
          {selected} {t("sample accounts selected")}
        </p>
        <Link className="auth-skip" to={SCREENS.AUTHENTICATOR}>
          {t("Skip for now")}
        </Link>
      </div>
      {sheet && (
        <PreviewSheet title={sheet} onClose={() => setSheet(null)}>
          {sheet === "Choose mock file" ? (
            <>
              <p>
                {t(
                  "Choose a fictional export. No file contents or secrets are read.",
                )}
              </p>
              <button
                type="button"
                className="security-choice"
                onClick={() => {
                  setFile(true);
                  setSheet(null);
                }}
              >
                {t("Use sample-export.json")}
              </button>
              <button
                type="button"
                className="security-choice"
                onClick={() => setSheet("Unsupported format")}
              >
                {t("Preview unsupported format")}
              </button>
            </>
          ) : sheet === "Unsupported format" ? (
            <p>
              {t(
                "Unsupported sample format. No import was attempted. Choose the JSON demo sample to review the workflow.",
              )}
            </p>
          ) : (
            <p>
              {t(
                "Visual import preview only. No accounts or seeds were imported, no backup was decrypted, and the Authenticator remains unchanged.",
              )}
            </p>
          )}
        </PreviewSheet>
      )}
    </main>
  );
}
