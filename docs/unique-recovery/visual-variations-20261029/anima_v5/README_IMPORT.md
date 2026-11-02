# KNOUX CRYPT — Anima V5 project staging

This folder was prepared for the owner's organized reference pack.

## SOURCE OF TRUTH
Existing repo: D:\KnouxCrypt
Existing work under visuals/prompts, visuals/references, visuals/generated and visuals/approved MUST NOT be overwritten.

## VERIFIED PACKAGE (CURRENT CHAT ATTACHMENT)
KNOUX_CRYPT_ANIMA_V5_ORGANIZED.zip
SHA256: 6762949092df5ba4cdafdb0011245ade786df3bd4482e72409e1c8dcf1548cc0
Expected: 44 primary screenshot references, 44 same-stem prompts, 1 standalone stag brand source, 5 alternate designs.
Original RAR contained 60 images, 10 byte-identical duplicates; 50 unique references are represented in the ZIP.

## SMALL ZIP FALLBACK (when the full-package download fails)
Download all six ZIP files named KNOUX_V5_00_PROMPTS_AND_GUIDES.zip through KNOUX_V5_41-44_SCREENS.zip into Downloads. Run:
  & 'D:\KnouxCrypt\visuals\anima_v5\Import-KnouxAnimaSplitPack.ps1'
The split importer verifies every SHA-256 and the 98 staged files, refuses conflicts, and never overwrites different existing files.

## INSTALL WITHOUT DESTROYING PRIOR WORK
1. Download the ZIP attachment from the current chat to the computer's Downloads folder.
2. In a PowerShell console, run:
   & 'D:\KnouxCrypt\visuals\anima_v5\Import-KnouxAnimaPack.ps1'
3. The importer checks ZIP SHA256, file counts, free space, and conflicts; it aborts rather than replacing existing files. It leaves staging behind for traceability.
4. Review README_FIRST.md and MANIFEST.json inside this folder when import finishes.

NOTE: This project's V5 folder and the importer were created directly on the Windows machine. The ZIP image/prompt contents are not yet installed on D: at time of writing because the chat attachment is located in ChatGPT's separate sandbox. Do NOT claim transfer is complete until the importer actually runs successfully and verifies counts.

ANIMA usage: first patch the Splash (01), then build Home (02) and Secure Access (03) inside the SAME existing React project. The Splash fingerprint Enter opens Home; login remains a separate visual page accessible through Account. For each later screen upload exactly one reference plus same-number prompt. UI only; DeepSeek V4 later implements real Android services.

GIT: Worktree/branch untouched. New V5 files are local, uncommitted. Do not push/merge before owner review.
