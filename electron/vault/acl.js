"use strict";

/**
 * Real per-user file protection for the vault's on-disk material.
 *
 * Why this exists
 * ---------------
 * Node's `mode: 0o600` and `fs.chmod()` are a no-op for confidentiality on
 * Windows. libuv only maps the POSIX write bit onto FILE_ATTRIBUTE_READONLY;
 * the DACL a new file actually gets is inherited from its directory, and the
 * default ACL under a temp or profile directory grants
 * `BUILTIN\Users:(RX)` and `NT AUTHORITY\Authenticated Users:(M)`. Measured on
 * the Windows QA host: a file written with `{mode: 0o600}` reported `0o666`
 * and carried `BUILTIN\Users:(I)(RX)`, i.e. every other local (non-admin) user
 * could read the wrapped DEK, the verifier and every sealed `*.knx` store.
 * Offline password guessing against `vault-enrollment.json` becomes possible.
 *
 * So on Windows confidentiality is a discretionary-ACL question, not a mode
 * question, and it has to be answered with an ACL.
 *
 * What "protected" means here
 * ---------------------------
 * The DACL is replaced so that only these principals hold a grant:
 *   - the current interactive user  (FullControl)
 *   - NT AUTHORITY\SYSTEM           (FullControl)
 *   - BUILTIN\Administrators        (FullControl)
 * SYSTEM/Administrators are kept deliberately: that is the convention Windows
 * itself uses for per-user secrets (SSH private keys, DPAPI blobs), it keeps
 * backup agents, antivirus and elevated servicing working, and it removes a
 * self-lockout class. It is not a weakening relative to the threat we are
 * closing: a member of Administrators can take ownership of any file on the
 * machine regardless of its DACL, so an admin was never actually excluded.
 * The property we do establish is that *no other ordinary user account* and no
 * broad group (Everyone, Authenticated Users, Users, Guests, Interactive,
 * Network, All Application Packages) has any grant at all.
 *
 * Safety invariant (learned the hard way on this host)
 * ---------------------------------------------------
 * `/inheritance:r` with a grant that fails to apply leaves an EMPTY DACL, and
 * an empty DACL locks the owner out of their own vault — the file then fails
 * even `stat()` with EPERM, and `takeown` needs elevation. Two rules follow:
 *   1. never strip inheritance unless the owner grant is in the *same* icacls
 *      command, so icacls computes one final ACL and applies it in a single
 *      SetSecurityInfo call (no intermediate empty-DACL state);
 *   2. never pass `(OI)(CI)` to a file, and never use `/T` for remediation:
 *      `(OI)(CI)` are inert on files, so `/T /inheritance:r` wiped existing
 *      children while their only grant was an inert template. We walk the tree
 *      ourselves, parents first, with a type-matched grant per node.
 * Recovery is still possible whenever a *parent directory* keeps an effective
 * owner grant, because `icacls <file> /reset` restores inherited ACLs — which
 * is exactly why parents are processed before children.
 */

const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const cp = require("child_process");

const IS_WINDOWS = process.platform === "win32";

// Well-known security identifiers. Compared as SIDs, never as display names:
// icacls resolves names through the local security account, so
// `BUILTIN\Administrators` prints as `Verwaltungsverzeichnis\Administratoren`
// on a German Windows and any name-based assertion would be locale-brittle.
const SID = Object.freeze({
  OWNER_PLACEHOLDER: "OWNER",
  SYSTEM: "S-1-5-18",
  ADMINISTRATORS: "S-1-5-32-544",
  EVERYONE: "S-1-1-0",
  AUTHENTICATED_USERS: "S-1-5-11",
  USERS: "S-1-5-32-545",
  GUESTS: "S-1-5-32-546",
  INTERACTIVE: "S-1-5-4",
  NETWORK: "S-1-5-2",
  ALL_APPLICATION_PACKAGES: "S-1-15-2-1",
  ANONYMOUS_LOGON: "S-1-5-7",
  BATCH: "S-1-5-3",
  SERVICE: "S-1-5-6",
});

// Grants that must never survive on vault material. Any of these admits a
// population larger than the single logged-in user.
const BROAD_DENY_LIST = Object.freeze([
  SID.EVERYONE,
  SID.AUTHENTICATED_USERS,
  SID.USERS,
  SID.GUESTS,
  SID.INTERACTIVE,
  SID.NETWORK,
  SID.ALL_APPLICATION_PACKAGES,
  SID.ANONYMOUS_LOGON,
]);

const WINDOWS_ALLOW_LIST = Object.freeze([SID.SYSTEM, SID.ADMINISTRATORS]);
const EXEC_TIMEOUT_MS = 20000;

function system32() {
  const root = process.env.SystemRoot || process.env.windir || "C:\\Windows";
  return path.join(root, "System32");
}

function tool(name) {
  if (IS_WINDOWS) return path.join(system32(), name);
  return name;
}

const POWERSHELL = IS_WINDOWS
  ? path.join(process.env.SystemRoot || "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe")
  : null;

function run(file, args, options = {}) {
  return new Promise((resolve) => {
    cp.execFile(
      file,
      args,
      { encoding: "utf8", timeout: EXEC_TIMEOUT_MS, windowsHide: true, ...options },
      (err, stdout, stderr) => {
        resolve({
          ok: !err,
          code: err ? (typeof err.code === "number" ? err.code : -1) : 0,
          stdout: String(stdout || ""),
          stderr: String(stderr || ""),
          error: err || null,
        });
      },
    );
  });
}

// ---- identity ---------------------------------------------------------------

let cachedUserSid;

/**
 * SID of the account that owns the vault material, or null when it cannot be
 * determined. `null` is a hard stop: callers must not strip inheritance without
 * it. whoami.exe is addressed by absolute path because a POSIX `whoami` earlier
 * on PATH (Git Bash, MSYS) accepts no `/user` switch and would be chosen first.
 */
async function currentUserSid() {
  if (cachedUserSid !== undefined) return cachedUserSid;
  if (!IS_WINDOWS) {
    cachedUserSid = null;
    return null;
  }
  const res = await run(tool("whoami.exe"), ["/user", "/fo", "csv", "/nh"]);
  const match = String(res.stdout).match(/S-1-5-\d+(?:-\d+)+/);
  cachedUserSid = res.ok && match ? match[0] : null;
  return cachedUserSid;
}

// ---- enforcement ------------------------------------------------------------

function grantSuffix(isDirectory) {
  // (OI)(CI) = object+container inherit: an inheritance *template*, meaningful
  // only on a directory. On a file it is inert and leaves no effective grant.
  return isDirectory ? "(OI)(CI)F" : "F";
}

async function runIcacls(target, isDirectory, sid) {
  const suffix = grantSuffix(isDirectory);
  const grants = [`*${sid}:${suffix}`, `*${SID.SYSTEM}:${suffix}`, `*${SID.ADMINISTRATORS}:${suffix}`];
  // /remove is needed as well as /inheritance:r: `/inheritance:r` only drops
  // *inherited* ACEs and `/grant:r` only replaces the ACEs of the trustees named
  // in the same command. An *explicit* grant to Everyone or Authenticated Users
  // — which is what a shared folder, a previous install or a third-party tool
  // leaves behind — survives both, and was measured doing exactly that here.
  // Removing the known broad trustees makes the command genuinely exclusive.
  //
  // All of it stays in one icacls invocation so the ACL is computed once and
  // applied in a single SetSecurityInfo call: there is no intermediate state in
  // which the file has no effective grant.
  const removals = [];
  for (const broad of BROAD_DENY_LIST) removals.push("/remove", `*${broad}`);
  return run(tool("icacls.exe"), [target, "/inheritance:r", ...removals, "/grant:r", ...grants]);
}

async function exists(target) {
  try {
    await fsp.lstat(target);
    return true;
  } catch {
    return false;
  }
}

const protectionLog = [];

function note(entry) {
  protectionLog.push(entry);
  if (protectionLog.length > 200) protectionLog.shift();
  return entry;
}

/**
 * Restrict one file to its owner (plus SYSTEM/Administrators on Windows).
 * Never rejects: a protection failure is reported, because refusing to write
 * the user's own vault would be worse than writing it with a weak ACL — and
 * `protectionStatus()` surfaces the gap instead of hiding it.
 */
async function protectFile(filePath) {
  if (IS_WINDOWS) {
    const sid = await currentUserSid();
    if (!sid) {
      return note({ target: filePath, kind: "file", applied: false, reason: "sid-unresolved" });
    }
    const res = await runIcacls(filePath, false, sid);
    if (!res.ok) {
      return note({ target: filePath, kind: "file", applied: false, reason: "icacls-failed", detail: (res.stdout + res.stderr).trim().slice(0, 200) });
    }
    return note({ target: filePath, kind: "file", applied: true, reason: "ntfs-dacls" });
  }
  try {
    await fsp.chmod(filePath, 0o600);
    return note({ target: filePath, kind: "file", applied: true, reason: "posix-mode" });
  } catch (err) {
    return note({ target: filePath, kind: "file", applied: false, reason: `chmod-${err.code}` });
  }
}

async function protectDirectoryOnce(dirPath) {
  if (IS_WINDOWS) {
    const sid = await currentUserSid();
    if (!sid) {
      return note({ target: dirPath, kind: "directory", applied: false, reason: "sid-unresolved" });
    }
    const res = await runIcacls(dirPath, true, sid);
    if (!res.ok) {
      return note({ target: dirPath, kind: "directory", applied: false, reason: "icacls-failed", detail: (res.stdout + res.stderr).trim().slice(0, 200) });
    }
    return note({ target: dirPath, kind: "directory", applied: true, reason: "ntfs-dacls" });
  }
  try {
    await fsp.chmod(dirPath, 0o700);
    return note({ target: dirPath, kind: "directory", applied: true, reason: "posix-mode" });
  } catch (err) {
    return note({ target: dirPath, kind: "directory", applied: false, reason: `chmod-${err.code}` });
  }
}

/**
 * Restrict a directory and everything inside it.
 *
 * Platform asymmetry worth knowing: on POSIX this chmod is the whole operation,
 * and it therefore *overwrites* a restrictive mode someone else put on the
 * directory — a store root frozen at 0500 comes back to 0700. That is intended
 * for the application's own directories, because a vault root that cannot be
 * written is a vault that can never be saved again, and 0700 still denies group
 * and world. It is not intended for user-chosen output directories, which this
 * module never touches; those refusals surface as PERMISSION_DENIED from the
 * engine's write probe instead.
 *
 * On Windows the same reasoning does not apply, because a DENY ACE is a separate
 * trustee entry that `/grant:r` does not replace — an explicit refusal survives
 * protection and is reported as a refusal.
 *
 * The default is *not* to walk: measured on this host, Windows propagates a
 * parent DACL change into the inherited ACEs of children that already exist, so
 * one `/inheritance:r /grant:r …(OI)(CI)F` call on a vault root removed
 * `BUILTIN\Users` / `Authenticated Users` from a two-level-deep pre-existing
 * `*.knx` file and replaced it with the owner-only set — while the file stayed
 * readable and writable by its owner. A single call per root is therefore both
 * cheaper and safer than a tree walk, and it never puts an inert `(OI)(CI)`
 * template on a file (the bug that produced empty DACLs during probing).
 *
 * `recursive: true` is kept for the one case propagation cannot fix: a child
 * that already carries *explicit* ACEs. It walks parents-first, one atomic
 * type-matched icacls call per node.
 */
async function protectDirectory(dirPath, { recursive = false } = {}) {
  if (!(await exists(dirPath))) {
    return note({ target: dirPath, kind: "directory", applied: false, reason: "missing" });
  }
  // Parents first: an intact parent grant is what makes a bad child ACL
  // recoverable with `icacls /reset`.
  const self = await protectDirectoryOnce(dirPath);
  if (!recursive) return self;
  if (IS_WINDOWS) await walkWindows(dirPath);
  else await chmodTreePosix(dirPath);
  return self;
}

async function walkWindows(dirPath) {
  let entries = [];
  try {
    entries = await fsp.readdir(dirPath, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const child = path.join(dirPath, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      await protectDirectoryOnce(child);
      await walkWindows(child);
    } else if (entry.isFile()) {
      await protectFile(child);
    }
  }
}

async function chmodTreePosix(dirPath) {
  try {
    await fsp.chmod(dirPath, 0o700);
    const entries = await fsp.readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const child = path.join(dirPath, entry.name);
      if (entry.isDirectory()) await chmodTreePosix(child);
      else if (entry.isFile()) await fsp.chmod(child, 0o600);
    }
  } catch {
    /* best effort; POSIX denial is verified by the mode itself */
  }
}

// Roots we have already paid for. Cleared only by resetProtectionCache(), which
// tests use because a temp directory is recreated between cases.
const protectedRoots = new Set();

async function ensureProtected(dirPath, { recursive = false } = {}) {
  const key = path.resolve(dirPath);
  if (protectedRoots.has(key)) return { cached: true, target: key };
  const result = await protectDirectory(key, { recursive });
  if (result.applied) protectedRoots.add(key);
  return { cached: false, ...result };
}

function resetProtectionCache() {
  protectedRoots.clear();
}

// ---- verification -----------------------------------------------------------

function findSid(target, sid) {
  return run(tool("icacls.exe"), [target, "/findsid", `*${sid}`]).then((res) => {
    // Exit code is 0 for both outcomes; the verdict is in the text.
    const hit = /SID Found/i.test(res.stdout) || /SID Found/i.test(res.stderr);
    return { hit, out: (res.stdout + res.stderr).trim() };
  });
}

async function readAclText(target) {
  const res = await run(tool("icacls.exe"), [target]);
  return (res.stdout + res.stderr).trim();
}

/*
 * PowerShell argument passing.
 *
 * `powershell -Command <script> <extra>` does NOT bind <extra> to $args — the
 * array stays empty and the value is emitted as stray output. Verified on this
 * host: `echo GOT=$args[0] hello` printed "GOT=[0]" then "hello". So the target
 * has to be embedded in the script text itself, as a single-quoted literal with
 * internal apostrophes doubled. Vault paths live under %USERPROFILE%, and a
 * profile name like O'Brien is legal, so this escaping is load-bearing rather
 * than defensive noise.
 */
function psQuote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

const ENUMERATE_SCRIPT = [
  "$ErrorActionPreference='Stop'",
  "$a = Get-Acl -LiteralPath __TARGET__",
  "'PROTECTED=' + $a.AreAccessRulesProtected",
  "$owner = ''",
  "try { $owner = $a.GetOwner([System.Security.Principal.SecurityIdentifier]).Value } catch { $owner = '' }",
  "'OWNER=' + $owner",
  "foreach ($e in $a.Access) {",
  "  $s = ''",
  "  try { $s = $e.IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]).Value } catch { $s = 'UNRESOLVED' }",
  "  'TRUSTEE|' + $s + '|' + $e.AccessControlType + '|' + $e.FileSystemRights + '|' + $e.IsInherited",
  "}",
].join("\n");

function replacementScript(isDirectory) {
  const inherit = isDirectory ? "ObjectInherit,ContainerInherit" : "None";
  return [
    "$ErrorActionPreference='Stop'",
    // Mutate the ACL that Get-Acl already read rather than constructing a fresh
    // security object: a constructed object carries a SACL section, and writing
    // one requires SeSecurityPrivilege, which an ordinary vault owner does not
    // hold. Get-Acl without -Sacl does not.
    "$sec = Get-Acl -LiteralPath __TARGET__",
    "$existing = @($sec.Access)",
    "foreach ($e in $existing) { [void]$sec.RemoveAccessRuleAll($e) }",
    // (true, false) = block inheritance and do not copy the inherited ACEs, so
    // the resulting DACL is exactly the allow-list and nothing else.
    "$sec.SetAccessRuleProtection($true, $false)",
    "$sids = @(__SIDS__)",
    "$rt = [System.Security.AccessControl.FileSystemRights]::FullControl",
    `$inherit = [System.Security.AccessControl.InheritanceFlags]'${inherit}'`,
    "$prop = [System.Security.AccessControl.PropagationFlags]::None",
    "foreach ($u in $sids) {",
    "  $id = New-Object System.Security.Principal.SecurityIdentifier($u)",
    "  $rule = New-Object System.Security.AccessControl.FileSystemAccessRule($id, $rt, $inherit, $prop, 'Allow')",
    "  [void]$sec.AddAccessRule($rule)",
    "}",
    "Set-Acl -LiteralPath __TARGET__ -AclObject $sec",
    "'REPLACED'",
  ].join("\n");
}

let powershellAvailable;

async function hasPowerShell() {
  if (powershellAvailable !== undefined) return powershellAvailable;
  powershellAvailable = POWERSHELL && (await exists(POWERSHELL)) && !process.env.KNOUX_DISABLE_POWERSHELL;
  return powershellAvailable;
}

/**
 * Authoritative answer to "who can reach this path?", read straight out of the
 * security descriptor. Slower than icacls (one PowerShell host, ~0.5s), so it is
 * used for verification and repair rather than on every write. Unlike the
 * icacls fast path it reports *every* trustee, including a foreign user SID that
 * is not on any known-broad list.
 */
async function enumerateAcl(target) {
  if (!IS_WINDOWS || !(await hasPowerShell())) return null;
  const script = ENUMERATE_SCRIPT.split("__TARGET__").join(psQuote(target));
  const res = await run(POWERSHELL, ["-NoProfile", "-NonInteractive", "-Command", script], { timeout: 45000 });
  if (!res.ok) {
    // Record it: an unavailable verifier must not silently downgrade protection
    // to the fast blocklist path without leaving a trace.
    note({ target, kind: "verify", applied: false, reason: "enumerate-failed", detail: (res.stdout + res.stderr).trim().slice(0, 200) });
    return null;
  }
  const lines = res.stdout.replace(/\r\n/g, "\n").split("\n").map((l) => l.trim()).filter(Boolean);
  const entries = [];
  let owner = "";
  let protectedFromInheritance = null;
  for (const line of lines) {
    if (line.startsWith("TRUSTEE|")) {
      const [, sid, type, rights, inherited] = line.split("|");
      entries.push({ sid, type, rights, inherited: inherited === "True" });
    } else if (line.startsWith("OWNER=")) owner = line.slice(6);
    else if (line.startsWith("PROTECTED=")) protectedFromInheritance = line.slice(10) === "True";
  }
  return { owner, entries, protectedFromInheritance };
}

/**
 * Drop the trustees enumeration says do not belong, then re-assert the
 * allow-list — in one atomic icacls command, so there is no state in which the
 * file has no effective grant.
 */
async function removeTrustees(target, straySids, isDirectory, sid) {
  const suffix = grantSuffix(isDirectory);
  const removals = [];
  for (const foreign of straySids) removals.push("/remove", `*${foreign}`);
  const grants = [`*${sid}:${suffix}`, `*${SID.SYSTEM}:${suffix}`, `*${SID.ADMINISTRATORS}:${suffix}`];
  return run(tool("icacls.exe"), [target, ...removals, "/grant:r", ...grants]);
}

/**
 * Replace the DACL outright. Kept as a last resort: constructing a fresh
 * security object and calling Set-Acl also writes the SACL, which needs
 * SeSecurityPrivilege — an ordinary user does not hold it, and the call fails
 * with "The process does not possess the 'SeSecurityPrivilege' privilege".
 * removeTrustees() achieves the same result without that requirement, so it is
 * tried first.
 */
async function replaceDacl(target, { isDirectory = false, allowList } = {}) {
  if (!IS_WINDOWS) return { applied: false, reason: "not-windows" };
  if (!(await hasPowerShell())) return { applied: false, reason: "no-powershell" };
  const sid = await currentUserSid();
  if (!sid) return { applied: false, reason: "sid-unresolved" };
  const list = allowList || [sid, SID.SYSTEM, SID.ADMINISTRATORS];
  const script = replacementScript(isDirectory)
    .split("__TARGET__").join(psQuote(target))
    .split("__SIDS__").join(list.map((entry) => psQuote(entry)).join(","));
  const res = await run(POWERSHELL, ["-NoProfile", "-NonInteractive", "-Command", script], {
    timeout: 45000,
  });
  if (!res.ok) {
    return { applied: false, reason: "set-acl-failed", detail: (res.stdout + res.stderr).trim().slice(0, 200) };
  }
  return note({ target, kind: isDirectory ? "directory" : "file", applied: true, reason: "ntfs-dacls-replaced" });
}

/**
 * Trustees on this path that must not be there. Anything outside the allow-list
 * counts — that is what makes this exhaustive rather than a blocklist.
 */
function unexpectedTrustees(entries, allowList) {
  const allowed = new Set(allowList);
  return (entries || []).filter((e) => e.type === "Allow" && !allowed.has(e.sid));
}

/**
 * Verify, and if the DACL is still not exclusive, repair it authoritatively and
 * verify again. Returns the final verdict rather than the intention.
 */
async function harden(target, { isDirectory = false } = {}) {
  const sid = await currentUserSid();
  const allowList = sid ? [sid, SID.SYSTEM, SID.ADMINISTRATORS] : [SID.SYSTEM, SID.ADMINISTRATORS];
  const applied = isDirectory ? await protectDirectoryOnce(target) : await protectFile(target);
  const listing = await enumerateAcl(target);
  if (!listing) return { ...applied, verified: false, reason: applied.applied ? "applied-unverified" : applied.reason };
  const stray = unexpectedTrustees(listing.entries, allowList);
  if (stray.length === 0 && listing.owner) {
    if (isDirectory) protectedRoots.add(path.resolve(target));
    return { ...applied, verified: true, repaired: false, trustees: listing.entries.length };
  }
  // Tier 1 repair: drop precisely the trustees enumeration found, using the
  // same atomic icacls command shape as protection. Needs no special privilege.
  const straySids = stray.map((e) => e.sid);
  let removal = sid ? await removeTrustees(target, straySids, isDirectory, sid) : { ok: false };
  let after = await enumerateAcl(target);
  let remaining = after ? unexpectedTrustees(after.entries, allowList) : stray;
  let strategy = "icacls-remove";

  // Tier 2: only if some ACE refused to go (for instance one we cannot address
  // by SID), try the outright replacement and see whether it is permitted.
  if (remaining.length > 0) {
    const replaced = await replaceDacl(target, { isDirectory, allowList });
    strategy = replaced.applied ? "set-acl-replace" : "set-acl-denied";
    after = await enumerateAcl(target);
    remaining = after ? unexpectedTrustees(after.entries, allowList) : remaining;
  }

  if (isDirectory && remaining.length === 0) protectedRoots.add(path.resolve(target));
  return {
    ...applied,
    verified: Boolean(after),
    repaired: remaining.length === 0 && stray.length > 0,
    repairStrategy: strategy,
    icaclsRemovalOk: Boolean(removal.ok),
    strayBefore: straySids,
    strayAfter: remaining.map((e) => e.sid),
    applied: remaining.length === 0,
    reason:
      remaining.length === 0
        ? stray.length
          ? "repaired"
          : "clean"
        : `residual:${remaining.map((e) => e.sid).join(",")}`,
  };
}

/**
 * Ask the OS, in a locale-independent way, who can reach this path.
 * Returns null when the platform has no ACL answer for us (POSIX callers use
 * `posixMode` instead).
 */
async function describeAccess(target, { exhaustive = false } = {}) {
  if (!IS_WINDOWS) {
    let stat = null;
    try {
      stat = await fsp.stat(target);
    } catch {
      return null;
    }
    const mode = stat.mode & 0o777;
    return {
      platform: process.platform,
      mechanism: "posix-mode",
      mode,
      modeOctal: mode.toString(8),
      // The only question POSIX mode bits can answer for confidentiality:
      // does anyone other than the owner hold a bit?
      groupOrWorldBits: mode & 0o077,
      groupRead: (mode & 0o040) !== 0,
      groupWrite: (mode & 0o020) !== 0,
      otherRead: (mode & 0o004) !== 0,
      otherWrite: (mode & 0o002) !== 0,
      restricted: (mode & 0o077) === 0,
    };
  }

  const ownerSid = await currentUserSid();
  if (!ownerSid) return { platform: "win32", mechanism: "unavailable", ownerSid: null };

  if (exhaustive) {
    const listing = await enumerateAcl(target);
    if (listing) {
      const allowList = [ownerSid, SID.SYSTEM, SID.ADMINISTRATORS];
      const stray = unexpectedTrustees(listing.entries, allowList);
      const denies = listing.entries.filter((e) => e.type === "Deny");
      const ownerEntry = listing.entries.find((e) => e.sid === ownerSid && e.type === "Allow");
      return {
        platform: "win32",
        mechanism: "ntfs-dacls",
        detail: "exhaustive",
        ownerSid,
        listingOwner: listing.owner,
        ownerGranted: Boolean(ownerEntry),
        systemGranted: listing.entries.some((e) => e.sid === SID.SYSTEM && e.type === "Allow"),
        administratorsGranted: listing.entries.some((e) => e.sid === SID.ADMINISTRATORS && e.type === "Allow"),
        trustees: listing.entries,
        broadGrants: stray.map((e) => e.sid),
        denyEntries: denies.map((e) => e.sid),
        inheritanceBlocked: listing.protectedFromInheritance,
        restricted: Boolean(ownerEntry) && stray.length === 0,
        rawAcl: await readAclText(target),
      };
    }
    // PowerShell unavailable: fall through to the blocklist fast path and say so.
  }

  const probes = [ownerSid, ...BROAD_DENY_LIST, ...WINDOWS_ALLOW_LIST];
  const results = await Promise.all(probes.map((sid) => findSid(target, sid)));
  const granted = {};
  probes.forEach((sid, index) => {
    granted[sid] = results[index].hit;
  });
  const broad = BROAD_DENY_LIST.filter((sid) => granted[sid]);
  const rawAcl = await readAclText(target);

  return {
    platform: "win32",
    mechanism: "ntfs-dacls",
    detail: "known-broad-list",
    ownerSid,
    ownerGranted: granted[ownerSid] === true,
    systemGranted: granted[SID.SYSTEM] === true,
    administratorsGranted: granted[SID.ADMINISTRATORS] === true,
    broadGrants: broad,
    rawAcl,
    restricted: granted[ownerSid] === true && broad.length === 0,
  };
}

/**
 * True when the path really is confined to one user. On POSIX that is the mode
 * bits; on Windows it is a DACL with no grant outside the allow-list. A missing
 * answer is never treated as a pass.
 */
async function isProtected(target, { exhaustive = false } = {}) {
  if (!IS_WINDOWS) {
    try {
      const mode = (await fsp.stat(target)).mode & 0o777;
      return { ok: (mode & 0o077) === 0, mechanism: "posix-mode", detail: `mode ${mode.toString(8)}` };
    } catch (err) {
      return { ok: false, mechanism: "posix-mode", detail: err.code };
    }
  }
  const info = await describeAccess(target, { exhaustive });
  if (!info || info.mechanism !== "ntfs-dacls") {
    return { ok: false, mechanism: "ntfs-dacls", detail: "owner SID could not be resolved" };
  }
  if (!info.ownerGranted) return { ok: false, mechanism: "ntfs-dacls", detail: "owner has no ACE" };
  if (info.broadGrants.length) {
    return { ok: false, mechanism: "ntfs-dacls", detail: `unexpected grant present: ${info.broadGrants.join(", ")}` };
  }
  return { ok: true, mechanism: "ntfs-dacls", detail: "owner-only DACL" };
}

function protectionStatus() {
  const failed = protectionLog.filter((e) => !e.applied);
  return {
    platform: process.platform,
    mechanism: IS_WINDOWS ? "ntfs-dacls" : "posix-mode",
    attempts: protectionLog.length,
    failures: failed.length,
    lastFailures: failed.slice(-5),
  };
}

// ---- platform denial recognition -------------------------------------------

/**
 * Did the OS itself refuse this write? The errno differs by platform for the
 * same underlying event, and getting this wrong turns a permission problem into
 * a generic IO_FAILED:
 *   - POSIX: EACCES (write bit cleared)
 *   - Windows: EPERM for an NTFS DENY ACE on the parent directory. libuv maps
 *     a CreateFile sharing/permission refusal to EPERM, not EACCES, so a
 *     Windows-only check for EACCES would silently miss every real denial.
 */
function isPermissionDenial(err) {
  if (!err) return false;
  const code = err.code;
  if (code === "EACCES" || code === "EPERM") return true;
  // libuv surfaces ERROR_ACCESS_DENIED from some syscalls this way.
  if (typeof err.message === "string" && /operation not permitted|permission denied|access is denied/i.test(err.message)) return true;
  return false;
}

// ---- synchronous variants ---------------------------------------------------

function runSync(file, args) {
  try {
    cp.execFileSync(file, args, { encoding: "utf8", timeout: EXEC_TIMEOUT_MS, windowsHide: true });
    return true;
  } catch {
    return false;
  }
}

function currentUserSidSync() {
  if (cachedUserSid !== undefined) return cachedUserSid;
  if (!IS_WINDOWS) {
    cachedUserSid = null;
    return null;
  }
  try {
    const out = cp.execFileSync(tool("whoami.exe"), ["/user", "/fo", "csv", "/nh"], {
      encoding: "utf8",
      timeout: EXEC_TIMEOUT_MS,
      windowsHide: true,
    });
    const match = String(out).match(/S-1-5-\d+(?:-\d+)+/);
    cachedUserSid = match ? match[0] : null;
  } catch {
    cachedUserSid = null;
  }
  return cachedUserSid;
}

/**
 * Blocking form of protectFile, for call sites that are synchronous today
 * (the journal creates its HMAC key inside a sync read). Costs one short
 * icacls spawn and only ever runs when the secret is first created.
 */
function protectFileSync(filePath, isDirectory = false) {
  if (IS_WINDOWS) {
    const sid = currentUserSidSync();
    if (!sid) return false;
    const s = grantSuffix(isDirectory);
    return runSync(tool("icacls.exe"), [
      filePath,
      "/inheritance:r",
      "/grant:r",
      `*${sid}:${s}`,
      `*${SID.SYSTEM}:${s}`,
      `*${SID.ADMINISTRATORS}:${s}`,
    ]);
  }
  try {
    fs.chmodSync(filePath, isDirectory ? 0o700 : 0o600);
    return true;
  } catch {
    return false;
  }
}

/** Synchronous directory seal, used on cold sync paths. */
function ensureProtectedSync(dirPath) {
  const key = path.resolve(dirPath);
  if (protectedRoots.has(key)) return true;
  const applied = protectFileSync(key, true);
  if (applied) protectedRoots.add(key);
  return applied;
}

// ---- negative-test primitives ----------------------------------------------

/**
 * Make `dir` genuinely unwritable for the current user, using the mechanism the
 * platform actually enforces. On Windows that is an explicit DENY ACE for
 * WriteData/AddFile/CreateDirectories: Windows evaluates DENY before ALLOW, so
 * it wins even though the same user also holds FullControl — which is precisely
 * why `chmod 0o500` has no Windows equivalent in the mode bits.
 */
async function denyChildCreation(dir) {
  if (!IS_WINDOWS) {
    await fsp.chmod(dir, 0o500);
    return { mechanism: "posix-mode", dir };
  }
  const sid = await currentUserSid();
  if (!sid) throw new Error("cannot resolve the current user SID");
  const res = await run(tool("icacls.exe"), [dir, "/deny", `*${sid}:(WD,AD)`]);
  if (!res.ok) throw new Error(`icacls /deny failed: ${(res.stdout + res.stderr).trim()}`);
  return { mechanism: "ntfs-deny-ace", dir };
}

async function allowChildCreation(dir) {
  if (!IS_WINDOWS) {
    await fsp.chmod(dir, 0o700);
    return { mechanism: "posix-mode", dir };
  }
  const sid = await currentUserSid();
  if (!sid) throw new Error("cannot resolve the current user SID");
  const res = await run(tool("icacls.exe"), [dir, "/remove:d", `*${sid}`]);
  if (!res.ok) throw new Error(`icacls /remove:d failed: ${(res.stdout + res.stderr).trim()}`);
  return { mechanism: "ntfs-deny-ace", dir };
}

module.exports = {
  IS_WINDOWS,
  SID,
  BROAD_DENY_LIST,
  WINDOWS_ALLOW_LIST,
  currentUserSid,
  protectFile,
  protectFileSync,
  protectDirectory,
  ensureProtected,
  ensureProtectedSync,
  harden,
  replaceDacl,
  enumerateAcl,
  unexpectedTrustees,
  resetProtectionCache,
  describeAccess,
  isProtected,
  isPermissionDenial,
  protectionStatus,
  denyChildCreation,
  allowChildCreation,
};
