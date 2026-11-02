# TASK 30 - Document Viewer / Evidence

State: **SOURCE_IMPLEMENTED, JVM_TESTED, DEVICE_TESTED=NO (BLOCKED_DEVICE), VISUAL_VERIFIED=NO**.

- Baseline commit: `354f8f41a1ca1ee2df149bc2467a35174000a79a` (`origin/main`, tree verified clean
  before branching; `gh pr list --state open` returned `[]`)
- Implementation branch: `feature/android-task30-document-viewer-20261102`
- Implementation commits: `e144b18` (feature) + `016e9f0` (execution-path fixes)
- Prerequisites: TASK 05 Shadow Vault (`ab0424a`) and TASK 29 Vault Collections (`6b3ef20`), both
  already on `main` and reused, not re-implemented
- No Room schema change: database version stays **3**, no new table, no migration, and no change to
  any KNC/KNF/KNP envelope format. No new Android permission.
- Canonical reference: `agent-handoff/KNOUX_CRYPT/03_HOME/02_VAULT/SERVICES/30_DOCUMENT_VIEWER/REFERENCE.png`,
  SHA-256 `2a01befee13521a0a895e0149e7fe55b3033e84e7fe4106f7b204ce70904d8f0` — re-hashed on this
  checkout with `certutil -hashfile … SHA256` and identical to `30_DOCUMENT_VIEWER/SCREEN_QA.md`.

## TASK CLAIM (single writer)

| Field | Value |
|---|---|
| TASK_ID | 30 DOCUMENT_VIEWER |
| OWNER | this session (Android lane) |
| BASE_SHA | `354f8f4` |
| ALLOWED FILES | `native-android/core/data/.../DocumentViewer.kt` (new), `SecurityAudit.kt`, `DocumentViewerServiceTest.kt` (new), `native-android/app/.../ui/DocumentViewerScreen.kt` (new), `ui/ShadowVaultScreen.kt`, `Catalog.kt`, `KnouxNavHost.kt`, `AppContainer.kt`, `CatalogTest.kt`, `native-android/scripts/check-source.py`, `missions/fullstack-android/30_*`, `STATUS_LEDGER_CURRENT.md` |
| PROTECTED (untouched) | `MainActivity.kt`, `SecretsDatabase.kt`, Room schemas, Keystore/session contracts, Gradle files, `.github/workflows/*`, all `electron/`, `src/`, `docs/production-program/` |
| COMPETING WRITERS | none found: no open PR, no stash, no other worktree touching `native-android` |

## Real service behaviour

`native-android/core/data/src/main/kotlin/com/knoux/crypt/data/DocumentViewer.kt` —
`DocumentViewerService` + `DocumentViewerPolicy`:

- **Text never touches storage.** Decryption writes into `WipeableBuffer`, a bounded
  `OutputStream` whose storage is zeroed both when it is superseded by a growth copy and in the
  `finally` of the read. The String is built directly from that buffer
  (`String(bytes, 0, size, UTF_8)`), so no intermediate plaintext array is left behind.
- **The bound is enforced during decryption, not after.** `grow()` throws
  `DocumentRejectedException(TOO_LARGE)` as soon as the plaintext would exceed
  `MAX_TEXT_BYTES` (4 MiB), so an oversized document is never fully decrypted into memory.
- **A PDF needs a seekable descriptor** for `android.graphics.pdf.PdfRenderer`; the platform cannot
  render from a stream. A PDF is therefore staged as a transient lease named
  `docview-<UUID>.pdf.lease` inside a caller-supplied root, which `AppContainer` sets to
  `File(appContext.cacheDir, "document_viewer")` — app-private, never external storage, never
  `getExternalCacheDir`, never `createTempFile`, never `MediaStore`. The lease is deliberately
  **not fsynced**: durability would only make plaintext survive a crash.
- **Four independent reclaim paths** for that lease: explicit `closeLease`, `onLock` (also sweeps
  every matching file in the root), `sweepExpiredLeases` on the next start, and the failure paths of
  `openPdfLease` itself (cancellation, rejection, I/O and authentication failures all delete before
  rethrowing).
- **A stale descriptor cannot open.** Before any byte is decrypted the service re-checks the live
  `VaultAccess`, the mode/size policy, that the record still exists, that its kind is `media`, that
  its metadata decrypted, and that the container is present. A deleted record yields `MISSING`, not
  content.
- **A lock is reported as a lock.** `VaultLockedException` propagates instead of being flattened
  into "unreadable", so the UI cannot claim a file is corrupt when the session ended.
- **Failure classification is typed and non-revealing**: `TamperedFileException` /
  `GeneralSecurityException` → `UNREADABLE`; anything else maps to the I/O fallback of the path in
  use (`UNREADABLE` for text, `LEASE_WRITE_FAILED` for a PDF lease). No message carries a path.
- `DocumentViewerPolicy.descriptor()` filters unsuitable items out of the catalog entirely:
  unsupported MIME, zero length, unreadable metadata, or a size above the mode limit.

## Audit integration

Three typed actions were added to the existing `SecurityAudit.kt` catalog (no new table, no schema
change): `DOCUMENT_VIEWED` (DATA/INFO), `DOCUMENT_OPEN_FAILED` (DATA/ALERT),
`DOCUMENT_LEASE_CLEARED` (PRIVACY/INFO). Details are fixed-shape tokens only —
`mode=text bytes=…`, `mode=pdf bytes=…`, `mode=… reason=…`, `deleted=true`, `swept=n`,
`reason=lock cleared=n`.

`closeLease`, `onLock` and `sweepExpiredLeases` run from lifecycle and lock callbacks, so they use a
detached audit dispatch (`auditScope`) instead of a suspending write. **The file deletion happens
synchronously before any audit work**, so a dropped or cancelled audit dispatch can never leave
plaintext on disk.

## Real UI behaviour

`native-android/app/src/main/kotlin/com/knoux/crypt/ui/DocumentViewerScreen.kt`:

- `DocumentLibraryScreen` (`document_viewer`) lists only items the viewer may actually open, with
  the real byte size, MIME type and mode, plus an explicit count of vault records whose metadata
  could not be decrypted. Empty and locked states are distinct and truthful.
- `DocumentViewerScreen` (`document_viewer/{recordId}`) reproduces the approved reference order:
  back header + status pill, two-tone title block, document card (glyph tile, name, size,
  "Encrypted at rest", MIME, collection pill), large preview panel, three protection rows, primary
  CTA, then the plaintext-lifetime note.
- The preview panel has five distinct states, not one: locked, not-openable, loading (driven by a
  real in-flight open job), text body, PDF body, and "no decrypted copy is held".
- The three rows are **real values, not decoration**: session timeout reads
  `AppSettings.autoLockSeconds` (enforced in `MainActivity`), screenshot restriction reads
  `AppSettings.blockScreenshots` (which adds or clears `FLAG_SECURE`), and temporary plaintext
  handling shows the live `DocumentViewerPolicy.IDLE_CLEAR_SECONDS` countdown while a copy is open.
  All three navigate to the real Privacy screen or perform the real release.
- PDF pages render through `PdfRenderer` over the lease, longest edge capped at
  `MAX_PAGE_WIDTH = 1600`, with prev/next navigation, a page counter exposed through semantics, and
  pinch/drag zoom. Rendering and release share one lock, and a render sequence number stops a
  superseded page from publishing after a release or a lock.
- Text is deliberately **not selectable**: copying would move plaintext into the system clipboard
  outside the clipboard-guard path. The screen says so, and export is the only sanctioned handoff.
- Export goes through `ActivityResultContracts.CreateDocument` after an explicit confirmation dialog
  that states the destination is no longer protected by this app, and reuses the existing
  `ShadowVaultService.export` — no second export implementation.
- Release happens on the primary CTA, on the overflow "Clear decrypted copy", on the idle timeout,
  on a real unlocked → locked transition, and in `onCleared()`. A configuration change does **not**
  discard a copy the user is still reading; the countdown still bounds it.
- Bilingual AR/EN through the existing `tr()`; ViewModel messages use a `BilingualText` pair because
  `tr()` is a composable function and must not be called from a ViewModel.

## Wiring

- `AppContainer`: `DocumentViewerService` constructed with the existing `session`, `secrets`,
  `shadowVault`, `vaultFiles` and `securityEvents`; lease root under `cacheDir`; `appScope` supplied
  for detached audit. Two new lock paths: `session.addOnLockListener { documentViewer.onLock() }`
  and a startup `sweepExpiredLeases()` on `Dispatchers.IO`.
- `KnouxNavHost`: routes `document_viewer` and `document_viewer/{recordId}`; `ShadowVaultScreen`
  gains `onOpenDocument` and the details dialog offers "Read" only when
  `DocumentViewerPolicy.descriptor(item) != null`.
- `Catalog`: `DOCUMENT_VIEWER` moved `DESIGN_ONLY` → `IMPLEMENTED` with route `document_viewer`,
  keeping the 34 unique destinations and unique-route invariants asserted by `CatalogTest`.

## Commands, results and exit codes

All from `native-android/` on Windows, `--no-daemon`, launcher Gradle 8.14.6 / JDK 21.

| # | COMMAND | WORKTREE | EXIT | RESULT | TEST_COUNT | LOG_OR_ARTIFACT |
|---|---|---|---|---|---|---|
| 1 | `./gradlew.bat :core:data:compileDebugKotlin` | `D:\KnouxCrypt-Android-Ready` @ `feature/android-task30-document-viewer-20261102` | 0 | PASS | n/a | gradle console |
| 2 | `./gradlew.bat :core:data:testDebugUnitTest --tests "com.knoux.crypt.data.DocumentViewerServiceTest"` | same | 0 | PASS | 10/10, 0 fail, 1.196 s | `core/data/build/test-results/testDebugUnitTest/TEST-com.knoux.crypt.data.DocumentViewerServiceTest.xml` |
| 3 | `./gradlew.bat :core:security:test` | same | 0 | PASS | 161 tests, 0 failures | `core/security/build/test-results/` |
| 4 | `./gradlew.bat :core:data:testDebugUnitTest` | same | 0 | PASS | 175 tests, 0 failures, 21 classes | `core/data/build/test-results/testDebugUnitTest/` |
| 5 | `./gradlew.bat :app:testDebugUnitTest` | same | 0 | PASS | 18 tests, 0 failures, 6 classes | `app/build/test-results/testDebugUnitTest/` |
| 6 | `./gradlew.bat :app:lintDebug` | same | 0 | PASS | 0 errors | `app/build/reports/lint-results-debug.html` |
| 7 | `./gradlew.bat :app:assembleDebug` | same | 0 | PASS | n/a | `app/build/outputs/apk/debug/app-debug.apk` |
| 8 | `./gradlew.bat :core:data:compileDebugAndroidTestKotlin` | same | 0 | PASS (compile only) | n/a | gradle console |
| 9 | `python scripts/check-source.py` | same | 0 | PASS | 173 Kotlin files | stdout |
| 10 | dex literal check (unzip APK, search concatenated `classes*.dex` for 10 Arabic viewer strings) | same | 0 | PASS 10/10 | n/a | inline python over `app-debug.apk` |
| 11 | `aapt2 dump permissions app-debug.apk` (build-tools 36.0.0) | same | 0 | PASS | 3 permissions | CAMERA, USE_BIOMETRIC, USE_FINGERPRINT only |

## Targeted test coverage (`DocumentViewerServiceTest`, 10 JVM cases)

1. `modeAndAcceptancePolicyIsExplicit` — full MIME/mode/limit matrix including OOXML rejection and
   lease-name recognition.
2. `onlyOpenableAndInPolicyItemsAreOffered` — a photo is never offered and the lease root stays
   empty when only unsupported media exists.
3. `textDocumentDecryptsInMemoryAndCreatesNoFile` — Arabic body round-trips, lease root stays empty,
   the vault directory still holds exactly one container, the container does not contain the
   plaintext, and `DOCUMENT_VIEWED mode=text` is recorded.
4. `unsupportedAndLockedReadsFailWithoutReturningContent` — mode mismatch, unsupported mode, and a
   locked session surfacing `VaultLockedException` rather than a fake corruption error.
5. `oversizeTextIsRejectedByTheHardMemoryBoundWithoutReturningContent` — a real 4 MiB + 1 document is
   not offered by the policy, and a hand-built descriptor still fails with `TOO_LARGE` during
   decryption before any content is returned.
6. `pdfLeaseRoundTripsThenIsDeletedOnCloseAndOnLock` — lease is in the right root, correctly named,
   byte-equal to the plaintext while the container is not, removed by `closeLease`, idempotent on a
   second close, and removed by `onLock` for a lease that was still open.
7. `staleDescriptorCannotOpenADeletedRecord` — after `ShadowVaultService.delete`, both read paths
   fail `MISSING` and no lease is created.
8. `tamperedContainerFailsAsUnreadableAndLeavesNoLease` — a one-bit flip in the final tag byte makes
   the open fail `UNREADABLE`, leaves zero lease files, and records the typed failure.
9. `startupSweepRemovesStaleLeasesAndKeepsOtherFiles` — an orphaned lease older than the bound is
   reclaimed, an unrelated file and a still-owned live lease are not.
10. `auditDetailsNeverCarryTheDocumentNameOrAnyPath` — after open, close, lock and sweep, no audit
    detail contains the document name, the record id, the lease file name, the lease root or any
    path separator.

## CI

GitHub Actions "Android Native CI" on the exact PR head SHA — see the integration table below.

| FULL_SHA | RUN | RESULT |
|---|---|---|
| `e144b18daadb7d383186aa165286115380607497` | 41465619254 | success (compile, JVM tests, lint, debug APK, SHA-256, evidence upload) |
| `016e9f007375b435bc86946fd099ee9f99d95c80` | 41466855064 | see below |

## Remaining production blockers (unchanged by this task)

1. **BLOCKED_DEVICE** — `adb devices` is empty and `D:\Android\sdk` has no `emulator` package and no
   `system-images`. Owner action required: install `emulator` plus a
   `system-images;android-36;google_apis;x86_64` image, or attach a physical device on an isolated
   test profile. Until then:
   - `PdfRenderer` page rendering, page-count handling, zoom, and the OOM behaviour of a large PDF
     are **unverified at runtime**. The service and lease lifecycle are JVM-proved; the renderer
     binding is compiled only.
   - `:core:data:connectedDebugAndroidTest` (including the TASK 39 Room migration 1→2→3 tests) is
     still compiled-not-run.
   - No runtime screenshot exists, so `VISUAL_VERIFIED` stays NO and this screen is **not**
     pixel-approved.
2. **Visual deviations recorded, not hidden.** The reference shows a filesystem-looking second line
   (`/Vault/Documents`) on the document card. This app has no path for vault media — the container
   file is a random UUID under app-private storage — so the card shows the real MIME type and the
   encrypted collection label instead. Fabricating a path was rejected as untrue. The reference also
   shows a fixed "5 minutes"/"Enabled"/"30 seconds"; those are read from real settings and the real
   policy instead of being hard-coded, so they can legitimately differ from the mock.
3. **Password-protected PDFs** are reported through the honest render-failure state (the lease is
   reclaimed, the original is untouched) but no password prompt exists; `PdfRenderer` cannot supply
   one. Not claimed as supported.
4. **No page thumbnails, no text search inside documents, no reflow.** Out of scope for this task.
5. `SECURITY_REVIEWED` — not independently performed. This file records what was built and tested,
   not an external audit.

## Definition-of-done position

UI + ViewModel + domain use case + vetted core service (existing KNF2 vault reader) + encrypted
local persistence + observable real outcome all exist and are JVM-tested. The Android platform
boundary (`PdfRenderer`, SAF export, `FLAG_SECURE`, biometric-gated session) is wired to real APIs
and compiles, but its runtime behaviour is unverified on this host. TASK 30 is therefore recorded as
**SOURCE_IMPLEMENTED / JVM_TESTED / BLOCKED_DEVICE**, not as VERIFIED or COMPLETE.
