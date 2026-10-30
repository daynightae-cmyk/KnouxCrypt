import { useLanguage } from "../../i18n/Language";
import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { SCREENS, SERVICES } from "../../config/screens";
import { StagEmblem } from "../entry/StagEmblem";
import "./home.css";

const artwork = import.meta.glob("../../assets/service-*.webp", { eager: true, import: "default" });
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
  return <>{filtered.length ? <div className="hub-services">{filtered.map((service, index) => <Link className={`hub-service hub-service-${service.art}`} style={{"--rim-delay": `${index * 30}ms`}} key={service.id} to={SCREENS[service.id]}>
    <span className="hub-icon"><img src={artwork[`../../assets/service-${service.art}.webp`]} width="120" height="124" alt=""/></span>
    <span className="hub-service-copy"><span>{t(service.title)}</span><small>{t(service.description)}</small></span><span className="hub-chevron" aria-hidden="true">{t("›")}</span>
  </Link>)}</div> : <p className="hub-no-results" role="status">{t("No matching tools.")}</p>}</>;
}
function HubDialog({ kind, onClose }) {
  const { t, locale, dir } = useLanguage();

  const ref = useRef(null);
  const [filter, setFilter] = useState("");
  useEffect(() => { const previous = document.activeElement;ref.current.showModal();return () => previous?.focus(); }, []);
  return <dialog ref={ref} className="hub-dialog" onCancel={onClose} onClick={e => { if (e.target === e.currentTarget) onClose(); }} aria-labelledby="hub-dialog-title">
    <button className="hub-close" type="button" aria-label={t("Close")} onClick={onClose}>{t("×")}</button>
    <h2 id="hub-dialog-title">{t(kind === "search" ? "Search tools" : "Settings · VISUAL DEMO")}</h2>
    {kind === "search" ? <><label className="hub-search-label">{t("Find a service")}<input autoFocus type="search" value={filter} onChange={e => setFilter(e.target.value)} placeholder={t("Vault, notes, keys…")}/></label><ServiceGrid filter={filter}/></> : <><p>{t("This is an offline interface preview. The protection text on Home is reference demo copy, not a verified security status. No encryption or account settings are active.")}</p><Link to={SCREENS.SECURE_ACCESS_LOGIN} state={{returnTo: SCREENS.HOME}}>{t("Open Account preview")}</Link><button type="button" onClick={onClose}>{t("Return to Home")}</button></>}
  </dialog>;
}
export function Home({ tools = false }) {
  const { t, locale, dir } = useLanguage();

  const [dialog, setDialog] = useState(null);
  const [toolQuery,setToolQuery] = useState("");
  return <main className="crypt-hub" dir={dir} lang={locale} data-screen={tools ? "TOOLS" : "HOME"}>
    <div className="hub-shell">
      <Header onSearch={() => setDialog("search")} onSettings={() => setDialog("settings")}/>
      {!tools ? <section className="hub-hero" aria-labelledby="hub-status" aria-describedby="hub-demo-context">
        <div className="hub-stag-hero"><div className="hub-hero-haze" aria-hidden="true"/><span className="hub-hero-energy" aria-hidden="true"/><StagEmblem className="hub-final-stag" ignite/></div>
        <div className="hub-hero-brand" dir="ltr">Knoux <span>Crypt</span></div>
        <div className="hub-brand-divider" aria-hidden="true"><i/></div>
        <div className="hub-hero-caption">{t("Private Encryption Suite")}</div>
        <div className="hub-sealed-horizon" aria-hidden="true"/>
        <h1 id="hub-status">{t("Your Vault is Protected")}</h1><p>{t("End-to-End Encrypted")}</p><span id="hub-demo-context" className="hub-sr-only">{t("Visual demo reference text only. No vault protection or encryption has been verified.")}</span>
      </section> : <div className="hub-tools-heading"><h1>{t("Tools")}</h1><p>{t("Choose a service to preview")}</p></div>}
      {tools && <label className="hub-tools-search"><span>{t("Search tools")}</span><input type="search" value={toolQuery} onChange={e=>setToolQuery(e.target.value)} placeholder={t("Vault, notes, keys…")}/></label>}
      {!tools && <ServiceGrid/>}
      {tools && <div className="hub-extra-tools" data-tools-results>{[['KEY_FORGE','Key Forge'],['SIGNATURE','Signature Verification'],['SECURE_SHARE','Secure Share'],['INTEGRITY','Hash & Integrity'],['TEXT_CIPHER','Text Cipher'],['CERTIFICATE_INSPECTOR','Certificate Inspector'],['ARCHIVE','Archive'],['LOCAL_TRANSFER','Local Transfer'],['FINGERPRINT_VERIFY','Fingerprint Verify'],['METADATA_CLEANER','Metadata Cleaner'],['CLIPBOARD_GUARD','Clipboard Guard'],['SECURE_RANDOM','Secure Random Studio'],['HMAC_AUTHENTICITY','HMAC Authenticity Lab'],['PUBLIC_KEY_QR','Public Key QR'],['COLLECTIONS','Collections'],['DOCUMENT_VIEWER','Document viewer'],['PACKAGE_INSPECTOR','Package Inspector'],['AUTOFILL','Autofill'],['OFFLINE_ADVISOR','Offline Security Advisor'],['KEY_DERIVATION','Key Derivation'],['SECURITY_ACTIVITY','Security Activity'],['SECRET_CAPSULE','Expiring Secret Capsule'],['SESSION_PRIVACY','Session Privacy'],['FILE_INTEGRITY','File integrity'],['SECURE_CLIPBOARD','Secure Clipboard'],['DEVICE_PAIRING','Device Pairing'],['PASSWORD_AUDIT','Password audit']].filter(([id,title])=>`${title} ${t(title)}`.toLowerCase().includes(toolQuery.toLowerCase())).map(([id,title])=><Link key={id} to={SCREENS[id]}>{t(title)}{t(" preview")}</Link>)}</div>}
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
