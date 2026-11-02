# SAME PROJECT, SINGLE ROUTE REGISTRY

**Anima existing state:** existing Splash was shown in the user's screenshot. Do not assert the source was inspected or modified here. First preserve it; patch Touch to Enter.

## Entry and routes
`SPLASH -> HOME`. `HOME -> ENCRYPT, SHADOW_VAULT, SECURE_NOTES, PASSWORDS, KEY_FORGE, AUTHENTICATOR, PRIVACY, BACKUP`. `HOME Account -> SECURE_ACCESS_LOGIN`. Subroutes: `SECURE_NOTES -> NOTES_EDITOR`; `PASSWORDS -> PASSWORD_DETAIL -> ANDROID_AUTOFILL or PASSWORD_STRENGTH_AUDIT`; `AUTHENTICATOR -> AUTH_IMPORT`; `KEY_FORGE -> KEY_DETAILS -> VAULT_KEY_ROTATION or PUBLIC_KEY_QR`; `KEY_FORGE -> DIGITAL_SIGNATURE -> SIGNATURE_STUDIO`; `KEY_FORGE -> SECURE_SHARE -> FINGERPRINT_VERIFY`; `SHADOW_VAULT -> VAULT_COLLECTIONS -> DOCUMENT_VIEWER`; `PRIVACY -> BACKUP / SESSION_PRIVACY_CONTROLS / LOCAL_SECURITY_ACTIVITY`. Tool index shows the remaining advanced tools.

Existing screen route names must be discovered and reused before creating new ones; these IDs are logical aliases if the project already uses another router. Preserve all old screens and gracefully handle unfinished routes via explicit, dismissible demo placeholders. Never wire false actual app credentials into a visual preview. No full project reset.

## Why some similar images remain
Different image layouts for the same type of service can be separate subflows, e.g. Notes list vs Notes Editor, Password index vs Password Detail, Key Forge overview vs Key Details. Some minor alternate mockups are retained under `references/alternates` and are not part of the primary one-screen-per-prompt production queue.

## Trust boundaries
This is only a visual UI collection. The UI concept cannot prove cryptographic implementation, biometric integration, connection status, certificate validation, 2FA or device posture. DeepSeek V4 implements services later in the native Android stage.
