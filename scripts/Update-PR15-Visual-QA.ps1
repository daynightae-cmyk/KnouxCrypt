#requires -Version 5.1
[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$missionRoot = Join-Path $repo 'missions\fullstack-android'
$baseline = 'de01b23f9a010cb3743bc117bb3b78c2bb5ee86c'
$source = 'f836a5c8e7c2e03a94f06fa8dc22a3cb5c702f55'
$ref = 'missions/fullstack-android/POST_PR15_VISUAL_BASELINE.md'
$utf8 = New-Object System.Text.UTF8Encoding($false)
$qaFiles = @(Get-ChildItem -LiteralPath $missionRoot -Filter SCREEN_QA.md -File -Recurse)
$taskFiles = @(Get-ChildItem -LiteralPath $missionRoot -Filter TASK.md -File -Recurse)
if ($qaFiles.Count -ne 44 -or $taskFiles.Count -ne 46) { throw "Mission inventory mismatch: QA=$($qaFiles.Count), TASK=$($taskFiles.Count)" }
if (-not (Test-Path -LiteralPath (Join-Path $repo $ref))) { throw 'Canonical PR15 visual baseline document missing' }
$head = (& git -C $repo rev-parse origin/main).Trim()
if ($LASTEXITCODE -ne 0 -or $head -ne $baseline) { throw "Expected origin/main $baseline but got $head" }
$changed = New-Object 'System.Collections.Generic.List[string]'
function Add-Section([string]$path,[string]$marker,[string]$section) {
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Missing target $path" }
  $old = [IO.File]::ReadAllText($path)
  if ($old.Contains($marker)) { return }
  $new = $old.TrimEnd([char]13,[char]10) + "`r`n`r`n" + $marker + "`r`n" + $section.Trim() + "`r`n"
  [IO.File]::WriteAllText($path,$new,$utf8)
  $script:changed.Add($path.Substring($repo.Length).TrimStart('\').Replace('\','/'))
}
$tag = '<!-- PR15_VISUAL_BASELINE_V1 -->'
foreach($f in $qaFiles) {
  $name=$f.Directory.Name
  $specific = switch($name) {
    '01_SPLASH_ENTRY' { 'Splash: preserve original freestanding stag-K and independent bounded eye activation; compare illuminated eye contour and cinematic timing to the approved image/video.' }
    '02_SECURE_ACCESS_LOGIN' { 'Secure Access: preserve approved visual centering, auth/guest separation, RTL/LTR and keyboard-safe layout; no demo unlock may expose secrets.' }
    '03_HOME' { 'Home: compact hero and 8 canonical cards above footer at approved reference aspect, violet ribbons/particles, exact stag-K identity; narrow devices may scroll naturally.' }
    default { 'Apply screen-specific canonical reference and actual merged React UI, with independent Compose screenshot and interaction checks. No screenshot-backed interactive UI.' }
  }
  $body=@"
## PR #15 visual baseline overlay (2026-10-31)
- Visual code baseline: `main` merge '$baseline' from PR #15 head '$source'.
- Shared current acceptance, provenance and unresolved visual exceptions: '$ref'. This addendum supersedes any older source SHA or browser NOT_TESTED statement above; the original task's native/device verification remains untested until actually executed.
- $specific
- Preserve cross-screen Tools inventory of 34 unique destinations, AR/EN search, categorized default and anchored navigation; compare the screen against its canonical PNG. Record any approved mismatch in this task's eventual EVIDENCE.md.
- React browser checks do NOT make native Android/crypto tests pass; status remains PLANNED unless independently implemented and evidenced.
"@
  Add-Section $f.FullName $tag $body
}
foreach($f in $taskFiles) {
  $body=@"
## Visual baseline checkpoint - PR #15 (2026-10-31)
- Use merged `main` visual source '$baseline' and '$ref', together with this mission's `SCREEN_QA.md` (when present), before implementing native Compose UI.
- Maintain the original business/security scope and task dependencies. Preserve all 46 tasks; do not equate React/Vercel screenshots with native functionality. PR #14 partial TASK 00 stays unmerged and IMPLEMENTED_UNVERIFIED until separately reconciled/tested.
- All owner-accepted visual deviations are **implementation baseline only**, not pixel-perfect approval. Compare actual Android outputs with canonical per-screen references and record residual differences in EVIDENCE.md.
"@
  Add-Section $f.FullName $tag $body
}
$documents=@(
 'missions/00_START_HERE.md',
 'missions/fullstack-android/00_READY_TO_START_LOCAL_ANDROID.md',
 'missions/fullstack-android/00_VISUAL_QA_HANDOFF.md',
 'missions/fullstack-android/00_NAVIGATION_BACK_QA_HANDOFF.md',
 'missions/fullstack-android/LOCAL_AGENT_AFTER_VISUALS.md',
 'missions/fullstack-android/README.md',
 'docs/LOCAL_AGENT_START_HERE.md',
 'docs/LOCAL_SYNC_QA_RESULTS.md',
 'visuals/VISUAL_SYSTEM.md'
)
foreach($relative in $documents) {
  $path=Join-Path $repo $relative
  if (-not (Test-Path -LiteralPath $path)) { throw "Expected handoff document missing $relative" }
  $body=@"
## POST-MERGE HANDOFF STATUS UPDATE - 2026-10-31
- The earlier dates, `LOCAL ONLY`, `NO NATIVE SOURCE`, `ANDROID UNIMPLEMENTED` and `VISUAL NOT BROWSER-TESTED` descriptions are preserved as historical checkpoints, NOT the current situation.
- Latest visually merged `main`: '$baseline'; original PR #15 source head: '$source'. User accepted this source as the native coding starting point, **not** perfect design fidelity, deployed app or production release.
- Android integration branch was previously pushed at `3d986c8`; current branch/HEAD must always be rechecked. PR #14 native TASK 00 source exists at `310665d` **only in a separate unmerged branch**, implemented but not natively tested.
- Updated 44 SCREEN_QA.md files, 46 TASK.md instructions and shared cross-screen design/exception matrix: '$ref'.
- The 34 Tools destinations include restored Vault, Secure Notes, Passwords, Encrypt Files, Authenticator, Privacy and Recovery; preserve all eight Home cards. Keep AR/EN searching, grouped Tools UI, continuous cyber rain, original stag and eye light, safe bottom navigation, proper scrolling and motion accessibility.
- Chromium evidence in `qa-evidence/pr15-fidelity/` belongs to PR15; it documents real browser runs, not Compose/runtime security. Vercel account remains blocked. All native APK/Keystore/device/security claims require new independent evidence.
- Do not touch protected original `D:\KnouxCrypt`, lose unique planning branches/worktrees, force-push, rewrite history, auto-merge PR #14 or delete references.
"@
  Add-Section $path $tag $body
}
Write-Output ("UPDATED_QA_FILES="+$qaFiles.Count)
Write-Output ("UPDATED_TASK_FILES="+$taskFiles.Count)
Write-Output ("UPDATED_HANDOFF_DOCS="+$documents.Count)
Write-Output ("CHANGED_TOTAL="+$changed.Count)
$changed | Sort-Object | Select-Object -First 12 | ForEach-Object {Write-Output ("UPDATED="+$_)}
