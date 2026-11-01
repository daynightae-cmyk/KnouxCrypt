import { useLanguage } from "../../i18n/Language";
import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { SCREENS } from "../../config/screens";
import { ScreenFrame, ScreenHeader, Mark, IconButton, PreviewSheet } from "./ScreenUI";
import { useVault, VAULT_STATE } from "../../hooks/useVault";

const ERROR_COPY = {
  AUTH_FAILED: "Authentication failed: the file is corrupt, was tampered with, or the wrong key was used.",
  INTEGRITY_FAILED: "Integrity check failed. The file does not match its recorded digest.",
  TRUNCATED: "The file is truncated or is not a complete vault container.",
  NOT_A_VAULT: "This file is not a KnouxCrypt vault container.",
  PATH_CONFLICT: "The output file already exists. Choose another destination.",
  NOT_FOUND: "The selected file no longer exists.",
  IO_FAILED: "The operation could not be written to disk.",
  PERMISSION_DENIED: "This user is not allowed to write there. Choose another destination or grant permission in the folder's Security tab.",
  SESSION_REQUIRED: "Unlock the vault before encrypting or decrypting.",
  SESSION_REVOKED: "Your session was revoked. Unlock again to continue.",
  CANCELLED: "Operation cancelled. No output file was written.",
  UNSUPPORTED_FORMAT: "This container format version is not supported.",
  BAD_INPUT: "Check the selected file and destination.",
  UNAVAILABLE: "The vault engine is unavailable in this preview.",
};

const HELP = {
  "Encryption Details": "Files are encrypted with AES-256-GCM in 1 MiB authenticated chunks. The container records the plaintext SHA-256 and carries a trailing HMAC so truncation is detectable.",
  "Recovery Requirements": "You need the vault password (or the device's vault key) to decrypt. Without it the content is unrecoverable; there is no backdoor.",
  "Container Format": "KnouxCrypt vault format KNXVLT01: 96-byte authenticated header, length-prefixed GCM frames, end-of-stream sentinel, and a trailing HMAC-SHA256 over every frame byte.",
  "Key Derivation": "Enrollment uses PBKDF2-HMAC-SHA256 (600,000 iterations) to wrap a random 256-bit vault key, which is then separated into encryption and MAC keys with HKDF-SHA256.",
  "Integrity": "Every chunk is authenticated by its GCM tag, the whole stream is authenticated by a trailing HMAC, and the recovered plaintext is compared against the digest recorded in the header.",
};

function bytes(n) {
  if (typeof n !== "number" || !Number.isFinite(n)) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(2)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function FileCipher() {
  const { t, locale, dir } = useLanguage();
  const vault = useVault();
  const [mode, setMode] = useState("encrypt");
  const [inputPath, setInputPath] = useState(null);
  const [outputPath, setOutputPath] = useState(null);
  const [sheet, setSheet] = useState(null);
  const [result, setResult] = useState(null);
  const operationId = useRef(null);

  const unlocked = vault.state === VAULT_STATE.UNLOCKED;
  const busy = vault.busy;
  const errorMessage = vault.error ? ERROR_COPY[vault.error.code] || vault.error.message : null;
  const percent = vault.progress?.total ? Math.min(100, Math.round((vault.progress.processed / vault.progress.total) * 100)) : 0;

  useEffect(() => {
    if (!vault.progress) return;
    if (vault.progress.processed >= vault.progress.total) setResult((r) => r);
  }, [vault.progress]);

  async function chooseInput() {
    setResult(null);
    const res = await vault.pickInputFile();
    if (res?.ok && !res.data.cancelled && res.data.path) {
      setInputPath(res.data.path);
      setOutputPath(null);
    }
  }

  async function chooseOutput() {
    const res = await vault.pickOutputFile({
      title: mode === "encrypt" ? t("Save encrypted container as") : t("Save decrypted file as"),
      defaultPath: inputPath || undefined,
    });
    if (res?.ok && !res.data.cancelled && res.data.path) setOutputPath(res.data.path);
  }

  async function run() {
    if (!unlocked) {
      setSheet("locked");
      return;
    }
    if (!inputPath || !outputPath) {
      setSheet("needsPaths");
      return;
    }
    setResult(null);
    const id = `${mode}-${Date.now()}`;
    operationId.current = id;
    const payload = { inputPath, outputPath, operationId: id };
    const res = mode === "encrypt" ? await vault.encryptFile(payload) : await vault.decryptFile(payload);
    if (res?.ok) {
      setResult({ ok: true, mode, outputPath: res.data.outputPath, meta: res.data.meta });
    } else {
      setResult({ ok: false, mode, code: res?.error?.code });
    }
  }

  async function cancel() {
    if (operationId.current) await vault.cancel(operationId.current);
  }

  // A path conflict is recoverable: keep the chosen source and offer a new
  // destination instead of forcing the user to start the whole flow again.
  async function resolveConflict() {
    setResult(null);
    await chooseOutput();
  }

  const rows = [
    ["Algorithm", "AES-256-GCM", "Authenticated encryption with 1 MiB streaming chunks.", "shield"],
    ["Key Protection", unlocked ? "Vault key in memory" : "Vault locked", "Keys are derived and held only in the main process.", "key"],
    ["Destination", outputPath ? outputPath : "Choose destination", "Atomic write; existing files are never overwritten silently.", "folder"],
    ["Integrity", "SHA-256 + GCM + HMAC", "Chunk tags, a trailing HMAC, and a plaintext digest.", "shield"],
  ];

  return <ScreenFrame type="cipher-screen">
    <ScreenHeader title={t("FILE")} accent="CIPHER" caption="Encrypt and decrypt with authenticated protection.">
      <IconButton icon="settings" label="File Cipher settings" onClick={() => setSheet("Encryption Details")} />
    </ScreenHeader>

    {!vault.available && <section className="cipher-ready" role="status" data-vault-unavailable>
      <Mark name="info" />
      <div><strong>{t("Vault engine unavailable")}</strong><p>{t("Open the desktop application to encrypt or decrypt real files. Nothing is simulated here.")}</p></div>
    </section>}

    {vault.available && !unlocked && <section className="cipher-ready" role="status" data-vault-locked>
      <Mark name="lock" />
      <div><strong>{t(vault.state === VAULT_STATE.GUEST ? "Guest preview cannot encrypt" : "Vault is locked")}</strong><p>{t("Unlock the vault to enable file encryption and decryption.")}</p></div>
      <Link className="security-choice" to={SCREENS.SECURE_ACCESS_LOGIN} state={{ returnTo: SCREENS.HOME }}>{t("Unlock Vault")}</Link>
    </section>}

    <section className="cipher-file" aria-label={t("Selected file")}>
      {inputPath ? <>
        <button className="cipher-pdf" onClick={chooseInput} aria-label={t("Choose a different file")}><span>{t("FILE")}</span></button>
        <button className="cipher-file-name" dir="ltr" onClick={chooseInput}><strong>{inputPath.split(/[\\/]/).pop()}</strong><span dir="ltr">{inputPath}</span></button>
        <button className="cipher-remove" aria-label={t("Clear selection")} onClick={() => { setInputPath(null); setOutputPath(null); setResult(null); }}>{t("×")}</button>
      </> : <button className="cipher-pick-empty" onClick={chooseInput} disabled={!vault.available}><Mark name="file" />{t("Choose a file")}<small>{t("Opens the system file picker")}</small></button>}
    </section>

    <div className="cipher-modes" role="tablist" aria-label={t("Cipher mode")}>
      {["encrypt", "decrypt"].map((m) => <button key={m} role="tab" aria-selected={mode === m} tabIndex={mode === m ? 0 : -1} className={mode === m ? "active" : ""} data-mode={m} onClick={() => { setMode(m); setResult(null); }}><Mark name={m === "encrypt" ? "lock" : "unlock"} />{t(m.toUpperCase())}</button>)}
    </div>

    <section className="cipher-options" aria-label={t("Encryption configuration")}>
      {rows.map(([label, value, description, icon]) => <button className="cipher-option" key={label} onClick={() => setSheet(label)}>
        <span className="cipher-option-icon"><Mark name={icon} /></span>
        <span className="cipher-option-copy"><small>{t(label)}</small><strong dir={/^AES-|^SHA-|^[A-Za-z]:|^\//.test(value) ? "ltr" : dir}>{t(value)}</strong><span>{t(description)}</span></span>
        <span className="cipher-option-next"><Mark name="chevron" /></span>
      </button>)}
    </section>

    <button className="security-choice" onClick={chooseOutput} disabled={!vault.available}>{t(outputPath ? "Change destination" : "Choose destination")}</button>

    {busy && <section className="cipher-ready" role="status" aria-live="polite" data-cipher-progress={percent}>
      <Mark name="clock" />
      <div><strong>{t(mode === "encrypt" ? "Encrypting…" : "Decrypting…")}</strong><p>{percent}% · {bytes(vault.progress?.processed)} / {bytes(vault.progress?.total)}</p></div>
      <button className="security-choice" onClick={cancel}>{t("Cancel")}</button>
    </section>}

    {errorMessage && <p className="access-error" role="alert" data-cipher-error={vault.error?.code}>{t(errorMessage)}</p>}

    {result?.ok && <section className="cipher-ready" role="status" data-cipher-result="success">
      <Mark name="shield" />
      <div><strong>{t(result.mode === "encrypt" ? "Encrypted successfully" : "Decrypted and verified")}</strong>
        <p dir="ltr">{result.outputPath}</p>
        <p>{t("Original size")}: {bytes(result.meta?.origSize)} · {t("SHA-256")}: <bdi dir="ltr">{(result.meta?.plaintextSha256 || "").slice(0, 16)}…</bdi></p>
      </div>
    </section>}

    {result && !result.ok && <section className="cipher-ready" role="alert" data-cipher-result="failure">
      <Mark name="info" />
      <div><strong>{t("Operation did not complete")}</strong><p>{t(ERROR_COPY[result.code] || "The operation failed.")}</p></div>
      {result.code === "PATH_CONFLICT" && <button className="security-choice" onClick={resolveConflict}>{t("Choose another destination")}</button>}
      {["INTEGRITY_FAILED", "TRUNCATED", "NOT_A_VAULT", "AUTH_FAILED"].includes(result.code) && <button className="security-choice" onClick={() => setResult(null)}>{t("Clear and choose another file")}</button>}
    </section>}

    <button className="security-primary cipher-action" disabled={!vault.available || busy || !inputPath || !outputPath || !unlocked} onClick={run}>
      <Mark name={mode === "encrypt" ? "lock" : "unlock"} />{t(`${mode === "encrypt" ? "Encrypt" : "Decrypt"} File`)}<Mark name="arrow" />
    </button>

    <div className="cipher-help">
      {[["Encryption Details", "How the container works.", "file"], ["Recovery Requirements", "What you need to decrypt.", "help"]].map(([title, caption, icon]) => <button key={title} onClick={() => setSheet(title)}><Mark name={icon} /><span>{t(title)}<small>{t(caption)}</small></span><Mark name="chevron" /></button>)}
    </div>

    {sheet && <PreviewSheet title={t(sheet)} label="DETAILS" dismissLabel="Close" onClose={() => setSheet(null)}>
      {sheet === "Destination" ? <p dir="ltr">{outputPath || t("No destination chosen yet.")}</p>
        : sheet === "Key Protection" ? <p>{t(HELP["Recovery Requirements"])}</p>
          : sheet === "locked" ? <p>{t("Unlock the vault from Secure Access before running a file operation.")}</p>
            : sheet === "needsPaths" ? <p>{t("Choose both a source file and an output destination.")}</p>
              : <p>{t(HELP[sheet] || HELP["Encryption Details"])}</p>}
    </PreviewSheet>}
  </ScreenFrame>;
}
