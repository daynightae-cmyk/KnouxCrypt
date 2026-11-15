# EVIDENCE — TASK 21 — Encrypted Archive

Date: 2026-11-01 · Branch `android/native-implementation-20261031` · Baseline `a60ed40`
Classification: **SOURCE_IMPLEMENTED + JVM_TESTED — DEVICE_UNVERIFIED / AUDIT_PENDING**

## What works

**Reuse, not a new format.** `ArchiveService` (`:core:data`) seals its payload with the **same KNF2
file envelope** File Cipher uses — a random per-file DEK wrapped by the non-exportable Keystore root
(KDK1), or a PBKDF2 key derived from a passphrase for portable archives. Inside the container the
payload is a **standard ZIP** written by `java.util.zip`. The only invented part is a 4-byte manifest
length plus a JSON manifest in front of the ZIP, and the whole thing is authenticated by the
container's AEAD.

**Domain separation is enforced by the AEAD context.** Archives use `knoux.archive.v1`, plain files
use the file context, so a file container cannot be opened as an archive or the reverse. A test
asserts exactly that: a KNF2 file produced by File Cipher is refused by the archive opener.

**Authenticated manifest.** Each entry records its name, byte length and SHA-256, computed while the
bytes stream into the ZIP — so the manifest describes the real content, not what the caller claimed.
Listing cross-checks the manifest against the ZIP's own directory and calls a mismatch **tampering**,
not a warning.

**Path traversal is refused, not cleaned.** `sanitize()` accepts only a single safe segment: any
separator, `..`, a leading dot, control characters, reserved device names (`CON`, `COM1`…) or an
over-long name is rejected. The first implementation stripped the directory part and kept the tail —
which turned `../escape.txt` into a legal-looking name — and a test caught it; the current rule
rejects the whole input instead. Extraction re-checks the stored name before writing.

**Zip-bomb and quota protection.** 256 entries, 256 MiB per entry, 1 GiB total, checked before any
work and again while streaming. On extraction, an entry may not exceed its declared size plus
`max(size, 1 MiB)` of slack; a hand-built archive whose manifest declared 100 bytes for a 2 MiB entry
is refused and nothing is written.

**Symlink escape is structurally impossible.** Extraction never writes to a filesystem path: entries
are created as new documents inside a user-picked SAF tree (`OpenDocumentTree` +
`DocumentsContract.createDocument`), so an archive cannot plant a link that points outside the
destination.

**Atomic output.** Creation builds the ZIP and the payload in staging files, seals into a temp file,
and copies to the chosen destination only after the whole container is written; extraction verifies
each entry into a temp file and only then copies it onward. Every staging file is deleted in a
`finally`, and the source documents are only ever read.

**Never overwrites originals.** Nothing in this service writes back to a source URI; extraction
always creates new documents with the user's consent to a tree.

**UI** (`EncryptedArchiveScreen`, route `archive`, catalog IMPLEMENTED, unlock-required) follows the
reference: queued-files card with per-file remove and total size, archive name field, the option
rows, destination, **Create Archive**, Add Files, and an Open mode that lists verified entries and
extracts to a folder. Records of created archives are stored as encrypted vault records holding only
counts, sizes, the container digest and the key source — never entry names.

## Deliberate deviations from the reference

- **"Encryption Required" and "Include File Manifest" are not switchable off.** They are rendered as
  disabled switches with the reason on the row: an archive that might silently be unencrypted is not
  an encrypted archive, and without the manifest there is nothing to verify before extraction. The
  mock presents them as choices; making them real choices here would be a footgun.
- **"Choose folder" for the archive itself is a `CreateDocument`**, because the output is one file.
  The folder contract is used where it actually fits: extraction into an `OpenDocumentTree`.
- Compression is real (DEFLATE) and optional; STORED mode is used when it is off.

## Verification

| Check | Result |
|---|---|
| JVM | **296 tests, 0 failures** (security 152, data 127, app 17); new `ArchiveServiceTest` 11 |
| Round trips | device-key compressed · device-key stored (STORED entries need size+CRC up front, so that path is measured then streamed) · passphrase container opened with the right and the wrong passphrase |
| Hostile cases (JVM) | `../escape.txt`, `/absolute.txt`, `a/b/c`, `.hidden`, `CON`, `LPT1`, control chars, 201-char names, duplicate names, empty queue, >256 entries · **crafted manifest understating a 2 MiB entry → refused** · **crafted manifest naming a file the ZIP does not hold → tampering** · container byte flipped → `TamperedFileException` on open · plain KNF2 file presented as an archive → refused |
| Persistence | archive record holds counts/size/digest only; the stored envelope contains neither the entry names nor the file contents |
| Instrumented | `ArchiveDeviceTest` **written, NOT RUN** — no handset attached during this pass. The KNF2 DEK wrapping against the real Keystore root is therefore unproven for archives specifically |
| Lint | 0 errors |
| APK | clean build **20,175,839 bytes**, SHA-256 `2776a8fddd5342e4aedae6e83ee80a550f8604d707ecd90ce97a27381d9de82d` |
| Build note | the first `:app:clean` after `:app:lintDebug` again failed to delete `lint-cache/migrated-jars` held by the daemon; the daemon was stopped and the build re-run |

## Not verified / limits

- The screen has never rendered on a device: queue rows, RTL, the SAF tree picker, permission denial
  and the extraction progress are **DEVICE_UNVERIFIED**.
- Large-archive behaviour past the quotas is defined but unmeasured: no 1 GiB archive was built, and
  throughput on real flash is unknown.
- ZIP features outside the used subset are not honoured: no nested archive directories (names are
  single segments by design), no comments, no data descriptors beyond what `java.util.zip` writes, no
  encryption inside the ZIP itself (the container does that job).
- A passphrase archive is only as strong as the passphrase; PBKDF2-HMAC-SHA256 at 310 000 iterations
  is what File Cipher already uses, and the screen says the strength claim belongs to the user.
- No independent security review. **AUDIT_PENDING.**
