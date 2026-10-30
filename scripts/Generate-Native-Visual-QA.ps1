# Create independent per-mission VISUAL QA handoff sheets from the single reference map.
$ErrorActionPreference='Stop'
$repo='D:\KnouxCrypt-Android-Ready'
$refs=Join-Path $repo 'visuals\ANIMA_REFERENCE_MAP.csv'
$missions=Join-Path $repo 'missions\fullstack-android'
if(!(Test-Path -LiteralPath $refs)){throw 'Missing approved reference manifest'}
$data=@(Import-Csv -LiteralPath $refs)
if($data.Count -ne 44){throw 'Expected 44 mapped references'}
$utf8=New-Object System.Text.UTF8Encoding($false)
$count=0
foreach($row in $data) {
 $name=$row.mission
 $taskDir=Join-Path $missions $name
 $task=Join-Path $taskDir 'TASK.md'
 $ref=Join-Path $repo ($row.approved_reference.Replace('/','\'))
 $prompt=Join-Path $repo ($row.prompt.Replace('/','\'))
 if(!(Test-Path -LiteralPath $task) -or !(Test-Path -LiteralPath $ref) -or !(Test-Path -LiteralPath $prompt)){throw "Missing task or source for $name"}
 $file=Join-Path $taskDir 'SCREEN_QA.md'
 if(Test-Path -LiteralPath $file){throw "Refuse to replace $file"}
 $lines=@(
  "# $name / Native visual QA",
  "",
  "State: REFERENCE_MATCHED; VISUAL_RUNTIME_NOT_TESTED; ANDROID_NOT_IMPLEMENTED.",
  "Canonical reference: $($row.approved_reference)",
  "Anima UI interaction prompt: $($row.prompt)",
  "Reference reconciliation: $($row.reference_status)",
  "Local reference SHA256: $($row.original_sha256)",
  "",
  "Required before implementing: read TASK.md, 00_VISUAL_QA_HANDOFF.md, actual merged React source for this mission and the two reference files.",
  "",
  "## Acceptance",
  "- Preserve the approved stag-K asset, typography, panel order, padding, violet-on-obsidian identity, icons and bottom navigation. The screenshot is only a design reference; build native Compose components.",
  "- Confirm top/bottom safe-area balance and no overlapping logo, headings, cards or footer. Center the whole Auth group only when its reference requires it, not every page.",
  "- Provide all reference-visible controls with local and native states: pressed, selected, loading, disabled, sheet, navigation, error and clear Back behavior.",
  "- Use meaningful screen-specific purple cinematic motion and restrained embers behind controls. Limit particle count and disable animations for reduced-motion; no sound on first paint.",
  "- Match Arabic RTL and English LTR with correct text wrap, 360x800, 390x844 and 412x915 mobile viewports and large text.",
  "- Check Back from the screen, modal dismissal, child-to-parent route and deep-link auth gating using native Navigation Compose. Demo Guest never unlocks real vault data.",
  "- Never call a simulated crypto/OTP/biometric/backup result VERIFIED. Real service is separately gated by TASK.md acceptance tests and platform capability.",
  "",
  "## Evidence needed",
  "- Source baseline SHA, implemented Android SHA, device model/API, screenshot paths for the reference and actual runtime, measured differences and approved exceptions.",
  "- Automated Compose preview/screenshot and instrumented navigation/gestures/accessibility tests, plus functional domain positive/negative results from TASK.md.",
  "- Record acceptance in EVIDENCE.md when actually performed. Until then keep state NOT_TESTED.",
  ""
 )
 [IO.File]::WriteAllText($file,($lines -join [Environment]::NewLine),$utf8)
 $count++
}
"GENERATED_SCREEN_QA=$count"
"NO_TASK_FILES_OVERWRITTEN"
