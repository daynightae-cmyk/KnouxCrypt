# GitHub sign-in

KnouxCrypt signs in to GitHub with the OAuth 2.0 **Device Authorization
Grant** (RFC 8628). This is a real authorization flow, not a simulated one.

The flow runs in the Electron main process because GitHub's OAuth endpoints do
not send CORS headers. A browser-only preview cannot start it, and the UI says
so instead of faking a result.

## What the app does with GitHub

- Requests a device code from `https://github.com/login/device/code` with the
  `read:user` scope.
- Shows the one-time user code and opens `https://github.com/login/device`.
- Polls `https://github.com/login/oauth/access_token`, honouring
  `authorization_pending`, `slow_down` (+5 s), `expired_token`, and
  `access_denied`.
- Uses the access token **once** to read the public profile from
  `https://api.github.com/user`, then discards it.
- Returns only `login`, display name, numeric id and profile URL to the
  renderer.

It does **not** unlock the vault. The vault is encrypted locally with the vault
password; GitHub identity is not a decryption key and is never presented as
one.

## One-time setup

GitHub requires an OAuth App. The app owner must create it; KnouxCrypt cannot
create one for you.

1. Open <https://github.com/settings/developers> and choose **New OAuth App**.
2. Set any name and homepage. The authorization callback URL is not used by the
   device flow; `https://github.com/login/device` is a reasonable placeholder.
3. After creating the app, open its settings and enable **Device Flow**.
4. Copy the **Client ID**. It is public; the device flow does not use a client
   secret.

Then open **Secure Access → GitHub** and paste the Client ID into the setup
panel. It is stored in the Electron user-data directory at
`auth/github.json` (public value only, no token, no identity).

For development, the same value can be supplied through the environment:

```powershell
$env:KNOUX_GITHUB_CLIENT_ID = "Iv1.0123456789abcdef"
npm run electron:dev
```

The persisted value is used when the environment variable is absent. A
malformed environment value is ignored at startup so the app can still open and
show the setup panel.

## Security properties

| Property | Behaviour |
| --- | --- |
| Client secret | Never requested, never stored. Device flow does not need one. |
| Access token | Lives only as a local variable in the main process for one profile request. Never crosses IPC, never touches disk. |
| Device code | Stays in the main process; the renderer receives only the user code and verification URL. |
| Renderer surface | Seven fixed channels under `electronAPI.auth.github`; no generic invoke. |
| External links | The open handler accepts only `https://github.com` and `https://www.github.com`. |
| Sign-out | Clears the in-memory identity. There is no token to revoke. |
| Vault impact | None. GitHub sign-in cannot encrypt, decrypt, unlock, or change vault data. |

## Passkey and fingerprint

These are deliberately unavailable. This build has no WebAuthn credential
store / PRF key wrapping for passkeys and no native Windows Hello binding for
fingerprints, so neither can unlock the vault. The UI says so and does not show
a simulated scan or prompt. Do not describe them as working until a real
platform integration exists.

## Troubleshooting

| Message | Cause |
| --- | --- |
| `GitHub did not recognise this client ID…` | Wrong Client ID, or Device Flow is disabled on the OAuth App. |
| `GitHub sign-in was cancelled on the GitHub page.` | The user denied the request at GitHub. |
| `This GitHub sign-in code expired. Start again.` | The 15-minute device code elapsed. |
| `Could not reach GitHub…` | Network/DNS/proxy failure in the main process. |
| `Only GitHub pages can be opened…` | The open handler rejected a non-GitHub URL. |
