import React from "react";
import { useLanguage } from "../../i18n/Language";

class LoadBoundary extends React.Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return this.props.fallback;
    return this.props.children;
  }
}
export function ScreenLoadBoundary({ children }) {
  const { t } = useLanguage();
  // Reload is explicit. No background retry loop or mutation of demo data.
  return <LoadBoundary fallback={<section className="app-route-loading" role="alert"><div><p>{t("Screen unavailable. Reload to try again; in-memory demo edits will reset.")}</p><button type="button" className="app-language-toggle" onClick={()=>window.location.reload()}>{t("Reload application")}</button></div></section>}>{children}</LoadBoundary>;
}
