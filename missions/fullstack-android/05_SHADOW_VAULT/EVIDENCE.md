# TASK 05 - Shadow Vault / Evidence

State: **SOURCE_IMPLEMENTED, JVM_TESTED, DEVICE_TESTED=NO, VISUAL_VERIFIED=NO**.

- Baseline commit: `c240b87db96d091426242261c293d28342bbbf23` (TASK 39 evidence commit; feature baseline `038c734`)
- Implementation commit: `ab0424a974d8c6108c9f3291d0d46d0ccf9f659b`
- Branch: `production/android-hardening-20261102`
- No Room schema change: media metadata reuses the existing `secrets` table (database version stays 3).

## Real service behaviour

`core/data/src/main/kotlin/com/knoux/crypt/data/ShadowVault.kt` — `ShadowVaultService`:

- Media bytes are encrypted with the existing `VaultFileCipher` (KNF2: random per-file
  DEK wrapped by the non-exportable Keystore root, KDK1). The vault key hierarchy and
  file primitives are reused; no new crypto format was invented.
- Item metadata is a KNC2 vault record (`SecretKinds.MEDIA`) encrypted by the same
  versioned data key, so display name, MIME, dimensions and duration are inside ciphertext.
- Thumbnails are a second encrypted KNF2 container with a distinct AEAD context
  (`knoux.shadow.thumb.v1`); the grid never sees a plaintext thumbnail file.
- `VaultFileCipher.openRandomAccess()` + `FileEnvelope.decryptChunk()` provide
  chunk-authenticated random access. `VaultRandomAccessReader` decrypts only the chunks a
  read window needs into a 4-chunk LRU cache, re-validates the live capability on every
  chunk, and wipes the cache on close. **No decrypted media file is ever written.**
- `export()` streams plaintext only into a user-chosen SAF destination after explicit
  confirmation. `delete()` removes the metadata record then the encrypted files
  (logical deletion; stated in UI). `onLock()` removes interrupted `.part` temps.
- Every entry point requires a live `VaultAccess`; a lock mid-stream fails instead of
  returning bytes (covered by a JVM test).
- Audit events (`MEDIA_IMPORTED/CANCELLED/FAILED/DELETED/EXPORTED/EXPORT_FAILED/OPENED`)
  carry only media type and byte counts. Generic `DATA_*` writes are suppressed for the
  `media` and `note_draft` kinds so autosave/import cannot flood the bounded timeline.

## Real UI behaviour

`app/src/main/kotlin/com/knoux/crypt/ui/ShadowVaultScreen.kt`, `ShadowVaultMedia.kt`,
`media/MediaImporter.kt`:

- Route `shadow_vault` is wired in `KnouxNavHost` and `Catalog`; the Home/Tools **Vault**
  entry is now `IMPLEMENTED` instead of design-only.
- Imports use the system **Photo Picker** (`PickMultipleVisualMedia` Image+Video) and
  `OpenMultipleDocuments` for audio/any file. No storage permission is requested; the
  manifest keeps the camera-only runtime grant.
- Import is a real pipeline: metadata + in-memory thumbnail (EXIF rotation applied,
  sampled to 512 px) → streaming encryption → `fd.sync()` → atomic rename → encrypted
  metadata record. Failure or cancellation deletes partial ciphertext and reports
  distinct cancelled / failed / retry states. Retry re-runs the real import.
- Grid: `LazyVerticalStaggeredGrid` with per-item aspect ratio, blurred encrypted
  thumbnail, violet shutter motion (disabled under reduced motion), lock glyph, type and
  size labels, tap-to-open and long-press/menu details. Display names are not shown on tiles.
- Categories Photos / Videos / Audio / Files filter the real record list. The usage card
  shows real item counts and real encrypted container bytes split by category — no fake
  percentage. Unreadable records are reported as unreadable, not hidden.
- Viewer: images decode bounded (≤64 MB, sampled to 2048 px) in-memory bitmaps with
  pinch-zoom; video and audio play through `MediaPlayer` + `MediaDataSource` over the
  authenticated reader with real seek/play/pause; unsupported file types get an honest
  "no in-app preview" state instead of a fake player.
- Export requires a confirmation that names the plaintext risk; deletion requires a
  confirmation that names the non-provable-erase limit. Locking clears the timeline of
  decrypted bitmaps and closes the player.
- Identity: original stag asset via `StagHero`, violet glass panels, obsidian gradients,
  Arabic/English `tr()` strings, RTL-safe layout, safe-area insets, `FLAG_SECURE` inherited.

## Encrypted persistence

- `filesDir/shadow_vault/media/<uuid>.knf`, `.../thumbs/<uuid>.knf`, `.../tmp/*.part`
  (ciphertext only, random names, app-private).
- Room `secrets` rows hold KNC2 metadata envelopes; kind and timestamps are the only
  plaintext columns. `allowBackup=false` unchanged.
- JVM tests assert the stored envelope does not contain the display name and that the
  on-disk container is not the plaintext.

## Tests actually run on this host (2026-11-02)

| Command | Result |
|---|---|
| `./gradlew :core:data:testDebugUnitTest --no-daemon` | **SUCCESS** — 157 tests, 0 failures |
| `./gradlew :core:security:test --no-daemon` | **SUCCESS** — 161 tests, 0 failures |
| `./gradlew :app:testDebugUnitTest --no-daemon` | **SUCCESS** — 18 tests, 0 failures |
| `./gradlew :app:lintDebug --no-daemon` | **SUCCESS** |
| `./gradlew :app:assembleDebug --no-daemon` | **SUCCESS** (20 MB debug APK) |
| `python native-android/scripts/check-source.py` | **PASS** (camera-only manifest, bilingual parity, AEAD framing) |
| APK content check | Arabic literals (`سجل الأمان`, `الخزنة الظلية`, `ملاحظات آمنة`, `خصوصية الجلسة`) found in packaged DEX; `aapt2 dump permissions` shows only CAMERA + biometric |

New JVM tests (`ShadowVaultServiceTest`, 7): import + ciphertext-only storage + sequential
and random authenticated reads, encrypted thumbnail round-trip and absence, export bytes and
outcome, delete removes record and files, lock revokes an open reader mid-read, usage counts
real containers, EXIF rotation stored and reflected in aspect ratio.

## Device and visual verification status

**Not performed.** `adb devices` is empty and `D:\Android\sdk` contains no emulator or
system-image package; installing one was not attempted because free space is 4.3 GB (C:) /
4.9 GB (D:). Therefore picker behaviour, real Keystore-backed playback, rotation, RTL,
font scale, process death and screenshot comparison against
`agent-handoff/KNOUX_CRYPT/03_HOME/02_VAULT/REFERENCE.png` remain **unverified**.
Known visual deviations from the reference: no masonry artwork (real thumbnails instead),
no bottom tab bar inside the service screen (the app uses the shared back header), and the
usage bar is a real per-category share rather than the reference's fixed "40% used".

## Remaining production blockers

- Device/emulator run of import → view → export → lock → recover, plus Media3-class
  behaviour checks for long videos.
- Video thumbnails are not EXIF/rotation-corrected (frame may be sideways on some files).
- HEIC/HEIF and animated GIF previews depend on platform decoders; unverified.
- Orphan ciphertext can survive if file deletion fails after the metadata record is gone;
  no background orphan sweep yet.
- No duplicate detection, no per-item rename/move, no Collections (TASK 29) integration.

## Next safe task

TASK 07 Notes editor (implemented in `6ebcf96`), then device QA for both.