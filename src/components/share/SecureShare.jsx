import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { SCREENS } from "../../config/screens";
import { useLanguage } from "../../i18n/Language";
import { Mark, PreviewSheet, CapabilityCard } from "../security/ScreenUI";
import { useVault, VAULT_STATE } from "../../hooks/useVault";
import "./share.css";

export const DEMO_RECIPIENTS = Object.freeze([
  {
    id: "a",
    name: "Example Recipient A",
    fingerprint: "DEMO-A · 1111 2222 3333 4444",
  },
  {
    id: "b",
    name: "Example Recipient B",
    fingerprint: "DEMO-B · 5555 6666 7777 8888",
  },
]);
export function SecureShare() {
  const { t, locale, dir } = useLanguage();
  const vault = useVault();
  const unlocked = vault.state === VAULT_STATE.UNLOCKED;
  const [file, setFile] = useState(true);
  const [recipient, setRecipient] = useState(DEMO_RECIPIENTS[0]);
  const [confirmed, setConfirmed] = useState(false);
  const [review, setReview] = useState(false);
  const [sheet, setSheet] = useState(null);
  const [model, setModel] = useState("shared-secret");
  const [passphrase, setPassphrase] = useState("");
  const [realKeys, setRealKeys] = useState([]);
  const [realRecipient, setRealRecipient] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [status, setStatus] = useState(null);

  // Real RSA public keys from the key forge can be used as recipients.
  useEffect(() => {
    let active = true;
    if (!unlocked) {
      setRealKeys([]);
      return undefined;
    }
    vault.keyList().then((res) => {
      if (!active || !res?.ok) return;
      setRealKeys((res.data.keys || []).filter((key) => key.publicPem));
    });
    return () => {
      active = false;
    };
  }, [unlocked, vault]);

  // Real package creation. shared-secret uses PBKDF2; recipient-key wraps the
  // content key with RSA-OAEP for the chosen public key.
  const createPackage = useCallback(async () => {
    setBusy(true);
    setStatus(null);
    setResult(null);
    try {
      const request = {
        model,
        payload: `KnouxCrypt share preview · ${new Date().toISOString()}`,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
      };
      if (model === "shared-secret") request.passphrase = passphrase;
      else {
        const key = realKeys.find((k) => k.id === realRecipient);
        if (!key) {
          setStatus(t("Choose a recipient key first."));
          return;
        }
        request.recipientPublicPem = key.publicPem;
      }
      const res = await vault.shareCreate(request);
      if (res?.ok) {
        setResult(res.data);
        setStatus(`${t("Package created")} · ${res.data.model} · ${res.data.fingerprint.slice(0, 16)}…`);
      } else {
        setStatus(res?.error?.message || t("The package could not be created."));
      }
    } finally {
      setBusy(false);
    }
  }, [expiresAt, model, passphrase, realKeys, realRecipient, t, vault]);

  const verifyPackage = useCallback(async () => {
    if (!result) return;
    const res = await vault.shareInspect(result.envelope);
    if (res?.ok) {
      setStatus(
        `${t("Verified envelope")} · ${res.data.model} · ${res.data.expired ? t("expired") : t("valid")}`,
      );
    } else {
      setStatus(res?.error?.message || t("The package could not be read."));
    }
  }, [result, t, vault]);

  function chooseRecipient(value) {
    setRecipient(value);
    setConfirmed(false);
    setSheet(null);
  }
  return (
    <main
      className="share-screen"
      dir={dir}
      lang={locale}
      data-screen="SECURE_SHARE"
    >
      <div className="share-shell">
        <Link className="share-back" to={SCREENS.TOOLS}>
          ‹ {t("Back to Tools")}
        </Link>
        <div
          className={`share-portals ${confirmed && file ? "share-demo-confirmed" : ""}`}
          aria-hidden="true"
        >
          <span className="share-portal share-portal-left">
            <Mark name="lock" />
          </span>
          <i className="share-bridge" />
          <span className="share-portal share-portal-right">
            <Mark name="key" />
          </span>
        </div>
        <header className="share-heading">
          <h1>{t("Secure Share")}</h1>
          <p>{t("Prepare a private sharing preview.")}</p>
        </header>
        <section
          className="share-file"
          aria-label={t("Fictional sharing file")}
        >
          {file ? (
            <>
              <button
                className="share-file-icon"
                type="button"
                onClick={() => setSheet("Choose sample file")}
                aria-label={t("Choose sample file")}
              >
                <Mark name="file" />
              </button>
              <button
                className="share-file-name"
                type="button"
                onClick={() => setSheet("Choose sample file")}
              >
                <strong dir="ltr">design-package.pdf</strong>
                <small dir="ltr">8.4 MB · /Demo</small>
              </button>
              <button
                className="share-remove"
                type="button"
                aria-label={t("Remove fictional sharing sample")}
                onClick={() => {
                  setFile(false);
                  setConfirmed(false);
                }}
              >
                ×
              </button>
            </>
          ) : (
            <button
              type="button"
              className="share-empty"
              onClick={() => setSheet("Choose sample file")}
            >
              {t("Choose sample file")}
              <small>{t("No device file access")}</small>
            </button>
          )}
        </section>
        <section className="share-recipient"><Link to={SCREENS.PUBLIC_KEY_QR}>{t("Public Key QR")}</Link><Link to={SCREENS.FINGERPRINT_VERIFY}>{t("Fingerprint Verify")}</Link>
          <div className="share-section-heading">
            <Mark name="key" />
            <h2>{t("Recipient Public Key")}</h2>
          </div>
          <strong>{t(recipient.name)}</strong>
          <code dir="ltr">{recipient.fingerprint}</code>
          <p>{t("Public fictional fingerprint only · not a real key")}</p>
          <button
            className="share-secondary"
            type="button"
            onClick={() => setSheet("Change Recipient")}
          >
            {t("Change Recipient")}
          </button>
          <label className="share-confirm">
            <input
              type="checkbox"
              checked={confirmed}
              disabled={!file}
              onChange={() => setConfirmed((value) => !value)}
            />
            <span>
              {t(
                "I confirm this fictional fingerprint for the visual preview only.",
              )}
            </span>
          </label>
        </section>
        <section className="share-review">
          <button
            type="button"
            aria-expanded={review}
            aria-controls="share-review-details"
            onClick={() => setReview((value) => !value)}
          >
            <Mark name="shield" />
            <span>{t("Review sharing details")}</span>
            <Mark name="chevron" />
          </button>
          <div id="share-review-details" hidden={!review}>
            <dl>
              <dt>{t("File")}</dt>
              <dd dir="ltr">{file ? "design-package.pdf" : "—"}</dd>
              <dt>{t("Recipient")}</dt>
              <dd>{t(recipient.name)}</dd>
              <dt>{t("Mode")}</dt>
              <dd>{t("Visual demo only")}</dd>
            </dl>
            <p>
              {t(
                "No keys are verified. No encryption, upload, message, or remote delivery occurs.",
              )}
            </p>
          </div>
        </section>
        <button
          className="security-primary share-action"
          type="button"
          disabled={!file || !confirmed}
          onClick={() => setSheet("Demo Workflow")}
        >
          <Mark name="lock" />
          {t("Verify & Encrypt")}
          <Mark name="arrow" />
        </button>
        <CapabilityCard id="SECURE_SHARE" />
        <section className="share-package" aria-label={t("Create encrypted package")}>
          <div className="share-section-heading">
            <Mark name="shield" />
            <h2>{t("Create encrypted package")}</h2>
          </div>
          <div role="group" aria-label={t("Package model")}>
            {[
              ["shared-secret", "Shared passphrase"],
              ["recipient-key", "Recipient key"],
            ].map(([id, label]) => (
              <button
                key={id}
                type="button"
                className="security-choice"
                aria-pressed={model === id}
                disabled={!unlocked}
                onClick={() => {
                  setModel(id);
                  setResult(null);
                  setStatus(null);
                }}
              >
                {t(label)}
              </button>
            ))}
          </div>
          {model === "shared-secret" ? (
            <label className="share-confirm">
              {t("Share passphrase (8+ characters)")}
              <input
                dir="ltr"
                type="password"
                autoComplete="new-password"
                value={passphrase}
                disabled={!unlocked}
                onChange={(e) => setPassphrase(e.target.value.slice(0, 256))}
              />
            </label>
          ) : (
            <label className="share-confirm">
              {t("Recipient public key")}
              <select
                dir="ltr"
                value={realRecipient}
                disabled={!unlocked || realKeys.length === 0}
                onChange={(e) => setRealRecipient(e.target.value)}
              >
                <option value="">
                  {realKeys.length ? t("Choose a key") : t("No keys in the vault")}
                </option>
                {realKeys.map((key) => (
                  <option key={key.id} value={key.id}>
                    {key.name} · {key.algorithm}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="share-confirm">
            {t("Expires (optional)")}
            <input
              dir="ltr"
              type="datetime-local"
              value={expiresAt}
              disabled={!unlocked}
              onChange={(e) => setExpiresAt(e.target.value)}
            />
          </label>
          <button
            className="security-primary share-action"
            type="button"
            disabled={!unlocked || busy}
            onClick={createPackage}
          >
            <Mark name="lock" />
            {busy ? t("Working…") : t("Create Encrypted Package")}
            <Mark name="arrow" />
          </button>
          {result && (
            <div className="share-review" role="group" aria-label={t("Package result")}>
              <button type="button" onClick={verifyPackage}>
                <Mark name="shield" />
                <span>{t("Verify package envelope")}</span>
              </button>
              <p className="share-demo-caption" dir="ltr">
                {result.model} · {result.fingerprint}
              </p>
            </div>
          )}
        </section>
        <p className="share-status" role="status">
          {status ||
            t(
              unlocked
                ? "Ready · packages are real AES-256-GCM containers"
                : "Unlock the vault to create encrypted packages.",
            )}
        </p>
        <div className="share-related">
          {[
            ["LOCAL_TRANSFER", "Local Transfer"],
            ["DEVICE_PAIRING", "Device Pairing"],
            ["TRANSFER_WIZARD", "Transfer Wizard"],
            ["SECRET_CAPSULE", "Expiring Secret Capsule"],
          ].map(([id, title]) => (
            <Link key={id} to={SCREENS[id]}>
              {t(title)} <span>{t("Visual preview")}</span>
            </Link>
          ))}
        </div>
      </div>
      {sheet && (
        <PreviewSheet title={sheet} onClose={() => setSheet(null)}>
          {sheet === "Choose sample file" ? (
            <>
              <p>
                {t(
                  "Select the public fictional PDF label. No picker opens and no file is read or written.",
                )}
              </p>
              <button
                type="button"
                className="security-choice"
                onClick={() => {
                  setFile(true);
                  setConfirmed(false);
                  setSheet(null);
                }}
              >
                design-package.pdf · 8.4 MB · DEMO
              </button>
            </>
          ) : sheet === "Change Recipient" ? (
            <>
              <p>
                {t(
                  "Choose a fictional recipient. Changing it clears the preview confirmation.",
                )}
              </p>
              {DEMO_RECIPIENTS.map((value) => (
                <button
                  type="button"
                  className="security-choice"
                  key={value.id}
                  aria-pressed={recipient.id === value.id}
                  onClick={() => chooseRecipient(value)}
                >
                  {t(value.name)}
                  <code className="share-choice-fingerprint" dir="ltr">
                    {value.fingerprint}
                  </code>
                </button>
              ))}
            </>
          ) : (
            <>
              <p>
                {t(
                  "Workflow explanation only. No fingerprint verification, encryption, share link, upload or delivery was performed.",
                )}
              </p>
              <ol className="share-demo-steps">
                <li>{t("Review a fictional file label.")}</li>
                <li>{t("Confirm a fictional recipient fingerprint.")}</li>
                <li>
                  {t(
                    "Stop at the visual preview. No protected output is created.",
                  )}
                </li>
              </ol>
            </>
          )}
        </PreviewSheet>
      )}
    </main>
  );
}
export function ShareWorkflowPreview({ title }) {
  const { t, locale, dir } = useLanguage();
  return (
    <main className="share-screen" dir={dir} lang={locale}>
      <section className="share-shell share-holding">
        <p>{t("VISUAL DEMO")}</p>
        <h1>{t(title)}</h1>
        <p>
          {t(
            "This workflow is awaiting its numbered implementation. No security operation is running.",
          )}
        </p>
        <Link to={SCREENS.SECURE_SHARE}>{t("Back to Secure Share")}</Link>
      </section>
    </main>
  );
}
