import React, { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { SCREENS } from "../../config/screens";
import { useLanguage } from "../../i18n/Language";
import { StagEmblem } from "../entry/StagEmblem";
import { Mark, PreviewSheet } from "../security/ScreenUI";
import "./workflows.css";
export const ARCHIVE_SAMPLES = Object.freeze([
  "design.pdf",
  "sample-image.jpg",
  "project-notes.txt",
]);
export const PUBLIC_FINGERPRINT = "DEMO-PUBLIC-0000-1111-2222-3333";
function Frame({ title, icon, children, back = SCREENS.TOOLS, motion = "" }) {
  const { t, locale, dir } = useLanguage();
  return (
    <main className={`workflow-screen ${motion}`} dir={dir} lang={locale}>
      <div className="workflow-shell">
        <Link className="workflow-back" to={back}>
          ‹{" "}
          {t(
            back === SCREENS.SECURE_SHARE
              ? "Back to Secure Share"
              : back === SCREENS.KEY_DETAILS
                ? "Back to Key Details"
                : "Back to Tools",
          )}
        </Link>
        <div className="workflow-hero" aria-hidden="true">
          <span />
          <span />
          <Mark name={icon} />
          <i />
        </div>
        <h1>{t(title)}</h1>
        <p className="workflow-caption">{t("VISUAL DEMO")}</p>
        {children}
      </div>
    </main>
  );
}
function Check({ label, checked, onChange }) {
  const { t } = useLanguage();
  return (
    <label className="workflow-check">
      <span>{t(label)}</span>
      <input type="checkbox" checked={checked} onChange={onChange} />
    </label>
  );
}
export function EncryptedArchive() {
  const { t } = useLanguage();
  const [files, setFiles] = useState([...ARCHIVE_SAMPLES]);
  const [compression, setCompression] = useState(true);
  const [sheet, setSheet] = useState(null);
  return (
    <Frame
      title="ENCRYPTED ARCHIVE"
      icon="database"
      motion={sheet === "Create Archive" ? "workflow-sealing" : ""}
    >
      <section className="workflow-panel" aria-label={t("Demo archive files")}>
        {files.map((name) => (
          <div className="workflow-file" key={name}>
            <Mark name="file" />
            <span dir="ltr">{name}</span>
            <button
              type="button"
              aria-label={`${t("Remove sample")}: ${name}`}
              onClick={() =>
                setFiles((current) => current.filter((f) => f !== name))
              }
            >
              ×
            </button>
          </div>
        ))}
        {!files.length && <p>{t("No demo files selected.")}</p>}
        <button
          className="workflow-secondary"
          type="button"
          onClick={() => setSheet("Add demo files")}
        >
          {t("Add demo files")}
        </button>
      </section>
      <section className="workflow-panel">
        <Check
          label="Compression preview"
          checked={compression}
          onChange={() => setCompression((v) => !v)}
        />
        <button
          className="workflow-row"
          type="button"
          onClick={() => setSheet("Passphrase policy")}
        >
          <Mark name="lock" />
          {t("Passphrase policy")}
          <Mark name="chevron" />
        </button>
        <button
          className="workflow-row"
          type="button"
          onClick={() => setSheet("Output target preview")}
        >
          <Mark name="folder" />
          {t("Output target preview")}
          <Mark name="chevron" />
        </button>
      </section>
      <button
        type="button"
        className="security-primary"
        disabled={!files.length}
        onClick={() => setSheet("Create Archive")}
      >
        {t("Create Archive")}
        <Mark name="arrow" />
      </button>
      <p className="workflow-notice">
        {t("No real archive, compression or encryption is performed.")}
      </p>
      {sheet && (
        <PreviewSheet title={sheet} onClose={() => setSheet(null)}>
          {sheet === "Add demo files" ? (
            <>
              {ARCHIVE_SAMPLES.map((name) => (
                <button
                  key={name}
                  type="button"
                  className="security-choice"
                  disabled={files.includes(name)}
                  onClick={() =>
                    setFiles((current) =>
                      current.includes(name) ? current : [...current, name],
                    )
                  }
                >
                  {name}
                </button>
              ))}
              <p>{t("No device file access")}</p>
            </>
          ) : sheet === "Passphrase policy" ? (
            <p>
              {t(
                "No passphrase is collected. Password and key storage are disabled in this visual workflow.",
              )}
            </p>
          ) : sheet === "Output target preview" ? (
            <p>
              {t(
                "Output is an illustrative archive-demo.zip label only. Nothing is written, downloaded or uploaded.",
              )}
            </p>
          ) : (
            <>
              <p>
                {t(
                  "Configuration explanation only. No archive was created and no files were read or modified.",
                )}
              </p>
              <p>
                {files.length} {t("fictional files")} ·{" "}
                {t(
                  compression
                    ? "Compression preview on"
                    : "Compression preview off",
                )}
              </p>
            </>
          )}
        </PreviewSheet>
      )}
    </Frame>
  );
}
export function LocalTransfer() {
  const { t } = useLanguage();
  const [device, setDevice] = useState("");
  const [consent, setConsent] = useState(false);
  const [sheet, setSheet] = useState(null);
  return (
    <Frame
      title="LOCAL TRANSFER"
      icon="upload"
      back={SCREENS.SECURE_SHARE}
      motion={device ? "workflow-device-selected" : ""}
    >
      <section className="workflow-panel">
        <h2>{t("Sender")}</h2>
        <p>{t("This device · fictional label")}</p>
        <h2>{t("Recipient")}</h2>
        <button
          type="button"
          className="workflow-row"
          onClick={() => setSheet("Nearby Device")}
        >
          {t(device || "Choose demo device")}
          <Mark name="chevron" />
        </button>
        <p className="workflow-notice">
          {t(
            "No nearby-device discovery, permission or network connection occurs.",
          )}
        </p>
      </section>
      <button
        type="button"
        className="workflow-secondary"
        onClick={() => setSheet("File list review")}
      >
        {t("File list review")}
      </button>
      <button
        type="button"
        className="workflow-secondary"
        onClick={() => setSheet("Permissions explanation")}
      >
        {t("Permissions explanation")}
      </button>
      <button
        type="button"
        className="security-primary"
        disabled={!device}
        onClick={() => setSheet("Transfer consent preview")}
      >
        {t("Prepare Secure Transfer")}
        <Mark name="arrow" />
      </button>
      <p className="workflow-notice" role="status">
        {t(
          consent
            ? "Consent recorded for the visual preview only. Nothing was sent."
            : "No transfer has been prepared or delivered.",
        )}
      </p>
      <Link className="workflow-link" to={SCREENS.TRANSFER_WIZARD}>
        {t("Transfer Wizard")}
      </Link>
      {sheet && (
        <PreviewSheet title={sheet} onClose={() => setSheet(null)}>
          {sheet === "Nearby Device" ? (
            <>
              {["Demo Phone", "Demo Tablet"].map((name) => (
                <button
                  className="security-choice"
                  type="button"
                  key={name}
                  onClick={() => {
                    setDevice(name);
                    setConsent(false);
                    setSheet(null);
                  }}
                >
                  {t(name)}
                </button>
              ))}
            </>
          ) : sheet === "Transfer consent preview" ? (
            <>
              <p>
                {t(
                  "Consent is a local demonstration, not a remote recipient response.",
                )}
              </p>
              <button
                type="button"
                className="security-choice"
                onClick={() => {
                  setConsent(true);
                  setSheet(null);
                }}
              >
                {t("Accept demo consent")}
              </button>
              <button
                type="button"
                className="security-choice"
                onClick={() => {
                  setConsent(false);
                  setSheet(null);
                }}
              >
                {t("Reject demo consent")}
              </button>
            </>
          ) : (
            <p>
              {t(
                sheet === "File list review"
                  ? "The only sample is transfer-demo.pdf. No device files are read."
                  : "No camera, Bluetooth, local-network or filesystem permission is requested.",
              )}
            </p>
          )}
        </PreviewSheet>
      )}
    </Frame>
  );
}
export function FingerprintVerify() {
  const { t } = useLanguage();
  const { state } = useLocation();
  const parent =
    state?.returnTo === SCREENS.KEY_DETAILS
      ? SCREENS.KEY_DETAILS
      : SCREENS.SECURE_SHARE;
  const [input, setInput] = useState("");
  const [words, setWords] = useState(false);
  const [status, setStatus] = useState("");
  const [sheet, setSheet] = useState(null);
  const [copied, setCopied] = useState("");
  async function copy() {
    try {
      if (!navigator.clipboard?.writeText) throw new Error();
      await navigator.clipboard.writeText(PUBLIC_FINGERPRINT);
      setCopied("Public demo copied");
    } catch {
      setCopied("Clipboard unavailable");
    }
  }
  return (
    <Frame
      title="FINGERPRINT VERIFY"
      icon="key"
      back={parent}
      motion={status ? "workflow-comparing" : ""}
    >
      <StagEmblem className="workflow-fingerprint-stag" />
      <div className="workflow-fingerprint-cards">
        {["Local public fingerprint", "Recipient public fingerprint"].map(
          (label) => (
            <button
              className="workflow-panel"
              type="button"
              key={label}
              onClick={() => setSheet(label)}
            >
              <strong>{t(label)}</strong>
              <code dir="ltr">
                DEMO-PUBLIC
                <br />
                0000 · 1111
              </code>
            </button>
          ),
        )}
      </div>
      <section className="workflow-panel">
        <label>
          {t("Compare public demo fingerprint")}
          <input
            dir="ltr"
            maxLength={160}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              setStatus("");
            }}
            placeholder={PUBLIC_FINGERPRINT}
          />
        </label>
        <Check
          label="Both people reviewed the demo words: violet · river"
          checked={words}
          onChange={() => {
            setWords((v) => !v);
            setStatus("");
          }}
        />
        <button
          className="security-primary"
          type="button"
          disabled={!input.trim() || !words}
          onClick={() =>
            setStatus(
              input.trim() === PUBLIC_FINGERPRINT
                ? "Demo text matches only. Identity and key ownership are not verified."
                : "Demo text differs. No identity or cryptographic conclusion.",
            )
          }
        >
          {t("Compare Fingerprints")}
          <Mark name="arrow" />
        </button>
        <p className="workflow-notice" role="status">
          {t(status)}
        </p>
      </section>
      {sheet && (
        <PreviewSheet title={sheet} onClose={() => setSheet(null)}>
          <code className="workflow-public-code" dir="ltr">
            {PUBLIC_FINGERPRINT}
          </code>
          <button type="button" className="security-choice" onClick={copy}>
            {t("Copy public demo text")}
          </button>
          <p role="status">{t(copied)}</p>
          <p>
            {t(
              "Public fictional text only. Comparison is not a cryptographic identity guarantee.",
            )}
          </p>
        </PreviewSheet>
      )}
    </Frame>
  );
}
export const METADATA_FIELDS = Object.freeze([
  "GPS location",
  "EXIF camera data",
  "Capture dates",
  "Lens information",
]);
export function MetadataCleaner() {
  const { t } = useLanguage();
  const [fields, setFields] = useState(
    Object.fromEntries(METADATA_FIELDS.map((key) => [key, true])),
  );
  const [sheet, setSheet] = useState(null);
  const [revision, setRevision] = useState(0);
  return (
    <Frame
      title="METADATA CLEANER"
      icon="file"
      motion={revision ? "workflow-metadata-change" : ""}
    >
      <section className="workflow-panel">
        <div className="workflow-file">
          <Mark name="photo" />
          <span dir="ltr">IMG_DEMO_001.jpg</span>
          <button
            type="button"
            onClick={() => setSheet("Sample image")}
            aria-label={t("Sample image")}
          >
            <Mark name="chevron" />
          </button>
        </div>
        <p className="workflow-notice">{t("Fictional sample only")}</p>
      </section>
      <section className="workflow-panel">
        <h2>{t("Choose metadata to remove")}</h2>
        {METADATA_FIELDS.map((label) => (
          <Check
            key={label}
            label={label}
            checked={fields[label]}
            onChange={() => {
              setFields((current) => ({
                ...current,
                [label]: !current[label],
              }));
              setRevision((v) => v + 1);
            }}
          />
        ))}
      </section>
      <button
        type="button"
        className="workflow-secondary"
        onClick={() => setSheet("Supported formats")}
      >
        {t("Supported formats")}
      </button>
      <button
        type="button"
        className="security-primary"
        disabled={!Object.values(fields).some(Boolean)}
        onClick={() => setSheet("Create Clean Copy")}
      >
        {t("Create Clean Copy")}
        <Mark name="arrow" />
      </button>
      <p className="workflow-warning">
        {t(
          "Original untouched. No image is read, metadata removed or clean copy written.",
        )}
      </p>
      {sheet && (
        <PreviewSheet title={sheet} onClose={() => setSheet(null)}>
          <p>
            {t(
              sheet === "Create Clean Copy"
                ? "Output preview only. Selected labels describe a future operation, not removed metadata."
                : sheet === "Supported formats"
                  ? "JPEG and PNG are illustrative examples. Actual format support and removal effectiveness are not implemented."
                  : "IMG_DEMO_001.jpg is a fictional label; no image bytes or private metadata are loaded.",
            )}
          </p>
          {sheet === "Create Clean Copy" && (
            <ul>
              {METADATA_FIELDS.filter((label) => fields[label]).map((label) => (
                <li key={label}>{t(label)}</li>
              ))}
            </ul>
          )}
        </PreviewSheet>
      )}
    </Frame>
  );
}
