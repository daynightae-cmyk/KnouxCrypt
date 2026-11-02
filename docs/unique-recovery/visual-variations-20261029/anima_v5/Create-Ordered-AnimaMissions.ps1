# Safe Anima sequential pack builder. ASCII-only script source for Windows PowerShell.
$ErrorActionPreference = 'Stop'
$project = 'D:\KnouxCrypt'
$source = Join-Path $project 'visuals\anima_v5\KNOUX_CRYPT_ANIMA_V5_DELIVERY'
$dest = Join-Path $project 'visuals\ANIMA_MISSIONS_01-44'
$stage = Join-Path $project ('visuals\_ANIMA_MISSIONS_STAGE_' + [guid]::NewGuid().ToString('N'))
if (!(Test-Path -LiteralPath (Join-Path $project '.git'))) { throw 'Git root not found.' }
if (Test-Path -LiteralPath $dest) { throw 'Destination already exists. Aborting.' }
if (!(Test-Path -LiteralPath (Join-Path $source 'prompts'))) { throw 'Source prompts missing.' }
if (!(Test-Path -LiteralPath (Join-Path $source 'references\primary'))) { throw 'Source images missing.' }
$pfiles=@(Get-ChildItem (Join-Path $source 'prompts') -File -Filter '*.txt')
$images=@(Get-ChildItem (Join-Path $source 'references\primary') -File -Filter '*.png')
if($pfiles.Count -ne 44 -or $images.Count -ne 44) { throw 'Expected 44 exact pairs.' }
if((Get-PSDrive D).Free -lt 200MB) { throw 'Insufficient free D: space.' }
$byStem=@{}
foreach($p in $pfiles) {
  $stem=[IO.Path]::GetFileNameWithoutExtension($p.Name)
  $img=Join-Path (Join-Path $source 'references\primary') ($stem+'.png')
  if($byStem.ContainsKey($stem) -or !(Test-Path -LiteralPath $img)) { throw "Missing or duplicate source $stem" }
  $byStem[$stem]=@{Prompt=$p.FullName;Image=$img}
}
$old=@($pfiles | Sort-Object Name | ForEach-Object { [IO.Path]::GetFileNameWithoutExtension($_.Name) })
$ordered=@('01_SPLASH_ENTRY','03_SECURE_ACCESS_LOGIN','02_HOME') + @($old | Where-Object {$_ -notin @('01_SPLASH_ENTRY','02_HOME','03_SECURE_ACCESS_LOGIN')})
if($ordered.Count -ne 44 -or @($ordered|Sort-Object -Unique).Count -ne 44){throw 'Invalid order'}
$utf8=New-Object System.Text.UTF8Encoding($false)
New-Item -ItemType Directory -Path $stage | Out-Null
try {
  $min=99999; $max=0
  for($i=0;$i -lt 44;$i++) {
    $prev=$ordered[$i];$slug=$prev.Substring(3);$num='{0:D2}' -f ($i+1);$stem=$num+'_'+$slug
    $folder=Join-Path $stage $stem
    New-Item -ItemType Directory -Path $folder | Out-Null
    $imgDest=Join-Path $folder ($stem+'.png')
    $txtDest=Join-Path $folder ($stem+'.txt')
    Copy-Item -LiteralPath $byStem[$prev].Image -Destination $imgDest
    if((Get-FileHash $imgDest -Algorithm SHA256).Hash -ne (Get-FileHash $byStem[$prev].Image -Algorithm SHA256).Hash) {throw "Image hash mismatch $stem"}
    $text=[IO.File]::ReadAllText($byStem[$prev].Prompt)
    $header=@(
      "ANIMA IMAGE-TO-APP | LINK SCREEN $num ($slug) TO THE CURRENT KNOUX CRYPT APP SHELL FIRST.",
      "USE the SAME existing Anima project, session and route registry. No new app, website clone, remote assets, deleted screens, changed stag-K or duplicate AppShell. Attach ONLY $stem.png as pixel-locked reference, then implement accessible local UI interactions.",
      "Mandatory flow: SPLASH_ENTRY -> SECURE_ACCESS_LOGIN -> HOME, followed by service routes. Touch to Enter opens Auth only, not Home. Sign In on Auth offers an explicit local VISUAL DEMO transition to Home; no real auth, biometrics, encryption, key storage or backend. Every later screen connects to the SAME existing navigation; back returns to the caller."
    ) -join [Environment]::NewLine
    $text=[regex]::Replace($text,'(?s)\AANIMA.*?Do not reset or recreate the app\.', $header)
    $text=[regex]::Replace($text,'(?m)^CURRENT SCREEN \d\d\s+\S+\s+', "CURRENT SCREEN $num - ")
    $text=[regex]::Replace($text,'(?m)^VISUAL QA SCENARIOS\..*$', 'VISUAL QA: Pixel-compare idle UI, pressed/focus states, Back, narrow Android viewport, keyboard and reduced motion. All buttons, cards and menus respond locally or show clear demo sheet. No fake security status. Preserve brand, layout, insets, previous components and routes.')
    if($slug -eq 'SPLASH_ENTRY') {
      $text=$text.Replace('ROUTING: The fingerprint control navigates to HOME. On returning from another screen do not replay the entire intro.', 'ROUTING: Touch to Enter opens SECURE_ACCESS_LOGIN (screen 02) in the same existing app, never HOME directly. Returning does not replay the full intro.')
      $text=$text.Replace('immediately navigate to existing HOME, even if HOME is still a placeholder until its own pass', 'navigate to SECURE_ACCESS_LOGIN or its named route placeholder until screen 02 exists')
    } elseif($slug -eq 'SECURE_ACCESS_LOGIN') {
      $text=$text.Replace('ROUTING: Accessible via HOME Account or app menu; back returns HOME, never overwrite Splash. Login stays demo only.', 'ROUTING: Screen 02 opens from Splash Touch to Enter. Sign In on sample inputs performs a demo-only transition to HOME (screen 03) without claiming real authentication. GitHub, Passkey, Fingerprint remain visual previews. Back returns to SPLASH if entered there; Account from HOME can reopen Auth and return HOME.')
      $text=$text.Replace('demonstrate an offline visual form without credential requests or actual auth results', 'demonstrate offline fictional inputs and a preview-only transition to HOME; no real credentials or auth results')
      $text=$text.Replace('do not request or transmit real user credentials during this prototype.', 'do not request, save, or transmit real credentials. Preview navigation is not authentication.')
    } elseif($slug -eq 'HOME') {
      $text=$text.Replace('ROUTING: SPLASH Enter opens HOME. All eight destinations resolve to one shared route registry with Back to HOME.', 'ROUTING: Explicit Auth demo Sign In opens HOME after Splash; never skip Auth. All eight cards use the shared route registry and Back returns HOME.')
      $text=$text.Replace('attach existing Splash Touch to Enter','attach Auth demo Sign In transition')
    }
    if($text -match 'https?://' -or $text -match 'SPLASH Enter opens HOME') {throw "Unwanted URL or old flow in $stem"}
    if($text.Length -ge 5000 -or $text.Length -lt 2500) {throw "Prompt length not allowed for $stem : $($text.Length)"}
    if(!$text.StartsWith('ANIMA IMAGE-TO-APP | LINK SCREEN')) {throw "Bad prompt header for $stem"}
    if($text -notmatch ('CURRENT SCREEN '+$num+' -')) {throw "Bad numbering for $stem"}
    [IO.File]::WriteAllText($txtDest,$text,$utf8)
    $min=[Math]::Min($min,$text.Length);$max=[Math]::Max($max,$text.Length)
  }
  $folders=@(Get-ChildItem -LiteralPath $stage -Directory)
  if($folders.Count -ne 44) {throw 'Folder count wrong'}
  foreach($f in $folders) {
    $content=@(Get-ChildItem -LiteralPath $f.FullName)
    if($content.Count -ne 2 -or @($content|Where-Object {$_.Extension -notin @('.png','.txt')}).Count -gt 0){throw "Unexpected files in $($f.Name)"}
  }
  $files=@(Get-ChildItem -LiteralPath $stage -File -Recurse)
  if($files.Count -ne 88){throw 'File count wrong'}
  Move-Item -LiteralPath $stage -Destination $dest -ErrorAction Stop
  "CREATED=$dest"
  "FOLDERS=44 FILES=88 PROMPT_MIN=$min PROMPT_MAX=$max"
  Get-ChildItem -LiteralPath $dest -Directory | Select-Object -First 5 -ExpandProperty Name
  'SOURCE PRESERVED. NO COMMIT OR PUSH.'
} catch {
  Write-Warning $_.Exception.Message
  Write-Warning "Staging retained for inspection: $stage"
  throw
}
