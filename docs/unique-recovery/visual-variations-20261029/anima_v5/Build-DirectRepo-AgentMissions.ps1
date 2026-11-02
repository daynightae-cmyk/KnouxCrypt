# KNOUX CRYPT - Organize direct-repository agent missions from 44 verified Anima references.
# This script only creates new text tasks. It never modifies source tasks, PNGs or Git.
$ErrorActionPreference='Stop'
$project='D:\KnouxCrypt'
$visuals=Join-Path $project 'visuals'
$anima=Join-Path $visuals 'ANIMA_MISSIONS_01-44'
$dest=Join-Path $visuals 'REPO_AGENT_MISSIONS'
$stage=Join-Path $visuals ('_REPO_AGENT_STAGE_'+[guid]::NewGuid().ToString('N'))
$utf8=New-Object System.Text.UTF8Encoding($false)
if(!(Test-Path -LiteralPath (Join-Path $project '.git'))) {throw 'Project root .git missing'}
if(!(Test-Path -LiteralPath $anima)) {throw 'Existing Anima mission pack missing'}
if(Test-Path -LiteralPath $dest){throw "Destination already exists. No overwrite: $dest"}
if((Get-PSDrive D).Free -lt 25MB){throw 'D: has insufficient free space'}
$mapping=@'
01_SPLASH_ENTRY|01_SPLASH_ENTRY
02_SECURE_ACCESS_LOGIN|02_SECURE_ACCESS_LOGIN
03_HOME|03_HOME
04_FILE_CIPHER|03_HOME\01_ENCRYPT_FILES
17_HASH_INTEGRITY|03_HOME\01_ENCRYPT_FILES\SERVICES\17_HASH_INTEGRITY
18_TEXT_CIPHER|03_HOME\01_ENCRYPT_FILES\SERVICES\18_TEXT_CIPHER
21_ENCRYPTED_ARCHIVE|03_HOME\01_ENCRYPT_FILES\SERVICES\21_ENCRYPTED_ARCHIVE
32_CIPHERTEXT_PACKAGE_INSPECTOR|03_HOME\01_ENCRYPT_FILES\SERVICES\32_CIPHERTEXT_PACKAGE_INSPECTOR
43_FILE_INTEGRITY_TOOL|03_HOME\01_ENCRYPT_FILES\SERVICES\43_FILE_INTEGRITY_TOOL
05_SHADOW_VAULT|03_HOME\02_VAULT
29_VAULT_COLLECTIONS|03_HOME\02_VAULT\SERVICES\29_VAULT_COLLECTIONS
30_DOCUMENT_VIEWER|03_HOME\02_VAULT\SERVICES\30_DOCUMENT_VIEWER
31_VAULT_KEY_ROTATION|03_HOME\02_VAULT\SERVICES\31_VAULT_KEY_ROTATION
06_SECURE_NOTES|03_HOME\03_SECURE_NOTES
07_NOTES_EDITOR|03_HOME\03_SECURE_NOTES\SERVICES\07_NOTES_EDITOR
08_PASSWORDS|03_HOME\04_PASSWORDS
09_PASSWORD_DETAIL|03_HOME\04_PASSWORDS\SERVICES\09_PASSWORD_DETAIL
33_ANDROID_AUTOFILL|03_HOME\04_PASSWORDS\SERVICES\33_ANDROID_AUTOFILL
36_PASSWORD_STRENGTH_AUDIT|03_HOME\04_PASSWORDS\SERVICES\36_PASSWORD_STRENGTH_AUDIT
12_KEY_FORGE|03_HOME\05_KEY_FORGE
13_KEY_DETAILS|03_HOME\05_KEY_FORGE\SERVICES\13_KEY_DETAILS
19_DIGITAL_SIGNATURE|03_HOME\05_KEY_FORGE\SERVICES\19_DIGITAL_SIGNATURE
20_CERTIFICATE_INSPECTOR|03_HOME\05_KEY_FORGE\SERVICES\20_CERTIFICATE_INSPECTOR
23_FINGERPRINT_VERIFY|03_HOME\05_KEY_FORGE\SERVICES\23_FINGERPRINT_VERIFY
26_SECURE_RANDOM|03_HOME\05_KEY_FORGE\SERVICES\26_SECURE_RANDOM
27_HMAC_AUTHENTICITY|03_HOME\05_KEY_FORGE\SERVICES\27_HMAC_AUTHENTICITY
28_PUBLIC_KEY_QR|03_HOME\05_KEY_FORGE\SERVICES\28_PUBLIC_KEY_QR
37_ARGON2ID_KEY_DERIVATION|03_HOME\05_KEY_FORGE\SERVICES\37_ARGON2ID_KEY_DERIVATION
38_SIGNATURE_STUDIO|03_HOME\05_KEY_FORGE\SERVICES\38_SIGNATURE_STUDIO
10_AUTHENTICATOR|03_HOME\06_AUTHENTICATOR
11_AUTH_IMPORT|03_HOME\06_AUTHENTICATOR\SERVICES\11_AUTH_IMPORT
14_PRIVACY|03_HOME\07_PRIVACY_CENTER
24_METADATA_CLEANER|03_HOME\07_PRIVACY_CENTER\SERVICES\24_METADATA_CLEANER
25_CLIPBOARD_GUARD|03_HOME\07_PRIVACY_CENTER\SERVICES\25_CLIPBOARD_GUARD
34_OFFLINE_SECURITY_ADVISOR|03_HOME\07_PRIVACY_CENTER\SERVICES\34_OFFLINE_SECURITY_ADVISOR
39_LOCAL_SECURITY_ACTIVITY|03_HOME\07_PRIVACY_CENTER\SERVICES\39_LOCAL_SECURITY_ACTIVITY
42_SESSION_PRIVACY_CONTROLS|03_HOME\07_PRIVACY_CENTER\SERVICES\42_SESSION_PRIVACY_CONTROLS
44_SECURE_CLIPBOARD|03_HOME\07_PRIVACY_CENTER\SERVICES\44_SECURE_CLIPBOARD
15_BACKUP|03_HOME\08_RECOVERY
16_SECURE_SHARE|03_HOME\09_TOOLS_NAV\01_SECURE_SHARE
22_LOCAL_TRANSFER|03_HOME\09_TOOLS_NAV\01_SECURE_SHARE\SERVICES\22_LOCAL_TRANSFER
35_MULTI_DEVICE_PAIRING|03_HOME\09_TOOLS_NAV\01_SECURE_SHARE\SERVICES\35_MULTI_DEVICE_PAIRING
40_TRANSFER_WIZARD|03_HOME\09_TOOLS_NAV\01_SECURE_SHARE\SERVICES\40_TRANSFER_WIZARD
41_EXPIRING_SECRET_CAPSULE|03_HOME\09_TOOLS_NAV\01_SECURE_SHARE\SERVICES\41_EXPIRING_SECRET_CAPSULE
'@
$map=[ordered]@{}
foreach($line in ($mapping -split '\r?\n')){
 $line=$line.Trim(); if(!$line){continue}
 $parts=$line.Split('|')
 if($parts.Count -ne 2 -or $map.Contains($parts[0])){throw "Bad mapping: $line"}
 $map[$parts[0]]=$parts[1]
}
if($map.Count -ne 44){throw "Expected 44 tasks, found $($map.Count)"}
$sourceDirs=@(Get-ChildItem -LiteralPath $anima -Directory)
if($sourceDirs.Count -ne 44){throw "Expected 44 source dirs, got $($sourceDirs.Count)"}
foreach($id in $map.Keys){
 $s=Join-Path $anima $id
 if(!(Test-Path -LiteralPath (Join-Path $s ($id+'.txt'))) -or !(Test-Path -LiteralPath (Join-Path $s ($id+'.png')))){throw "Missing exact pair: $id"}
}
$global=@'
# KNOUX CRYPT - MASTER DIRECT-REPOSITORY AGENT CONTRACT

## Role, freedom and source-of-truth boundaries
This agent works on the EXISTING GitHub repository (not Anima) and has engineering freedom to choose React implementation, libraries, components and refactors. Match the latest user-approved reference image with highest possible pixel-level fidelity. Do not replace approved art with a redesigned approximation. Every control should be a real UI component, not an invisible hotspot over a screenshot. Prefer improving the existing app without starting a duplicate frontend.

Only two approved images (01 Splash and 02 Secure Access) have been delivered to this repository agent SO FAR. Home and the other 41 design tasks are staged for later. A local Windows path to a screenshot does NOT prove that a remote agent has received it. The agent must request or receive that exact approved image before implementing any not-yet-supplied screen. Do not claim to have accessed the owner's D: files from cloud tools.

## Global color, brightness and CONTINUOUS cipher-code atmosphere
Use ONE obsidian-black/violet global theme and one shared AppShell for the whole KNOUX CRYPT experience. Centralize palette, glass surfaces, type scale, shadows, header dimensions, gutters, safe areas and bottom navigation. Do not allow one route to turn gray, washed-out lavender or white; no fullscreen flashes or unmatched gradients between screens.

The VIDEO reference shows sparse VERTICAL ANIMATED CIPHER GLYPHS / CRYPTOGRAPHIC CODE RAIN and faint diagonal purple energy strands in the background. Reconstruct those as ONE persistent shared background component with a stable layout/seed and consistent low opacity, speed, density and depth. The atmosphere MUST REMAIN MOUNTED and animate continuously across route transitions; do not remount, restart, reshuffle or flash it per screen. Render it BEHIND content and nav, pointer-events:none, never legibility-breaking. When an approved reference has a quieter background, use the subtle global layer without drowning that particular artwork. Do not infer unseen pages from the short video.

## Immutable stag-K asset and cinematic lighting
Use the authentic transparent stag-K supplied by the owner, without embedded square/rectangle, opaque background, disc, sphere, altered antlers, changed integrated K, artificial cropping or distortion. Scale it proportionately and optically align it to the shared grid; its artwork must never collide with the wordmark, subtitle, labels or header.

On Splash, illuminate eyes INDEPENDENTLY in controlled violet-white, with a soft mysterious ignition, glow falloff, stag-antler light sweep, sparse fire-like purple embers and subtle atmospheric haze. Animation overlays should visually track the source eyes, not float away from them. No blinding flashes or generic animated-logo replacement. On Home, if the user's latest approved reference uses free-standing stag hero, do not restore the old glowing globe. Each service has its own function-led motion while retaining the shared backdrop. Reduced-motion and performance limits are mandatory; sound disabled by default.

## One responsive viewport, no collision, persistent bottom navigation
Use common CSS tokens for content widths, horizontal gutters, safe-area top/bottom and consistent scale on 360x800, 390x844, 412x915 and centered desktop preview. Avoid whole-page transform scaling and independent fixed top offsets. Splash/Auth: center the COMPLETE group optically between safe areas; don't push all content toward the top or leave a huge unintended bottom void. Home/services: preserve image composition and scroll naturally in a separate main content region.

Never overlap deer art with KNOUX CRYPT text, crowd buttons, clip list content, squeeze Home card labels or lose lower rows below navigation. Use one shared anchored Home/Tools/Account bottom bar ONLY on appropriate pages. Keep it fixed in safe-area footer while scrolling content ABOVE with sufficient bottom padding. Splash and login can omit the bar. Page-specific glow and glass should blend into the same global background.

## Routing and mission hierarchy
One React app, one router: SPLASH_ENTRY -> SECURE_ACCESS_LOGIN -> HOME, followed by eight approved Home cards: Encrypt Files, Vault, Secure Notes, Passwords, Key Forge, Authenticator, Privacy Center, Recovery. Tools and Account are bottom-nav destinations, not additional Home cards. Secure Share belongs to Tools, with a link from Key Forge. Child services use shared route registry and back-to-parent navigation. Preserve existing functional legacy pages where a newer reference is not yet approved; avoid dead links or pretending placeholders are final UI.

## Functional honesty and source protection
Visual demos must not claim actual encryption, biometrics, OTP verification, cloud transfers, secure backups, or other operations unless a real underlying service exists and is tested. Use fake sample data; never collect actual credentials or sensitive private material in a demo. Do not remove existing functional capabilities while replacing a visual layer.

## Delivery workflow, visual evidence and safe integration
For EACH assigned task: inspect existing repo and latest image; implement in active app; run build/lint/typecheck and route tests where available; inspect the rendered result; capture a REAL screenshot at the same aspect ratio as the approved reference; compare side-by-side and refine visible differences; report exact tests, visual differences, screenshot and commit/PR status. A passing build is not pixel proof. For shared-shell fixes, screenshot affected screens too.

Minimize unnecessary branches and duplicate worktrees. Integrate verified work toward main by the project's safe review/merge workflow when authorized. Before cleanup, preserve every unique change and inspect worktrees; never force push, throw away unmerged work or delete the local main project. No background promises. If a tool or image is unavailable, report the limitation. The agent may choose technical approach freely, but the approved appearance, shared atmosphere, route coherence and real screenshot after every task are required.
'@
$notes=@{
 '01_SPLASH_ENTRY'='Entry screen only. Immersive stag with precisely tracked eye illumination and antler sweeps. Touch to Enter pulses then opens Secure Access. Balanced center and negative space. No Home bypass or bottom navbar.'
 '02_SECURE_ACCESS_LOGIN'='Recreate the supplied Auth page and remove demo placeholder. Center overall brand/form/method-card composition; maintain a clear gap between logo and text. Fingerprint, Passkey and GitHub controls are demo-only until real integration. Back to Splash; demo Continue to existing Home.'
 '03_HOME'='NOT READY FOR VISUAL IMPLEMENTATION until the user supplies its image. When supplied, implement exact eight-card 2-column grid, header, hero, code-rain atmosphere, anchored shared bottom nav. Preserve legacy Home until approved replacement is integrated.'
 '04_FILE_CIPHER'='This is the Encrypt Files MAIN Home card destination. Do not misfile as a standalone top-level ninth card.'
 '05_SHADOW_VAULT'='This is the Vault MAIN Home card destination. Collections, Document Viewer and Vault Key Rotation are its subservices.'
 '06_SECURE_NOTES'='This is the Secure Notes MAIN Home card destination. Its Editor is a child screen preserving parent navigation.'
 '08_PASSWORDS'='This is the Passwords MAIN Home card destination. Details, Android Autofill and Password Audit are child services.'
 '10_AUTHENTICATOR'='This is the Authenticator MAIN Home card destination. Auth Import is a child workflow.'
 '12_KEY_FORGE'='This is the Key Forge MAIN Home card destination. Device keys, signatures, public QR, HMAC, Argon2id and random tools are subservices. Link to Secure Share in Tools; do not add a ninth Home card.'
 '14_PRIVACY'='This is the Privacy Center MAIN Home card destination. Session controls, clipboard tools, offline advisor and activity are child services.'
 '15_BACKUP'='This is the Recovery MAIN Home card destination. Also link from the Privacy Center backup hero. No fake successful recovery.'
 '16_SECURE_SHARE'='This parent service lives under the Tools tab, accessible from Key Forge. Its nested services include Local Transfer, Device Pairing, Transfer Wizard and Expiring Secret Capsule.'
}
$intro=@'
# KNOUX CRYPT - REPOSITORY AGENT MISSIONS

This folder is located BESIDE ANIMA_MISSIONS_01-44 and is for the direct GitHub/Vercel repository agent. Each service folder contains TASK.md; the eight Home categories have child SERVICES subfolders. All 44 missions are uniquely mapped and carry the full global engineering rules so that a single TASK.md can be sent to an agent independently.

IMPORTANT STATUS: As of this pack creation, only Splash and Secure Access reference images have been delivered to the repository agent. Home and later tasks are preorganized, NOT authorized to be implemented without their user-provided approved image.

HOW TO USE: Start with 00_GLOBAL_AGENT_RULES.md, then the specific TASK.md. Attach the corresponding PNG from the original Anima pack when assigning a new screen to a cloud agent; D: local paths alone are not remotely accessible. Require a real rendered screenshot and comparison after every task. No need to manually type global design instructions for each task.

DIRECTORY MODEL:
01_SPLASH_ENTRY/TASK.md
02_SECURE_ACCESS_LOGIN/TASK.md
03_HOME/TASK.md
03_HOME/01_ENCRYPT_FILES/TASK.md + SERVICES/
03_HOME/02_VAULT/TASK.md + SERVICES/
03_HOME/03_SECURE_NOTES/TASK.md + SERVICES/
03_HOME/04_PASSWORDS/TASK.md + SERVICES/
03_HOME/05_KEY_FORGE/TASK.md + SERVICES/
03_HOME/06_AUTHENTICATOR/TASK.md + SERVICES/
03_HOME/07_PRIVACY_CENTER/TASK.md + SERVICES/
03_HOME/08_RECOVERY/TASK.md
03_HOME/09_TOOLS_NAV/01_SECURE_SHARE/TASK.md + SERVICES/

Home UI MUST have exactly eight main cards. Tools is a bottom navigation category, NOT a ninth card. Related tools can cross-link while retaining their unique primary folder.

The source Anima PNG/TXT tasks are left unchanged; this new pack uses text references rather than duplicating images on the already constrained D: disk. This builder does not commit, push, merge, or clean historical worktrees.
'@
$toolNav=@'
# Tools navigation - NOT a Home service card

Reuse the shared Tools tab to index ancillary cryptographic services without adding ninth Home card. Its Secure Share service has its own parent task and nested SERVICES. Maintain cross-links:
Key Forge > Encrypted Share > Secure Share.
Key Details > Vault Key Rotation, Public Key QR and fingerprint comparison.
Encrypt Files > Hash Integrity, Text Cipher, Archive, Ciphertext Package Inspector, File Integrity.
Password Vault > Password Detail, Android Autofill, Password Strength Audit.
Privacy > Metadata Cleaner, Clipboard Guard, Offline Security Advisor, Local Security Activity, Session Privacy Controls, Secure Clipboard.
Authenticator > Import Accounts.
Secure Share > Local Transfer, Multi Device Pairing, Transfer Wizard, Expiring Secret Capsule.
All routes inherit globally persistent low-opacity cipher code rain, shared geometry, theme and safe navigation. Screenshot the completed Tools index and every child service.
'@
function ExtractLine([string]$body,[string]$label,[string]$mission){
 $m=[regex]::Match($body,'(?m)^'+[regex]::Escape($label)+':\s*(.*)$')
 if(!$m.Success){throw "Missing field $label for $mission"}
 return $m.Groups[1].Value.Trim()
}
New-Item -ItemType Directory -Path $stage | Out-Null
try{
 $index=@('mission,relative_folder,reference_png,status')
 foreach($id in $map.Keys){
  $rel=$map[$id]
  $src=Join-Path (Join-Path $anima $id) ($id+'.txt')
  $png=Join-Path (Join-Path $anima $id) ($id+'.png')
  $body=[IO.File]::ReadAllText($src)
  $anchors=ExtractLine $body 'REFERENCE ANCHORS' $id
  $interaction=ExtractLine $body 'SCREEN INTERACTIONS' $id
  $motion=ExtractLine $body 'DISTINCTIVE MOTION' $id
  $route=ExtractLine $body 'ROUTING' $id
  $extra=$notes[$id]
  if([string]::IsNullOrWhiteSpace($extra)){$extra='Implement this service faithfully using its matching reference and its parent service route; preserve all cross-links.'}
  $approval= if($id -in @('01_SPLASH_ENTRY','02_SECURE_ACCESS_LOGIN')){'ALREADY SUPPLIED to the repository agent. Improve and verify against the approved image.'}else{'STAGED: Image has NOT been provided to the repository agent. DO NOT implement or invent screen until the user supplies its approved image in that agent session.'}
  $taskText=@"
# DIRECT REPO AGENT MISSION: $id

**Project:** daynightae-cmyk/KnouxCrypt (same existing repository, not Anima).
**Current permission:** $approval
**Role in app hierarchy:** $rel
**Image on owner's machine:** $png
**Image to attach to remote agent:** $id.png (DO NOT assume cloud access to D drive).

## Mission-specific implementation
$extra

**Exact reference composition:** $anchors

**Screen controls and visual UI states:** $interaction

**Distinctive motion:** $motion

**Navigation and dependency:** $route

**Deliverable:** Implement and verify the actual running app screen, then provide a REAL screenshot at the reference dimensions and state the remaining differences. Report accurate commit, PR, branch and deployment status. Never claim a static image is a running UI screenshot.

---
$global
"@
  if($taskText.Length -lt 5000){throw "Short task unexpected: $id"}
  $folder=Join-Path $stage $rel
  New-Item -ItemType Directory -Path $folder -Force | Out-Null
  [IO.File]::WriteAllText((Join-Path $folder 'TASK.md'),$taskText,$utf8)
  $index+=($id+','+$rel.Replace('\','/')+','+$png.Replace('\','/')+','+($approval.Split(':')[0]))
 }
 [IO.File]::WriteAllText((Join-Path $stage '00_START_HERE.md'),$intro,$utf8)
 [IO.File]::WriteAllText((Join-Path $stage '00_GLOBAL_AGENT_RULES.md'),$global,$utf8)
 [IO.File]::WriteAllText((Join-Path $stage '00_MISSION_INDEX.csv'),($index -join [Environment]::NewLine),$utf8)
 $toolDir=Join-Path $stage '03_HOME\09_TOOLS_NAV'
 New-Item -ItemType Directory -Path $toolDir -Force | Out-Null
 [IO.File]::WriteAllText((Join-Path $toolDir 'NAVIGATION.md'),$toolNav,$utf8)
 $tasks=@(Get-ChildItem -LiteralPath $stage -File -Filter 'TASK.md' -Recurse)
 $files=@(Get-ChildItem -LiteralPath $stage -File -Recurse)
 if($tasks.Count -ne 44 -or $files.Count -ne 48){throw "Validation failed: tasks $($tasks.Count), files $($files.Count)."}
 $contains=@($tasks|Where-Object{([IO.File]::ReadAllText($_.FullName)).Contains('CONTINUOUS cipher-code atmosphere')})
 if($contains.Count -ne 44){throw "Some tasks lack global background: $($contains.Count)"}
 Move-Item -LiteralPath $stage -Destination $dest -ErrorAction Stop
 'SUCCESS: CREATED '+$dest
 'MISSIONS='+$tasks.Count+' FILES='+$files.Count
 'SOURCE_IMAGE_DUPLICATION=0'
 'SOURCE_ANIMA_TASKS_UNCHANGED=TRUE'
 'GIT_COMMIT_OR_PUSH=NONE'
}catch{
 Write-Warning ('FAILED: '+$_.Exception.Message)
 Write-Warning ('Stage preserved: '+$stage)
 throw
}
