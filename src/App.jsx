import {
  ClipboardGuard,
  SecureRandom,
  HmacAuthenticity,
  PublicKeyQr,
} from "./components/labs/LabScreens";
import {
  EncryptedArchive,
  LocalTransfer,
  FingerprintVerify,
  MetadataCleaner,
} from "./components/workflows/WorkflowScreens";
import {
  HashIntegrity,
  TextCipher,
  DigitalSignature,
  CertificateInspector,
} from "./components/inspectors/InspectionScreens";
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
import { Recovery } from "./components/recovery/Recovery";
import {
  SecureShare,
  ShareWorkflowPreview,
} from "./components/share/SecureShare";
import {
  SCREENS,
  SERVICES,
  KEY_WORKFLOWS,
  SHARE_WORKFLOWS,
} from "./config/screens";

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
                <Route
                  path={SCREENS.CLIPBOARD_GUARD}
                  element={<ClipboardGuard />}
                />
                <Route
                  path={SCREENS.SECURE_RANDOM}
                  element={<SecureRandom />}
                />
                <Route
                  path={SCREENS.HMAC_AUTHENTICITY}
                  element={<HmacAuthenticity />}
                />
                <Route path={SCREENS.PUBLIC_KEY_QR} element={<PublicKeyQr />} />
                <Route path={SCREENS.ARCHIVE} element={<EncryptedArchive />} />
                <Route
                  path={SCREENS.LOCAL_TRANSFER}
                  element={<LocalTransfer />}
                />
                <Route
                  path={SCREENS.FINGERPRINT_VERIFY}
                  element={<FingerprintVerify />}
                />
                <Route
                  path={SCREENS.METADATA_CLEANER}
                  element={<MetadataCleaner />}
                />
                <Route path={SCREENS.HOME} element={<Home />} />
                <Route
                  path={SCREENS.HASH_INTEGRITY}
                  element={<HashIntegrity />}
                />
                <Route path={SCREENS.TEXT_CIPHER} element={<TextCipher />} />
                <Route
                  path={SCREENS.SIGNATURE}
                  element={<DigitalSignature />}
                />
                <Route
                  path={SCREENS.CERTIFICATE_INSPECTOR}
                  element={<CertificateInspector />}
                />
                <Route path={SCREENS.SECURE_SHARE} element={<SecureShare />} />
                {SHARE_WORKFLOWS.filter(
                  (workflow) => workflow.id !== "LOCAL_TRANSFER",
                ).map((workflow) => (
                  <Route
                    key={workflow.id}
                    path={SCREENS[workflow.id]}
                    element={<ShareWorkflowPreview title={workflow.title} />}
                  />
                ))}
                <Route path={SCREENS.BACKUP} element={<Recovery />} />
                <Route path={SCREENS.PRIVACY} element={<PrivacyCenter />} />
                <Route path={SCREENS.KEY_FORGE} element={<KeyForge />} />
                <Route path={SCREENS.KEY_DETAILS} element={<KeyDetails />} />
                {KEY_WORKFLOWS.filter(
                  (workflow) =>
                    !["SECURE_SHARE", "SIGNATURE"].includes(workflow.id),
                ).map((workflow) => (
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
                  ["SECURE_CLIPBOARD", "Secure Clipboard"],
                  ["FILE_INTEGRITY", "File integrity"],
                  ["SIGNATURE_STUDIO", "Signature Studio"],
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
                      "BACKUP",
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
