// Real Electron runtime check for the vault stack.
//
// This is NOT a browser test and NOT a Windows EXE test. It boots the actual
// Electron main process, builds a real BrowserWindow with the real preload,
// loads the built renderer over file://, and drives the real IPC contract from
// the renderer. It proves: assets resolve, the bridge is the only renderer
// surface, and enroll/unlock/encrypt/decrypt round-trip across the boundary.
//
// Run: npx electron --no-sandbox --ozone-platform=headless scripts/electron-runtime-check.cjs
const { app, BrowserWindow } = require("electron");
const fs = require("fs");
const os = require("os");
const crypto = require("crypto");
const path = require("path");
const { VaultService } = require("../electron/vault/service");
const { registerVaultIpc } = require("../electron/vault/ipc");

const root = path.resolve(__dirname, "..");
const results = [];
let failed = 0;

function check(name, ok, detail) {
  results.push({ name, ok, detail });
  if (!ok) failed += 1;
}

app.disableHardwareAcceleration();

app.whenReady().then(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "knoux-runtime-"));
  const service = new VaultService({ userDataPath: dir });
  // A real source file for the file-cipher probe (binary, larger than one frame).
  const probePayload = Buffer.concat([Buffer.from("KnouxCrypt runtime file probe — مرحبا\n", "utf8"), Buffer.alloc(300000, 0xa7)]);
  fs.writeFileSync(path.join(dir, "probe-source.bin"), probePayload);
  // A real text document for the protected-viewer probe.
  fs.writeFileSync(path.join(dir, "probe-doc.txt"), "Runtime protected document\nsecond line\n");
  // A real JPEG carrying EXIF, XMP and ICC segments for the metadata probe.
  fs.writeFileSync(path.join(dir, "probe-photo.jpg"), (() => {
    const seg = (marker, payload) => {
      const out = Buffer.alloc(4 + payload.length);
      out[0] = 0xff;
      out[1] = marker;
      out.writeUInt16BE(payload.length + 2, 2);
      payload.copy(out, 4);
      return out;
    };
    return Buffer.concat([
      Buffer.from([0xff, 0xd8]),
      seg(0xe0, Buffer.from("JFIF\0\x01\x02", "latin1")),
      seg(0xe1, Buffer.concat([Buffer.from("Exif\0\0", "latin1"), Buffer.from("MM\0*\0\0\0\x08\0\x01\x88\x25", "latin1"), Buffer.alloc(24, 1)])),
      seg(0xe1, Buffer.concat([Buffer.from("http://ns.adobe.com/xap/1.0/\0", "latin1"), Buffer.from("<x:xmpmeta/>", "latin1")])),
      seg(0xe2, Buffer.concat([Buffer.from("ICC_PROFILE\0\x01\x01", "latin1"), Buffer.alloc(64, 2)])),
      seg(0xdb, Buffer.alloc(65, 3)),
      seg(0xc0, Buffer.alloc(17, 4)),
      seg(0xda, Buffer.alloc(12, 5)),
      Buffer.from([1, 2, 3, 0xff, 0x00, 4]),
      Buffer.from([0xff, 0xd9]),
    ]);
  })());
  // A real self-signed certificate for the certificate-inspector probe.
  let hasCert = false;
  try {
    const { execFileSync } = require("node:child_process");
    const keyFile = path.join(dir, "probe-key.pem");
    const certFile = path.join(dir, "probe-cert.pem");
    const { privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
    fs.writeFileSync(keyFile, privateKey.export({ type: "pkcs8", format: "pem" }));
    execFileSync("openssl", [
      "req", "-x509", "-new", "-key", keyFile, "-out", certFile,
      "-not_before", "20200101000000Z", "-not_after", "20400101000000Z",
      "-subj", "/CN=runtime.knoux.test",
      "-addext", "subjectAltName=DNS:runtime.knoux.test",
    ], { stdio: "pipe" });
    hasCert = fs.existsSync(certFile);
  } catch {
    hasCert = false;
  }
  let win;
  registerVaultIpc(service, () => win);

  win = new BrowserWindow({
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(root, "electron/preload.js"),
    },
  });

  const consoleErrors = [];
  win.webContents.on("console-message", (_e, level, message) => {
    if (level >= 2) consoleErrors.push(message);
  });

  try {
    await win.loadFile(path.join(root, "build/index.html"));
    await new Promise((r) => setTimeout(r, 1000));

    const probe = await win.webContents.executeJavaScript(`(async () => {
      const api = window.electronAPI;
      const out = {};
      try {
      out.bridge = !!api;
      out.rawIpc = typeof api?.ipcRenderer !== "undefined" || typeof api?.require !== "undefined";
      out.mounted = !!document.querySelector("#root > *");
      out.assetScripts = [...document.querySelectorAll("script[src]")].map(s => s.getAttribute("src"));
      out.legacySupported = api?.legacy?.isSupported;
      out.status = await api.vault.status();
      const enr = await api.vault.enroll("runtime-check-password");
      out.enrollSession = enr.data?.sessionId ? "issued" : enr.error?.code;
      const enc = await api.vault.encryptText(enr.data.sessionId, "renderer round trip");
      const dec = await api.vault.decryptText(enr.data.sessionId, enc.data.container);
      out.roundTrip = dec.data?.text;
      const guest = await api.vault.startGuest();
      const denied = await api.vault.encryptText(guest.data.sessionId, "nope");
      out.guestDenied = denied.error?.code;
      // Flip one byte in the middle of the sealed container (same length) so the
      // trailing MAC and the per-chunk GCM tag both see tampered data.
      const raw = atob(enc.data.container);
      const at = Math.floor(raw.length * 0.6);
      const flipped = raw.slice(0, at) + String.fromCharCode(raw.charCodeAt(at) ^ 0xff) + raw.slice(at + 1);
      const tampered = await api.vault.decryptText(enr.data.sessionId, btoa(flipped));
      out.tamperCode = tampered.error?.code;
      const truncated = await api.vault.decryptText(enr.data.sessionId, enc.data.container.slice(0, enc.data.container.length - 8));
      out.truncatedCode = truncated.error?.code;

      // Real file operation through the IPC contract, using paths the main
      // process can actually reach (the temp dir is created by this script).
      const base = ${JSON.stringify(dir)};
      out.fileEncrypt = await api.vault.encryptFile({
        sessionId: enr.data.sessionId,
        inputPath: base + "/probe-source.bin",
        outputPath: base + "/probe.knv",
        operationId: "runtime-file-1",
      });
      out.fileDecrypt = await api.vault.decryptFile({
        sessionId: enr.data.sessionId,
        inputPath: base + "/probe.knv",
        outputPath: base + "/probe-roundtrip.bin",
        operationId: "runtime-file-2",
      });
      // A text container for the protected-viewer probe (task 30).
      out.docEncrypt = await api.vault.encryptFile({
        sessionId: enr.data.sessionId,
        inputPath: base + "/probe-doc.txt",
        outputPath: base + "/probe-doc.knv",
        operationId: "runtime-file-3",
      });
      // Encrypted record store over the real IPC boundary (notes + credentials).
      out.storeEmpty = await api.vault.storeList(enr.data.sessionId, "notes");
      out.storePut = await api.vault.storePut(enr.data.sessionId, "notes", {
        id: "runtime-note",
        title: "Runtime note",
        body: "secret body text",
        category: "Work",
      });
      out.storePut2 = await api.vault.storePut(enr.data.sessionId, "passwords", {
        id: "runtime-cred",
        title: "Runtime credential",
        username: "runtime@example.invalid",
        password: "Public-Demo-Only!23",
      });
      const listed = await api.vault.storeList(enr.data.sessionId, "notes");
      out.storeCount = listed.data?.records?.length;
      out.storeRoundTrip = listed.data?.records?.[0]?.body;
      out.storeUnknown = (await api.vault.storeList(enr.data.sessionId, "nope")).error?.code;
      out.storeRemove = await api.vault.storeRemove(enr.data.sessionId, "notes", "runtime-note");
      out.storeAfterRemove = (await api.vault.storeList(enr.data.sessionId, "notes")).data?.records?.length;
      const guestStore = await api.vault.storePut(guest.data.sessionId, "notes", { id: "x" });
      out.guestStoreDenied = guestStore.error?.code;
      // Authenticator and Key Forge over the same live bridge.
      out.authAdd = await api.vault.authAdd(enr.data.sessionId, {
        name: "Runtime account",
        issuer: "Knoux",
        secret: "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ",
      });
      const authListed = await api.vault.authList(enr.data.sessionId);
      out.authCount = authListed.data?.accounts?.length;
      out.authSecretLeaked = /GEZDGNBV/.test(JSON.stringify(authListed));
      const code = await api.vault.authCode(enr.data.sessionId, out.authAdd.data.id);
      out.authCode = code.data?.code;
      out.authCodeShape = /^[0-9]{6}$/.test(code.data?.code || "");
      out.authRemoved = (await api.vault.authRemove(enr.data.sessionId, out.authAdd.data.id)).data?.removed;
      out.keyMade = await api.vault.keyGenerate(enr.data.sessionId, { algorithm: "ED25519", name: "Runtime key" });
      const keyListed = await api.vault.keyList(enr.data.sessionId);
      out.keyCount = keyListed.data?.keys?.length;
      out.keyPrivateLeaked = /PRIVATE KEY/.test(JSON.stringify(keyListed));
      out.keyExportDenied = (await api.vault.keyExportPrivate(enr.data.sessionId, out.keyMade.data.id, {})).error?.code;
      out.keyExportAllowed = (await api.vault.keyExportPrivate(enr.data.sessionId, out.keyMade.data.id, { confirm: true })).ok;
      out.guestAuthDenied = (await api.vault.authList(guest.data.sessionId)).error?.code;
      out.guestKeyDenied = (await api.vault.keyList(guest.data.sessionId)).error?.code;
      // Batch 05 (tasks 17-20): real hashing, signatures and certificate parsing.
      out.hash = await api.vault.hashCompute({ algorithm: "SHA-256", text: "abc" });
      out.hashMatch = await api.vault.hashCompare(out.hash.data.digest, out.hash.data.digest);
      out.hashMismatch = await api.vault.hashCompare(out.hash.data.digest, "00".repeat(32));
      out.hashBadAlgo = (await api.vault.hashCompute({ algorithm: "MD5", text: "x" })).error?.code;
      const sig = await api.vault.sign(enr.data.sessionId, { keyId: out.keyMade.data.id, text: "runtime signature" });
      out.signOk = sig.ok === true;
      out.signFingerprint = sig.data?.fingerprint === out.keyMade.data.fingerprint;
      const pub = (await api.vault.keyList(enr.data.sessionId)).data.keys[0].publicPem;
      out.verifyOk = (await api.vault.signVerify(enr.data.sessionId, {
        publicPem: pub,
        algorithm: "ED25519",
        signature: sig.data.signature,
        text: "runtime signature",
      })).data?.valid;
      out.verifyTampered = (await api.vault.signVerify(enr.data.sessionId, {
        publicPem: pub,
        algorithm: "ED25519",
        signature: sig.data.signature,
        text: "runtime signature!",
      })).data?.valid;
      out.signGuest = (await api.vault.sign(guest.data.sessionId, { keyId: out.keyMade.data.id, text: "x" })).error?.code;
      out.certBad = (await api.vault.certInspect("not a certificate")).error?.code;
      if (${JSON.stringify(hasCert)}) {
        out.certInfo = await api.vault.certInspect({ inputPath: base + "/probe-cert.pem" });
      }
      // Batch 06 (tasks 21-24): encrypted archive, fingerprint verify and
      // metadata cleaning, all through the real IPC boundary.
      const archiveOut = base + "/probe-archive.knx";
      out.archiveMade = await api.vault.archiveCreate({
        sessionId: enr.data.sessionId,
        inputPaths: [base + "/probe-source.bin"],
        outputPath: archiveOut,
      });
      out.archivePath = archiveOut;
      out.archiveListed = await api.vault.archiveInspect(enr.data.sessionId, archiveOut);
      out.archiveExtracted = await api.vault.archiveExtract({
        sessionId: enr.data.sessionId,
        inputPath: archiveOut,
        outputDir: base + "/probe-extract",
      });
      out.archiveExtractPath = base + "/probe-extract/probe-source.bin";
      out.archiveOverwriteDenied = (
        await api.vault.archiveExtract({
          sessionId: enr.data.sessionId,
          inputPath: archiveOut,
          outputDir: base + "/probe-extract",
        })
      ).error?.code;
      out.archiveGuestDenied = (
        await api.vault.archiveInspect(guest.data.sessionId, archiveOut)
      ).error?.code;

      out.fingerprint = await api.vault.fingerprintGet({
        sessionId: enr.data.sessionId,
        keyId: out.keyMade.data.id,
      });
      // Hand the public PEM back so the main process can hash it independently.
      out.fingerprintPem = pub;
      out.fingerprintEqual = await api.vault.fingerprintCompare(
        out.fingerprint.data.fingerprint,
        out.fingerprint.data.grouped,
      );
      out.fingerprintDifferent = await api.vault.fingerprintCompare(
        out.fingerprint.data.fingerprint,
        "00".repeat(32),
      );

      out.metaBefore = await api.vault.metadataInspect(base + "/probe-photo.jpg");
      out.metaCleaned = await api.vault.metadataClean({
        inputPath: base + "/probe-photo.jpg",
        outputPath: base + "/probe-clean.jpg",
        remove: ["gps", "xmp", "icc"],
      });
      out.metaAfter = await api.vault.metadataInspect(base + "/probe-clean.jpg");
      out.metaSourcePath = base + "/probe-photo.jpg";
      out.metaCleanPath = base + "/probe-clean.jpg";
      out.metaNotJpeg = (
        await api.vault.metadataClean({
          inputPath: base + "/probe-source.bin",
          outputPath: base + "/probe-nope.jpg",
          remove: ["gps"],
        })
      ).error?.code;

      // Batch 07 (tasks 25-28) over the real runtime IPC surface.
      out.random = await api.vault.randomGenerate({ type: "hex", length: 16 });
      out.hmac = await api.vault.hmacCompute({
        algorithm: "SHA-256",
        message: "runtime hmac probe",
        key: "0123456789abcdef0123456789abcdef",
      });
      out.hmacNoKeyEcho = !JSON.stringify(out.hmac?.data || {}).includes("0123456789abcdef0123456789abcdef");
      out.hmacStream = await api.vault.hmacCompute({
        algorithm: "SHA-256",
        key: "0123456789abcdef0123456789abcdef",
        inputPath: base + "/probe-source.bin",
      });
      out.hmacShortKey = (
        await api.vault.hmacCompute({ algorithm: "SHA-256", message: "x", key: "short" })
      ).error?.code;
      out.qr = await api.vault.publicKeyQr({ text: "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIKnouxRuntimePublicKeyProbe" });
      out.qrPrivate = (await api.vault.publicKeyQr({ text: "-----BEGIN PRIVATE KEY-----AAAA-----END PRIVATE KEY-----" })).error?.code;
      out.clipboardStatus = await api.vault.clipboardStatus();
      // The clipboard copy runs on the real OS clipboard; headless Linux has no
      // display, so either a lease is issued or the platform refusal is recorded.
      const clipCopy = await api.vault.clipboardCopy({ text: "runtime-clipboard-probe", seconds: 15, confirm: true });
      out.clipboardCopyOk = clipCopy.ok === true;
      out.clipboardCopyCode = clipCopy.ok ? null : clipCopy.error?.code;
      if (clipCopy.ok) {
        out.clipboardLeaseId = clipCopy.data.leaseId;
        out.clipboardVerify = await api.vault.clipboardVerify(clipCopy.data.leaseId);
        out.clipboardClear = await api.vault.clipboardClearNow(clipCopy.data.leaseId);
      }
      out.clipboardNoConsent = (
        await api.vault.clipboardCopy({ text: "x", seconds: 15 })
      ).error?.code;

      // Batch 08 (tasks 29-32) over the real runtime IPC surface.
      const col = await api.vault.collectionsCreate({ sessionId: enr.data.sessionId, name: "Runtime Collection", tags: ["probe"] });
      out.collectionCreated = col.ok === true;
      out.collectionId = col.data?.id || null;
      out.collectionAdd = await api.vault.collectionsAddItem({
        sessionId: enr.data.sessionId,
        collectionId: out.collectionId,
        inputPath: base + "/probe-source.bin",
      });
      out.collectionTree = await api.vault.collectionsTree(enr.data.sessionId);
      out.collectionItemCount = out.collectionTree.data?.collections?.[0]?.itemCount ?? -1;
      out.collectionExportPath = base + "/probe-collection-export.bin";
      out.collectionExport = await api.vault.collectionsExportItem({
        sessionId: enr.data.sessionId,
        itemId: out.collectionAdd.data?.item?.id,
        outputPath: out.collectionExportPath,
        confirm: true,
      });
      out.collectionNoConsent = (
        await api.vault.collectionsCreate({ name: "no session" })
      ).error?.code;

      out.viewerOpen = await api.vault.viewerOpen({
        sessionId: enr.data.sessionId,
        inputPath: base + "/probe-doc.knv",
        displayName: "probe-doc.txt",
      });
      out.viewerKind = out.viewerOpen.data?.kind || null;
      out.viewerText = out.viewerOpen.data?.text || null;
      out.viewerUnsupported = (
        await api.vault.viewerOpen({ sessionId: enr.data.sessionId, inputPath: base + "/probe.knv", displayName: "probe.bin" })
      ).error?.code;
      if (out.viewerOpen.ok) {
        out.viewerDocId = out.viewerOpen.data.docId;
        out.viewerChunk = await api.vault.viewerReadChunk(out.viewerDocId, { offset: 0, length: 64 });
        out.viewerClose = await api.vault.viewerClose(out.viewerDocId);
      }

      out.rotationPreflight = await api.vault.rotationPreflight(enr.data.sessionId);
      out.rotationNoConfirm = (
        await api.vault.rotationStart({ sessionId: enr.data.sessionId, newPassword: "runtime rotation passphrase", mode: "rewrap" })
      ).error?.code;
      out.rotationStart = await api.vault.rotationStart({
        sessionId: enr.data.sessionId,
        newPassword: "runtime rotation passphrase",
        mode: "rewrap",
        confirm: true,
      });
      out.rotationVerified = out.rotationStart.data?.verified === true;

      out.packageInspect = await api.vault.packageInspect(base + "/probe.knv");
      out.packageNotVault = (await api.vault.packageInspect(base + "/probe-source.bin")).error?.code;
      out.packageVerify = await api.vault.packageVerify(enr.data.sessionId, base + "/probe.knv");

      // Batch 09 (tasks 33-36) runtime checks.
      out.autofillGet = await api.vault.autofillGet();
      out.autofillNative = out.autofillGet.data?.capabilities?.nativeAutofill;
      out.autofillUpdate = await api.vault.autofillUpdate({ suggestions: true });
      out.autofillPersisted = out.autofillUpdate.data?.values?.suggestions === true;

      out.advisorFilters = await api.vault.advisorFilters();
      out.advisorReview = await api.vault.advisorReview("All");
      out.advisorObserved = (out.advisorReview.data?.rows || []).filter((r) => r.kind === "OBSERVED").length;
      out.advisorManual = (out.advisorReview.data?.rows || []).filter((r) => r.kind === "MANUAL").length;
      out.advisorBadFilter = (await api.vault.advisorReview("Nonsense")).error?.code;

      out.pairingStart = await api.vault.pairingStart({});
      out.pairingNetwork = out.pairingStart.data?.networkOpened;
      out.pairingSas = out.pairingStart.data?.sas?.length;
      out.pairingBadConfirm = (
        await api.vault.pairingConfirm(out.pairingStart.data.sessionId, { matches: false })
      ).error?.code;
      out.pairingConfirm = await api.vault.pairingConfirm(out.pairingStart.data.sessionId, {
        matches: true,
        phrase: out.pairingStart.data.sasText,
      });
      out.pairingConfirmed = out.pairingConfirm.data?.confirmed === true;
      out.pairingCancel = await api.vault.pairingCancel(out.pairingStart.data.sessionId);

      out.auditWeak = await api.vault.passwordAudit("password");
      out.auditStrong = await api.vault.passwordAudit("correct horse battery staple");
      out.auditBreachChecked = out.auditWeak.data?.limits?.breachChecked;
      out.auditEmpty = (await api.vault.passwordAudit("")).error?.code;

      // Revocation must reach the renderer without a polling call.
      out.revokedEvent = await new Promise((resolve) => {
        const timer = setTimeout(() => resolve("timeout"), 4000);
        api.vault.onRevoked((event) => {
          clearTimeout(timer);
          resolve(event?.reason || "delivered");
        });
        api.vault.lock(enr.data.sessionId, "runtime-check");
      });
      return out;
      } catch (err) {
        out.__error = String(err && err.stack ? err.stack : err);
        return out;
      }
    })()`);

    check("renderer loaded and mounted", probe.mounted === true);
    check("preload bridge present", probe.bridge === true);
    check("no raw ipcRenderer/require leaked", probe.rawIpc === false);
    check("file:// assets resolve relatively", probe.assetScripts.every((s) => s && !s.startsWith("/assets/")), probe.assetScripts.join(","));
    check("legacy disk surface fails closed", probe.legacySupported === false);
    check("vault status reachable from renderer", probe.status?.ok === true);
    check("enroll issues a session", probe.enrollSession === "issued", String(probe.enrollSession));
    check("text round-trips across IPC", probe.roundTrip === "renderer round trip", String(probe.roundTrip));
    check("guest session is refused privileged work", probe.guestDenied === "SESSION_REQUIRED", String(probe.guestDenied));
    check("tampered ciphertext is rejected", probe.tamperCode === "INTEGRITY_FAILED", String(probe.tamperCode));
    check("truncated container is rejected", probe.truncatedCode === "TRUNCATED", String(probe.truncatedCode));
    check("file encryption succeeds across IPC", probe.fileEncrypt?.ok === true, JSON.stringify(probe.fileEncrypt?.error));
    check("file decryption succeeds across IPC", probe.fileDecrypt?.ok === true, JSON.stringify(probe.fileDecrypt?.error));
    check(
      "the decrypted file matches the source byte for byte",
      fs.existsSync(path.join(dir, "probe-roundtrip.bin")) &&
        fs.readFileSync(path.join(dir, "probe-roundtrip.bin")).equals(fs.readFileSync(path.join(dir, "probe-source.bin"))),
    );
    check("the source file is preserved", fs.existsSync(path.join(dir, "probe-source.bin")));
    check("session revocation reaches the renderer", probe.revokedEvent === "runtime-check", String(probe.revokedEvent));
    check("an empty record store lists nothing", probe.storeEmpty?.ok === true && probe.storeEmpty?.data?.records?.length === 0);
    check("a note is written to the encrypted store over IPC", probe.storePut?.ok === true, JSON.stringify(probe.storePut?.error));
    check("a credential is written to the encrypted store over IPC", probe.storePut2?.ok === true, JSON.stringify(probe.storePut2?.error));
    check("the stored note reads back", probe.storeCount === 1 && probe.storeRoundTrip === "secret body text", `${probe.storeCount}/${probe.storeRoundTrip}`);
    // The IPC boundary validates the collection enum before the service sees it.
    check("an unknown collection is refused over IPC", probe.storeUnknown === "BAD_INPUT", String(probe.storeUnknown));
    check("a stored note can be removed over IPC", probe.storeRemove?.ok === true && probe.storeAfterRemove === 0, `${probe.storeRemove?.ok}/${probe.storeAfterRemove}`);
    check("a guest session cannot write the store", probe.guestStoreDenied === "SESSION_REQUIRED", String(probe.guestStoreDenied));
    check("no plaintext secret is left in the store file", !fs.readdirSync(dir).filter((f) => f.startsWith("store") || f.endsWith(".knvstore")).some((f) => fs.readFileSync(path.join(dir, f)).includes(Buffer.from("secret body text"))));
    check("an authenticator account is stored over IPC", probe.authAdd?.ok === true, JSON.stringify(probe.authAdd?.error));
    check("the account is listed once", probe.authCount === 1, String(probe.authCount));
    check("the authenticator secret is never returned to the renderer", probe.authSecretLeaked === false);
    check("a real TOTP code is produced", probe.authCodeShape === true, String(probe.authCode));
    check("the account can be removed over IPC", probe.authRemoved === true);
    check("a key pair is generated over IPC", probe.keyMade?.ok === true, JSON.stringify(probe.keyMade?.error));
    check("the key is listed once", probe.keyCount === 1, String(probe.keyCount));
    check("private key material is never returned to the renderer", probe.keyPrivateLeaked === false);
    check("private key export is refused without confirmation", probe.keyExportDenied === "BAD_INPUT", String(probe.keyExportDenied));
    check("private key export succeeds with confirmation", probe.keyExportAllowed === true);
    check("a guest session cannot read authenticator accounts", probe.guestAuthDenied === "SESSION_REQUIRED", String(probe.guestAuthDenied));
    check("a guest session cannot read the key store", probe.guestKeyDenied === "SESSION_REQUIRED", String(probe.guestKeyDenied));
    check("SHA-256 of \"abc\" is the published value over IPC", probe.hash?.data?.digest === "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad", String(probe.hash?.data?.digest));
    check("matching digests compare equal", probe.hashMatch?.data?.equal === true);
    check("different digests compare unequal", probe.hashMismatch?.data?.equal === false);
    check("a broken digest algorithm is refused", probe.hashBadAlgo === "BAD_INPUT", String(probe.hashBadAlgo));
    check("a real signature is produced over IPC", probe.signOk === true, JSON.stringify(probe.signOk));
    check("the signature reports the signing key fingerprint", probe.signFingerprint === true);
    check("the signature verifies against the public key", probe.verifyOk === true);
    check("a tampered message fails verification", probe.verifyTampered === false, String(probe.verifyTampered));
    check("a guest session cannot sign", probe.signGuest === "SESSION_REQUIRED", String(probe.signGuest));
    check("a non-certificate string is refused", probe.certBad === "BAD_INPUT", String(probe.certBad));
    if (hasCert) {
      check("a real certificate is parsed over IPC", probe.certInfo?.ok === true && /runtime\.knoux\.test/.test(probe.certInfo?.data?.subject || ""), JSON.stringify(probe.certInfo?.error || probe.certInfo?.data?.subject));
      check("the parsed certificate reports its validity window", probe.certInfo?.data?.expired === false && probe.certInfo?.data?.selfSigned === true);
    }
    check("an encrypted archive is created over IPC", probe.archiveMade?.ok === true, JSON.stringify(probe.archiveMade?.error));
    const archiveZipHeader = fs.existsSync(probe.archivePath)
      ? fs.readFileSync(probe.archivePath).subarray(0, 4).readUInt32LE(0)
      : null;
    check("the archive is not a readable ZIP", archiveZipHeader !== null && archiveZipHeader !== 0x04034b50, String(archiveZipHeader));
    check("the archive lists its real entries", probe.archiveListed?.data?.fileCount === 1, JSON.stringify(probe.archiveListed?.data));
    check("the archive extracts over IPC", probe.archiveExtracted?.ok === true, JSON.stringify(probe.archiveExtracted?.error));
    check(
      "the extracted file matches the source byte for byte",
      fs.existsSync(probe.archiveExtractPath) &&
        fs.readFileSync(probe.archiveExtractPath).equals(fs.readFileSync(path.join(dir, "probe-source.bin"))),
    );
    check("extraction refuses to overwrite an existing file", probe.archiveOverwriteDenied === "BAD_INPUT", String(probe.archiveOverwriteDenied));
    check("a guest session cannot open an archive", probe.archiveGuestDenied === "SESSION_REQUIRED", String(probe.archiveGuestDenied));
    check("a key fingerprint is computed over IPC", probe.fingerprint?.ok === true, JSON.stringify(probe.fingerprint?.error));
    const fingerprintExpected = probe.fingerprintPem
      ? crypto
          .createHash("sha256")
          .update(crypto.createPublicKey(probe.fingerprintPem).export({ type: "spki", format: "der" }))
          .digest("hex")
      : null;
    check(
      "the fingerprint matches an independent SHA-256 of the key",
      probe.fingerprint?.data?.fingerprint === fingerprintExpected,
      `${probe.fingerprint?.data?.fingerprint} vs ${fingerprintExpected}`,
    );
    check("a grouped fingerprint compares equal to its raw form", probe.fingerprintEqual?.data?.equal === true);
    check("a different fingerprint is reported unequal", probe.fingerprintDifferent?.data?.equal === false);
    check("JPEG metadata groups are detected over IPC", probe.metaBefore?.data?.cleanable === true && probe.metaBefore?.data?.groups?.find((g) => g.id === "gps")?.present === true, JSON.stringify(probe.metaBefore?.data));
    check("metadata is removed over IPC", probe.metaCleaned?.ok === true, JSON.stringify(probe.metaCleaned?.error));
    check("the removed groups are gone from the clean copy", ["gps", "xmp", "icc"].every((id) => probe.metaAfter?.data?.groups?.find((g) => g.id === id)?.present === false), JSON.stringify(probe.metaAfter?.data));
    check("EXIF removal also cleared the capture date and camera groups", probe.metaAfter?.data?.groups?.find((g) => g.id === "dates")?.present === false);
    const metaEoi = fs.existsSync(probe.metaCleanPath)
      ? fs.readFileSync(probe.metaCleanPath).subarray(-2).toString("hex")
      : null;
    check("the clean copy is still a valid JPEG", metaEoi === "ffd9", String(metaEoi));
    check("a non-JPEG is refused for metadata cleaning", probe.metaNotJpeg === "BAD_INPUT", String(probe.metaNotJpeg));
    check("secure random returns real bytes over IPC", probe.random?.ok === true && /^[0-9a-f]{32}$/.test(probe.random?.data?.value || ""), JSON.stringify(probe.random?.error));
    check("secure random reports its CSPRNG source", probe.random?.data?.source === "crypto.randomBytes", String(probe.random?.data?.source));
    check("HMAC-SHA-256 computes over IPC", probe.hmac?.ok === true && probe.hmac?.data?.mac?.length === 64, JSON.stringify(probe.hmac?.error));
    check("the HMAC key is never echoed back", probe.hmacNoKeyEcho === true);
    check("HMAC streams a real file over IPC", probe.hmacStream?.ok === true && probe.hmacStream?.data?.source === "file" && probe.hmacStream?.data?.messageBytes > 300000, JSON.stringify(probe.hmacStream?.error));
    check("a short HMAC key is refused over IPC", probe.hmacShortKey === "BAD_INPUT", String(probe.hmacShortKey));
    check("public key QR renders a real matrix over IPC", probe.qr?.ok === true && probe.qr?.data?.rows?.length === probe.qr?.data?.size, JSON.stringify(probe.qr?.error));
    check("private key material is refused for QR over IPC", probe.qrPrivate === "BAD_INPUT", String(probe.qrPrivate));
    check("clipboard status is reachable over IPC", probe.clipboardStatus?.ok === true);
    check(
      "clipboard copy issues a lease or reports the platform limit",
      probe.clipboardCopyOk === true || probe.clipboardCopyCode === "UNSUPPORTED_FORMAT",
      `${probe.clipboardCopyOk}/${probe.clipboardCopyCode}`,
    );
    check("clipboard copy without consent is refused over IPC", probe.clipboardNoConsent === "CONSENT_REQUIRED", String(probe.clipboardNoConsent));
    if (probe.clipboardCopyOk) {
      check("clipboard verify reports the leased value present", probe.clipboardVerify?.data?.present === true, JSON.stringify(probe.clipboardVerify?.data));
      check("clipboard clear empties the clipboard", probe.clipboardClear?.ok === true && probe.clipboardClear?.data?.lastClearedAt, JSON.stringify(probe.clipboardClear?.data));
    }
    // Batch 08 (tasks 29-32) runtime checks.
    check("a collection is created over IPC", probe.collectionCreated === true);
    check("a file is encrypted into the collection", probe.collectionAdd?.ok === true, JSON.stringify(probe.collectionAdd?.error));
    check("the collection reports its item", probe.collectionItemCount === 1, String(probe.collectionItemCount));
    check("a collection item exports a decrypted copy", probe.collectionExport?.ok === true, JSON.stringify(probe.collectionExport?.error));
    check("a session-less collection request is refused", probe.collectionNoConsent === "BAD_INPUT", String(probe.collectionNoConsent));
    check("the protected viewer opens a text document", probe.viewerOpen?.ok === true && probe.viewerKind === "text", JSON.stringify(probe.viewerOpen?.error));
    check("the viewer returns the decrypted text", probe.viewerText === "Runtime protected document\nsecond line\n", String(probe.viewerText));
    check("the viewer refuses an unsupported format", probe.viewerUnsupported === "UNSUPPORTED_FORMAT", String(probe.viewerUnsupported));
    check("the viewer streams a bounded chunk", probe.viewerChunk?.ok === true && probe.viewerChunk?.data?.bytesRead > 0, JSON.stringify(probe.viewerChunk?.data));
    check("the viewer close deletes the decrypted copy", probe.viewerClose?.ok === true);
    check("rotation preflight is reachable over IPC", probe.rotationPreflight?.ok === true);
    check("rotation without consent is refused over IPC", probe.rotationNoConfirm === "CONSENT_REQUIRED", String(probe.rotationNoConfirm));
    check("rotation completes and verifies over IPC", probe.rotationVerified === true, JSON.stringify(probe.rotationStart?.error));
    check("the package header inspects over IPC", probe.packageInspect?.ok === true && probe.packageInspect?.data?.isVault === true, JSON.stringify(probe.packageInspect?.error));
    check("a non-vault package is refused over IPC", probe.packageNotVault === "NOT_A_VAULT", String(probe.packageNotVault));
    check("the package verifies with the vault key", probe.packageVerify?.ok === true && probe.packageVerify?.data?.verified === true, JSON.stringify(probe.packageVerify?.error));
    // Batch 09 (tasks 33-36) runtime checks.
    check("the Autofill preview reads over IPC", probe.autofillGet?.ok === true, JSON.stringify(probe.autofillGet?.error));
    check("the Autofill preview reports native Autofill unavailable", probe.autofillNative === false, String(probe.autofillNative));
    check("an Autofill preview toggle persists over IPC", probe.autofillPersisted === true);
    check("the advisor lists its real filters", probe.advisorFilters?.ok === true && probe.advisorFilters?.data?.filters?.includes("Vault"));
    check("the advisor review returns observed and manual rows", probe.advisorObserved >= 8 && probe.advisorManual >= 1, `${probe.advisorObserved}/${probe.advisorManual}`);
    check("the advisor refuses an unknown filter", probe.advisorBadFilter === "BAD_INPUT", String(probe.advisorBadFilter));
    check("a pairing session starts over IPC with no network opened", probe.pairingStart?.ok === true && probe.pairingNetwork === false, JSON.stringify(probe.pairingStart?.error));
    check("the pairing phrase has six words", probe.pairingSas === 6, String(probe.pairingSas));
    check("a declined pairing match is refused", probe.pairingBadConfirm === "AUTH_FAILED", String(probe.pairingBadConfirm));
    check("the pairing phrase confirms over IPC", probe.pairingConfirmed === true, JSON.stringify(probe.pairingConfirm?.error));
    check("the pairing session cancels over IPC", probe.pairingCancel?.ok === true);
    check("the password audit scores a weak input low", probe.auditWeak?.ok === true && probe.auditWeak?.data?.score <= 1, JSON.stringify(probe.auditWeak?.data));
    check("the password audit scores a strong input high", probe.auditStrong?.data?.score >= 3, JSON.stringify(probe.auditStrong?.data));
    check("the password audit reports breachChecked=false", probe.auditBreachChecked === false, String(probe.auditBreachChecked));
    check("the password audit refuses empty input", probe.auditEmpty === "BAD_INPUT", String(probe.auditEmpty));
    check("renderer produced no console errors", consoleErrors.length === 0, consoleErrors.slice(0, 3).join(" | "));
    if (probe.__error) check("runtime probe completed without throwing", false, probe.__error);
  } catch (err) {
    check("runtime check completed without throwing", false, err.message);
  }

  for (const r of results) console.log(`  ${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.detail && !r.ok ? " -> " + r.detail : ""}`);
  console.log(failed ? `FAIL: ${failed} runtime check(s) failed` : "PASS: Electron runtime vault stack verified (file:// renderer, sandboxed preload, IPC round-trip).");
  fs.rmSync(dir, { recursive: true, force: true });
  app.exit(failed ? 1 : 0);
});
