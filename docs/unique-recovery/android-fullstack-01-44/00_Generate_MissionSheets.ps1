# Generate 44 SAFE, non-overwriting Android full-stack mission sheets.
$ErrorActionPreference='Stop'
$root='D:\KnouxCrypt\missions\android-fullstack-01-44'
$matrix=Join-Path $root '00_FEATURE_MATRIX.psv'
if (!(Test-Path -LiteralPath (Join-Path 'D:\KnouxCrypt' '.git'))) {throw 'Wrong repo root'}
if (!(Test-Path -LiteralPath $matrix)) {throw 'Missing feature matrix'}
$rows=@(Get-Content -LiteralPath $matrix -Encoding UTF8 | Where-Object {$_.Trim()})
if($rows.Count -ne 44){throw "Expected 44 matrix rows, got $($rows.Count)"}
$utf8=New-Object System.Text.UTF8Encoding($false)
$seen=@{}
$expected=@()
$min=999999;$max=0
for($j=0;$j -lt $rows.Count;$j++){
  $cols=$rows[$j].Split('|')
  if($cols.Count -ne 11){throw "Row $($j+1): expected 11 fields, got $($cols.Count)"}
  $n=$cols[0];$slug=$cols[1];$priority=$cols[2]
  if($n -ne ('{0:D2}' -f ($j+1))) {throw "Row sequence mismatch $n"}
  if($slug -notmatch '^[A-Z0-9_]+$' -or $seen.ContainsKey($slug)){throw "Bad/duplicate slug $slug"}
  $seen[$slug]=$true
  $dir=Join-Path $root ($n+'_'+$slug)
  $file=Join-Path $dir 'FULLSTACK_MISSION.md'
  if(Test-Path -LiteralPath $file){throw "Do not overwrite existing mission: $file"}
  $expected+=@{id=$n;slug=$slug;file=$file;dir=$dir;cols=$cols}
}
foreach($r in $expected){
  $c=$r.cols;$n=$c[0];$slug=$c[1];$priority=$c[2]
  $deps=$c[3];$oldMissions=$c[4];$ui=$c[5];$domain=$c[6];$data=$c[7];$platform=$c[8];$risks=$c[9];$tests=$c[10]
  $layers=@(
    "# $n - $slug | FULL-STACK NATIVE ANDROID MISSION",
    "",
    "STATUS: PLANNED. This document is an engineering contract, NOT a claim of implementation.",
    "PRIORITY: $priority | Linked existing foundational mission numbers: $oldMissions",
    "VISUAL ASSET: visuals/ANIMA_MISSIONS_01-44/$n" + "_$slug/$n" + "_$slug.png",
    "VISUAL PROMPT: visuals/ANIMA_MISSIONS_01-44/$n" + "_$slug/$n" + "_$slug.txt",
    "CONTRACTS: ../00_ANDROID_ENGINEERING_CONTRACT.md and ../00_SAFE_SYNC_AND_GATES.md; repo-level Android security contract and 80-service catalog.",
    "",
    "## 1. Real prerequisite and execution boundary",
    "- Required before claiming live service: $deps.",
    "- Inspect the actual working repo at runtime, preserve the Vercel agent's in-flight React/visual branch and unique local work, and check relevant prior implementations to avoid duplication.",
    "- Implement this mission in new/current Kotlin Android modules, NOT as a website wrapper or only an Anima-style screen. Keep source design/art untouched.",
    "- Confirm needed hardware/provider/network capabilities; if absent, render an honest DISABLED state and record blocker, never a fake working feature.",
    "",
    "## 2. Screen-level user journey and UI completeness",
    "- Implement screen-specific interaction contract: $ui.",
    "- Compose UI must match its independently attached reference PNG, not the mock-device frame: exact stag-K, violet gradient material, titles, card geometry, optical spacing, bottom navigation, plus functional editable controls.",
    "- Define visual states: idle, checking capability, needsUnlock, needsPermission, ready, running(progress), verified(receipt), error(cause/retry), canceled. Map terminal success to real operation receipts, not animation.",
    "- Expose at minimum Back, cancel, progress, retry, unavailable explanation, accessibility labels, TalkBack announcements, RTL and English LTR. Maintain stable state on rotation, system bars, keyboard and narrow screens.",
    "- Animate by domain: use meaningful purple energy arcs, subtle particles and glow behind content, while avoiding text obstruction and noisy duplication. Ensure reduced-motion and muted-by-default sound.",
    "- No new root AppShell. Register screen route once in shared Navigation Compose registry; preserve Splash -> Auth -> Home lock boundary and return to originating parent screen.",
    "",
    "## 3. End-to-end domain behavior (NO MOCK BACKEND)",
    "- Real feature engine/use cases: $domain.",
    "- Define typed Kotlin commands, results and error models; validate all user input; forbid UI from writing files or manipulating secret keys directly.",
    "- Build ViewModel StateFlow reducer -> domain UseCase -> repository interface -> Android/native provider implementation. Use coroutines with explicit dispatcher, cancellation and progress; guarantee idempotent retry where feasible.",
    "- Make actions persistent only after authenticated and atomic success; if optional remote service is truly required, add reviewed authenticated API/backend contract with user opt-in, offline/timeout and rollback behavior, otherwise keep feature disabled.",
    "",
    "## 4. Storage, keying and data contracts",
    "- Per-feature data schema and storage behavior: $data.",
    "- Choose encrypted payload columns or app-private authenticated ciphertext with versioning. Room is not inherently encrypted. Separate minimal non-sensitive index metadata and document disclosure risks.",
    "- Reuse one reviewed key hierarchy and authenticated envelope format; never create a new custom cipher per screen. Validate unique nonce, AAD binding, authentication tags, rollback and truncation checks.",
    "- Sensitive in-memory state is cleared/locked appropriately, never persisted in SavedStateHandle, clipboard/logs/analytics or notification previews without explicit informed consent.",
    "",
    "## 5. Android platform, capabilities and lifecycle",
    "- Real OS integration and permission strategy: $platform.",
    "- Use real Android lifecycle, SAF, Photo Picker, KeyStore, BiometricPrompt, Credential Manager, CameraX, AutofillService or WorkManager ONLY where appropriate and supported, after device capability and permission check.",
    "- Never assume background privileges or unrestricted file access. Define process-death/reboot/offline/low-storage behavior and user-visible recovery action.",
    "- Expose real providerReady, requiresNetwork, permissionNeeds, platformCapability and realTestEvidence values into shared Service Hub; avoid fake ACTIVE status.",
    "",
    "## 6. Threat model and refusal/disabled boundaries",
    "- Service-specific abuse cases and limitations: $risks.",
    "- Reject malformed inputs, unsafe URI/path and huge payloads with bounded processing. Use guarded secret handling, authenticated data, no silent network access, and user approval for destructive export/delete.",
    "- If security guarantees cannot be supported by platform/provider, state the limitation inside the actual UI rather than pretending to satisfy it.",
    "- Never port known unsafe legacy custom AES/ECB or unsupported desktop BitLocker/VeraCrypt semantics into Android.",
    "",
    "## 7. Acceptance and test plan",
    "- Primary domain/negative tests: $tests.",
    "- Tests must include relevant positive result and read-back proof, wrong key/modified bytes, denied permissions, cancellation, process kill, app background/foreground, device reboot and low space as applicable.",
    "- Test crypto with published known-answer vectors and independent verification. Test fresh-device backup/restore for any persistent secret or key-linked item where applicable.",
    "- Test UI by actual Kotlin Compose screenshot: exact reference proportions, no logo overlap, balanced spacing, visible bottom navigation, scroll/keyboard safe, Android insets and dark theme.",
    "- Test API compatibility with actual emulator/device install if available, accessibility/TalkBack and both RTL/LTR languages. Validate performance without memory leaks and without rendering a WebView.",
    "- CI validation: Gradle assembleDebug, unit tests, instrumented tests, lint, dependency checks; archive command output, exit codes and actual APK/install evidence.",
    "",
    "## 8. Definition of COMPLETE and evidence artifact",
    "- A mission is COMPLETE only when native Compose UI, domain engine, data contract, platform permissions, real outputs, recoverability and device/security tests all pass with evidence.",
    "- Do NOT mark VERIFIED because React preview, Anima prototype, unit tests alone or a static Android build looks successful.",
    "- After implementation write EVIDENCE.md beside this file: current HEAD and source SHA; feature branch; Kotlin files; crypto/provider choices; commands + raw results; device/API; UI screenshot refs/diff; security negative cases; CI; risks; next safe action.",
    "- Continue next independent mission without routine questions, but stop destructive Git operations, production release, provider billing, user-data deletion and unauthorized secret/network access until owner approval.",
    "",
    "## 9. Handoff check",
    "- Shared UI shell and capability registry updated without breaking previous missions.",
    "- Domain service reused by dependent screens. Route from HOME or parent verified; Back returns to caller.",
    "- Existing visual asset preserved, no duplicate repository/service implementations, no lost unique branch work.",
    "- Actual implementation status recorded honestly; optional blocked dependencies listed concretely."
  )
  $doc=$layers -join [Environment]::NewLine
  if($doc.Length -lt 3500 -or $doc.Length -gt 11000) {throw "Unexpected mission length $($doc.Length) $slug"}
  if (!(Test-Path -LiteralPath $r.dir)) {New-Item -ItemType Directory -Path $r.dir | Out-Null}
  [IO.File]::WriteAllText($r.file,$doc,$utf8)
  $min=[Math]::Min($min,$doc.Length)
  $max=[Math]::Max($max,$doc.Length)
}
$files=@(Get-ChildItem -LiteralPath $root -Filter FULLSTACK_MISSION.md -File -Recurse)
if($files.Count -ne 44){throw "Expected 44 generated files; got $($files.Count)"}
$index=@("# KNOUX CRYPT | 44 ANDROID FULLSTACK MISSIONS","","Order is visual-screen order. Dependencies may be implemented earlier but remain tracked here.","","| # | Native feature | Priority | Core prerequisites |","|---|---|---|---|")
foreach($r in $expected){$c=$r.cols;$index+=("| "+$c[0]+" | "+$c[1]+" | "+$c[2]+" | "+$c[3]+" |")}
[IO.File]::WriteAllText((Join-Path $root '00_MISSION_INDEX.md'),($index -join [Environment]::NewLine),$utf8)
"MISSIONS_GENERATED=$($files.Count)"
"PROMPT_DOC_LENGTH_MIN=$min MAX=$max"
"ROOT=$root"
"NO CODE, BRANCHES OR EXISTING VISUALS MODIFIED"
