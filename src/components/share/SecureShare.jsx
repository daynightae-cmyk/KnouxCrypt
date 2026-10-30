import React, { useState } from "react";
import { Link } from "react-router-dom";
import { SCREENS } from "../../config/screens";
import { useLanguage } from "../../i18n/Language";
import { Mark, PreviewSheet } from "../security/ScreenUI";
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
  const [file, setFile] = useState(true);
  const [recipient, setRecipient] = useState(DEMO_RECIPIENTS[0]);
  const [confirmed, setConfirmed] = useState(false);
  const [review, setReview] = useState(false);
  const [sheet, setSheet] = useState(null);
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
        <p className="share-status" role="status">
          {t(
            confirmed && file
              ? "Fictional selection confirmed · no security verification performed"
              : "Confirm the fictional fingerprint to preview the workflow.",
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
