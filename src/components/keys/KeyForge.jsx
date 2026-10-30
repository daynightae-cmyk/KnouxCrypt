import React, { useState } from "react";
import { Link } from "react-router-dom";
import { SCREENS } from "../../config/screens";
import { useLanguage } from "../../i18n/Language";
import { StagEmblem } from "../entry/StagEmblem";
import { Mark, PreviewSheet } from "../security/ScreenUI";
import "./keys.css";

export const KEY_METADATA = Object.freeze([
  {
    id: "alias",
    label: "Alias",
    value: "Knoux Demo Key",
    description: "A fictional display name, not a key stored on this device.",
  },
  {
    id: "purpose",
    label: "Purpose",
    value: "Signing & verification",
    description:
      "Reference usage only. This interface does not sign or verify data.",
  },
  {
    id: "provider",
    label: "Provider",
    value: "Device provider · demo",
    description:
      "No device keystore, browser credential API or hardware provider is connected.",
  },
  {
    id: "hardware",
    label: "Hardware Support",
    value: "Not evaluated",
    description: "Hardware-backed protection has not been detected or tested.",
  },
  {
    id: "lifecycle",
    label: "Lifecycle",
    value: "Visual sample only",
    description:
      "No key was created, activated, rotated, revoked or destroyed.",
  },
]);
const keyTools = [
  ["KEY_DETAILS", "Device Keys", "Manage your device key previews", "key"],
  ["SIGNATURE", "Signature Verify", "Explore signature verification", "shield"],
  ["SECURE_SHARE", "Encrypted Share", "Preview protected sharing", "upload"],
];
export function KeyForge() {
  const { t, locale, dir } = useLanguage();
  const [profile, setProfile] = useState(false);
  return (
    <main
      className="keys-screen"
      dir={dir}
      lang={locale}
      data-screen="KEY_FORGE"
    >
      <div className="keys-shell">
        <div className="keys-topline">
          <Link to={SCREENS.HOME}>‹ {t("Back to Home")}</Link>
          <button
            type="button"
            aria-label={t("Key Forge profile")}
            onClick={() => setProfile(true)}
          >
            <Mark name="settings" />
          </button>
        </div>
        <div className="keys-forge-hero" aria-hidden="true">
          <div className="keys-hero-haze" />
          <div className="keys-orbital keys-orbital-one" />
          <div className="keys-orbital keys-orbital-two" />
          <StagEmblem ignite />
          <div className="keys-rock-platform" />
        </div>
        <header className="keys-heading">
          <h1>{t("Key Forge")}</h1>
          <p>{t("Your keys. Your control.")}</p>
        </header>
        <section
          className="keys-service-list"
          aria-label={t("Key Forge services")}
        >
          {keyTools.map(([id, title, description, icon]) => (
            <Link key={id} to={SCREENS[id]} className="keys-service">
              <span className="keys-service-icon">
                <Mark name={icon} />
              </span>
              <span>
                <strong>{t(title)}</strong>
                <small>{t(description)}</small>
                <em>{t("Visual preview")}</em>
              </span>
              <Mark name="chevron" />
            </Link>
          ))}
        </section>
        <p className="keys-demo-caption">
          {t("Visual demo · no device keys or security operations")}
        </p>
      </div>
      {profile && (
        <PreviewSheet
          title="Key Forge profile"
          onClose={() => setProfile(false)}
        >
          <p>
            {t(
              "Key Forge is an offline visual demo. No account, device key, hardware protection or cryptographic service is connected.",
            )}
          </p>
          <Link to={SCREENS.HOME}>{t("Back to Home")}</Link>
          <Link to={SCREENS.TOOLS}>{t("Tools")}</Link>
        </PreviewSheet>
      )}
    </main>
  );
}
function KeyLattice({ expanded }) {
  return (
    <div
      className={`keys-lattice ${expanded ? "keys-lattice-expanded" : ""}`}
      aria-hidden="true"
    >
      <span />
      <span />
      <span />
      <Mark name="key" />
    </div>
  );
}
export function KeyDetails() {
  const { t, locale, dir } = useLanguage();
  const [expanded, setExpanded] = useState(null);
  const [sheet, setSheet] = useState(null);
  const [alias, setAlias] = useState("Knoux Demo Key");
  const [configured, setConfigured] = useState(false);
  return (
    <main
      className="keys-screen keys-details-screen"
      dir={dir}
      lang={locale}
      data-screen="KEY_DETAILS"
    >
      <div className="keys-shell">
        <Link className="keys-parent-back" to={SCREENS.KEY_FORGE}>
          ‹ {t("Back to Key Forge")}
        </Link>
        <KeyLattice expanded={!!expanded} />
        <header className="keys-heading">
          <h1>{t("Key Forge")}</h1>
          <p>{t("Device Keys")}</p>
        </header>
        <section className="keys-metadata" aria-label={t("Key metadata")}>
          {KEY_METADATA.map((row) => (
            <div key={row.id} className="keys-metadata-item">
              <button
                type="button"
                aria-expanded={expanded === row.id}
                aria-controls={`key-${row.id}-description`}
                onClick={() => setExpanded(expanded === row.id ? null : row.id)}
              >
                <span>{t(row.label)}</span>
                <strong>{t(row.value)}</strong>
                <Mark name="chevron" />
              </button>
              <p id={`key-${row.id}-description`} hidden={expanded !== row.id}>
                {t(row.description)}
              </p>
            </div>
          ))}
        </section>
        <div className="keys-main-actions">
          <button
            className="security-primary"
            type="button"
            onClick={() => {
              setConfigured(false);
              setSheet("Create Key");
            }}
          >
            <Mark name="key" />
            {t("Create Key")}
            <Mark name="arrow" />
          </button>
          <button
            className="keys-secondary"
            type="button"
            onClick={() => setSheet("View Public Key")}
          >
            {t("View Public Key")}
          </button>
        </div>
        <div className="keys-minor-actions">
          <button type="button" onClick={() => setSheet("Rotate Key")}>
            {t("Rotate Key")}
          </button>
          <button type="button" onClick={() => setSheet("Key Details")}>
            {t("Key Details")}
          </button>
        </div>
        <Link className="keys-verification" to={SCREENS.SIGNATURE}>
          <Mark name="shield" />
          <span>
            <strong>{t("Signature Verification")}</strong>
            <small>{t("Inspect the verification workflow")}</small>
          </span>
          <Mark name="chevron" />
        </Link>
        <p className="keys-demo-caption">
          {t("Visual demo · no device keys or security operations")}
        </p>
      </div>
      {sheet && (
        <PreviewSheet title={sheet} onClose={() => setSheet(null)}>
          {sheet === "Create Key" ? (
            <>
              <p>
                {t(
                  "Configure a fictional label only. No key material, keystore or hardware API will be created or accessed.",
                )}
              </p>
              <form
                className="keys-config-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (alias.trim()) setConfigured(true);
                }}
              >
                <label>
                  {t("Alias")}
                  <input
                    dir="auto"
                    value={alias}
                    maxLength={80}
                    onChange={(e) => {
                      setAlias(e.target.value);
                      setConfigured(false);
                    }}
                  />
                </label>
                <label>
                  {t("Purpose")}
                  <input value={t("Signing & verification")} readOnly />
                </label>
                <button
                  className="security-choice"
                  type="submit"
                  disabled={!alias.trim()}
                >
                  {t("Preview configuration")}
                </button>
              </form>
              {configured && (
                <p role="status">
                  {t("Configuration preview only. No key was created.")}
                </p>
              )}
            </>
          ) : sheet === "View Public Key" ? (
            <>
              <p>
                {t(
                  "This public sample fingerprint is illustrative and does not identify a real key.",
                )}
              </p>
              <code className="keys-fingerprint" dir="ltr">
                DEMO-ONLY · 0000 1111 2222 3333
                <br />
                4444 5555 6666 7777
              </code>
              <p>
                {t("No private key or exportable key material is available.")}
              </p>
            </>
          ) : sheet === "Rotate Key" ? (
            <>
              <p>
                {t(
                  "Rotation confirmation preview only. Continuing does not rotate, replace or revoke any key.",
                )}
              </p>
              <Link to={SCREENS.VAULT_KEY_ROTATION}>
                {t("Open rotation workflow preview")}
              </Link>
            </>
          ) : (
            <>
              <p>
                {t(
                  "Key metadata is fictional. No hardware security, provider availability or lifecycle state has been verified.",
                )}
              </p>
              <Link to={SCREENS.SIGNATURE}>{t("Signature Verification")}</Link>
            </>
          )}
        </PreviewSheet>
      )}
    </main>
  );
}
// Future missions retain explicit holding screens and parent-specific Back links.
export function KeyWorkflowPreview({ id, title }) {
  const { t, locale, dir } = useLanguage();
  const parent =
    id === "VAULT_KEY_ROTATION"
      ? SCREENS.KEY_DETAILS
      : id === "SECURE_SHARE"
        ? SCREENS.TOOLS
        : SCREENS.KEY_FORGE;
  return (
    <main className="keys-screen" dir={dir} lang={locale}>
      <section className="keys-shell keys-holding">
        <p className="keys-demo-caption">{t("VISUAL DEMO")}</p>
        <h1>{t(title)}</h1>
        <p>
          {t(
            "This workflow is awaiting its numbered implementation. No security operation is running.",
          )}
        </p>
        <Link to={parent}>
          {t(
            id === "VAULT_KEY_ROTATION"
              ? "Back to Key Details"
              : id === "SECURE_SHARE"
                ? "Back to Tools"
                : "Back to Key Forge",
          )}
        </Link>
      </section>
    </main>
  );
}
