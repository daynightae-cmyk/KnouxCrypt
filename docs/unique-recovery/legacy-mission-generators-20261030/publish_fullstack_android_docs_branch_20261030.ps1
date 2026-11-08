$ErrorActionPreference = 'Stop'
$repo='D:\KnouxCrypt'
$branch='planning/knoux-crypt-native-44-vertical-slices-20261030'
Set-Location -LiteralPath $repo
if(!(Test-Path '.git')) { throw 'Not in project root.' }
$docs=@(Get-ChildItem 'missions\fullstack-android' -Recurse -File)
if($docs.Count -ne 49) { throw "Expected 49 local docs, got $($docs.Count)." }
$existing=(git ls-remote origin ("refs/heads/"+$branch))
if($LASTEXITCODE -ne 0) {throw 'Branch existence check failed'}
if($existing) {throw "Remote branch exists: $branch"}
git fetch --no-tags origin main
if($LASTEXITCODE -ne 0) {throw 'Remote fetch failed'}
$base=(git rev-parse origin/main).Trim()
$liveLine=(git ls-remote origin refs/heads/main | Select-Object -First 1)
$live=([regex]::Match($liveLine,'^[0-9a-f]{40}')).Value
if($base -ne $live){throw "main moved between fetch and packaging: $base != $live"}
$oldIndex=$env:GIT_INDEX_FILE
$oldPrompt=$env:GIT_TERMINAL_PROMPT
$index=Join-Path $env:TEMP ('knoux-crypt-fullstack-index-'+[guid]::NewGuid().ToString('N'))
$env:GIT_INDEX_FILE=$index
$env:GIT_TERMINAL_PROMPT='0'
try {
  git read-tree $base
  if($LASTEXITCODE -ne 0){throw 'Temporary index read-tree failed'}
  git add -- missions/fullstack-android
  if($LASTEXITCODE -ne 0){throw 'Temporary index add failed'}
  $changed=@(git diff --cached --name-only $base)
  if($LASTEXITCODE -ne 0 -or $changed.Count -ne 49 -or @($changed|Where-Object {$_ -notlike 'missions/fullstack-android/*'}).Count -gt 0) {
    throw "Unexpected tracked diff from temporary index: $($changed.Count)"
  }
  $tree=(git write-tree).Trim()
  if($LASTEXITCODE -ne 0) { throw 'Failed to construct tree' }
  $commit=(git commit-tree $tree -p $base -m 'docs(android): add 44 full-stack native vertical-slice missions and safe local handoff').Trim()
  if($LASTEXITCODE -ne 0) {throw 'Failed to create commit'}
  git branch $branch $commit
  if($LASTEXITCODE -ne 0) {throw 'Failed to create local branch'}
  git push origin ('refs/heads/'+$branch+':refs/heads/'+$branch)
  if($LASTEXITCODE -ne 0) {throw 'Branch exists locally, remote push failed; do not claim published.'}
  'PUBLISHED_BRANCH='+$branch
  'BASE_SHA='+$base
  'COMMIT_SHA='+$commit
  'DOCS_PUBLISHED='+$changed.Count
  'WORKTREE_UNCHANGED=YES'
} finally {
  $env:GIT_INDEX_FILE=$oldIndex
  $env:GIT_TERMINAL_PROMPT=$oldPrompt
  'TEMP_INDEX_PRESERVED='+$index
}
