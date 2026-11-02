"""Check that the Arabic text in Kotlin sources survives into the packaged APK dex.

This is the packaging half of the Arabic-corruption guard. `ArabicSourceIntegrityTest`
proves the *source* is intact; this proves the *built artifact* still carries the same
Arabic after Kotlin compilation, dexing and packaging, which is where the original
question-mark corruption would actually have surfaced.

Rather than parsing Kotlin, it extracts every maximal run of Arabic script (plus the
Arabic punctuation and marks that sit inside such a run) from each string literal and
checks that the run appears in the packaged dex.

Why runs and not whole literals: a literal containing an interpolation is compiled into
runtime concatenation, so the full string never exists as one contiguous byte sequence
in the dex. Splitting on interpolations instead breaks on nested braces and on escape
sequences. An Arabic word-run is stable under both, and it is exactly the unit that
corruption destroys: the TASK 39 incident replaced Arabic with question marks, which
removes these runs entirely.

Limitation, stated so it is not mistaken for more than it is: this proves the Arabic
text survived compilation and packaging. It does not prove the text is grammatical,
correctly ordered, or rendered well on a screen - that needs a device.

Run from `native-android/` after `./gradlew :app:assembleDebug`.
"""
import glob
import re
import sys
import zipfile

# The character class is built from code points so this file's regex source stays
# ASCII and cannot be mangled by an editor, a patch script or a non-UTF-8 locale.
ARABIC_LOW = chr(0x0600)
ARABIC_HIGH = chr(0x06FF)
RANGES = [
    (0x0600, 0x06FF),  # Arabic block: letters, Arabic-Indic digits, punctuation
    (0x064B, 0x065F),  # harakat / combining marks
    (0x0670, 0x0670),  # superscript alef
    (0x0640, 0x0640),  # tatweel
    (0x06D6, 0x06ED),  # small Arabic letter marks
]
CHARS = [''.join([chr(low) if low == high else chr(low) + '-' + chr(high) for low, high in RANGES])]
CHAR_CLASS = '[' + ''.join(CHARS) + ']'

MIN_RUN = 3
LITERAL = re.compile(r'"([^"]*)"')
ARABIC_RUN = re.compile(CHAR_CLASS + '{' + str(MIN_RUN) + ',}')


def has_arabic(value):
    return any(ARABIC_LOW <= char <= ARABIC_HIGH for char in value)


def arabic_runs(path):
    """Every distinct Arabic-script run of at least MIN_RUN characters in the file."""
    text = open(path, encoding='utf-8').read()
    runs = []
    for value in LITERAL.findall(text):
        if not has_arabic(value):
            continue
        for run in ARABIC_RUN.findall(value):
            if run not in runs:
                runs.append(run)
    return runs


def dex_blob():
    apks = glob.glob('app/build/outputs/apk/debug/app-debug.apk')
    if not apks:
        return None
    with zipfile.ZipFile(apks[0]) as archive:
        return b''.join(
            archive.read(name)
            for name in archive.namelist()
            if name.startswith('classes') and name.endswith('.dex')
        )


def main():
    if len(sys.argv) < 2:
        print('usage: check-dex-arabic.py <source.kt> [more.kt ...]', file=sys.stderr)
        return 2
    blob = dex_blob()
    if blob is None:
        print('NO APK: run ./gradlew :app:assembleDebug first', file=sys.stderr)
        return 2
    failures = 0
    total = 0
    for path in sys.argv[1:]:
        runs = arabic_runs(path)
        total += len(runs)
        missing = [run for run in runs if run.encode('utf-8') not in blob]
        failures += len(missing)
        print('%s: %d Arabic runs, %d found in dex, %d missing'
              % (path, len(runs), len(runs) - len(missing), len(missing)))
        for run in missing[:8]:
            print('  MISSING:', run)
    if failures:
        print('RESULT: FAIL (%d of %d Arabic runs did not reach the packaged dex)' % (failures, total))
        return 1
    print('RESULT: PASS (%d Arabic runs across %d files are all present in the packaged dex)'
          % (total, len(sys.argv) - 1))
    return 0


if __name__ == '__main__':
    sys.exit(main())
