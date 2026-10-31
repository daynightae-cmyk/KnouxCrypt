import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useLanguage } from "../../i18n/Language";
import { SCREENS } from "../../config/screens";
import { StagEmblem } from "../entry/StagEmblem";
import { CapabilityCard, Mark, PreviewSheet } from "../security/ScreenUI";
import { capabilityById } from "../../config/desktopCapabilities";
import { useVault, VAULT_STATE } from "../../hooks/useVault";
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
function RealRing({ remaining, period = 30 }) {
  const { t } = useLanguage();
  const circumference = 2 * Math.PI * 19;
  const fraction = Math.min(1, Math.max(0, remaining / period));
  return (
    <span
      className="auth-demo-ring"
      aria-label={`${t("Time remaining")}: ${remaining}`}
    >
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <circle cx="24" cy="24" r="19" />
        <circle
          className="auth-demo-ring-active"
          cx="24"
          cy="24"
          r="19"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - fraction)}
        />
      </svg>
      <small>{remaining}</small>
    </span>
  );
}
export function Authenticator() {
  const { t, locale, dir } = useLanguage();
  const vault = useVault();
  const persisted = vault.state === VAULT_STATE.UNLOCKED;
  const sessionKey = vault.session?.sessionId ?? null;
  const [now, setNow] = useState(() => Date.now());
  const [sheet, setSheet] = useState(null);
  const [account, setAccount] = useState(DEMO_ACCOUNTS[0]);
  const [label, setLabel] = useState("Example Account");
  const [issuer, setIssuer] = useState("Knoux");
  const [secret, setSecret] = useState("");
  const [status, setStatus] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [codes, setCodes] = useState({});
  const [busy, setBusy] = useState(false);
  const vaultRef = useRef(vault);
  vaultRef.current = vault;

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Load the real account list once per unlocked session.
  useEffect(() => {
    let cancelled = false;
    if (!persisted) {
      setAccounts([]);
      setCodes({});
      return () => {
        cancelled = true;
      };
    }
    vaultRef.current
      .authList()
      .then((res) => {
        if (cancelled) return;
        if (res?.ok === false) {
          setStatus(t("Could not read the authenticator store."));
          setAccounts([]);
        } else {
          setStatus(null);
          setAccounts(res?.data?.accounts || []);
        }
      })
      .catch(() => {
        if (!cancelled) setStatus(t("Could not read the authenticator store."));
      });
    return () => {
      cancelled = true;
    };
  }, [persisted, sessionKey, t]);

  // Ask the main process for a fresh code for each account. The secret never
  // enters the renderer, so this is the only way a code can be produced.
  useEffect(() => {
    let cancelled = false;
    if (!persisted || accounts.length === 0) return () => {
      cancelled = true;
    };
    const tick = async () => {
      const next = {};
      for (const item of accounts) {
        const res = await vaultRef.current.authCode(item.id);
        if (res?.ok) next[item.id] = res.data;
      }
      if (!cancelled) setCodes(next);
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [persisted, accounts, sessionKey]);

  const remaining = secondsRemaining(now);

  const addAccount = async () => {
    if (!persisted || busy) return;
    setBusy(true);
    try {
      const res = await vaultRef.current.authAdd({
        name: label.trim(),
        issuer: issuer.trim(),
        secret: secret.trim(),
      });
      if (res?.ok) {
        setStatus(t("Account added to the encrypted store."));
        setSecret("");
        setLabel("");
        const listed = await vaultRef.current.authList();
        if (listed?.ok) setAccounts(listed.data.accounts || []);
        setSheet(null);
      } else {
        setStatus(res?.error?.message || t("Could not add the account."));
      }
    } finally {
      setBusy(false);
    }
  };

  const removeAccount = async (id) => {
    const res = await vaultRef.current.authRemove(id);
    if (res?.ok) {
      setAccounts((list) => list.filter((item) => item.id !== id));
      setCodes((map) => {
        const next = { ...map };
        delete next[id];
        return next;
      });
    }
  };

  const realAccounts = persisted ? accounts : [];
  const showDemo = !persisted;

  return (
    <main
      className="authenticator-screen"
      dir={dir}
      lang={locale}
      data-screen="AUTHENTICATOR"
    >
      <div className="authenticator-shell">
        <Header />
        {showDemo ? (
          <p className="auth-demo-banner">
            {t("DEMO · masked placeholders, not OTP codes")}
          </p>
        ) : (
          <p className="auth-demo-banner">
            {t("LIVE · codes are computed from your encrypted secrets")}
          </p>
        )}
        <CapabilityCard
          capability={capabilityById("AUTHENTICATOR")}
          fallback={{
            platformCapability: "RFC 6238 TOTP, SHA-1/256/512",
            permissionNeeds: "Unlocked vault session",
            requiresNetwork: false,
            providerReady: true,
          }}
        />
        {status && (
          <p className="auth-demo-caption" role="status">
            {status}
          </p>
        )}
        {persisted ? (
          <section
            className="auth-account-list"
            aria-label={t("Stored authenticator accounts")}
          >
            {realAccounts.length === 0 && (
              <p className="auth-demo-caption">
                {t("No accounts stored yet. Add one to begin.")}
              </p>
            )}
            {realAccounts.map((item, index) => (
              <article className="auth-account" key={item.id}>
                <span className="auth-account-icon">
                  <Mark name={index % 2 ? "shield" : "key"} />
                </span>
                <div className="auth-account-copy">
                  <strong>{item.name}</strong>
                  {item.issuer ? <small>{item.issuer}</small> : null}
                  <span className="auth-real-code" dir="ltr">
                    {codes[item.id]?.code || "------"}
                  </span>
                </div>
                <RealRing remaining={codes[item.id]?.remaining ?? remaining} period={item.period} />
                <div className="auth-account-actions">
                  <button
                    type="button"
                    aria-label={`${t("Remove account")}: ${item.name}`}
                    onClick={() => removeAccount(item.id)}
                  >
                    <Mark name="file" />
                  </button>
                </div>
              </article>
            ))}
          </section>
        ) : (
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
        )}
        <button
          className="security-primary auth-scan"
          type="button"
          disabled={!persisted}
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
            disabled={!persisted}
            onClick={() => {
              setStatus(null);
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
          {persisted
            ? t("Secrets are stored in the encrypted vault and never shown.")
            : t("Unlock the vault to store real accounts. This is a visual demo.")}
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
                  "Enter the Base32 secret from your provider. It is written straight into the encrypted store and is never displayed again.",
                )}
              </p>
              <label className="auth-manual-label">
                {t("Account name")}
                <input
                  dir="auto"
                  value={label}
                  onChange={(e) => {
                    setLabel(e.target.value.slice(0, 80));
                    setStatus(null);
                  }}
                />
              </label>
              <label className="auth-manual-label">
                {t("Issuer")}
                <input
                  dir="auto"
                  value={issuer}
                  onChange={(e) => setIssuer(e.target.value.slice(0, 80))}
                />
              </label>
              <label className="auth-manual-label">
                {t("Base32 secret")}
                <input
                  dir="ltr"
                  autoComplete="off"
                  spellCheck={false}
                  value={secret}
                  onChange={(e) => {
                    setSecret(e.target.value.slice(0, 256));
                    setStatus(null);
                  }}
                />
              </label>
              <button
                className="security-choice"
                type="button"
                disabled={!label.trim() || !secret.trim() || busy}
                onClick={addAccount}
              >
                {busy ? t("Adding…") : t("Add account")}
              </button>
            </>
          )}
        </PreviewSheet>
      )}
    </main>
  );
}
export function AuthImport() {
  const { t, locale, dir } = useLanguage();
  const vault = useVault();
  const persisted = vault.state === VAULT_STATE.UNLOCKED;
  const [source, setSource] = useState("Backup file");
  const [checked, setChecked] = useState([true, true, false, false]);
  const [file, setFile] = useState(false);
  const [sheet, setSheet] = useState(null);
  const [uri, setUri] = useState("");
  const [parsed, setParsed] = useState(null);
  const [importStatus, setImportStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const vaultRef = useRef(vault);
  vaultRef.current = vault;
  const selected = checked.filter(Boolean).length;

  // Parse first, store second: the user sees exactly what will be written.
  const parseUri = async () => {
    if (!persisted || busy) return;
    setBusy(true);
    setImportStatus(null);
    try {
      const res = await vaultRef.current.authParseUri(uri.trim());
      if (res?.ok) {
        setParsed(res.data);
      } else {
        setParsed(null);
        setImportStatus(res?.error?.message || t("That URI could not be read."));
      }
    } finally {
      setBusy(false);
    }
  };

  const confirmImport = async () => {
    if (!parsed || busy) return;
    setBusy(true);
    try {
      const res = await vaultRef.current.authAdd({
        name: parsed.name,
        issuer: parsed.issuer,
        secret: parsed.secret,
        digits: parsed.digits,
        period: parsed.period,
        algorithm: parsed.algorithm,
      });
      if (res?.ok) {
        setImportStatus(t("Account imported into the encrypted store."));
        setParsed(null);
        setUri("");
        setSheet(null);
      } else {
        setImportStatus(res?.error?.message || t("Could not import the account."));
      }
    } finally {
      setBusy(false);
    }
  };
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
          {persisted
            ? t("LIVE · otpauth:// URIs are parsed and stored encrypted")
            : t("Import preview · unlock the vault to import")}
        </p>
        <CapabilityCard
          capability={capabilityById("AUTH_IMPORT")}
          fallback={{
            platformCapability: "otpauth:// URI parsing (totp/hotp), Base32 validation",
            permissionNeeds: "Unlocked vault session",
            requiresNetwork: false,
            providerReady: true,
          }}
        />
        {importStatus && (
          <p className="auth-demo-caption" role="status">
            {importStatus}
          </p>
        )}
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
          <div className="auth-import-uri">
            <label className="auth-manual-label">
              {t("otpauth:// URI")}
              <input
                dir="ltr"
                autoComplete="off"
                spellCheck={false}
                placeholder="otpauth://totp/Issuer:account?secret=…"
                value={uri}
                disabled={!persisted}
                onChange={(e) => {
                  setUri(e.target.value.slice(0, 2048));
                  setParsed(null);
                  setImportStatus(null);
                }}
              />
            </label>
            <button
              type="button"
              className="security-choice"
              disabled={!persisted || !uri.trim() || busy}
              onClick={parseUri}
            >
              {busy ? t("Reading…") : t("Read URI")}
            </button>
            {parsed && (
              <div className="auth-import-preview" role="group" aria-label={t("Parsed account")}>
                <p>
                  <strong>{parsed.name}</strong>
                  {parsed.issuer ? ` · ${parsed.issuer}` : ""}
                </p>
                <p className="auth-demo-caption">
                  {parsed.type.toUpperCase()} · {parsed.algorithm} · {parsed.digits}{" "}
                  {t("digits")} · {parsed.period}s
                </p>
                <button
                  type="button"
                  className="security-primary"
                  disabled={busy}
                  onClick={confirmImport}
                >
                  <Mark name="upload" />
                  {t("Import this account")}
                </button>
              </div>
            )}
          </div>
        )}
        <section
          className="auth-import-accounts"
          aria-label={t("Select sample accounts")}
        >
          <h2>{t("Sample accounts · visual demo only")}</h2>
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
          {t("Preview sample import")}
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
