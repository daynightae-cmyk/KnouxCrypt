import React from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { ModernApp } from "./components/modern/ModernApp";
import { SplashEntry } from "./components/entry/SplashEntry";
import { SecureAccess } from "./components/entry/SecureAccess";
import { SCREENS } from "./config/screens";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path={SCREENS.SPLASH_ENTRY} element={<SplashEntry />} />
        <Route path={SCREENS.SECURE_ACCESS_LOGIN} element={<SecureAccess />} />
        <Route path="*" element={<ModernApp />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
