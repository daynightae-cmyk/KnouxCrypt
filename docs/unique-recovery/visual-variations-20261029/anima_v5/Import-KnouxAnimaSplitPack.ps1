param(
    [string]$SourceFolder = (Join-Path $env:USERPROFILE 'Downloads')
)
$ErrorActionPreference = 'Stop'
$Project = 'D:\KnouxCrypt'
$Target  = Join-Path $Project 'visuals\anima_v5'
$Expected = [ordered]@{
 'KNOUX_V5_00_PROMPTS_AND_GUIDES.zip' = '3f457442784f8b8dc98528312c187386ef4d06b458f727c3136f77d1a60bb34a'
 'KNOUX_V5_01-10_SCREENS.zip' = 'a9588dceae364fa966c95b00a24400fa4cc4eeaa55d7754c9f05418308a74338'
 'KNOUX_V5_11-20_SCREENS.zip' = '79f52e1fddfe751d34094b37907ed5f19e551cbf20f53494ceb34a427b5b54b9'
 'KNOUX_V5_21-30_SCREENS.zip' = 'f33345cf30d4875f67996724c1c76151a50d0c92cae262d3b3a5ce58aa682cc2'
 'KNOUX_V5_31-40_SCREENS.zip' = '391765987daf0e7830511c824ac55e280350035971d625c37d2decc7c60f1203'
 'KNOUX_V5_41-44_SCREENS.zip' = '35809082cd90dfd35fb7483bdb932dd9cbd7af3542bee1d09c9f205df0d51501'
}
if (!(Test-Path -LiteralPath (Join-Path $Project '.git'))) { throw 'Project Git root not found.' }
if (!(Test-Path -LiteralPath $SourceFolder -PathType Container)) { throw "Source directory missing: $SourceFolder" }
if ((Get-PSDrive D).Free -lt 190MB) { throw 'D: has less than 190 MB free; stop to avoid disk exhaustion.' }
Add-Type -AssemblyName System.IO.Compression
$entries = @()
foreach($file in $Expected.Keys) {
    $full = Join-Path $SourceFolder $file
    if (!(Test-Path -LiteralPath $full -PathType Leaf)) { throw "Missing $full - download all six ZIPs first." }
    $actual=(Get-FileHash -LiteralPath $full -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actual -ne $Expected[$file]) { throw "SHA256 mismatch: $file (no extraction)." }
    $arc=[System.IO.Compression.ZipFile]::OpenRead($full)
    try {
        foreach($entry in $arc.Entries) {
            if (!$entry.Name) { continue }
            $name=$entry.FullName
            if ($name.StartsWith('/') -or $name.Contains('\') -or $name.Contains(':') -or @($name.Split('/')) -contains '..') {
                throw "Unsafe ZIP member: $name"
            }
            $entries += $name
        }
    } finally { $arc.Dispose() }
}
if($entries.Count -ne 98 -or ($entries | Sort-Object -Unique).Count -ne 98) {
    throw "ZIP content count unexpectedly $($entries.Count) or duplicate member found; stopped."
}
if (!(Test-Path -LiteralPath $Target)) { New-Item -ItemType Directory -Path $Target -Force | Out-Null }
$Stage=Join-Path $Target ('_STAGE_SPLIT_'+(Get-Date -Format 'yyyyMMdd_HHmmss'))
New-Item -ItemType Directory -Path $Stage | Out-Null
foreach($file in $Expected.Keys) {
    Expand-Archive -LiteralPath (Join-Path $SourceFolder $file) -DestinationPath $Stage -ErrorAction Stop
}
$sourceFiles=@(Get-ChildItem -LiteralPath $Stage -File -Recurse)
if($sourceFiles.Count -ne 98) { throw "Staged file count mismatch $($sourceFiles.Count); staging preserved: $Stage" }
$conflicts=@()
foreach ($source in $sourceFiles) {
    $rel=$source.FullName.Substring($Stage.Length).TrimStart('\')
    $dest=Join-Path $Target $rel
    if (Test-Path -LiteralPath $dest -PathType Leaf) {
        $old=(Get-FileHash -LiteralPath $dest -Algorithm SHA256).Hash
        $new=(Get-FileHash -LiteralPath $source.FullName -Algorithm SHA256).Hash
        if($old -ne $new) { $conflicts += $rel }
    }
}
if($conflicts.Count -gt 0) {
    $conflicts | ForEach-Object { Write-Warning "Conflict: $_" }
    throw "Existing files differ. No old files overwritten. Staging preserved: $Stage"
}
$copyCount=0
foreach ($source in $sourceFiles) {
    $rel=$source.FullName.Substring($Stage.Length).TrimStart('\')
    $dest=Join-Path $Target $rel
    if(Test-Path -LiteralPath $dest) {continue}
    $parent=Split-Path -Parent $dest
    if (!(Test-Path -LiteralPath $parent)) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }
    Copy-Item -LiteralPath $source.FullName -Destination $dest
    $copyCount++
}
$p=@(Get-ChildItem -LiteralPath (Join-Path $Target 'prompts') -File -Filter '*.txt')
$i=@(Get-ChildItem -LiteralPath (Join-Path $Target 'references\primary') -File -Filter '*.png')
$a=@(Get-ChildItem -LiteralPath (Join-Path $Target 'references\alternates') -File -Filter '*.png')
$b=@(Get-ChildItem -LiteralPath (Join-Path $Target 'references\brand') -File -Filter '*.png')
if($p.Count -ne 44 -or $i.Count -ne 44 -or $a.Count -ne 5 -or $b.Count -ne 1) {
    throw "Import verification failed: prompts=$($p.Count), screens=$($i.Count), alternates=$($a.Count), brand=$($b.Count)"
}
Write-Host "VERIFIED FILE IMPORT: 44 prompts, 44 screens, 5 alternates, 1 brand logo." -ForegroundColor Green
Write-Host "Copied: $copyCount ; Target: $Target"
Write-Host "Staging retained (no deletion): $Stage"
Write-Host 'No git commit, push, merge, or old file replacement performed.'
