# KNOUX CRYPT: additive import of local prompts, reference approved GitHub PNGs.
$ErrorActionPreference='Stop'
$original='D:\KnouxCrypt'
$target='D:\KnouxCrypt-Android-Ready'
$oldRoot=Join-Path $original 'visuals\ANIMA_MISSIONS_01-44'
$handoff=Join-Path $target 'agent-handoff\KNOUX_CRYPT'
$out=Join-Path $target 'visuals\ANIMA_MISSIONS_01-44'
if(!(Test-Path -LiteralPath (Join-Path $target '.git'))){throw 'Ready worktree missing'}
if(!(Test-Path -LiteralPath $oldRoot)){throw 'Local reference folder missing'}
$folders=@(Get-ChildItem -LiteralPath $oldRoot -Directory|Sort-Object Name)
$refFiles=@(Get-ChildItem -LiteralPath $handoff -Recurse -Filter 'REFERENCE.png' -File)
if($folders.Count -ne 44 -or $refFiles.Count -ne 44){throw "Unexpected counts $($folders.Count)/$($refFiles.Count)"}
$hashMap=@{}
foreach($f in $refFiles){$hash=(Get-FileHash -LiteralPath $f.FullName -Algorithm SHA256).Hash.ToLowerInvariant();if(!$hashMap.ContainsKey($hash)){$hashMap[$hash]=$f.FullName}}
$utf8=New-Object System.Text.UTF8Encoding($false)
$records=[Collections.Generic.List[object]]::new()
$copied=0
foreach($dir in $folders){
 $slug=$dir.Name
 $localPng=Join-Path $dir.FullName ($slug+'.png')
 $localTxt=Join-Path $dir.FullName ($slug+'.txt')
 if(!(Test-Path -LiteralPath $localPng) -or !(Test-Path -LiteralPath $localTxt)){throw "Missing pair $slug"}
 $imgHash=(Get-FileHash -LiteralPath $localPng -Algorithm SHA256).Hash.ToLowerInvariant()
 if($hashMap.ContainsKey($imgHash)){$canonical=$hashMap[$imgHash];$type='SHA256_IDENTICAL'}
 elseif($slug -eq '03_HOME'){$canonical=Join-Path $handoff '03_HOME\REFERENCE.png';$type='LOCAL_HOME_DIFFERS_REMOTE_CANONICAL'}
 else {throw "Unmapped unique image: $slug"}
 if(!(Test-Path -LiteralPath $canonical)){throw "Canonical image missing: $canonical"}
 $relative=$canonical.Substring($target.Length+1).Replace('\','/')
 $outFolder=Join-Path $out $slug
 if(!(Test-Path -LiteralPath $outFolder)){New-Item -ItemType Directory -Path $outFolder|Out-Null}
 $outTxt=Join-Path $outFolder ($slug+'.txt')
 if(Test-Path -LiteralPath $outTxt){
  if((Get-FileHash $localTxt -Algorithm SHA256).Hash -ne (Get-FileHash $outTxt -Algorithm SHA256).Hash){throw "Different existing prompt: $outTxt"}
 }else{Copy-Item -LiteralPath $localTxt -Destination $outTxt -ErrorAction Stop;$copied++}
 $pointer=Join-Path $outFolder 'REFERENCE.md'
 if(Test-Path -LiteralPath $pointer){throw "Pointer collision: $pointer"}
 $nl=[Environment]::NewLine
 $description=('# '+$slug+' / Visual Reference'+$nl+$nl+'Canonical reference image: '+$relative+$nl+'Original Anima prompt: visuals/ANIMA_MISSIONS_01-44/'+$slug+'/'+$slug+'.txt'+$nl+'Reference match: '+$type+$nl+$nl+'Never use a device-frame composite as a native UI element. Do not replace approved Home with a legacy globe scene.'+$nl)
 [IO.File]::WriteAllText($pointer,$description,$utf8)
 $records.Add([pscustomobject]@{mission=$slug;approved_reference=$relative;prompt="visuals/ANIMA_MISSIONS_01-44/$slug/$slug.txt";reference_status=$type;original_sha256=$imgHash})|Out-Null
}
if($records.Count -ne 44){throw 'Mapping count failed'}
$review=Join-Path $target 'visuals\reference-review'
if(!(Test-Path -LiteralPath $review)){New-Item -ItemType Directory -Path $review |Out-Null}
$legacy=Join-Path $review '03_HOME_LOCAL_DIFFERENT_REFERENCE.png'
if(!(Test-Path -LiteralPath $legacy)){Copy-Item -LiteralPath (Join-Path $oldRoot '03_HOME\03_HOME.png') -Destination $legacy}
$csv=Join-Path $target 'visuals\ANIMA_REFERENCE_MAP.csv'
if(Test-Path -LiteralPath $csv){throw 'Mapping already exists'}
$records|Export-Csv -LiteralPath $csv -NoTypeInformation -Encoding UTF8
"PAIRS=$($records.Count)"
"PROMPTS_COPIED=$copied"
"EXACT_IMAGE_REUSE="+@($records|Where-Object {$_.reference_status -eq 'SHA256_IDENTICAL'}).Count
"HOME_LEGACY_PRESERVED=$legacy"
"OUTPUT=$out"
