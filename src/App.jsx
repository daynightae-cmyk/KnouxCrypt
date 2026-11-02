import React, { lazy, Suspense, useEffect } from "react";
import { BrowserRouter, HashRouter, Route, Routes } from "react-router-dom";
import { LanguageProvider, useLanguage } from "./i18n/Language";
import { NotesProvider } from "./components/notes/NotesContext";
import { PasswordProvider } from "./components/passwords/PasswordContext";
import { ScreenLoadBoundary } from "./components/shell/ScreenLoadBoundary";
import { DesktopRoute } from "./components/desktop/DesktopWorkspace";
import { AppShell } from "./components/shell/AppShell";
import { SCREENS } from "./config/screens";
import { MISSION_ROUTES } from "./config/missionRoutes";

// Construct once, never on navigation: persistent providers/background stay mounted.
const screens = MISSION_ROUTES.map(mission => ({
  ...mission,
  Screen: lazy(() => mission.load().then(module => ({ default: module[mission.component] }))),
}));
const Home = screens.find(screen => screen.id === "HOME").Screen;
const LegacyApp = lazy(() => import("./components/modern/ModernApp").then(module => ({default: module.ModernApp})));
function LoadingScreen() {
  const { t } = useLanguage();
  return <div className="app-route-loading" role="status">{t("Loading screen…")}</div>;
}
// The packaged Electron renderer loads over file://, where history.pushState
// rewrites the URL to file:///home and any reload lands on a browser error page.
// A hash router keeps every route inside the document URL, so deep links and
// reloads resolve against the single index.html in both Electron and the web.
const Router = typeof window !== "undefined" && window.knouxcrypt?.isElectron ? HashRouter : BrowserRouter;
function App() {
  // The native boot view ends when it has evidence that this document is up,
  // not after a fixed wait. Reported once, after the first committed render.
  useEffect(() => {
    window.electronAPI?.window?.ready?.();
  }, []);
  return <LanguageProvider><NotesProvider><PasswordProvider><Router><AppShell>
    <ScreenLoadBoundary>
    <Suspense fallback={<LoadingScreen/>}>
      <Routes>
        {screens.map(({id,suffix,Screen}) => <Route key={id} path={SCREENS[id]+suffix} element={<DesktopRoute id={id}><Screen/></DesktopRoute>}/>)}
        <Route path={SCREENS.TOOLS} element={<DesktopRoute id="TOOLS"><Home tools/></DesktopRoute>}/>
        <Route path="*" element={<LegacyApp/>}/>
      </Routes>
    </Suspense>
    </ScreenLoadBoundary>
  </AppShell></Router></PasswordProvider></NotesProvider></LanguageProvider>;
}
export default App;
