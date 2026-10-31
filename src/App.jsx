import React, { lazy, Suspense } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
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
function App() {
  return <LanguageProvider><NotesProvider><PasswordProvider><BrowserRouter><AppShell>
    <ScreenLoadBoundary>
    <Suspense fallback={<LoadingScreen/>}>
      <Routes>
        {screens.map(({id,suffix,Screen}) => <Route key={id} path={SCREENS[id]+suffix} element={<DesktopRoute id={id}><Screen/></DesktopRoute>}/>)}
        <Route path={SCREENS.TOOLS} element={<DesktopRoute id="TOOLS"><Home tools/></DesktopRoute>}/>
        <Route path="*" element={<LegacyApp/>}/>
      </Routes>
    </Suspense>
    </ScreenLoadBoundary>
  </AppShell></BrowserRouter></PasswordProvider></NotesProvider></LanguageProvider>;
}
export default App;
