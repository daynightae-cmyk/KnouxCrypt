import React from "react";
import { LanguageProvider } from "./i18n/Language";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { ModernApp } from "./components/modern/ModernApp";
import { SplashEntry } from "./components/entry/SplashEntry";
import { SecureAccess } from "./components/entry/SecureAccess";
import { Home, ServicePlaceholder } from "./components/home/Home";
import { FileCipher } from "./components/security/FileCipher";
import { ShadowVault } from "./components/security/ShadowVault";
import { AppShell } from "./components/shell/AppShell";
import { NotesProvider } from "./components/notes/NotesContext";
import { SecureNotes } from "./components/notes/SecureNotes";
import { NotesEditor } from "./components/notes/NotesEditor";
import { PasswordProvider } from "./components/passwords/PasswordContext";
import { Passwords, PasswordDetail } from "./components/passwords/Passwords";
import {
  Authenticator,
  AuthImport,
} from "./components/authenticator/Authenticator";
import {
  KeyForge,
  KeyDetails,
  KeyWorkflowPreview,
} from "./components/keys/KeyForge";
import { PrivacyCenter } from "./components/privacy/PrivacyCenter";
import { SCREENS, SERVICES, KEY_WORKFLOWS } from "./config/screens";

function App() {
  return (
    <LanguageProvider>
      <NotesProvider>
        <PasswordProvider>
          <BrowserRouter>
            <AppShell>
              <Routes>
                <Route path={SCREENS.SPLASH_ENTRY} element={<SplashEntry />} />
                <Route
                  path={SCREENS.SECURE_ACCESS_LOGIN}
                  element={<SecureAccess />}
                />
                <Route path={SCREENS.HOME} element={<Home />} />
                <Route path={SCREENS.PRIVACY} element={<PrivacyCenter />} />
                <Route path={SCREENS.KEY_FORGE} element={<KeyForge />} />
                <Route path={SCREENS.KEY_DETAILS} element={<KeyDetails />} />
                {KEY_WORKFLOWS.map((workflow) => (
                  <Route
                    key={workflow.id}
                    path={SCREENS[workflow.id]}
                    element={<KeyWorkflowPreview {...workflow} />}
                  />
                ))}
                <Route path={SCREENS.TOOLS} element={<Home tools />} />
                <Route path={SCREENS.FILE_CIPHER} element={<FileCipher />} />
                <Route
                  path={SCREENS.AUTHENTICATOR}
                  element={<Authenticator />}
                />
                <Route path={SCREENS.AUTH_IMPORT} element={<AuthImport />} />
                <Route path={SCREENS.PASSWORDS} element={<Passwords />} />
                <Route
                  path={`${SCREENS.PASSWORD_DETAIL}/:id`}
                  element={<PasswordDetail />}
                />
                <Route path={SCREENS.NOTES} element={<SecureNotes />} />
                <Route
                  path={`${SCREENS.NOTES_EDITOR}/:id`}
                  element={<NotesEditor />}
                />
                <Route path={SCREENS.SHADOW_VAULT} element={<ShadowVault />} />
                {[
                  ["AUTOFILL", "Autofill"],
                  ["PASSWORD_AUDIT", "Password audit"],
                  ["INTEGRITY", "Integrity"],
                  ["ARCHIVE", "Archive"],
                  ["COLLECTIONS", "Collections"],
                  ["DOCUMENT_VIEWER", "Document viewer"],
                ].map(([id, title]) => (
                  <Route
                    key={id}
                    path={SCREENS[id]}
                    element={<ServicePlaceholder service={{ id, title }} />}
                  />
                ))}
                {SERVICES.filter(
                  (service) =>
                    ![
                      "ENCRYPT",
                      "VAULT",
                      "NOTES",
                      "PASSWORDS",
                      "AUTHENTICATOR",
                      "KEY_FORGE",
                      "PRIVACY",
                    ].includes(service.id),
                ).map((service) => (
                  <Route
                    key={service.id}
                    path={SCREENS[service.id]}
                    element={<ServicePlaceholder service={service} />}
                  />
                ))}
                <Route path="*" element={<ModernApp />} />
              </Routes>
            </AppShell>
          </BrowserRouter>
        </PasswordProvider>
      </NotesProvider>
    </LanguageProvider>
  );
}

export default App;
