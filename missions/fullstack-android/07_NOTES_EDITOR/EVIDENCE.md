# TASK 07 - Notes Editor / Evidence

State: **SOURCE_IMPLEMENTED, JVM_TESTED, DEVICE_TESTED=NO, VISUAL_VERIFIED=NO**.

- Baseline commit: `ab0424a974d8c6108c9f3291d0d46d0ccf9f659b` (TASK 05)
- Implementation commit: `6ebcf96e1018c50c0930f94f716e359c732b0e6c`
- Branch: `production/android-hardening-20261102`
- Notes were **not** rebuilt from zero: the existing `notes` route, `SecretKinds.NOTE`
  records and TASK 06 encrypted create/edit/save/delete behaviour are extended in place.

## Data compatibility

- `NotePayload` gains `category: String = ""` and `revisions: List<NoteRevision> = emptyList()`.
  Both have defaults and `Json { ignoreUnknownKeys = true }` is unchanged, so every existing
  KNC1/KNC2 note record (`{"title","body"}`) decodes exactly as before and keeps its bytes.
- `SecretsJson.encodeNote(title, body)` is retained for existing callers; the editor writes
  through `encodeNote(NotePayload)`.
- No Room schema change (database version stays 3); drafts are ordinary `secrets` rows of a
  new kind, so no migration and no encrypted-record format change.

## Real service behaviour

`core/data/src/main/kotlin/com/knoux/crypt/data/NotesEditorService.kt`:

- **Encrypted autosave**: drafts are separate vault records (`SecretKinds.NOTE_DRAFT`,
  deterministic id `knoux.note-draft.<noteId>`) written through `SecretRepository`, i.e.
  KNC1/KNC2 AES-256-GCM envelopes with the record id bound as AAD. No plaintext file, no
  DataStore copy, no `SavedStateHandle`, no clipboard.
- **Conflict detection**: the note row timestamp is the optimistic revision token.
  `SecretRepository.saveIfUnchanged(...)` re-checks inside the revocation boundary and the
  same Room transaction, so a stale editor cannot silently overwrite a newer encrypted
  revision. `allowCreate` supports first save of a new note and recovery of a deleted one.
  Timestamps are forced strictly increasing so two saves in one millisecond still produce
  distinct revisions.
- **Version history**: each successful commit appends the previous committed
  title/body/category as a `NoteRevision` inside the same ciphertext, bounded to
  `NoteRevisions.MAX_ENTRIES = 20` (newest first).
- **Recovery**: `open()` returns note + draft + conflict flag. A draft matching the current
  revision is discarded silently; a newer draft is loaded as "recovered"; a draft based on an
  older revision is preserved and surfaced for explicit review instead of being applied.
  `drafts()` lists drafts whose note is missing or unreadable so nothing is orphaned;
  recovering against an unreadable note copies the draft to a new encrypted identity.
- **Delete** removes the note and its draft. Draft and media kinds are excluded from generic
  `DATA_*` audit writes so autosave bursts cannot evict real security events.

## Real UI behaviour

`app/src/main/kotlin/com/knoux/crypt/ui/NotesScreen.kt`:

- The dialog editor is replaced by a full-screen editor pane while the list stays a
  `LazyColumn` with an explicit encrypted-drafts section (Recover / Discard).
- Premium editor: title field, horizontally scrollable formatting toolbar (bold, italic,
  underline, bullet, numbered, quote, checklist, inline code, undo, redo), large body field
  with a `MarkdownVisualTransformation` that styles headings, emphasis, code, quotes and
  checklist boxes locally while the stored text stays the user's exact characters, lilac
  caret, folio fold-in motion (disabled under reduced motion), IME-aware layout, safe-area
  insets, category sheet, encrypted status pill and autosave status line.
- Undo/redo are real in-memory stacks (bounded 50, coalesced per 450 ms burst) driven from
  the ViewModel, so rotation keeps the content.
- Autosave is a real debounced write (800 ms) with distinct states: idle, encrypting draft,
  draft encrypted with timestamp, failed, and vault-locked. `ON_STOP` flushes the draft;
  leaving the editor persists the draft before navigation so a ViewModel clear cannot lose it.
- Save performs the revision-checked commit; a conflict opens an explicit three-way dialog:
  overwrite with my version, reload latest and discard my draft, or cancel and keep editing.
  Recovery and stale-draft banners offer Review / Discard explicitly.
- "Lock Note" from the reference is not faked: all notes are already vault-encrypted, so the
  screen shows an encrypted status pill instead of a decorative switch.

## Tests actually run on this host (2026-11-02)

| Command | Result |
|---|---|
| `./gradlew :core:data:testDebugUnitTest --no-daemon` | **SUCCESS** — 157 tests, 0 failures |
| `./gradlew :app:testDebugUnitTest --no-daemon` | **SUCCESS** — 18 tests, 0 failures |
| `./gradlew :app:compileDebugKotlin :app:lintDebug --no-daemon` | **SUCCESS** |

New JVM coverage (`NotesEditorServiceTest`, 5): legacy `{"title","body"}` JSON still decodes
and the first commit adds an encrypted revision; draft is encrypted at rest and recoverable
for a new note; a stale draft is detected as a conflict and a stale commit is refused without
touching the newer row; revision history is bounded to 20 with the newest previous body first;
delete removes note and draft. `SecretRepositoryAuditTest` additionally proves draft/media
writes do not emit timeline events while note writes still do.

CI: **green** — run `41391174225` on `a93a19b` passed compile, JVM tests, lint and APK build.

## Device and visual verification status

**Not performed.** No ADB target and no emulator/system image installed (see storage
budget). Untested on device: IME behaviour, rotation with an open keyboard, process death
recovery, RTL editing, large font scaling, reduced motion, real Keystore-backed save
latency, and screenshot comparison against
`agent-handoff/KNOUX_CRYPT/03_HOME/03_SECURE_NOTES/SERVICES/07_NOTES_EDITOR/REFERENCE.png`.
Known deviations from the reference: the reference "Lock Note" toggle is replaced by an
encrypted status pill, and category values are plain labels rather than a coloured chip grid.

## Remaining production blockers

- Device QA for autosave/recovery and conflict flows, including force-kill while typing.
- A lock that lands inside the 800 ms debounce window can lose the last keystrokes; the
  previous completed draft survives. A pre-revocation flush hook would close this.
- Formatting is Markdown-marker based (no rich-text spans persisted), no attachments,
  no search, no cross-device merge; conflict resolution is choose-one-side, not auto-merge.
- Undo history is in-memory only and does not survive process death (draft does).

## Next safe task

Device verification pass for TASK 05 + TASK 07, then TASK 29 Vault Collections on top of the
now-real Shadow Vault.