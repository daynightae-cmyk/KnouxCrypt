# KNOUX CRYPT — Android Native Architecture Decision (Proposed)

**Status:** DESIGN ONLY / not implemented. Desktop legacy remains intact.

## Stack recommendation
- Kotlin, Gradle Kotlin DSL, Jetpack Compose / Material 3 internal components with custom KNOUX tokens, Navigation Compose, ViewModel, StateFlow/Coroutines, Hilt DI, Room or vetted encrypted persistence, WorkManager for eligible deferrable operations.
- Target SDK **36 or later** for Google Play new Android apps from 2026-08-31; verify latest policy before shipping. Decide and document minSdk after device market review.
- Core modules: `app`, `core-ui`, `core-crypto`, `core-keyring`, `core-storage`, `core-files`, `core-domain`, `feature-entry`, `feature-home`, `feature-vault`, `feature-secrets`, `feature-keyforge`, `feature-toolkit`, `feature-privacy`, `feature-settings`. Optional remote features behind separate modules and explicit permission flags.
- All sensitive work occurs in trusted Android native services, not inside old Electron or JS renderer; Compose surfaces operation state but never owns long-term raw keys.
- A capability registry powers Service Hub cards: `PLANNED`, `UNSUPPORTED`, `DISABLED`, `AVAILABLE`, `TESTED`, `AUDITED`. Only earned claims appear.

## Trust and data boundaries
OS Keystore keys can be non-exportable. Secure cross-device recovery needs independent user-held recovery wrap. Crypto file format includes algorithm IDs, version, key ID, KDF parameters, nonce/chunk framing, AAD and authenticated tag. Android app cannot directly encrypt Android system partitions like Windows BitLocker. Use SAF, Photo Picker and app-private storage, not broad permissions.

## UI screens batch (ten portraits, each separate asset)
1. Splash / Black Seal. 2. Onboarding / Trust Oath. 3. Local Unlock / Gate Zero. 4. Home / Crypt Command. 5. Cipher Lab / File Encrypt. 6. Shadow Vault / Media. 7. Black Archive / Notes & Passwords. 8. Key Forge / Share & Sign. 9. Threat Radar / Privacy & Authenticator. 10. Recovery / Settings & Catalog.

## Performance and dependency guards
D partition was low free space at preparation time. Do not install full SDK/Gradle builds until free-space plan; reserve adequate disk for local Maven cache and emulator image. Avoid unrelated changes to desktop project. Release only with security and visual approval gates.

## Verified references
- Android Keystore: https://developer.android.com/privacy-and-security/keystore
- Google Play API requirements: https://support.google.com/googleplay/android-developer/answer/11926878
- OWASP MASVS: https://mas.owasp.org/MASVS/
