# KNOUX CRYPT - Inject universal visual engineering rules into the 44 Anima prompts.
# Source PNGs remain byte-for-byte untouched. Backups outside task folders.
param([switch]$PreviewOnly)
$ErrorActionPreference='Stop'
$root='D:\KnouxCrypt\visuals\ANIMA_MISSIONS_01-44'
$backupRoot='D:\KnouxCrypt\visuals\anima_v5\_PROMPT_BACKUPS'
$tag='[UNIVERSAL_ANIMA_ENGINEERING_V2_START]'
$endTag='[UNIVERSAL_ANIMA_ENGINEERING_V2_END]'
$nl=[Environment]::NewLine
$block=@'
[UNIVERSAL_ANIMA_ENGINEERING_V2_START]
MANDATORY APP-INTEGRATION + PIXEL-LOCK + MOTION RULES, FOR THIS SCREEN:
1) SAME APP: Reuse existing Anima React project, AppShell, stag-K, routes, Back and all approved screens. No new app, clone or remote assets. Mandatory flow: SPLASH_ENTRY -> SECURE_ACCESS_LOGIN -> HOME; later screens join this registry.
2) REFERENCE FIRST: The single attached image defines the actual live viewport, visual hierarchy, gradients, lettering, icons, glass surfaces, geometry, and spacing. Do NOT use the screenshot as one flat clickable bitmap; text and controls must be real accessible React components. Do not add a phone frame, stray sections or visible badges not present in the image. Illustrative artwork may use local layers. Preserve all prior finished screens.
3) SHARED RESPONSIVE GEOMETRY: Match Splash's screen coordinate system, viewport proportions and horizontal gutters across all screens. Use min-height:100dvh, CSS Grid/Flex, a shared 8px spacing rhythm and safe-area insets; never force an arbitrary fixed-height artboard. For centered Splash/Auth-like compositions, optically center the WHOLE content group between top and bottom safe areas, balancing outer whitespace. For content-dense lists, align as shown in the reference and scroll naturally. On short screens or open keyboards allow scrolling instead of shrinking or clipping content.
4) ZERO COLLISIONS: Keep stag-K aspect ratio and visible artwork unchanged; give logo, KNOUX CRYPT wordmark, subtitle, heading, fields, cards and navigation separate collision-free layout regions. No text-over-logo, transform-based fake alignment, negative-margin crowding, cut-off footer, or overlapping cards. Use real layout gap (about 24-40px between logo art and brand wordmark when appropriate), adjusted to visible image bounds; glow may extend over empty background only.
5) CINEMATIC PURPLE MOTION: Keep the static reference accurate. Add sparse purple fire-like embers, tiny drifting sparks, energy arcs and soft depth BEHIND content. Follow this screen's DISTINCTIVE MOTION: Splash stag eye/antler ignition; Auth focus/biometric rings; Home orbit; File Cipher sealed-file rail; Vault shutter; Notes page-fold; Passwords reveal; 2FA timer; Key Forge keys; Privacy shield; Recovery rings. Other screens animate their own controls, not generic pulses. Few particles; pointer-events:none; transform/opacity effects; readable text; reduced-motion; sound OFF.
6) REAL LOCAL INTERACTION: Every visible CTA, input, tab, filter, list item, icon button, toggle, close action and bottom-nav control responds through local React state; provide focus, pressed, selected, expanded or disabled feedback as relevant. A deferred secure operation opens a clear VISUAL DEMO sheet, never a fake completed security result. Do not implement real crypto, auth, OAuth, biometrics, OTP, filesystem, cloud, key storage or backend.
7) QA: Compare rendered frame to reference. Test vertical balance, logo/text clearance, mobile width, keyboard, scroll, controls, Back and reduced motion. Fix defects; report only actually tested changes.
[UNIVERSAL_ANIMA_ENGINEERING_V2_END]
'@
$removable=@('SCOPE SEPARATION\.','NO EXTERNAL INPUTS\.','INTEGRATION CONTRACT\.','MICROINTERACTION QUALITY\.','VISUAL QA:','FINAL ACCEPTANCE\.')
if(!(Test-Path -LiteralPath $root -PathType Container)){throw "Mission root missing: $root"}
$dirs=@(Get-ChildItem -LiteralPath $root -Directory | Sort-Object Name)
if($dirs.Count -ne 44){throw "Expected 44 mission dirs, got $($dirs.Count)"}
$plan=New-Object System.Collections.Generic.List[object]
$utf8=New-Object System.Text.UTF8Encoding($false)
foreach($dir in $dirs){
  $png=Join-Path $dir.FullName ($dir.Name+'.png')
  $txt=Join-Path $dir.FullName ($dir.Name+'.txt')
  $items=@(Get-ChildItem -LiteralPath $dir.FullName -File)
  if($items.Count -ne 2 -or !(Test-Path -LiteralPath $png) -or !(Test-Path -LiteralPath $txt)) {
    throw "Expected exactly $($dir.Name).png and .txt in $($dir.FullName)"
  }
  $original=[IO.File]::ReadAllText($txt,[Text.Encoding]::UTF8)
  if($original.Contains($tag)){
    if(!$original.Contains($endTag)){throw "Partial marker in $($dir.Name)"}
    $plan.Add([pscustomobject]@{Dir=$dir.Name;Path=$txt;Original=$original;New=$original;Status='ALREADY_DONE';ImageHash=(Get-FileHash $png -Algorithm SHA256).Hash}) | Out-Null
    continue
  }
  $matchPattern='(?m)^REFERENCE IS LAW\.[^\r\n]*(?:\r?\n)?'
  if([regex]::Matches($original,$matchPattern).Count -ne 1){throw "Missing original visual reference heading in $($dir.Name)"}
  $new=[regex]::Replace($original,$matchPattern, [System.Text.RegularExpressions.MatchEvaluator]{param($m) $block.Trim()+$nl+$nl},1)
  # Remove two duplicate preambles; their instructions are covered by the inserted universal block.
  $new=[regex]::Replace($new,'(?m)^USE the SAME existing Anima project[^\r\n]*\r?\n','',1)
  $new=[regex]::Replace($new,'(?m)^Mandatory flow: SPLASH_ENTRY[^\r\n]*\r?\n','',1)
  foreach($prefix in $removable){
    $pattern='(?m)^'+$prefix+'[^\r\n]*(?:\r?\n)?'
    if([regex]::Matches($new,$pattern).Count -ne 1){throw "Missing single common contract ($prefix) in $($dir.Name)"}
    $new=[regex]::Replace($new,$pattern,'',1)
  }
  $new=[regex]::Replace($new,'(?:\r?\n){3,}',"$nl$nl")
  if($new.Length -ge 5000){throw "Prompt too long after insertion $($dir.Name): $($new.Length). No files modified."}
  if($new.Length -lt 2000){throw "Unexpectedly short prompt $($dir.Name): $($new.Length)"}
  if($new -notmatch [regex]::Escape($tag) -or $new -notmatch [regex]::Escape($endTag)){throw "Universal block missing $($dir.Name)"}
  if($new -notmatch '(?m)^REFERENCE ANCHORS:' -or $new -notmatch '(?m)^SCREEN INTERACTIONS:' -or $new -notmatch '(?m)^DISTINCTIVE MOTION:' -or $new -notmatch '(?m)^ROUTING:' -or $new -notmatch '(?m)^CURRENT SCREEN '){throw "Per-screen requirements lost: $($dir.Name)"}
  if($new -match 'https?://' -or $new -match 'SPLASH Enter opens HOME'){throw "Unexpected link or old route $($dir.Name)"}
  $plan.Add([pscustomobject]@{Dir=$dir.Name;Path=$txt;Original=$original;New=$new;Status='UPDATE';ImageHash=(Get-FileHash $png -Algorithm SHA256).Hash}) | Out-Null
}
if($plan.Count -ne 44){throw 'Incomplete plan'}
$update=@($plan|Where-Object {$_.Status -eq 'UPDATE'})
$max=($plan|ForEach-Object {$_.New.Length}|Measure-Object -Maximum).Maximum
$min=($plan|ForEach-Object {$_.New.Length}|Measure-Object -Minimum).Minimum
"PRECHECK_OK: missions=$($plan.Count) update=$($update.Count) already_done=$($plan.Count-$update.Count) prompt_chars=$min..$max"
if($PreviewOnly) { 'PREVIEW_ONLY: no files modified.'; return }
if($update.Count -eq 0){'IDEMPOTENT_NO_CHANGES: all 44 prompts already contain the block.';return}
$stamp=Get-Date -Format 'yyyyMMdd_HHmmss'
$backup=Join-Path $backupRoot ("BeforeUniversal_"+$stamp)
New-Item -ItemType Directory -Path $backup -Force | Out-Null
foreach($item in $plan){
  $dirBackup=Join-Path $backup $item.Dir
  New-Item -ItemType Directory -Path $dirBackup -Force | Out-Null
  Copy-Item -LiteralPath $item.Path -Destination (Join-Path $dirBackup ($item.Dir+'.txt')) -ErrorAction Stop
}
$modified=New-Object System.Collections.Generic.List[object]
try{
  foreach($item in $update){
    [IO.File]::WriteAllText($item.Path,$item.New,$utf8)
    $modified.Add($item) | Out-Null
  }
  $count=0
  foreach($item in $plan){
    $actual=[IO.File]::ReadAllText($item.Path,[Text.Encoding]::UTF8)
    if($actual -ne $item.New -or !$actual.Contains($tag) -or $actual.Length -ge 5000) {throw "Post-write text verification failed: $($item.Dir)"}
    $png=Join-Path (Split-Path -Parent $item.Path) ($item.Dir+'.png')
    if((Get-FileHash $png -Algorithm SHA256).Hash -ne $item.ImageHash){throw "PNG image altered: $($item.Dir)"}
    $count++
  }
  $summary= @("KNOUX universal engineering block applied", "Missions=$count","Changed=$($update.Count)","Backup=$backup","CharsMin=$min","CharsMax=$max","PNG files unchanged","Source routes: Splash > Auth > Home","No commit / push")
  [IO.File]::WriteAllLines((Join-Path $backup 'RESULT.txt'),$summary,$utf8)
  "SUCCESS: verified $count files; changed $($update.Count); min/max=$min/$max; PNGs unchanged"
  "BACKUP=$backup"
}catch{
  $failure=$_.Exception.Message
  foreach($item in $modified){
    try{ [IO.File]::WriteAllText($item.Path,$item.Original,$utf8) }catch{Write-Warning "Manual restore needed for $($item.Dir)"}
  }
  throw "Failed and attempted rollback; backup=$backup ; error=$failure"
}
