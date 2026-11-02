# TASK 29 - Vault Collections / Evidence

State: **SOURCE_IMPLEMENTED, JVM_TESTED, DEVICE_TESTED=NO (BLOCKED_DEVICE), VISUAL_VERIFIED=NO**.

- Baseline commit: `619a1e3069d6fe1881e6a46ac3317e68e1dd8ae6` (`origin/main`, verified clean tree)
- Implementation branch: `feature/android-task29-vault-collections-20261102`
- Implementation commit: recorded in this file's final section once pushed
- Prerequisite: TASK 05 Shadow Vault (`ab0424a`, already on `main`) — reused, not re-implemented
- No Room schema change: database version stays **3**, no new table, no migration, and no
  change to any KNC/KNF envelope format.

## TASK CLAIM (single writer)

| Field | Value |
|---|---|
| TASK_ID | 29 VAULT_COLLECTIONS |
| OWNER | this session (Android lane) |
| BASE_SHA | `619a1e3` |
| ALLOWED FILES | `native-android/core/data/.../VaultCollections.kt` (new), `ShadowVault.kt`, `Secrets.kt`, `SecurityAudit.kt`, `VaultCollectionsServiceTest.kt` (new), `native-android/app/.../VaultCollectionsScreen.kt` (new), `ShadowVaultScreen.kt`, `Catalog.kt`, `KnouxNavHost.kt`, `AppContainer.kt`, `CatalogTest.kt`, `missions/fullstack-android/29_*`, `STATUS_LEDGER_CURRENT.md` |
| PROTECTED (untouched) | `MainActivity.kt`, `SecretsDatabase.kt`, Keystore/session contracts, Room schemas, Gradle files, `.github/workflows/*`, all `electron/`, `src/`, `docs/production-program/` |
| COMPETING WRITERS | none found: `gh pr list --state open` returned `[]`, no stash, no other worktree on `native-android` |

## Real service behaviour

`core/data/src/main/kotlin/com/knoux/crypt/data/VaultCollections.kt` — `VaultCollectionsService`:

- A collection is one authenticated vault record (`SecretKinds.COLLECTION`); the record id is
  the collection id, and the **label is stored only inside the KNC envelope** (AAD-bound to
  kind + id), so no plaintext collection index exists anywhere.
- Membership is a field on the item's own encrypted metadata
  (`VaultMediaPayload.collectionId`), so there is exactly one authoritative link per item.
  There is no membership table to orphan and no second source of truth to reconcile.
- `create` / `rename` / `delete` / `assign` all require a live `VaultAccess` and are typed:
  `EMPTY_NAME`, `NAME_TOO_LONG` (80), `DUPLICATE_NAME` (case-insensitive),
  `COLLECTION_NOT_FOUND`, `MEDIA_NOT_FOUND`, `MEDIA_UNREADABLE`, `STALE_REVISION`,
  `LIMIT_REACHED` (200 collections).
- `rename` and `assign` go through `SecretRepository.saveIfUnchanged`, i.e. the revision check
  happens inside the same revocation boundary and Room transaction, so a concurrent change
  fails as `STALE_REVISION` instead of clobbering.
- **Moving an item never touches its media bytes.** The container file is not re-read,
  re-written or re-encrypted, so no AEAD nonce is reused; only the metadata envelope changes.
  Proven by test.
- `delete` clears every member first and only then removes the collection record, so a crash
  leaves items pointing at a collection that still exists, and the operation is idempotent on
  retry. Media files and their encrypted containers are never deleted by a collection delete;
  the UI confirmation states the exact number of items that will be kept.
- `summaries()` derives item counts, encrypted byte totals and member media types from the
  live item list — never denormalised counters that can drift.
- Audit: four new typed actions (`COLLECTION_CREATED/RENAMED/DELETED/MEMBERSHIP_CHANGED`)
  carrying counts only. Labels, record ids and file names are never written. A test asserts
  that every collection event's detail excludes the label and both record ids.

## Real UI behaviour

`app/src/main/kotlin/com/knoux/crypt/ui/VaultCollectionsScreen.kt` (route `vault_collections`,
now the `COLLECTIONS` catalog destination, previously design-only):

- Approved-reference layout: stag emblem in the back header, "Private Vault / Collections"
  two-tone title, letter-spaced tagline, the two action cards (Create Collection /
  Import Encrypted), then the vertical collection card list with folder glyph, name,
  "N items · size", an Encrypted pill, member-type chips and an overflow menu.
- Create and rename dialogs state that names are encrypted and never enter the audit
  timeline; Save is disabled while empty or busy.
- Search filters by label in memory; type chips (All/Photos/Videos/Audio/Files) filter by the
  real member types. Empty state distinguishes "no collections" from "no match for filter".
- Overflow menu: Open / Rename / Delete. Delete confirmation names the exact item count that
  will be kept and moved to uncategorized.
- Unreadable collection records are reported as a count with "nothing was replaced" instead of
  being silently dropped.
- Sealed-folder glyph extrudes extra layers as the collection fills (the reference's
  "collection cube extrudes layers"); the card press scale animation is skipped under
  reduced motion.
- `VaultCollectionsViewModel` binds Room-backed Flows for collections and media, recomputes
  summaries on either change, and drops all labels and counts on lock.

`ShadowVaultScreen.kt` (extended, not duplicated):

- New optional `collectionId` argument; route `shadow_vault/collection/{collectionId}` opens
  the existing media grid scoped to that collection, with a banner naming the collection and
  an "All collections" action.
- Category tabs, grid, viewer, export and delete are the existing TASK 05 implementations —
  no second media screen or second ViewModel.
- Details sheet now shows the item's collection (or "Uncategorized") and a **Move** action
  opening a real picker: existing collections, "Move to uncategorized", or create-and-move.
- Importing while inside a collection files the new item into it (the collection id is passed
  into the real import call).

## Encrypted persistence

- Collections: `secrets` rows of kind `collection`, KNC envelope, app-private Room DB.
- Membership: inside each media record's KNC envelope.
- Media containers: unchanged KNF2 files under `filesDir/shadow_vault/media|thumbs`.
- Nothing new is written to DataStore, external storage, the media store, or a plaintext file;
  `allowBackup=false` is unchanged and the manifest stays camera-only.

## Tests actually run on this host (2026-11-02)

| Command | Result |
|---|---|
| `./gradlew :core:data:testDebugUnitTest --no-daemon` | **SUCCESS** — 165 tests, 0 failures, 0 errors |
| `./gradlew :app:testDebugUnitTest --no-daemon` | **SUCCESS** — 18 tests, 0 failures, 0 errors |
| `./gradlew :app:compileDebugKotlin --no-daemon` | **SUCCESS** |
| `./gradlew :app:lintDebug :app:assembleDebug --no-daemon` | **SUCCESS** — debug APK 20 MB, sha256 prefix `dbb03f33c66a4f52737fcdeac2f082ad` |
| APK DEX check | all 7 Arabic literals (6 new TASK 29 strings + Shadow Vault) present in packaged DEX |
| `aapt2 dump permissions` on the APK | only `CAMERA`, `USE_BIOMETRIC`, `USE_FINGERPRINT` (+ the local dynamic-receiver permission) — no storage permission added |
| `python native-android/scripts/check-source.py` | **PASS** |

New `VaultCollectionsServiceTest` (8 tests): label exists only inside ciphertext (asserted
against the raw stored envelope, and that no row leaks an imported file name); duplicate /
empty / over-long names rejected with the exact typed failure; rename uses the revision token
and a stale rename is refused without changing the row; assign moves membership and the media
container bytes are byte-identical before and after, with unknown-collection rejection and
move-to-uncategorized; delete clears members, keeps both media files and reports the second
delete as `COLLECTION_NOT_FOUND`; summaries derive counts, bytes and types; a revoked session
cannot read or write; collection audit details contain no labels and no record ids.

## Device and visual verification status

**BLOCKED_DEVICE — not performed.** Re-verified this run: `adb devices` lists no target, and
`D:\Android\sdk` contains only `build-tools`, `cmdline-tools`, `licenses`, `platform-tools`,
`platforms` — there is **no `emulator` package and no `system-images`**, and no AVD exists.
D: has 3.6 GB free, which is not enough to download a system image plus create an AVD safely.

Therefore these remain unproven and are **not** claimed: real Keystore-backed create/move/
delete round-trip, collection persistence across process death, SAF import filing into a
collection, RTL rendering and mirroring of the new screens, TalkBack labels, 360/390/412 dp
layout, high font scale, reduced-motion behaviour, and any screenshot comparison against
`agent-handoff/KNOUX_CRYPT/03_HOME/02_VAULT/SERVICES/29_VAULT_COLLECTIONS/REFERENCE.png`
(SHA-256 recorded in that task's `SCREEN_QA.md`).

Exact owner action needed to close this gate: authorize installing `emulator` + a
`system-images;android-<api>;google_apis;x86_64` package (or attach a physical device with
USB debugging), then run `:core:data:connectedDebugAndroidTest` and the instrumented
collection/visual pass on an **isolated test profile**, never against a vault holding real
user data.

## Known limitations and honest gaps

- Membership is single-valued: an item lives in at most one collection (the reference's tag
  chips are derived from member media types, not free-form tags).
- No undo for collection deletion; recovery means recreating the collection and re-moving
  items, which are still present.
- No cross-collection drag-and-drop; moves go through the details "Move" action.
- The reference shows a "Share" action per collection; whole-collection sharing is **not**
  implemented and is deliberately absent rather than faked (Secure Share works per file and
  its two-device path is itself unverified).
- Collection rename/assignment is optimistic per record; a multi-item collection delete that
  is interrupted mid-way leaves the collection present with partially cleared membership,
  which is the safe state and is retried.

## Integration state

`PUSHED_UNMERGED` at the time this file was written; the merge commit and the CI run on the
exact target SHA are appended below once they exist.
