# KnouxCrypt™ 2025 — Windows installer customisation / تخصيص المثبّت
#
# electron-builder generates the real installer (file copy, shortcuts, the
# uninstaller, and the HKLM uninstall entry). This file is !include'd into that
# generated script, so it must only ADD things the template does not already do.
#
# What the previous revision got wrong, and why the x64 NSIS target could not
# build at all (makensis: !define: "MUI_ICON" already defined!):
#   - it redefined MUI_ICON / MUI_UNICON / MUI_FINISHPAGE_RUN, which
#     electron-builder defines from nsis.installerIcon, nsis.uninstallerIcon and
#     nsis.runAfterFinish in package.json;
#   - it declared its own installation Section doing `File /r "${BUILD_DIR}\*"`,
#     but ${BUILD_DIR} is not defined by the template and the template already
#     copies the application — a duplicate, broken install step;
#   - it wrote to HKLM and HKCR while package.json sets
#     requestedExecutionLevel "asInvoker", so those writes would fail for an
#     ordinary user rather than an administrator;
#   - it used ${If} ${AtMostWin7} without including LogicLib, and referenced
#     $INSTDIR\resources\help\index.html, which is not shipped.
#
# Everything here is therefore either a guarded define or an electron-builder
# custom macro, and per-user state is written to HKCU so it works unelevated.

# ---------------------------------------------------------------- page strings
# Guarded: if a future electron-builder template defines these, its value wins
# instead of the build aborting.

!ifndef MUI_WELCOMEPAGE_TITLE
  !define MUI_WELCOMEPAGE_TITLE "مرحباً بك في معالج تثبيت KnouxCrypt™ 2025"
!endif
!ifndef MUI_WELCOMEPAGE_TEXT
  !define MUI_WELCOMEPAGE_TEXT "سيقوم هذا المعالج بإرشادك خلال تثبيت نظام التشفير KnouxCrypt™ 2025.$\r$\n$\r$\nيُنصح بإغلاق KnouxCrypt قبل المتابعة.$\r$\n$\r$\nانقر على 'التالي' للمتابعة."
!endif

# ------------------------------------------------------------------- installer

!macro customInit
  # Refuse a second concurrent installer. CreateMutex returns an existing handle
  # and sets ERROR_ALREADY_EXISTS ($R0 != 0) rather than failing.
  System::Call 'kernel32::CreateMutexA(i 0, i 0, t "KnouxCrypt2025Setup") i .r1 ?e'
  Pop $R0
  StrCmp $R0 0 +3
    MessageBox MB_OK|MB_ICONEXCLAMATION "معالج التثبيت يعمل بالفعل./The installer is already running."
    Abort
!macroend

!macro customInstall
  # Per-user registration only: the package requests asInvoker, so HKLM and HKCR
  # are not writable here and must not be attempted.
  WriteRegStr HKCU "Software\KnouxTechnologies\KnouxCrypt2025" "InstallPath" "$INSTDIR"
  WriteRegStr HKCU "Software\KnouxTechnologies\KnouxCrypt2025" "Version" "${VERSION}"

  # knouxcrypt:// deep-link handler, registered for this user. $appExe is set by
  # the template's installSection before customInstall is inserted, so it is the
  # reliable reference to the installed executable rather than a re-derivation.
  WriteRegStr HKCU "Software\Classes\knouxcrypt" "" "URL:KnouxCrypt Protocol"
  WriteRegStr HKCU "Software\Classes\knouxcrypt" "URL Protocol" ""
  WriteRegStr HKCU "Software\Classes\knouxcrypt\shell\open\command" "" '"$appExe" "%1"'
!macroend

# ------------------------------------------------------------------- uninstaller

!macro customUnInit
  # Guarded by IfSilent on purpose. An unguarded MessageBox here was measured
  # blocking the whole silent uninstall: `Uninstall.exe /S` displayed the
  # question, waited for a click that would never come, and removed nothing at
  # all — the program, its registry keys and its shortcut all stayed installed.
  # The wizard already confirms interactively, so this text is only ever for a
  # human at the console, and must never appear in a scripted run.
  IfSilent knouxcryptUnInitDone
  MessageBox MB_ICONQUESTION|MB_YESNO|MB_DEFBUTTON2 "هل أنت متأكد من أنك تريد إزالة KnouxCrypt™ 2025؟$\r$\nلن يتم حذف خزنتك أو ملفاتك المشفرة./Your vault and encrypted files will NOT be deleted." IDYES knouxcryptUnInitDone
  Abort
knouxcryptUnInitDone:
!macroend

!macro customUnInstall
  # Remove only what customInstall created. The vault itself lives under
  # %APPDATA%\knouxcrypt — Electron names userData after package.json "name",
  # not productName — and it is deliberately left in place: package.json sets
  # nsis.deleteAppDataOnUninstall false, and an encryption tool must never
  # destroy a user's sealed data as a side effect of uninstalling the program.
  # Verified on the QA host: after a silent uninstall the enrollment record and
  # vault-store\notes.knx. scripts/qa-windows-installer.cjs is the check that
  # proves it on a real install/uninstall cycle.
  DeleteRegKey HKCU "Software\KnouxTechnologies\KnouxCrypt2025"
  DeleteRegKey HKCU "Software\Classes\knouxcrypt"
!macroend
