import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { SCREENS, SERVICES } from "../../config/screens";
import { StagEmblem } from "../entry/StagEmblem";
import core from "../../assets/home-core.webp";
import "./home.css";

const artwork = import.meta.glob("../../assets/service-*.webp", { eager: true, import: "default" });
function Glyph({ name }) {
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
  return <header className="hub-header">
    <Link to={SCREENS.HOME} className="hub-brand" aria-label="Knoux Crypt Home"><StagEmblem/><span><span className="hub-wordmark">Knoux <em>Crypt</em></span><small>Private Encryption Suite</small></span></Link>
    <div className="hub-header-actions"><button type="button" aria-label="Search tools" onClick={onSearch}><Glyph name="search"/></button><button type="button" aria-label="Settings visual demo" onClick={onSettings}><Glyph name="settings"/></button></div>
  </header>;
}
export function ServiceGrid({ filter = "" }) {
  const filtered = SERVICES.filter(s => `${s.title} ${s.description}`.toLowerCase().includes(filter.toLowerCase()));
  return <>{filtered.length ? <div className="hub-services">{filtered.map((service, index) => <Link className={`hub-service hub-service-${service.art}`} style={{"--rim-delay": `${index * 30}ms`}} key={service.id} to={SCREENS[service.id]}>
    <span className="hub-icon"><img src={artwork[`../../assets/service-${service.art}.webp`]} width="120" height="124" alt=""/></span>
    <span className="hub-service-copy"><span>{service.title}</span><small>{service.description}</small></span><span className="hub-chevron" aria-hidden="true">›</span>
  </Link>)}</div> : <p className="hub-no-results" role="status">No matching tools.</p>}</>;
}
function HubDialog({ kind, onClose }) {
  const ref = useRef(null);
  const [filter, setFilter] = useState("");
  useEffect(() => { const previous = document.activeElement;ref.current.showModal();return () => previous?.focus(); }, []);
  return <dialog ref={ref} className="hub-dialog" onCancel={onClose} onClick={e => { if (e.target === e.currentTarget) onClose(); }} aria-labelledby="hub-dialog-title">
    <button className="hub-close" type="button" aria-label="Close" onClick={onClose}>×</button>
    <h2 id="hub-dialog-title">{kind === "search" ? "Search tools" : "Settings · VISUAL DEMO"}</h2>
    {kind === "search" ? <><label className="hub-search-label">Find a service<input autoFocus type="search" value={filter} onChange={e => setFilter(e.target.value)} placeholder="Vault, notes, keys…"/></label><ServiceGrid filter={filter}/></> : <><p>This is an offline interface preview. The protection text on Home is reference demo copy, not a verified security status. No encryption or account settings are active.</p><Link to={SCREENS.SECURE_ACCESS_LOGIN} state={{returnTo: SCREENS.HOME}}>Open Account preview</Link><button type="button" onClick={onClose}>Return to Home</button></>}
  </dialog>;
}
export function Home({ tools = false }) {
  const [dialog, setDialog] = useState(null);
  return <main className="crypt-hub" dir="ltr" lang="en" data-screen={tools ? "TOOLS" : "HOME"}>
    <div className="hub-shell">
      <Header onSearch={() => setDialog("search")} onSettings={() => setDialog("settings")}/>
      {!tools ? <section className="hub-hero" aria-labelledby="hub-status" aria-describedby="hub-demo-context">
        <div className="hub-core-art"><img src={core} width="714" height="418" alt=""/><span className="hub-orbit" aria-hidden="true"/><svg className="hub-core-eyes" viewBox="0 0 714 418" aria-hidden="true"><ellipse cx="306" cy="190" rx="13" ry="8"/><ellipse cx="408" cy="190" rx="13" ry="8"/></svg></div>
        <h1 id="hub-status">Your Vault is Protected</h1><p>End-to-End Encrypted</p><span id="hub-demo-context" className="hub-sr-only">Visual demo reference text only. No vault protection or encryption has been verified.</span>
      </section> : <div className="hub-tools-heading"><h1>Tools</h1><p>Choose a service to preview</p></div>}
      <ServiceGrid/>
      {tools && <div className="hub-extra-tools">{[['INTEGRITY','Integrity'],['ARCHIVE','Archive'],['COLLECTIONS','Collections'],['DOCUMENT_VIEWER','Document viewer']].map(([id,title])=><Link key={id} to={SCREENS[id]}>{title} preview</Link>)}</div>}
    </div>
    {dialog && <HubDialog kind={dialog} onClose={() => setDialog(null)}/>}
  </main>;
}

// Explicit holding screen, not an invented design or a working security tool.
export function ServicePlaceholder({ service }) {
  return <main className="crypt-hub" dir="ltr" lang="en" data-screen={service.id}>
    <section className="hub-placeholder"><StagEmblem/><p className="hub-demo-label">VISUAL DEMO</p><h1>{service.title}</h1><p>This screen is awaiting its approved reference. No {service.title.toLowerCase()} operation is running and no data has been secured, stored, or generated.</p><Link to={SCREENS.HOME}>Back to Home</Link></section>
  </main>;
}
