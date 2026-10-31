import { useLanguage, translate } from "../../i18n/Language";
import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { SCREENS, SERVICES } from "../../config/screens";
import { StagEmblem } from "../entry/StagEmblem";
import { useVault, VAULT_STATE } from "../../hooks/useVault";
import { capabilityById } from "../../config/desktopCapabilities";
import "./home.css";

// Truthful status labels: a claim only appears when a real service backs it.
const VAULT_STATUS_COPY = {
  [VAULT_STATE.UNAVAILABLE]: {
    label: "Vault engine unavailable",
    detail: "Open the desktop app to enroll or unlock a real vault.",
    tone: "warn",
  },
  [VAULT_STATE.UNENROLLED]: {
    label: "No vault on this device",
    detail: "Create a local vault to enable real authenticated encryption.",
    tone: "idle",
  },
  [VAULT_STATE.LOCKED]: {
    label: "Vault locked",
    detail: "Your keys are protected. Unlock to encrypt or decrypt files.",
    tone: "idle",
  },
  [VAULT_STATE.UNLOCKED]: {
    label: "Vault unlocked",
    detail: "AES-256-GCM authenticated encryption is active for this session.",
    tone: "ok",
  },
  [VAULT_STATE.GUEST]: {
    label: "Guest preview",
    detail: "Non-privileged session. It cannot encrypt, decrypt, or read vault keys.",
    tone: "warn",
  },
};

function formatBytes(n) {
  if (typeof n !== "number" || !Number.isFinite(n)) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function VaultStatusPanel() {
  const { t } = useLanguage();
  const vault = useVault();
  const copy = VAULT_STATUS_COPY[vault.state] || VAULT_STATUS_COPY[VAULT_STATE.UNAVAILABLE];
  const activity = vault.status?.activity || [];
  return <section className="hub-vault-status" data-vault-state={vault.state} data-vault-tone={copy.tone} aria-label={t("Vault status")}>
    <div className="hub-vault-status-head">
      <span className="hub-vault-dot" aria-hidden="true"/>
      <div><strong>{t(copy.label)}</strong><p>{t(copy.detail)}</p></div>
    </div>
    <dl className="hub-vault-facts">
      <div><dt>{t("Encryption")}</dt><dd>{t(vault.status?.engine?.algorithm || "AES-256-GCM")}</dd></div>
      <div><dt>{t("Key derivation")}</dt><dd>{t(vault.status?.engine?.kdf || "HKDF-SHA256")}</dd></div>
      <div><dt>{t("Container format")}</dt><dd>{t(vault.status?.engine?.format || "KNXVLT01")}</dd></div>
      <div><dt>{t("Session")}</dt><dd>{t(vault.session ? (vault.session.guest ? "Guest" : "Authenticated") : "Locked")}</dd></div>
    </dl>
    {vault.state !== VAULT_STATE.UNLOCKED && <Link className="hub-vault-action" to={SCREENS.SECURE_ACCESS_LOGIN} state={{ returnTo: SCREENS.HOME }}>{t("Open Secure Access")}</Link>}
    {vault.state === VAULT_STATE.UNLOCKED && <button type="button" className="hub-vault-action" data-vault-action="lock" onClick={() => vault.lock()} disabled={vault.busy}>{t("Lock Vault Now")}</button>}
    {activity.length > 0 && <div className="hub-vault-activity">
      <h3>{t("Recent vault activity")}</h3>
      <ul>{activity.slice(0, 4).map((entry) => <li key={entry.id}><span>{t(entry.detail)}</span><time dateTime={entry.at}>{new Date(entry.at).toLocaleTimeString()}</time></li>)}</ul>
    </div>}
  </section>;
}

const artwork = import.meta.glob("../../assets/service-*.webp", { eager: true, import: "default" });

// The existing route registry remains authoritative. Home services come first;
// aliases in the additional Tools shortcuts must not hide or duplicate them.
const EXTRA_TOOLS = [['KEY_FORGE','Key Forge'],['SIGNATURE','Signature Verification'],['SECURE_SHARE','Secure Share'],['INTEGRITY','Hash & Integrity'],['TEXT_CIPHER','Text Cipher'],['CERTIFICATE_INSPECTOR','Certificate Inspector'],['ARCHIVE','Archive'],['LOCAL_TRANSFER','Local Transfer'],['FINGERPRINT_VERIFY','Fingerprint Verify'],['METADATA_CLEANER','Metadata Cleaner'],['CLIPBOARD_GUARD','Clipboard Guard'],['SECURE_RANDOM','Secure Random Studio'],['HMAC_AUTHENTICITY','HMAC Authenticity Lab'],['PUBLIC_KEY_QR','Public Key QR'],['COLLECTIONS','Collections'],['DOCUMENT_VIEWER','Document viewer'],['PACKAGE_INSPECTOR','Package Inspector'],['AUTOFILL','Autofill'],['OFFLINE_ADVISOR','Offline Security Advisor'],['KEY_DERIVATION','Key Derivation'],['SECURITY_ACTIVITY','Security Activity'],['SECRET_CAPSULE','Expiring Secret Capsule'],['SESSION_PRIVACY','Session Privacy'],['FILE_INTEGRITY','File integrity'],['SECURE_CLIPBOARD','Secure Clipboard'],['DEVICE_PAIRING','Device Pairing'],['PASSWORD_AUDIT','Password audit']];
export const TOOL_SERVICES = Object.freeze(
  [...SERVICES, ...EXTRA_TOOLS.map(([id, title]) => ({ id, title }))]
    .filter((service, index, all) => all.findIndex(entry => SCREENS[entry.id] === SCREENS[service.id]) === index)
);
function searchText(value) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f\u064B-\u065F\u0670\u0640]/g, "").toLocaleLowerCase().trim();
}
export const TOOL_CATEGORIES = Object.freeze([
  {id:"primary", title:"Essentials", ids:SERVICES.map(service=>service.id)},
  {id:"files", title:"Files & Vault", ids:["INTEGRITY","TEXT_CIPHER","ARCHIVE","METADATA_CLEANER","COLLECTIONS","DOCUMENT_VIEWER","PACKAGE_INSPECTOR","FILE_INTEGRITY"]},
  {id:"keys", title:"Keys & Identity", ids:["SIGNATURE","CERTIFICATE_INSPECTOR","FINGERPRINT_VERIFY","SECURE_RANDOM","HMAC_AUTHENTICITY","PUBLIC_KEY_QR","KEY_DERIVATION","AUTOFILL","PASSWORD_AUDIT"]},
  {id:"privacy", title:"Privacy & Sharing", ids:["SECURE_SHARE","LOCAL_TRANSFER","CLIPBOARD_GUARD","OFFLINE_ADVISOR","SECURITY_ACTIVITY","SECRET_CAPSULE","SESSION_PRIVACY","SECURE_CLIPBOARD","DEVICE_PAIRING"]},
  {id:"all", title:"All tools", ids:TOOL_SERVICES.map(service=>service.id)},
]);
export function ToolsDirectory({ query = "", resultsId = "hub-tools-results" }) {
  const { t } = useLanguage();
  const [category,setCategory] = useState("primary");
  const activeCategory = TOOL_CATEGORIES.find(item=>item.id===category);
  const filtered = TOOL_SERVICES.filter(service => (searchText(query) || activeCategory.ids.includes(service.id)) && searchText(`${service.title} ${translate(service.title, "ar")} ${service.description || ""} ${translate(service.description || "", "ar")} ${service.id === "BACKUP" ? "Backup نسخ احتياطي" : ""}`).includes(searchText(query)));
  return <section aria-label={t("Tools")}>
    <div className="hub-tool-categories" role="group" aria-label={t("Tool categories")}>{TOOL_CATEGORIES.map(item=><button key={item.id} type="button" data-tool-category={item.id} aria-pressed={category===item.id} onClick={()=>setCategory(item.id)}>{t(item.title)}</button>)}</div>
    <p className="hub-results-count" role="status" aria-live="polite" aria-atomic="true">{t("Matching services")}: {filtered.length}</p>
    {filtered.length ? <div id={resultsId} className="hub-extra-tools" data-tools-results>{filtered.map(service => {
      // The label reflects the capability registry: only services with real
      // tested behaviour are allowed to show a non-demo status.
      const status = capabilityById(service.id)?.displayStatus;
      return <Link key={service.id} to={SCREENS[service.id]} data-service-status={status || "PLANNED"}><span>{t(service.title)}</span><small>{t(status === "ACTIVE" || status === "VERIFIED" ? status : "VISUAL DEMO")}</small></Link>;
    })}</div> : <p id={resultsId} className="hub-no-results">{t("No matching tools.")}</p>}
  </section>;
}

function Glyph({ name }) {
  const { t, locale, dir } = useLanguage();

  const paths = {
    search: <><circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/></>,
    settings: <><path d="m10 2 4 0 1 3 3 1 3-1 2 4-2 2v3l2 2-2 4-3-1-3 1-1 3h-4l-1-3-3-1-3 1-2-4 2-2v-3L1 9l2-4 3 1 3-1Z"/><circle cx="12" cy="12" r="3"/></>,
    home: <><path d="m3 11 9-8 9 8v10h-6v-7H9v7H3Z"/></>,
    tools: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
    account: <><circle cx="12" cy="7" r="4"/><path d="M4 22v-3a8 8 0 0 1 16 0v3Z"/></>,
  };
  return <svg viewBox="0 0 24 24" fill={name === "home" ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

function Header({ onSearch, onSettings }) {
  const { t, locale, dir } = useLanguage();

  return <header className="hub-header">
    <Link to={SCREENS.HOME} className="hub-brand" aria-label={t("Knoux Crypt Home")}><span><span className="hub-wordmark">{t("Knoux ")}<em>{t("Crypt")}</em></span><small>{t("Private Encryption Suite")}</small></span></Link>
    <div className="hub-header-actions"><button type="button" aria-label={t("Search tools")} onClick={onSearch}><Glyph name="search"/></button><button type="button" aria-label={t("Settings visual demo")} onClick={onSettings}><Glyph name="settings"/></button></div>
  </header>;
}
export function ServiceGrid({ filter = "" }) {
  const { t, locale, dir } = useLanguage();

  const filtered = SERVICES.filter(s => `${s.title} ${s.description} ${t(s.title)} ${t(s.description)}`.toLowerCase().includes(filter.toLowerCase()));
  return <>{filtered.length ? <div className="hub-services">{filtered.map((service, index) => <Link className={`hub-service hub-service-${service.art}`} data-service={service.id} style={{"--rim-delay": `${index * 30}ms`}} key={service.id} to={SCREENS[service.id]}>
    <span className="energy-vein" aria-hidden="true"><svg viewBox="0 0 100 100" preserveAspectRatio="none"><rect x="1" y="1" width="98" height="98" rx="10" pathLength="100"/></svg></span><span className="hub-icon"><img src={artwork[`../../assets/service-${service.art}.webp`]} width="120" height="124" alt=""/></span>
    <span className="service-personality" data-personality={service.id} aria-hidden="true"><i/><i/><i/></span><span className="hub-service-copy"><span>{t(service.title)}</span><small>{t(service.description)}</small></span><span className="hub-chevron" aria-hidden="true">{t("›")}</span>
  </Link>)}</div> : <p className="hub-no-results" role="status">{t("No matching tools.")}</p>}</>;
}
function HubDialog({ kind, onClose }) {
  const { t, locale, dir } = useLanguage();

  const ref = useRef(null);
  const [filter, setFilter] = useState("");
  useEffect(() => { const previous = document.activeElement;ref.current.showModal();return () => previous?.focus(); }, []);
  return <dialog ref={ref} className="hub-dialog" onKeyDown={e => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onClose(); } }} onCancel={onClose} onClick={e => { if (e.target === e.currentTarget) onClose(); }} aria-labelledby="hub-dialog-title">
    <button className="hub-close" type="button" aria-label={t("Close")} onClick={onClose}>{t("×")}</button>
    <h2 id="hub-dialog-title">{t(kind === "search" ? "Search tools" : "Settings · VISUAL DEMO")}</h2>
    {kind === "search" ? <><label className="hub-search-label">{t("Find a service")}<input autoFocus type="search" aria-controls="hub-dialog-tools-results" value={filter} onChange={e => setFilter(e.target.value)} placeholder={t("Vault, notes, keys…")}/></label><ToolsDirectory query={filter} resultsId="hub-dialog-tools-results"/></> : <><p>{t("The vault status on Home is read from the local vault service, not a mock. Encryption settings, key custody and session control live in Secure Access. Disk and volume encryption are not implemented in this build.")}</p><Link to={SCREENS.SECURE_ACCESS_LOGIN} state={{returnTo: SCREENS.HOME}}>{t("Open Secure Access")}</Link><button type="button" onClick={onClose}>{t("Return to Home")}</button></>}
  </dialog>;
}
export function Home({ tools = false }) {
  const { t, locale, dir } = useLanguage();
  const vault = useVault();

  const [dialog, setDialog] = useState(null);
  const [toolQuery,setToolQuery] = useState("");
  const statusCopy = VAULT_STATUS_COPY[vault.state] || VAULT_STATUS_COPY[VAULT_STATE.UNAVAILABLE];
  return <main className="crypt-hub" dir={dir} lang={locale} data-screen={tools ? "TOOLS" : "HOME"} data-vault-state={vault.state}>
    <div className="hub-shell">
      <Header onSearch={() => setDialog("search")} onSettings={() => setDialog("settings")}/>
      {!tools ? <section className="hub-hero" aria-labelledby="hub-status" aria-describedby="hub-status-detail">
        <div className="hub-stag-hero"><div className="hub-hero-haze" aria-hidden="true"/><svg className="hub-energy-ribbons" viewBox="0 0 480 240" fill="none" aria-hidden="true"><defs><linearGradient id="hub-ribbon"><stop stopColor="#8b16ff" stopOpacity="0"/><stop offset=".45" stopColor="#bc54ff"/><stop offset=".6" stopColor="#f2c6ff"/><stop offset="1" stopColor="#681cff" stopOpacity="0"/></linearGradient></defs><path d="M12 186C-3 105 467 57 449 123S55 221 91 148 451 53 464 84"/><path d="M12 186C-3 105 467 57 449 123S55 221 91 148 451 53 464 84" className="hub-ribbon-core"/><path d="M48 90C115 224 434 157 454 74" className="hub-ribbon-thread"/></svg><div className="hub-hero-sparks" aria-hidden="true">{Array.from({length:12},(_,i)=><i key={i} style={{left:`${8+(i*31)%84}%`,top:`${5+(i*19)%85}%`,animationDelay:`${-i*.7}s`}}/>)}</div><StagEmblem className="hub-final-stag" ignite/></div>
        <div className="hub-hero-brand" dir="ltr">Knoux <span>Crypt</span></div>
        <div className="hub-brand-divider" aria-hidden="true"><i/></div>
        <div className="hub-hero-caption">{t("Private Encryption Suite")}</div>
        <div className="hub-sealed-horizon" aria-hidden="true"/>
        <h1 id="hub-status" data-vault-tone={statusCopy.tone}>{t(statusCopy.label)}</h1><p id="hub-status-detail">{t(statusCopy.detail)}</p>
      </section> : <div className="hub-tools-heading"><h1>{t("Tools")}</h1><p>{t("Choose a service to preview")}</p></div>}
      {tools && <label className="hub-tools-search"><span>{t("Search tools")}</span><input type="search" aria-controls="hub-tools-results" value={toolQuery} onChange={e=>setToolQuery(e.target.value)} placeholder={t("Vault, notes, keys…")}/></label>}
      {!tools && <VaultStatusPanel/>}
      {!tools && <ServiceGrid/>}
      {tools && <ToolsDirectory query={toolQuery}/>}
    </div>
    {dialog && <HubDialog kind={dialog} onClose={() => setDialog(null)}/>}
  </main>;
}

// Explicit holding screen, not an invented design or a working security tool.
export function ServicePlaceholder({ service }) {
  const { t, locale, dir } = useLanguage();

  return <main className="crypt-hub" dir={dir} lang={locale} data-screen={service.id}>
    <section className="hub-placeholder"><StagEmblem/><p className="hub-demo-label">{t("VISUAL DEMO")}</p><h1>{t(service.title)}</h1><p>{locale==='ar'?'هذه الشاشة بانتظار تنفيذ تصميمها المعتمد. لا تُجرى أي عملية، ولم يتم تأمين بيانات أو تخزينها أو إنشاؤها.':`This screen is awaiting its approved reference. No ${service.title.toLowerCase()} operation is running and no data has been secured, stored, or generated.`} </p><Link to={SCREENS.HOME}>{t("Back to Home")}</Link></section>
  </main>;
}
