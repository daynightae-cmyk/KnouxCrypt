$ErrorActionPreference='Stop'
$repo='D:\KnouxCrypt'
$missionRoot=Join-Path $repo 'visuals\REPO_AGENT_MISSIONS'
$animaRoot=Join-Path $repo 'visuals\ANIMA_MISSIONS_01-44'
$worktree='D:\KnouxCrypt_agent_handoff_20261030'
$pack=Join-Path $worktree 'agent-handoff\KNOUX_CRYPT'
$branch='feat/splash-entry'
$utf8=New-Object System.Text.UTF8Encoding($false)
if(!(Test-Path (Join-Path $repo '.git'))){throw 'Missing repo root'}
if(Test-Path $worktree){throw 'Worktree exists, aborting without overwrite'}
if((Get-PSDrive D).Free -lt 165MB){throw 'Low disk free space'}
$tasks=@(Get-ChildItem -LiteralPath $missionRoot -Recurse -File -Filter TASK.md)
$imgs=@(Get-ChildItem -LiteralPath $animaRoot -Recurse -File -Filter '*.png')
if($tasks.Count -ne 44 -or $imgs.Count -ne 44){throw "Expected 44 tasks and PNGs; got $($tasks.Count)/$($imgs.Count)"}
$sha=(git -C $repo rev-parse ("refs/remotes/origin/"+$branch))
if($LASTEXITCODE -ne 0){throw 'Remote branch not fetched'}
git -C $repo worktree add --detach $worktree $sha
if($LASTEXITCODE -ne 0){throw 'Could not create temporary worktree'}
New-Item -ItemType Directory -Path $pack -Force|Out-Null
$index=New-Object System.Collections.Generic.List[object]
foreach($f in @(Get-ChildItem $missionRoot -File -Recurse)){
 $rel=$f.FullName.Substring($missionRoot.Length).TrimStart('\')
 $out=Join-Path $pack $rel
 $dir=Split-Path -Parent $out
 if(!(Test-Path $dir)){New-Item -ItemType Directory -Path $dir -Force|Out-Null}
 if($f.Name -ne 'TASK.md'){Copy-Item -LiteralPath $f.FullName -Destination $out;continue}
 $body=[IO.File]::ReadAllText($f.FullName)
 $m=[regex]::Match($body,'(?m)^# DIRECT REPO AGENT MISSION: ([A-Z0-9_]+)')
 if(!$m.Success){throw "Mission ID missing: $rel"}
 $taskId=$m.Groups[1].Value
 $srcImage=Join-Path (Join-Path $animaRoot $taskId) ($taskId+'.png')
 if(!(Test-Path $srcImage)){throw "Missing image $taskId"}
 $imageOut=Join-Path $dir 'REFERENCE.png'
 Copy-Item -LiteralPath $srcImage -Destination $imageOut
 $h=(Get-FileHash $srcImage -Algorithm SHA256).Hash
 if((Get-FileHash $imageOut -Algorithm SHA256).Hash -ne $h){throw "Hash mismatch $taskId"}
 $body=[regex]::Replace($body,'(?m)^\*\*Current permission:\*\*[^\r\n]*','**Current permission:** READY - the approved image is included in this repository alongside this task.')
 $body=[regex]::Replace($body,'(?m)^\*\*Image on owner.s machine:\*\*[^\r\n]*','**Canonical reference:** REFERENCE.png in this task folder (available in Git).')
 $body=[regex]::Replace($body,'(?m)^\*\*Image to attach to remote agent:\*\*[^\r\n]*','**Agent reference:** Open REFERENCE.png directly from the same repository folder.')
 $body=$body.Replace('Only two approved images (01 Splash and 02 Secure Access) have been delivered to this repository agent SO FAR. Home and the other 41 design tasks are staged for later. A local Windows path to a screenshot does NOT prove that a remote agent has received it. The agent must request or receive that exact approved image before implementing any not-yet-supplied screen. Do not claim to have accessed the owner''s D: files from cloud tools.','ALL 44 approved reference images now exist in this repository as REFERENCE.png next to their TASK.md. Proceed in numeric order without routine questions.')
 $body='AUTONOMOUS SEQUENCE: Inspect the actual running app and same-folder REFERENCE.png, implement/refine safely, verify and show a REAL screenshot, then continue the next numbered task. Do not restart the app or ask routine questions.'+[Environment]::NewLine+[Environment]::NewLine+$body
 [IO.File]::WriteAllText($out,$body,$utf8)
 $index.Add([pscustomobject]@{ID=$taskId;Task=$rel.Replace('\','/');Image=($rel -replace 'TASK\.md$','REFERENCE.png').Replace('\','/');Sha256=$h})|Out-Null
}
$glob=Join-Path $pack '00_GLOBAL_AGENT_RULES.md'
$g=[IO.File]::ReadAllText($glob)
$g=$g.Replace('Only two approved images (01 Splash and 02 Secure Access) have been delivered to this repository agent SO FAR. Home and the other 41 design tasks are staged for later. A local Windows path to a screenshot does NOT prove that a remote agent has received it. The agent must request or receive that exact approved image before implementing any not-yet-supplied screen. Do not claim to have accessed the owner''s D: files from cloud tools.','ALL 44 approved images are now included in the same repo as a REFERENCE.png alongside their TASK.md. The owner authorizes autonomous sequential execution without routine approvals. If specific source information is truly missing, report only that blocker; never invent image details.')
[IO.File]::WriteAllText($glob,$g,$utf8)
$welcome=@'
# KNOUX CRYPT - GITHUB / VERCEL REPOSITORY AGENT: START HERE

This is a COMPLETE repository-side image/task handoff for the ACTIVE feat/splash-entry PR. No new app, no new branch, no replacement of working src files. 44 uniquely named screen TASK.md files each have exactly one REFERENCE.png.

FIRST read 00_GLOBAL_AGENT_RULES.md and 00_RUN_ORDER.md. Then implement/refine one screen at a time, using the visual reference in its own directory. All images are available inside this Git branch; do not ask the user to re-upload them.

MOST IMPORTANT:
- Preserve original transparent stag-K logo. Illuminate individual eyes violet-white and sweep antlers elegantly on Splash, matching approved motion. Dynamic sparse violet star embers and energy accents persist without obscuring content.
- Keep ONE global dark obsidian/violet design system and CONTINUOUS low-opacity animated vertical cipher code rain behind ALL compatible screens. Stable brightness, opacity, spacing and header/footer geometry across transitions.
- Splash -> Secure Access (add Guest if not already present) -> Home -> exactly eight Home cards and linked subservices in the hierarchy. Secure Share under Tools, NOT a ninth Home card.
- Bottom Home/Tools/Account nav anchored to safe-area; main content scrolls ABOVE it. Optically center Splash/Auth compositions; no collisions, unbalanced empty areas, or cut-off text.
- Visual interactions must animate meaningfully by function. Deep cyber ambience and mysterious cinematic rising entrance music are optional/opt-in with clear mute, sound off on load. No autoplay, no fabricated protected state or real security claims.
- Real running-app screenshot AFTER EVERY TASK at matching viewport. Compare reference vs result and fix problems before reporting success. Check build/tests/routes and state commit truthfully. Screenshot not an AI mockup.
- Maintain existing app and PR, preserve work in main and other worktrees. No force push or unsafe deletion. Merge through safe review when approved. Continue automatically through task queue, no routine questions.
- source-recovery folder contains screenshot-derived preliminary CODE REFERENCES only; compare carefully; DO NOT blindly overwrite src.
'@
[IO.File]::WriteAllText((Join-Path $pack '00_START_HERE.md'),$welcome,$utf8)
$run=New-Object System.Collections.Generic.List[string]
@('# SEQUENTIAL EXECUTION QUEUE','','Follow numeric screen order. Verify any previously built screen rather than recreating it. After each completed screen: real screenshot, visual comparison, build/routing tests, safe integration and move to next item.','','| # | Task | Reference |','|---|---|---|')|ForEach-Object{$run.Add($_)|Out-Null}
foreach($x in @($index|Sort-Object ID)){$run.Add('| '+$x.ID.Substring(0,2)+' | [TASK]('+$x.Task+') | [REFERENCE]('+$x.Image+') |')|Out-Null}
[IO.File]::WriteAllText((Join-Path $pack '00_RUN_ORDER.md'),($run -join [Environment]::NewLine),$utf8)
$manifest=@{date='2026-10-30';branch=$branch;screen_count=44;entries=$index}|ConvertTo-Json -Depth 7
[IO.File]::WriteAllText((Join-Path $pack '00_MANIFEST.json'),$manifest,$utf8)
$unique=@($index|Select-Object -ExpandProperty Sha256 -Unique)
if($index.Count -ne 44 -or $unique.Count -ne 44){throw 'Image deduplication or task count validation failed'}
$inRepoTasks=@(Get-ChildItem $pack -File -Recurse -Filter TASK.md)
$inRepoRefs=@(Get-ChildItem $pack -File -Recurse -Filter REFERENCE.png)
if($inRepoTasks.Count -ne 44 -or $inRepoRefs.Count -ne 44){throw 'Missing task or reference in handoff'}
'STAGED='+$pack
'TASKS='+$inRepoTasks.Count+' PNGS='+$inRepoRefs.Count+' UNIQUE='+$unique.Count
'NO_GIT_COMMIT_OR_PUSH_YET'
