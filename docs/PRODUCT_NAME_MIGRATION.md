# Product-name migration — `KnouxCrypt™ 2025` → `KNOUX CRYPT`

**Status: prepared, not executed.** Nothing in this document has been applied. The
rename is deliberately left out of the startup and visual work because it is the
one change in this product that can strand an existing installation, and that is
an owner decision, not a drive-by edit.

## Why the rename is tempting and why it is not free

The identity repair standardised the *displayed* name to `KNOUX CRYPT — Private
Encryption Suite` everywhere the product speaks about itself: the boot view, the
window title, the tray tooltip, the About dialog, the installer wizard, the web
document title and `package.json`'s `description`.

Four packaging fields still carry the old name, and they are the ones with
consequences:

| Field | Current value | What it controls |
|---|---|---|
| `build.productName` | `KnouxCrypt™ 2025` | install directory, Start Menu and desktop shortcut label, "Apps & features" display name |
| `build.nsis.shortcutName` | `KnouxCrypt™ 2025` | the shortcut file names |
| `build.linux.desktop.Name` | `KnouxCrypt™ 2025` | the Linux `.desktop` entry |
| `build.nsis.installerHeaderIcon`… | *(unchanged)* | icons — already migrated, no name coupling |

The embedded year is the actual defect: it went stale on 1 January and will keep
being stale in every future build, because a name is not a version.

## The three identities, and which one must never move

This is the whole reason the migration can be made safe.

1. **`name: "knouxcrypt"`** in `package.json` — this is what
   `app.getPath("userData")` resolves to, i.e.
   `%APPDATA%\knouxcrypt`. The enrollment record, the wrapped data-key material,
   the encrypted store, the journal and the preferences all live under it.
   **This value must never change.** Verified empirically during the Windows QA:
   the vault survived an uninstall *because* the folder is named from `name` and
   not from `productName`. Renaming it would orphan every existing vault.
2. **`appId: "com.knoux.knouxcrypt"`** — the Windows App User Model ID, which
   groups taskbar buttons and owns notification identity. It is already pinned
   explicitly, so it is stable across a rename. Leave it pinned.
3. **`productName`** — presentation only: where files are installed and what the
   shortcuts say. This is the field that can change.

So the vault's location and the taskbar identity are *already* decoupled from the
display name. What is not decoupled is the uninstaller's registry identity.

## The real risk: the uninstall GUID

electron-builder derives the `Apps & features` key from the product name unless
`nsis.guid` is set. Observed on this machine with a sibling product:

```
%LOCALAPPDATA%\Programs\KNOUX REC\
HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\980f6641-55d1-5ff1-bbde-6a154cc6bd1a
```

That GUID is generated, not chosen. If `productName` changes without pinning the
GUID:

- the new installer registers under a *different* key;
- Windows sees two products and keeps the old shortcut;
- the old install directory is never updated or removed, so the previous
  `KnouxCrypt™ 2025` build stays on disk and keeps launching from the old
  shortcut — two versions of the app, one vault, and no obvious way for the user
  to tell which they opened.

Nothing is deleted in that scenario, but the product is duplicated. That is the
failure this plan exists to prevent.

## Staged, non-destructive migration

### Stage 0 — pin identity before renaming anything

Ship this first, on its own, with **no** name change:

```json
"nsis": {
  "guid": "<a stable UUIDv4 generated once and committed>"
}
```

Verify on a machine with an existing install that the uninstall key becomes that
GUID and that "Apps & features" still shows exactly one entry. Until this has
shipped and been observed, a rename is unsafe.

### Stage 1 — rename the presentation only

```json
"productName": "KNOUX CRYPT",
"nsis": { "shortcutName": "KNOUX CRYPT", "guid": "<same as stage 0>" },
"linux": { "desktop": { "Name": "KNOUX CRYPT" } }
```

Keep `name: "knouxcrypt"`. Keep `appId`. Also drop the year from the artifact
names (`KnouxCrypt-2025-Setup-${version}…` → `KnouxCrypt-Setup-${version}…`) so a
future build does not carry a stale year either.

### Stage 2 — migrate the old install, in the installer, without touching data

Add a `customInit` hook to `electron/installer.nsh` that, at install time:

1. reads `HKCU\Software\KnouxTechnologies\KnouxCrypt2025\InstallPath` (the key the
   installer already writes) to find the previous directory;
2. if it exists and differs from `$INSTDIR`, and the running executable is not in
   use, deletes the **old shortcut** and marks the old directory for removal;
3. removes only files that belong to the application — `*.exe`, `*.dll`,
   `*.pak`, `resources/app.asar`, `resources/assets`, `LICENSE*`, the uninstaller
   stub — and **never** recurses into anything under `%APPDATA%`;
4. writes the new install path back to the same registry key, so the next
   migration has a pointer to follow.

The rule that makes this safe: the application's own files live in
`%LOCALAPPDATA%\Programs\…`, and user data lives in `%APPDATA%\knouxcrypt`. The
installer may clean the first and must be unable to reach the second.

### Stage 3 — uninstall must stay as it is today

`deleteAppDataOnUninstall: false` is already set and is asserted by
`tests/electron-hardening.test.cjs` ("uninstalling does not delete the user's
vault"). The migration must not weaken that: an uninstall removes program files,
never the vault, and the confirmation text already says so in Arabic and English.

## Verification that must pass before the rename ships

1. Install the current build. Enrol a vault. Encrypt a file. Record the SHA-256 of
   the container and of the enrollment record.
2. Install the renamed build over it **without uninstalling**. Assert:
   - one "Apps & features" entry, under the new name, same pinned GUID;
   - `%APPDATA%\knouxcrypt` byte-identical (same hashes);
   - the app unlocks with the same password and decrypts the recorded container to
     the original bytes;
   - the old shortcut is gone and the new one launches the new executable.
3. Uninstall. Assert the vault is still on disk and the next install unlocks it.
4. Run the existing harnesses against the renamed artifacts:
   `scripts/qa-windows-installer.cjs` and `scripts/qa-windows-exe.cjs` (both
   discover the uninstaller and the userData folder dynamically, so they will not
   be fooled by the rename — that discovery was added precisely because the
   uninstaller is named `Uninstall <productName>.exe`, which changes with the
   name).

## What is explicitly out of scope

- Changing `name: "knouxcrypt"`. That is the vault's address.
- Changing `appId`. That is the taskbar and notification identity.
- Any deletion of a previous installation's *data*.
- Squashing or rewriting history to "clean up" the old name.

## Recommendation

Land Stage 0 (pin the GUID) as its own small PR now, because it is a pure safety
improvement with no visible effect and it unblocks everything after it. Hold
Stages 1–2 until an owner confirms that a rename of the installed product name is
wanted, since it changes what the user sees in "Apps & features" and on the
desktop.
