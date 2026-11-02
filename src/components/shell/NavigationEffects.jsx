import React, { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { useLanguage } from "../../i18n/Language";

export function NavigationEffects() {
  const { pathname } = useLocation();
  const { locale } = useLanguage();
  const previousPath = useRef(pathname);
  const [announcement, setAnnouncement] = useState("");
  useEffect(() => {
    const changed = previousPath.current !== pathname;
    previousPath.current = pathname;
    const root = document.getElementById("app-content");
    if (!root) return;
    let focusPending = changed;
    let lastHeading = "";
    function update() {
      const heading = root.querySelector("main h1");
      if (!heading || !heading.textContent.trim()) return;
      const text = heading.textContent.trim();
      if (text !== lastHeading) {
        lastHeading = text;
        document.title = `${text} — KNOUX CRYPT`;
        setAnnouncement(text);
      }
      if (focusPending && !document.querySelector("dialog[open]")) {
        // A lazy screen can appear later. Never refocus when a form is edited
        // or language changes; focus only once for this navigation.
        focusPending = false;
        heading.setAttribute("tabindex", "-1");
        heading.focus({ preventScroll: true });
      }
    }
    const observer = new MutationObserver(update);
    observer.observe(root, { childList: true, subtree: true, characterData: true });
    update();
    return () => observer.disconnect();
  }, [pathname, locale]);
  return <span className="app-screen-announcement" role="status" aria-live="polite" aria-atomic="true">{announcement}</span>;
}
