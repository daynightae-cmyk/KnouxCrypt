import React, { useState } from "react";
import { Link } from "react-router-dom";
import { SCREENS } from "../../config/screens";
import { useLanguage } from "../../i18n/Language";
import { Mark, PreviewSheet } from "../security/ScreenUI";
import "./vaulttools.css";
function Frame({ title, icon, parent, children, motion = "" }) {
  const { t, locale, dir } = useLanguage();
  return (
    <main className={`vaulttools-screen ${motion}`} dir={dir} lang={locale}>
      <div className="vaulttools-shell">
        <Link className="vt-back" to={parent}>
          ‹{" "}
          {t(
            parent === SCREENS.VAULT
              ? "Back to Vault"
              : parent === SCREENS.KEY_DETAILS
                ? "Back to Key Details"
                : "Back to Tools",
          )}
        </Link>
        <div className="vt-art" aria-hidden="true">
          <Mark name={icon} />
          <i />
        </div>
        <h1>{t(title)}</h1>
        <p className="vt-notice">{t("VISUAL DEMO")}</p>
        {children}
      </div>
    </main>
  );
}
export function VaultCollections() {
  const { t } = useLanguage();
  const [items, setItems] = useState(
    [
      "Private Documents",
      "Creative Assets",
      "Personal Archive",
      "Shared Files",
    ].map((name, i) => ({ id: i, name, cover: "Cube" })),
  );
  const [query, setQuery] = useState("");
  const [sheet, setSheet] = useState(null);
  const [selected, setSelected] = useState(null);
  const [name, setName] = useState("");
  const [cover, setCover] = useState("Cube");
  return (
    <Frame
      title="VAULT COLLECTIONS"
      icon="database"
      parent={SCREENS.VAULT}
      motion={selected ? "vt-extruded" : ""}
    >
      <div className="vt-actions">
        <button type="button" onClick={() => setSheet("Create Collection")}>
          {t("Create Collection")}
        </button>
        <button type="button" onClick={() => setSheet("Import preview")}>
          {t("Import preview")}
        </button>
      </div>
      <label className="vt-field">
        {t("Filter collections")}
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          maxLength={100}
        />
      </label>
      <section className="vt-list">
        {items
          .filter((item) =>
            `${item.name} ${t(item.name)}`
              .toLowerCase()
              .includes(query.toLowerCase()),
          )
          .map((item) => (
            <button
              className="vt-card"
              type="button"
              key={item.id}
              onClick={() => {
                setSelected(item);
                setSheet("Collection preview");
              }}
            >
              <Mark name={item.cover === "Folder" ? "folder" : "database"} />
              <strong>{t(item.name)}</strong>
              <small>{t("Fictional collection")}</small>
              <Mark name="chevron" />
            </button>
          ))}
      </section>
      {sheet && (
        <PreviewSheet
          title={sheet}
          onClose={() => {
            setSheet(null);
            setSelected(null);
          }}
        >
          {sheet === "Create Collection" ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!name.trim()) return;
                setItems((current) => [
                  ...current,
                  { id: current.length, name: name.trim(), cover },
                ]);
                setName("");
                setSheet(null);
              }}
            >
              <label className="vt-field">
                {t("Fictional collection name")}
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value.slice(0, 80))}
                />
              </label>
              <div className="vt-actions">
                {["Cube", "Folder"].map((value) => (
                  <button
                    type="button"
                    key={value}
                    aria-pressed={cover === value}
                    onClick={() => setCover(value)}
                  >
                    {t(value)}
                  </button>
                ))}
              </div>
              <button
                className="security-choice"
                type="submit"
                disabled={!name.trim()}
              >
                {t("Create local preview")}
              </button>
              <p>{t("Memory only. No collection is encrypted or stored.")}</p>
            </form>
          ) : sheet === "Collection preview" ? (
            <>
              <h3>{t(selected?.name)}</h3>
              <p>
                {t(
                  "This collection is fictional and locked artwork does not prove protection.",
                )}
              </p>
              <Link to={SCREENS.DOCUMENT_VIEWER}>
                {t("Open document preview")}
              </Link>
            </>
          ) : (
            <p>{t("No collection import or file access is performed.")}</p>
          )}
        </PreviewSheet>
      )}
    </Frame>
  );
}
export function DocumentViewer() {
  const { t } = useLanguage();
  const [shown, setShown] = useState(false);
  const [sheet, setSheet] = useState(false);
  return (
    <Frame title="PROTECTED DOCUMENT VIEWER" icon="file" parent={SCREENS.VAULT}>
      <section className="vt-panel">
        <strong dir="ltr">Project_Orion_Proposal.pdf</strong>
        <p>{t("Fictional document · no file loaded")}</p>
      </section>
      <section
        className="vt-document"
        aria-label={t("Locked visual document preview")}
      >
        <Mark name="lock" />
        <strong>
          {t(shown ? "DEMO document illustration" : "Locked preview")}
        </strong>
        {shown && (
          <p>
            {t(
              "Fictional document layout only. No real document was unlocked or authenticated.",
            )}
          </p>
        )}
      </section>
      <section className="vt-panel">
        <p>{t("Session timer: not running")}</p>
        <p>{t("Screenshot restriction: not enforced")}</p>
        <p>{t("Temporary unlock: visual only")}</p>
      </section>
      <button
        type="button"
        className="security-primary"
        onClick={() => (shown ? setShown(false) : setSheet(true))}
      >
        {t(shown ? "Lock demo preview" : "Authenticate to Preview")}
        <Mark name="arrow" />
      </button>
      {sheet && (
        <PreviewSheet
          title="Document authentication preview"
          onClose={() => setSheet(false)}
        >
          <p>
            {t(
              "No authentication occurs. Continue to show a fictional DEMO illustration only.",
            )}
          </p>
          <button
            className="security-choice"
            type="button"
            onClick={() => {
              setShown(true);
              setSheet(false);
            }}
          >
            {t("Show DEMO illustration")}
          </button>
        </PreviewSheet>
      )}
    </Frame>
  );
}
export function VaultKeyRotation() {
  const { t } = useLanguage();
  const [step, setStep] = useState(0);
  const [checks, setChecks] = useState([false, false]);
  const [alias, setAlias] = useState("Demo next key");
  const [sheet, setSheet] = useState(false);
  return (
    <Frame
      title="VAULT KEY ROTATION"
      icon="key"
      parent={SCREENS.KEY_DETAILS}
      motion={`vt-rotation-step-${step}`}
    >
      <section className="vt-panel">
        <h2>{t("Current key · fictional")}</h2>
        <code dir="ltr">DEMO-KEY-UNCHANGED</code>
        <p>{t("No real key exists in this workflow.")}</p>
      </section>
      <section className="vt-panel">
        <h2>
          {t("Visual step")} {step + 1} / 3
        </h2>
        {step === 0 ? (
          [
            "I understand this is not a backup",
            "I will not enter private key material",
          ].map((label, i) => (
            <label className="vt-check" key={label}>
              {t(label)}
              <input
                type="checkbox"
                checked={checks[i]}
                onChange={() =>
                  setChecks((current) =>
                    current.map((v, j) => (j === i ? !v : v)),
                  )
                }
              />
            </label>
          ))
        ) : step === 1 ? (
          <label className="vt-field">
            {t("Fictional next-key alias")}
            <input
              value={alias}
              maxLength={80}
              onChange={(e) => setAlias(e.target.value)}
            />
          </label>
        ) : (
          <p>
            {t(
              "Review only. No preflight checks or key rewrite have occurred.",
            )}
          </p>
        )}
      </section>
      <button
        type="button"
        className="security-primary"
        disabled={
          step === 0
            ? !checks.every(Boolean)
            : step === 1
              ? !alias.trim()
              : false
        }
        onClick={() => (step < 2 ? setStep((s) => s + 1) : setSheet(true))}
      >
        {t(step === 2 ? "Run Preflight Checks" : "Next visual step")}
        <Mark name="arrow" />
      </button>
      <button
        type="button"
        className="vt-secondary"
        onClick={() => {
          setStep(0);
          setChecks([false, false]);
          setAlias("Demo next key");
        }}
      >
        {t("Cancel preview")}
      </button>
      {sheet && (
        <PreviewSheet title="Preflight preview" onClose={() => setSheet(false)}>
          <p>
            {t(
              "No preflight was run, no new key was created, and the current key label remains unchanged.",
            )}
          </p>
        </PreviewSheet>
      )}
    </Frame>
  );
}
export function PackageInspector() {
  const { t } = useLanguage();
  const [corrupt, setCorrupt] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [sheet, setSheet] = useState(null);
  const [inspect, setInspect] = useState(false);
  return (
    <Frame
      title="CIPHERTEXT PACKAGE INSPECTOR"
      icon="database"
      parent={SCREENS.TOOLS}
      motion={expanded ? "vt-inspecting" : ""}
    >
      <button
        type="button"
        className="vt-card"
        onClick={() => setSheet("Choose demo package")}
      >
        <Mark name="file" />
        <strong dir="ltr">
          {corrupt ? "corrupted-demo.knx" : "sample-package.knx"}
        </strong>
        <Mark name="chevron" />
      </button>
      <section className="vt-panel">
        <h2>{t("Package header")}</h2>
        {[
          ["Version", "DEMO-v1"],
          ["Nonce length", "12 · illustrative"],
          ["Tag length", "16 · illustrative"],
        ].map(([label, value]) => (
          <div key={label}>
            <button
              className="vt-row"
              type="button"
              aria-expanded={expanded === label}
              onClick={() => setExpanded(expanded === label ? null : label)}
            >
              {t(label)}
              <code dir="ltr">{value}</code>
              <Mark name="chevron" />
            </button>
            {expanded === label && (
              <p>
                {t(
                  "Illustrative field only. No ciphertext bytes are parsed or revealed.",
                )}
              </p>
            )}
          </div>
        ))}
      </section>
      <section className="vt-panel">
        <h2>{t("Container structure")}</h2>
        <p>DEMO header → DEMO payload → DEMO tag</p>
        <p className="vt-warning">
          {t(
            corrupt
              ? "Corrupted sample warning only. No integrity test was performed."
              : "Verification result: not evaluated",
          )}
        </p>
      </section>
      <button
        type="button"
        className="security-primary"
        onClick={() => {
          setInspect(true);
          setSheet("Header inspection preview");
        }}
      >
        {t("Inspect Package Header")}
        <Mark name="arrow" />
      </button>
      {sheet && (
        <PreviewSheet
          title={sheet}
          onClose={() => {
            setSheet(null);
            setInspect(false);
          }}
        >
          {sheet === "Choose demo package" ? (
            <>
              {[false, true].map((value) => (
                <button
                  key={String(value)}
                  className="security-choice"
                  type="button"
                  onClick={() => {
                    setCorrupt(value);
                    setExpanded(null);
                    setSheet(null);
                  }}
                >
                  {value ? "corrupted-demo.knx" : "sample-package.knx"}
                </button>
              ))}
            </>
          ) : (
            <p>
              {t(
                "Header preview only. No package authentication, decryption, integrity verdict or secret payload access occurred.",
              )}
            </p>
          )}
        </PreviewSheet>
      )}
      {inspect && (
        <span className="vt-sr-only">{t("Visual inspect preview only")}</span>
      )}
    </Frame>
  );
}
