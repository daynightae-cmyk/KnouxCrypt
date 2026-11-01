# EVIDENCE — TASK 24 — Metadata Cleaner

Date: 2026-11-01 · Branch `android/native-implementation-20261031` · Baseline `0d9c3fd`
Classification: **SOURCE_IMPLEMENTED + CLASSIFICATION_JVM_TESTED — EXIF READ/WRITE DEVICE_UNVERIFIED / AUDIT_PENDING**

## What works

**The platform does the format work.** `MetadataCleaner` (`:core:data`) reads and rewrites through
`android.media.ExifInterface` — the Android API that knows the APP1 segment layout and how to write it
back. There is no hand-rolled JPEG/TIFF parser in this build, and that is deliberate: a private parser
is where metadata tools usually lose data or miss tags.

**A declared, honest inventory.** `android.media.ExifInterface` cannot enumerate the tags a file
carries, so the build declares `KNOWN_TAGS` and reads exactly those. The consequence is stated on
screen rather than hidden: **anything outside the list is neither read nor removed**, and no file is
ever described as clean. The inventory also reports how many tags were inspected at all.

**Classification is a pure function, and it is tested.** `groupOf(tag)` sorts into GPS · camera model ·
author · timestamps · comments · technical, and `isStructural(tag)` protects the tags whose removal
would make the image display wrongly (orientation, pixel dimensions, EXIF version, interop index)
rather than more private. Six JVM tests pin those decisions, including that GPS tags never fall into
"technical" and that `Make`/`Model`/`Software` are separated from exposure data.

**Formats are declared, not assumed.** Only `image/jpeg` and `image/tiff` are offered for cleaning,
because those are what the platform will rewrite here. PNG, PDF, DOCX and video are reported as
inspect-or-unsupported with the reason, and the cleaner refuses to produce a "clean copy" it cannot
guarantee.

**The original is never touched.** The source is opened read-only, copied into a cache staging file,
rewritten there through the platform, and only then streamed into a **new** document the user chose
through `CreateDocument`. Staging is deleted in a `finally`; a refusal to write the destination leaves
the original exactly as it was.

**UI** (`MetadataCleanerScreen`, route `metadata_cleaner`, catalog IMPLEMENTED, no unlock required)
follows the approved reference: file card with size, dimensions and format badge; "Detected metadata —
select which metadata to remove — N categories found" with one switch per category and its item count;
"Clean copy output" with the explicit line *"No clean copy generated yet — the original file remains
unchanged"*; primary **Create Clean Copy**; and the two secondary actions Preview Metadata / Choose
Destination. A permanent warning panel lists what is *not* claimed.

## What is explicitly not claimed

XMP blocks, ICC profiles, embedded thumbnails, GPS inside video containers, and document metadata in
PDF or Office files are not inspected and not removed. The warning says so in both languages, and the
clean result carries it as a note next to the removed/kept counts.

## Verification

| Check | Result |
|---|---|
| JVM | **311 tests, 0 failures** (security 161, data 133, app 17); new `MetadataCleanerTest` 6 |
| Platform API check | every `ExifInterface` constant used was verified against `android-36/android.jar` before compiling; `TAG_AUTHOR`, `TAG_OWNER_NAME`, `TAG_GPS_INFO`, `TAG_LENS_MAKE/MODEL`, `TAG_DATETIME_CREATED/MODIFIED` and `getAttributes()` **do not exist** on this platform and were removed rather than guessed at — the assumption that androidx and `android.media` share an API was wrong |
| Instrumented | none written for this mission — a real EXIF round trip needs a handset and a camera JPEG; **the read/write path has never run** |
| Lint | 0 errors |
| APK | clean build **20,257,759 bytes**, SHA-256 `93d715fba4ada25a38221b97db51e2a6b476b55e4c3ce816e9c34e2dc2b00515` |

## Not verified / limits

- **No EXIF tag has ever been read or removed by this build.** The classification and the file
  handling are tested; the platform call itself is DEVICE_UNVERIFIED, and `setAttribute(tag, null)`
  behaviour across Android versions and camera vendors is unknown.
- Because the inventory is a declared list, a file carrying a sensitive tag outside that list will be
  reported as having nothing to remove. This is why the screen never says "clean".
- Vendors write some data outside EXIF (maker notes, XMP in JPEG, ID3-style blocks); those are not
  reached by `ExifInterface` and are named as untouched.
- No before/after byte-level diff evidence exists yet — that requires a real photo on a real handset.
- No independent security review. **AUDIT_PENDING.**

## Next action for this mission

With the owner's phone attached: take or copy one camera JPEG, inspect it, remove GPS + camera model +
timestamps, and record the before/after tag list plus the file sizes here.
