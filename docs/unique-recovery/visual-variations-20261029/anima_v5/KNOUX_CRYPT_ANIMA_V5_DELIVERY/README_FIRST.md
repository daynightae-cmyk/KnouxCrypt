# KNOUX CRYPT — Anima V5 reference + prompts pack

## Current reality
- Source RAR: 60 images, 10 byte-identical repeated files. **50 unique** images identified in the source; 49 screenshots included here, excluding the standalone logo at owner request.
- Organized as 44 independent screen images and 5 alternate design references. The standalone logo was intentionally excluded at owner request.
- Each of 44 screen images has one individual prompt under 5000 characters. No links in prompts.
- This package is a design/reference collection, **not** proof of implemented security services.
- The existing Splash in Anima is to be patched, not regenerated.
- All new screens must be added to the **same existing Anima React project**.
- NEVER use Clone Website or generic dashboard generation. Upload exactly one corresponding PNG + matching prompt per new screen.
- Files are REFERENCE candidates, not owner-approved final Android UI, so avoid writing to visuals/approved automatically.

## Recommended execution order
1. Existing Splash: patch existing screen using `prompts/01_SPLASH_ENTRY.txt` without creating a duplicate Splash.
2. Build Home first to complete the Splash fingerprint transition; then add Secure Access/login as the Account destination (no real authentication).
3. Build primary daily-use tools, then child flows in numbered order.
4. For every screen compare before/after screenshot, test controls, check back path and shared navigation.
5. Persist/export code and assets from Anima, then later hand off to DeepSeek V4 for real native Android functionality.

| # | Screen route | Reference | Prompt | Mission(s) |
|---:|---|---|---|---|
| 01 | SPLASH_ENTRY | `references/primary/01_SPLASH_ENTRY.png` | `prompts/01_SPLASH_ENTRY.txt` | 24, 25 |
| 02 | HOME | `references/primary/02_HOME.png` | `prompts/02_HOME.txt` | 26 |
| 03 | SECURE_ACCESS_LOGIN | `references/primary/03_SECURE_ACCESS_LOGIN.png` | `prompts/03_SECURE_ACCESS_LOGIN.txt` | 6, 22 |
| 04 | FILE_CIPHER | `references/primary/04_FILE_CIPHER.png` | `prompts/04_FILE_CIPHER.txt` | 4, 8, 29 |
| 05 | SHADOW_VAULT | `references/primary/05_SHADOW_VAULT.png` | `prompts/05_SHADOW_VAULT.txt` | 8, 9 |
| 06 | SECURE_NOTES | `references/primary/06_SECURE_NOTES.png` | `prompts/06_SECURE_NOTES.txt` | 10 |
| 07 | NOTES_EDITOR | `references/primary/07_NOTES_EDITOR.png` | `prompts/07_NOTES_EDITOR.txt` | 10 |
| 08 | PASSWORDS | `references/primary/08_PASSWORDS.png` | `prompts/08_PASSWORDS.txt` | 11 |
| 09 | PASSWORD_DETAIL | `references/primary/09_PASSWORD_DETAIL.png` | `prompts/09_PASSWORD_DETAIL.txt` | 11 |
| 10 | AUTHENTICATOR | `references/primary/10_AUTHENTICATOR.png` | `prompts/10_AUTHENTICATOR.txt` | 15 |
| 11 | AUTH_IMPORT | `references/primary/11_AUTH_IMPORT.png` | `prompts/11_AUTH_IMPORT.txt` | 15 |
| 12 | KEY_FORGE | `references/primary/12_KEY_FORGE.png` | `prompts/12_KEY_FORGE.txt` | 5, 18 |
| 13 | KEY_DETAILS | `references/primary/13_KEY_DETAILS.png` | `prompts/13_KEY_DETAILS.txt` | 5, 18 |
| 14 | PRIVACY | `references/primary/14_PRIVACY.png` | `prompts/14_PRIVACY.txt` | 19, 20 |
| 15 | BACKUP | `references/primary/15_BACKUP.png` | `prompts/15_BACKUP.txt` | 14 |
| 16 | SECURE_SHARE | `references/primary/16_SECURE_SHARE.png` | `prompts/16_SECURE_SHARE.txt` | 13 |
| 17 | HASH_INTEGRITY | `references/primary/17_HASH_INTEGRITY.png` | `prompts/17_HASH_INTEGRITY.txt` | 12 |
| 18 | TEXT_CIPHER | `references/primary/18_TEXT_CIPHER.png` | `prompts/18_TEXT_CIPHER.txt` | 12 |
| 19 | DIGITAL_SIGNATURE | `references/primary/19_DIGITAL_SIGNATURE.png` | `prompts/19_DIGITAL_SIGNATURE.txt` | 18 |
| 20 | CERTIFICATE_INSPECTOR | `references/primary/20_CERTIFICATE_INSPECTOR.png` | `prompts/20_CERTIFICATE_INSPECTOR.txt` | 18 |
| 21 | ENCRYPTED_ARCHIVE | `references/primary/21_ENCRYPTED_ARCHIVE.png` | `prompts/21_ENCRYPTED_ARCHIVE.txt` | 32 |
| 22 | LOCAL_TRANSFER | `references/primary/22_LOCAL_TRANSFER.png` | `prompts/22_LOCAL_TRANSFER.txt` | 17 |
| 23 | FINGERPRINT_VERIFY | `references/primary/23_FINGERPRINT_VERIFY.png` | `prompts/23_FINGERPRINT_VERIFY.txt` | 18 |
| 24 | METADATA_CLEANER | `references/primary/24_METADATA_CLEANER.png` | `prompts/24_METADATA_CLEANER.txt` | 19 |
| 25 | CLIPBOARD_GUARD | `references/primary/25_CLIPBOARD_GUARD.png` | `prompts/25_CLIPBOARD_GUARD.txt` | 19 |
| 26 | SECURE_RANDOM | `references/primary/26_SECURE_RANDOM.png` | `prompts/26_SECURE_RANDOM.txt` | 12 |
| 27 | HMAC_AUTHENTICITY | `references/primary/27_HMAC_AUTHENTICITY.png` | `prompts/27_HMAC_AUTHENTICITY.txt` | 12 |
| 28 | PUBLIC_KEY_QR | `references/primary/28_PUBLIC_KEY_QR.png` | `prompts/28_PUBLIC_KEY_QR.txt` | 18 |
| 29 | VAULT_COLLECTIONS | `references/primary/29_VAULT_COLLECTIONS.png` | `prompts/29_VAULT_COLLECTIONS.txt` | 9 |
| 30 | DOCUMENT_VIEWER | `references/primary/30_DOCUMENT_VIEWER.png` | `prompts/30_DOCUMENT_VIEWER.txt` | 9 |
| 31 | VAULT_KEY_ROTATION | `references/primary/31_VAULT_KEY_ROTATION.png` | `prompts/31_VAULT_KEY_ROTATION.txt` | 5 |
| 32 | CIPHERTEXT_PACKAGE_INSPECTOR | `references/primary/32_CIPHERTEXT_PACKAGE_INSPECTOR.png` | `prompts/32_CIPHERTEXT_PACKAGE_INSPECTOR.txt` | 27 |
| 33 | ANDROID_AUTOFILL | `references/primary/33_ANDROID_AUTOFILL.png` | `prompts/33_ANDROID_AUTOFILL.txt` | 11, 22 |
| 34 | OFFLINE_SECURITY_ADVISOR | `references/primary/34_OFFLINE_SECURITY_ADVISOR.png` | `prompts/34_OFFLINE_SECURITY_ADVISOR.txt` | 23 |
| 35 | MULTI_DEVICE_PAIRING | `references/primary/35_MULTI_DEVICE_PAIRING.png` | `prompts/35_MULTI_DEVICE_PAIRING.txt` | 22, 31 |
| 36 | PASSWORD_STRENGTH_AUDIT | `references/primary/36_PASSWORD_STRENGTH_AUDIT.png` | `prompts/36_PASSWORD_STRENGTH_AUDIT.txt` | 11 |
| 37 | ARGON2ID_KEY_DERIVATION | `references/primary/37_ARGON2ID_KEY_DERIVATION.png` | `prompts/37_ARGON2ID_KEY_DERIVATION.txt` | 5 |
| 38 | SIGNATURE_STUDIO | `references/primary/38_SIGNATURE_STUDIO.png` | `prompts/38_SIGNATURE_STUDIO.txt` | 18 |
| 39 | LOCAL_SECURITY_ACTIVITY | `references/primary/39_LOCAL_SECURITY_ACTIVITY.png` | `prompts/39_LOCAL_SECURITY_ACTIVITY.txt` | 19, 20 |
| 40 | TRANSFER_WIZARD | `references/primary/40_TRANSFER_WIZARD.png` | `prompts/40_TRANSFER_WIZARD.txt` | 13, 17 |
| 41 | EXPIRING_SECRET_CAPSULE | `references/primary/41_EXPIRING_SECRET_CAPSULE.png` | `prompts/41_EXPIRING_SECRET_CAPSULE.txt` | 13 |
| 42 | SESSION_PRIVACY_CONTROLS | `references/primary/42_SESSION_PRIVACY_CONTROLS.png` | `prompts/42_SESSION_PRIVACY_CONTROLS.txt` | 19 |
| 43 | FILE_INTEGRITY_TOOL | `references/primary/43_FILE_INTEGRITY_TOOL.png` | `prompts/43_FILE_INTEGRITY_TOOL.txt` | 12 |
| 44 | SECURE_CLIPBOARD | `references/primary/44_SECURE_CLIPBOARD.png` | `prompts/44_SECURE_CLIPBOARD.txt` | 19 |

## Brand and variations
- Standalone logo omitted from this delivery at owner request. Stag artwork remains embedded in the supplied screen reference images.
- Five intentional alternate screenshots are kept under `references/alternates`, never silently deleted.
- Exact duplicate image bytes were omitted from this pack; the full provenance and paired indexes are in `MANIFEST.json`.

## Security/UX acceptance checklist
- [ ] One reference + its matching prompt per Anima turn; never an entire image group in the input field.
- [ ] Existing splash and all previously implemented screens still present and navigable.
- [ ] Screenshot parity in idle state, then press/toggle/panel states tested.
- [ ] Real React controls and accessible touch targets, not a single flat image.
- [ ] No backend, cryptography, real codes or passwords or fabricated success claims.
- [ ] Mobile portrait, top/bottom safe area, no duplicated shell or device border.
- [ ] Visual-only demo sound off by default, reduced motion supported.
- [ ] App code exported only after per-screen visual review.

**Copy/install:** Extract package contents within `D:\KnouxCrypt\visuals\anima_v5\` without overwriting prior visuals or the repository root.

## Renewed single-file delivery (2026-10-30)
This ONE ZIP contains all 44 screen PNG references, 44 same-number TXT prompts, 5 alternative PNG references and docs. It does NOT contain a separate logo asset. Unpack into your project visuals/anima_v5 folder; do not overwrite previous approved files. The PNGs are original exact bytes, not re-encoded.
