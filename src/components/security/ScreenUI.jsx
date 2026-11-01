import { useLanguage } from "../../i18n/Language";
import React, { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { StagEmblem } from "../entry/StagEmblem";
import { SCREENS } from "../../config/screens";
import "./security.css";
import { capabilityById } from "../../config/desktopCapabilities";

export function Mark({ name = "shield", ...props }) {
  const { t, locale, dir } = useLanguage();

 const paths = {
  grid:<><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
  clock:<><circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/></>,
  shield:<><path d="m12 2 9 4v6c0 5-6 9-9 11-3-2-9-6-9-11V6Z"/><path d="m8 12 3 3 5-6"/></>,
  lock:<><rect x="5" y="10" width="14" height="12" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4M12 15v3"/></>,
  unlock:<><rect x="5" y="10" width="14" height="12" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0M12 15v3"/></>,
  key:<><circle cx="15" cy="7" r="5"/><path d="m11 11-9 9v2h4v-3h3v-3l4-4M16 6h.01"/></>,
  folder:<path d="M2 7V4h6l3 4h11v13H2V7h8"/>,
  file:<><path d="M5 2h9l5 5v15H5Z M14 2v6h5M8 12h8M8 16h8"/></>,
  chevron:<path d="m9 4 8 8-8 8"/>,
  arrow:<path d="M3 12h18m-7-7 7 7-7 7"/>,
  info:<><circle cx="12" cy="12" r="10"/><path d="M12 10v7m0-11v1"/></>,
  help:<><circle cx="12" cy="12" r="10"/><path d="M8 8a4 4 0 0 1 8 0c0 3-4 2-4 6m0 3v1"/></>,
  settings:<><path d="m9 2 6 0 1 4 4 1 2 5-3 3 0 5-5 2-3-3-5 0-2-5 3-3Z"/><circle cx="12" cy="12" r="3"/></>,
  search:<><circle cx="10" cy="10" r="7"/><path d="m15 15 7 7"/></>,
  dots:<><circle cx="12" cy="4" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="20" r="1"/></>,
  photo:<><rect x="2" y="3" width="20" height="18" rx="1"/><path d="m2 16 6-6 5 5 3-3 6 7"/><circle cx="16" cy="7" r="1"/></>,
  video:<path d="m5 2 16 10L5 22Z"/>,
  audio:<><path d="M8 17V4l12-2v13M8 8l12-2"/><ellipse cx="5" cy="18" rx="3" ry="3"/><ellipse cx="17" cy="16" rx="3" ry="3"/></>,
  upload:<><path d="M5 17a6 6 0 0 1-1-11 8 8 0 0 1 15 0 6 6 0 0 1 0 11M12 22V10m-5 5 5-5 5 5"/></>,
  home:<path d="m3 11 9-9 9 9v11h-7v-7h-4v7H3Z"/>,
  database:<><ellipse cx="12" cy="5" rx="9" ry="4"/><path d="M3 5v14c0 5 18 5 18 0V5M3 11c0 5 18 5 18 0M3 17c0 5 18 5 18 0"/></>,
 };
 return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{paths[name]}</svg>;
}
export function ScreenFrame({ children, type = "" }) {
  const { t, locale, dir } = useLanguage();

 return <main className={`security-screen ${type}`} dir={dir} lang={locale}><div className="security-atmosphere" aria-hidden="true"/><div className="security-shell">{children}</div></main>;
}
export function ScreenHeader({ title, accent, caption, children }) {
  const { t, locale, dir } = useLanguage();

 return <header className="security-header"><Link to={SCREENS.HOME} className="security-logo" aria-label={t("Back to Home")}><StagEmblem/></Link><div className="security-title"><h1>{t(title)} <span>{t(accent)}</span></h1><p>{t(caption)}</p></div><div className="security-header-actions">{children}</div></header>;
}
export function PreviewSheet({ title, children, onClose, label = "VISUAL DEMO", dismissLabel = "Back to preview" }) {
  const { t, locale, dir } = useLanguage();

 const ref=useRef(null);
 useEffect(()=>{const prior=document.activeElement; ref.current.showModal();return()=>prior?.focus();},[]);
 return <dialog className="security-dialog" ref={ref} onCancel={onClose} onClick={e=>{if(e.target===e.currentTarget)onClose();}} aria-labelledby="security-sheet-title"><button autoFocus className="security-close" aria-label={t("Close dialog")} onClick={onClose}>{t("×")}</button><p className="security-demo-label">{t(label)}</p><h2 id="security-sheet-title">{t(title)}</h2>{children}<button className="security-sheet-dismiss" onClick={onClose}>{t(dismissLabel)}</button></dialog>;
}
export function IconButton({ icon, label, ...props }) {
  const { t, locale, dir } = useLanguage();
return <button type="button" className="security-icon-button" aria-label={t(label)} {...props}><Mark name={icon}/></button>;}

/**
 * Honest capability card. Every field comes from the central capability
 * registry, so a screen cannot claim a capability the service does not have.
 */
export function CapabilityCard({ id, capability, fallback, className = "security-capability" }) {
  const { t } = useLanguage();
  // Prefer an explicit card, then the central registry, then the caller's
  // inline fallback. Registry entries win over a local fallback so a screen
  // cannot overstate a capability the service does not actually have.
  const card = capability || capabilityById(id) || (fallback ? { displayStatus: "PARTIAL", requiresNetwork: false, providerReady: false, permissionNeeds: [], realTestEvidence: [], ...fallback } : null);
  if (!card) return null;
  const permissions = Array.isArray(card.permissionNeeds) ? card.permissionNeeds : card.permissionNeeds ? [card.permissionNeeds] : [];
  const evidence = Array.isArray(card.realTestEvidence) ? card.realTestEvidence : [];
  return (
    <section className={className} data-status={card.displayStatus} aria-label={t("Capability")}>
      <strong>{t(card.title || "")}</strong>
      <p>{t(card.platformCapability || "")}</p>
      <dl>
        <div><dt>{t("Status")}</dt><dd>{t(card.displayStatus || "PARTIAL")}</dd></div>
        <div><dt>{t("Network")}</dt><dd>{t(card.requiresNetwork ? "Required" : "Not required")}</dd></div>
        <div><dt>{t("Provider ready")}</dt><dd>{t(card.providerReady ? "Yes" : "No")}</dd></div>
      </dl>
      <div className="security-capability-permissions">
        <span>{t("Permissions")}</span>
        {permissions.length > 0
          ? <ul>{permissions.map((need) => <li key={need}>{t(need)}</li>)}</ul>
          : <p>{t("None required")}</p>}
      </div>
      <details className="security-capability-evidence">
        <summary>{t("Test evidence")}</summary>
        {evidence.length > 0
          ? <ul>{evidence.map((line) => <li key={line}>{t(line)}</li>)}</ul>
          : <p>{t("No automated test recorded")}</p>}
      </details>
      <p className="security-capability-reason">{t(card.displayStatusReason || "No status rationale recorded")}</p>
    </section>
  );
}
