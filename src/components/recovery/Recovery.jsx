import React, { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useLanguage } from "../../i18n/Language";
import { SCREENS } from "../../config/screens";
import { Mark, PreviewSheet } from "../security/ScreenUI";
import "./recovery.css";

const MODE_IDS = ["create", "restore"];
export function Recovery() {
  const { t, locale, dir } = useLanguage();
  const { state } = useLocation();
  const parent =
    state?.returnTo === SCREENS.PRIVACY ? SCREENS.PRIVACY : SCREENS.HOME;
  const [mode, setMode] = useState("create");
  // Modes have separate mock destinations and acknowledgements; no real setup.
  const [destinations, setDestinations] = useState({
    create: "Choose demo location",
    restore: "Choose demo backup",
  });
  const [acknowledged, setAcknowledged] = useState({
    create: false,
    restore: false,
  });
  const [sheet, setSheet] = useState(null);
  const [tutorial, setTutorial] = useState(0);
  const creating = mode === "create";
  const rows = [
    [
      "Backup scope",
      "Fictional vault samples",
      "No real notes, passwords or device keys are included.",
      "database",
    ],
    [
      creating ? "Backup destination" : "Backup source",
      destinations[mode],
      creating
        ? "Select an illustrative destination label."
        : "Select a fictional backup label, not a device file.",
      "folder",
    ],
    [
      "Recovery credentials",
      "Not configured",
      "No recovery password, seed or private key is collected.",
      "key",
    ],
    [
      "Backup protection",
      "Preview only",
      "No encryption, file verification or storage is active.",
      "shield",
    ],
  ];
  function selectMode(next) {
    setMode(next);
    setSheet(null);
    setTutorial(0);
  }
  return (
    <main
      className="recovery-screen"
      dir={dir}
      lang={locale}
      data-screen="BACKUP"
    >
      <div className="recovery-shell">
        <Link className="recovery-back" to={parent}>
          ‹{" "}
          {t(
            parent === SCREENS.PRIVACY
              ? "Back to Privacy Center"
              : "Back to Home",
          )}
        </Link>
        <div
          className={`recovery-safe ${creating ? "" : "recovery-safe-restore"}`}
          aria-hidden="true"
        >
          <div className="recovery-safe-haze" />
          <div className="recovery-safe-half recovery-safe-left">
            <Mark name="database" />
            <span>
              <Mark name="lock" />
            </span>
          </div>
          <div className="recovery-safe-half recovery-safe-right">
            <Mark name="key" />
          </div>
          <i className="recovery-safe-seam" />
        </div>
        <header className="recovery-heading">
          <h1>{t("BACKUP & RECOVERY")}</h1>
          <p>{t("Plan your recovery. Keep control.")}</p>
        </header>
        <div
          className="recovery-tabs"
          role="tablist"
          aria-label={t("Backup mode")}
        >
          {MODE_IDS.map((id, index) => (
            <button
              type="button"
              key={id}
              id={`recovery-tab-${id}`}
              role="tab"
              data-mode={id}
              aria-selected={mode === id}
              aria-controls="recovery-setup-panel"
              tabIndex={mode === id ? 0 : -1}
              onClick={() => selectMode(id)}
              onKeyDown={(e) => {
                let next;
                if (e.key === "Home") next = 0;
                else if (e.key === "End") next = 1;
                else if (e.key === "ArrowRight") next = (index + 1) % 2;
                else if (e.key === "ArrowLeft") next = (index + 1) % 2;
                else return;
                e.preventDefault();
                selectMode(MODE_IDS[next]);
                e.currentTarget.parentElement
                  .querySelector(`[data-mode="${MODE_IDS[next]}"]`)
                  .focus();
              }}
            >
              {t(id === "create" ? "Create Backup" : "Restore Backup")}
            </button>
          ))}
        </div>
        <section
          className="recovery-setup"
          id="recovery-setup-panel"
          role="tabpanel"
          aria-labelledby={`recovery-tab-${mode}`}
        >
          <h2 className="recovery-sr-only">
            {t(creating ? "Create Backup" : "Restore Backup")}
          </h2>
          {rows.map(([title, value, description, icon], index) => (
            <button
              type="button"
              className="recovery-row"
              key={index}
              onClick={() =>
                setSheet(index === 1 ? "Choose mock location" : title)
              }
            >
              <span className="recovery-row-icon">
                <Mark name={icon} />
              </span>
              <span className="recovery-row-copy">
                <small>{t(title)}</small>
                <strong>{t(value)}</strong>
                <span>{t(description)}</span>
              </span>
              <Mark name="chevron" />
            </button>
          ))}
        </section>
        <aside className="recovery-warning">
          <Mark name="info" />
          <p>
            {t(
              "Preserve your originals. This visual demo does not create a backup or recover data. Do not enter real recovery secrets.",
            )}
          </p>
        </aside>
        <button
          className="security-primary recovery-configure"
          type="button"
          onClick={() =>
            setSheet(creating ? "Configure Backup" : "Review Restore")
          }
        >
          <Mark name={creating ? "lock" : "folder"} />
          {t(creating ? "Configure Backup" : "Review Restore")}
          <Mark name="arrow" />
        </button>
        <button
          className="recovery-test"
          type="button"
          onClick={() => {
            setTutorial(0);
            setSheet("Test Recovery");
          }}
        >
          <Mark name="shield" />
          {t("Test Recovery")}
          <Mark name="chevron" />
        </button>
        <p className="recovery-status" role="status">
          {t(
            acknowledged[mode]
              ? "Preview reviewed only. Recovery credentials remain Not configured."
              : "Visual demo · backup and recovery are not configured",
          )}
        </p>
      </div>
      {sheet && (
        <PreviewSheet title={sheet} onClose={() => setSheet(null)}>
          {sheet === "Choose mock location" ? (
            <>
              <p>
                {t(
                  "Choose a fictional label only. No device picker opens and nothing is read or written.",
                )}
              </p>
              {(creating
                ? ["Demo local folder", "Demo offline drive"]
                : ["Demo backup A", "Demo backup B"]
              ).map((label) => (
                <button
                  key={label}
                  type="button"
                  className="security-choice"
                  onClick={() => {
                    setDestinations((current) => ({
                      ...current,
                      [mode]: label,
                    }));
                    setAcknowledged((current) => ({
                      ...current,
                      [mode]: false,
                    }));
                    setSheet(null);
                  }}
                >
                  {t(label)}
                </button>
              ))}
            </>
          ) : sheet === "Recovery credentials" ? (
            <p>
              {t(
                "Recovery credentials remain Not configured. Secret entry is disabled; no real recovery material should be entered into this prototype.",
              )}
            </p>
          ) : sheet === "Test Recovery" ? (
            <>
              <p className="recovery-step-label">
                {t("Tutorial step")} {tutorial + 1} / 3
              </p>
              <p>
                {t(
                  [
                    "Review the fictional backup source and preserve your original files.",
                    "A real system would require verified recovery credentials. This demo does not accept or verify them.",
                    "End of tutorial only. No test recovery, decryption or restored output was performed.",
                  ][tutorial],
                )}
              </p>
              {tutorial < 2 ? (
                <button
                  type="button"
                  className="security-choice"
                  onClick={() => setTutorial((value) => value + 1)}
                >
                  {t("Next tutorial step")}
                </button>
              ) : (
                <button
                  type="button"
                  className="security-choice"
                  onClick={() => setSheet(null)}
                >
                  {t("Close tutorial")}
                </button>
              )}
            </>
          ) : sheet === "Configure Backup" || sheet === "Review Restore" ? (
            <>
              <p>
                {t(
                  creating
                    ? "Configuration preview only. The destination is an in-memory label. No backup, encryption or recovery credential will be created."
                    : "Restore preview only. No file is opened, decrypted or restored. Your original data is never changed.",
                )}
              </p>
              <dl className="recovery-summary">
                <dt>{t(creating ? "Backup destination" : "Backup source")}</dt>
                <dd>{t(destinations[mode])}</dd>
                <dt>{t("Recovery credentials")}</dt>
                <dd>{t("Not configured")}</dd>
              </dl>
              <button
                type="button"
                className="security-choice"
                onClick={() => {
                  setAcknowledged((current) => ({ ...current, [mode]: true }));
                  setSheet(null);
                }}
              >
                {t("Acknowledge visual preview")}
              </button>
            </>
          ) : (
            <p>
              {t(
                sheet === "Backup scope"
                  ? "Only fictional interface samples are described here. No real vault, device key, note or password is accessed."
                  : "Protection labels are explanatory only. No encrypted archive, integrity check, cloud transfer or secure backup exists in this prototype.",
              )}
            </p>
          )}
        </PreviewSheet>
      )}
    </main>
  );
}
