#!/usr/bin/env sh
# Read-only environment check. No downloads, licenses, cache removal or installs.
set -u
status=0
for tool in java javac gradle; do
  if command -v "$tool" >/dev/null 2>&1; then
    printf 'FOUND %s\n' "$tool"
  else
    printf 'MISSING %s\n' "$tool"; status=1
  fi
done
if [ -n "${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}" ]; then
  sdk="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
  [ -d "$sdk/platforms/android-36" ] || { printf 'MISSING Android API 36 platform\n'; status=1; }
else
  printf 'MISSING ANDROID_HOME / ANDROID_SDK_ROOT\n'; status=1
fi
df -h .
exit "$status"
