import React, { useCallback, useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { SCREENS } from "../../config/screens";
import { useLanguage } from "../../i18n/Language";
import { useVault } from "../../hooks/useVault";
import { StagEmblem } from "../entry/StagEmblem";
import { CapabilityCard, Mark, PreviewSheet } from "../security/ScreenUI";
import "./workflows.css";

function Frame({ title, icon, children, back = SCREENS.TOOLS, motion = "" }) {
  const { t, locale, dir } = useLanguage();
  return (
    <main className={`workflow-screen ${motion}`} dir={dir} lang={locale}>
      <div className="workflow-shell">
        <Link className="workflow-back" to={back}>
          ‹{" "}
          {t(
            back === SCREENS.SECURE_SHARE
              ? "Back to Secure Share"
              : back === SCREENS.KEY_DETAILS
                ? "Back to Key Details"
                : "Back to Tools",
          )}
        </Link>
        <div className="workflow-hero" aria-hidden="true">
          <span />
          <span />
          <Mark name={icon} />
          <i />
        </div>
        <h1>{t(title)}</h1>
        {children}
      </div>
    </main>
  );
}

function Check({ label, checked, onChange }) {
  const { t } = useLanguage();
  return (
    <label className="workflow-check">
      <span>{t(label)}</span>
      <input type="checkbox" checked={checked} onChange={onChange} />
    </label>
  );
}

/** A locked vault has to say so rather than offering a control that will fail. */
function LockedNotice({ state }) {
  const { t } = useLanguage();
  return (
    <p className="workflow-warning" role="status">
      {t(
        state === "guest"
          ? "Guest preview holds no key, so this operation is unavailable. Unlock the vault to continue."
          : "Unlock the vault to use this service.",
      )}
    </p>
  );
}

function Failure({ error }) {
  const { t } = useLanguage();
  if (!error) return null;
  return (
    <p className="workflow-warning" role="status">
      {t(error.message || "The operation failed")}
      {error.code ? ` (${error.code})` : ""}
    </p>
  );
}

export function EncryptedArchive() {
  const { t } = useLanguage();
  const vault = useVault();
  const [files, setFiles] = useState([]);
  const [compression, setCompression] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [created, setCreated] = useState(null);
  const [sheet, setSheet] = useState(null);
  const locked = vault.state !== "unlocked";

  async function chooseFiles() {
    setError(null);
    const picked = await vault.pickInputFiles({ title: t("Select files to archive") });
    if (picked && !picked.cancelled && picked.paths) setFiles(picked.paths);
  }

  async function createArchive() {
    setError(null);
    setCreated(null);
    if (!files.length) return;
    const target = await vault.pickOutputFile({
      title: t("Where should the archive go?"),
      defaultPath: "archive.knx",
    });
    if (!target || target.cancelled || !target.path) return;
    setBusy(true);
    const res = await vault.archiveCreate({
      inputPaths: files,
      outputPath: target.path,
      compression,
    });
    setBusy(false);
    if (res.ok) {
      setCreated(res.data);
      setSheet("Archive created");
    } else {
      setError(res.error);
    }
  }

  return (
    <Frame
      title="ENCRYPTED ARCHIVE"
      icon="database"
      motion={sheet === "Archive created" ? "workflow-sealing" : ""}
    >
      <section className="workflow-panel" aria-label={t("Selected files")}>
        {files.map((p) => (
          <div className="workflow-file" key={p}>
            <Mark name="file" />
            <span dir="ltr">{p.split(/[\\/]/).pop()}</span>
            <button
              type="button"
              aria-label={`${t("Remove")}: ${p}`}
              onClick={() => setFiles((cur) => cur.filter((f) => f !== p))}
            >
              ×
            </button>
          </div>
        ))}
        {!files.length && <p>{t("No files selected yet.")}</p>}
        <button className="workflow-secondary" type="button" onClick={chooseFiles}>
          {t("Choose files")}
        </button>
      </section>

      <section className="workflow-panel">
        <Check
          label="Compress before encrypting"
          checked={compression}
          onChange={() => setCompression((v) => !v)}
        />
        <button
          className="workflow-row"
          type="button"
          onClick={() => setSheet("How this archive is protected")}
        >
          <Mark name="lock" />
          {t("How this archive is protected")}
          <Mark name="chevron" />
        </button>
        <button
          className="workflow-row"
          type="button"
          onClick={() => setSheet("Open an existing archive")}
        >
          <Mark name="folder" />
          {t("Open an existing archive")}
          <Mark name="chevron" />
        </button>
      </section>

      <button
        type="button"
        className="security-primary"
        disabled={locked || busy || !files.length}
        onClick={createArchive}
      >
        {busy ? t("Creating…") : t("Create Archive")}
        <Mark name="arrow" />
      </button>

      {locked ? (
        <LockedNotice state={vault.state} />
      ) : (
        <p className="workflow-notice">
          {t(
            "Files are zipped in memory, sealed with AES-256-GCM under your vault key and written atomically to the destination you choose.",
          )}
        </p>
      )}
      <Failure error={error} />
      <CapabilityCard id="ARCHIVE" />

      {sheet && (
        <PreviewSheet title={sheet} onClose={() => setSheet(null)}>
          {sheet === "Archive created" && created ? (
            <>
              <p dir="ltr">{created.outputPath}</p>
              <p>
                {created.fileCount} {t("files")} · {t("plaintext")} {created.plaintextSize} B →{" "}
                {t("encrypted")} {created.encryptedSize} B
              </p>
              <code dir="ltr">{created.meta?.plaintextSha256}</code>
            </>
          ) : sheet === "How this archive is protected" ? (
            <>
              <p>
                {t(
                  "The ZIP is built in memory with zlib, then sealed by the vault engine with AES-256-GCM. The header and every chunk are authenticated, so a modified archive fails to open instead of yielding damaged files.",
                )}
              </p>
              <p>
                {t(
                  "On extraction, entry names are validated against directory traversal and an existing file is never overwritten.",
                )}
              </p>
            </>
          ) : (
            <ArchiveOpener vault={vault} onError={setError} />
          )}
        </PreviewSheet>
      )}
    </Frame>
  );
}

/** Decrypt an existing archive and either list it or extract it. */
function ArchiveOpener({ vault, onError }) {
  const { t } = useLanguage();
  const [entries, setEntries] = useState(null);
  const [path, setPath] = useState(null);
  const [note, setNote] = useState("");

  async function pick() {
    onError(null);
    const picked = await vault.pickInputFile();
    if (!picked || picked.cancelled || !picked.path) return;
    setPath(picked.path);
    const res = await vault.archiveInspect(picked.path);
    if (res.ok) setEntries(res.data);
    else onError(res.error);
  }

  async function extract() {
    const dir = await vault.pickDirectory({ title: t("Where should the files go?") });
    if (!dir || dir.cancelled || !dir.path) return;
    const res = await vault.archiveExtract({ inputPath: path, outputDir: dir.path });
    setNote(res.ok ? t("Extracted into the chosen folder.") : "");
    if (!res.ok) onError(res.error);
  }

  return (
    <>
      <button className="security-choice" type="button" onClick={pick}>
        {t("Choose an archive")}
      </button>
      {path && <p dir="ltr">{path}</p>}
      {entries && (
        <>
          <p>
            {entries.fileCount} {t("entries")} · {entries.totalSize} B
          </p>
          <ul>
            {entries.entries.map((e) => (
              <li key={e.name} dir="ltr">
                {e.name} — {e.size} B ({e.method})
              </li>
            ))}
          </ul>
          <button className="security-choice" type="button" onClick={extract}>
            {t("Extract to a folder")}
          </button>
        </>
      )}
      <p role="status">{note}</p>
    </>
  );
}

export function LocalTransfer() {
  const { t } = useLanguage();
  const vault = useVault();
  const [listener, setListener] = useState(null);
  const [requests, setRequests] = useState([]);
  const [files, setFiles] = useState([]);
  const [port, setPort] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState("");
  const locked = vault.state !== "unlocked";

  useEffect(() => {
    const off = vault.onTransferRequest?.((request) => {
      setRequests((cur) =>
        cur.some((r) => r.requestId === request.requestId) ? cur : [...cur, request],
      );
      setStatus(`${t("Incoming request from")} ${request.sender}`);
    });
    return () => {
      if (typeof off === "function") off();
    };
  }, [vault, t]);

  async function startListening() {
    setError(null);
    const res = await vault.transferListen(0);
    if (res.ok) {
      setListener(res.data);
      setStatus(`${t("Listening on")} 127.0.0.1:${res.data.port}`);
    } else {
      setError(res.error);
    }
  }

  async function stopListening() {
    await vault.transferStop();
    setListener(null);
    setRequests([]);
    setStatus(t("Stopped listening."));
  }

  async function respond(requestId, accept) {
    setError(null);
    const res = await vault.transferRespond({ requestId, accept });
    if (!res.ok) setError(res.error);
    setRequests((cur) => cur.filter((r) => r.requestId !== requestId));
  }

  async function chooseFiles() {
    const picked = await vault.pickInputFiles({ title: t("Select files to send") });
    if (picked && !picked.cancelled && picked.paths) setFiles(picked.paths);
  }

  async function send() {
    setError(null);
    setBusy(true);
    const res = await vault.transferSend({
      host: "127.0.0.1",
      port: Number(port),
      code,
      files,
      sender: t("This device"),
    });
    setBusy(false);
    if (res.ok) {
      setStatus(`${t("Delivered")} ${res.data.files} ${t("files")} · ${res.data.bytes} B`);
    } else {
      setError(res.error);
    }
  }

  return (
    <Frame
      title="LOCAL TRANSFER"
      icon="upload"
      back={SCREENS.SECURE_SHARE}
      motion={listener ? "workflow-device-selected" : ""}
    >
      <section className="workflow-panel">
        <h2>{t("Receive")}</h2>
        <p>
          {t(
            "KnouxCrypt only listens on this computer's loopback address. Nothing is exposed to your network.",
          )}
        </p>
        {listener ? (
          <>
            <p dir="ltr">
              127.0.0.1:{listener.port}
            </p>
            <button className="workflow-secondary" type="button" onClick={stopListening}>
              {t("Stop listening")}
            </button>
          </>
        ) : (
          <button
            className="workflow-secondary"
            type="button"
            disabled={locked}
            onClick={startListening}
          >
            {t("Start listening")}
          </button>
        )}
        {requests.map((request) => (
          <div className="workflow-panel" key={request.requestId}>
            <strong>{request.sender}</strong>
            <p>
              {t("Compare this code with the sender:")} <code dir="ltr">{request.code}</code>
            </p>
            <button
              className="security-choice"
              type="button"
              onClick={() => respond(request.requestId, true)}
            >
              {t("Accept")}
            </button>
            <button
              className="security-choice"
              type="button"
              onClick={() => respond(request.requestId, false)}
            >
              {t("Decline")}
            </button>
          </div>
        ))}
      </section>

      <section className="workflow-panel">
        <h2>{t("Send")}</h2>
        <label className="workflow-check">
          <span>{t("Peer port")}</span>
          <input
            dir="ltr"
            inputMode="numeric"
            maxLength={5}
            value={port}
            onChange={(e) => setPort(e.target.value.replace(/\D/g, ""))}
          />
        </label>
        <label className="workflow-check">
          <span>{t("Six-digit code")}</span>
          <input
            dir="ltr"
            inputMode="numeric"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          />
        </label>
        <button className="workflow-secondary" type="button" onClick={chooseFiles}>
          {files.length ? `${files.length} ${t("files selected")}` : t("Choose files to send")}
        </button>
        <button
          className="security-primary"
          type="button"
          disabled={
            locked || busy || !files.length || !/^\d{1,5}$/.test(port) || !/^\d{6}$/.test(code)
          }
          onClick={send}
        >
          {busy ? t("Sending…") : t("Prepare Secure Transfer")}
          <Mark name="arrow" />
        </button>
      </section>

      {locked ? (
        <LockedNotice state={vault.state} />
      ) : (
        <p className="workflow-notice" role="status">
          {status || t("No transfer has been started.")}
        </p>
      )}
      <Failure error={error} />
      <Link className="workflow-link" to={SCREENS.TRANSFER_WIZARD}>
        {t("Transfer Wizard")}
      </Link>
      <CapabilityCard id="LOCAL_TRANSFER" />
    </Frame>
  );
}

export function FingerprintVerify() {
  const { t } = useLanguage();
  const vault = useVault();
  const { state } = useLocation();
  const parent = state?.returnTo === SCREENS.KEY_DETAILS ? SCREENS.KEY_DETAILS : SCREENS.SECURE_SHARE;
  const [keys, setKeys] = useState([]);
  const [selected, setSelected] = useState(null);
  const [pasted, setPasted] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [sheet, setSheet] = useState(null);
  const [copied, setCopied] = useState("");
  const locked = vault.state !== "unlocked";

  useEffect(() => {
    if (locked) return undefined;
    let active = true;
    vault.keyList().then((res) => {
      if (active && res.ok) setKeys(res.data.keys.filter((k) => k.publicPem));
    });
    return () => {
      active = false;
    };
  }, [locked, vault]);

  const loadFingerprint = useCallback(
    async (keyId) => {
      setError(null);
      setResult(null);
      const res = await vault.fingerprintGet({ keyId });
      if (res.ok) {
        setSelected(res.data);
        setSheet("Fingerprint");
      } else {
        setError(res.error);
      }
    },
    [vault],
  );

  async function loadFromFile() {
    setError(null);
    const picked = await vault.pickInputFile();
    if (!picked || picked.cancelled || !picked.path) return;
    const res = await vault.fingerprintGet({ inputPath: picked.path });
    if (res.ok) {
      setSelected(res.data);
      setSheet("Fingerprint");
    } else {
      setError(res.error);
    }
  }

  async function compare() {
    setError(null);
    const res = await vault.fingerprintCompare(selected?.fingerprint || "", pasted);
    if (res.ok) setResult(res.data);
    else setError(res.error);
  }

  async function copy() {
    try {
      if (!navigator.clipboard?.writeText) throw new Error();
      await navigator.clipboard.writeText(selected.fingerprint);
      setCopied(t("Fingerprint copied"));
    } catch {
      setCopied(t("Clipboard unavailable"));
    }
  }

  return (
    <Frame
      title="FINGERPRINT VERIFY"
      icon="key"
      back={parent}
      motion={result ? "workflow-comparing" : ""}
    >
      <StagEmblem className="workflow-fingerprint-stag" />
      <div className="workflow-fingerprint-cards">
        <button className="workflow-panel" type="button" onClick={() => setSheet("Pick a key")}>
          <strong>{t("Local public fingerprint")}</strong>
          <code dir="ltr">
            {selected ? (
              <>
                {selected.groups.slice(0, 4).join(" ")}
                <br />
                {selected.groups.slice(4, 8).join(" ")}
              </>
            ) : (
              t("Choose a key")
            )}
          </code>
        </button>
        <button className="workflow-panel" type="button" onClick={loadFromFile}>
          <strong>{t("Recipient public fingerprint")}</strong>
          <code dir="ltr">{t("Open a key file")}</code>
        </button>
      </div>

      <section className="workflow-panel">
        <label>
          {t("Paste the fingerprint to compare")}
          <input
            dir="ltr"
            maxLength={256}
            value={pasted}
            onChange={(e) => {
              setPasted(e.target.value);
              setResult(null);
            }}
          />
        </label>
        <button
          className="security-primary"
          type="button"
          disabled={!selected || !pasted.trim()}
          onClick={compare}
        >
          {t("Compare Fingerprints")}
          <Mark name="arrow" />
        </button>
        {result && (
          <p className="workflow-notice" role="status">
            {result.equal
              ? t("The fingerprints are identical. This confirms the two keys match.")
              : `${t("The fingerprints differ.")} ${result.matchedGroups}/${result.totalGroups} ${t(
                  "groups matched before the first difference.",
                )}`}
          </p>
        )}
      </section>

      {locked ? <LockedNotice state={vault.state} /> : null}
      <Failure error={error} />
      <CapabilityCard id="FINGERPRINT_VERIFY" />

      {sheet && (
        <PreviewSheet title={sheet} onClose={() => setSheet(null)}>
          {sheet === "Pick a key" ? (
            keys.length ? (
              keys.map((k) => (
                <button
                  className="security-choice"
                  type="button"
                  key={k.id}
                  onClick={() => loadFingerprint(k.id)}
                >
                  {k.name} — {k.algorithm}
                </button>
              ))
            ) : (
              <p>{t("No keys with public material yet. Create one in Key Forge.")}</p>
            )
          ) : (
            <>
              <code className="workflow-public-code" dir="ltr">
                {selected?.grouped}
              </code>
              <button type="button" className="security-choice" onClick={copy}>
                {t("Copy fingerprint")}
              </button>
              <p role="status">{copied}</p>
              <p>
                {t(
                  "SHA-256 over the public key. Matching fingerprints prove the keys are the same; they do not by themselves prove who owns the key.",
                )}
              </p>
            </>
          )}
        </PreviewSheet>
      )}
    </Frame>
  );
}

export const METADATA_GROUPS = Object.freeze(["gps", "dates", "camera", "icc", "xmp"]);

export function MetadataCleaner() {
  const { t } = useLanguage();
  const vault = useVault();
  const [file, setFile] = useState(null);
  const [info, setInfo] = useState(null);
  const [remove, setRemove] = useState(() => new Set(METADATA_GROUPS));
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [sheet, setSheet] = useState(null);

  async function choose() {
    setError(null);
    setResult(null);
    setInfo(null);
    const picked = await vault.pickInputFile();
    if (!picked || picked.cancelled || !picked.path) return;
    setFile(picked.path);
    const res = await vault.metadataInspect(picked.path);
    if (res.ok) setInfo(res.data);
    else setError(res.error);
  }

  function toggle(id) {
    setRemove((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function clean() {
    setError(null);
    setResult(null);
    const target = await vault.pickOutputFile({
      title: t("Where should the clean copy go?"),
      defaultPath: "clean.jpg",
    });
    if (!target || target.cancelled || !target.path) return;
    setBusy(true);
    const res = await vault.metadataClean({
      inputPath: file,
      outputPath: target.path,
      remove: [...remove],
    });
    setBusy(false);
    if (res.ok) {
      setResult(res.data);
      setSheet("Clean copy written");
    } else {
      setError(res.error);
    }
  }

  const gpsPresent = Boolean(info?.groups?.find((g) => g.id === "gps")?.present);

  return (
    <Frame
      title="METADATA CLEANER"
      icon="file"
      motion={result ? "workflow-metadata-change" : ""}
    >
      <section className="workflow-panel">
        <div className="workflow-file">
          <Mark name="photo" />
          <span dir="ltr">{info ? info.name : t("No file chosen")}</span>
          <button type="button" onClick={choose} aria-label={t("Choose a file")}>
            <Mark name="chevron" />
          </button>
        </div>
        {info && (
          <p className="workflow-notice">
            {info.format.toUpperCase()} · {info.size} B ·{" "}
            {info.cleanable
              ? t("metadata can be removed")
              : t("this format cannot be rewritten safely yet")}
          </p>
        )}
        <button className="workflow-secondary" type="button" onClick={choose}>
          {t("Choose a file")}
        </button>
      </section>

      <section className="workflow-panel">
        <h2>{t("Choose metadata to remove")}</h2>
        {METADATA_GROUPS.map((id) => {
          const group = info?.groups?.find((g) => g.id === id);
          return (
            <Check
              key={id}
              label={`${group ? group.label : id}${
                info && !group?.present ? ` (${t("not present")})` : ""
              }`}
              checked={remove.has(id)}
              onChange={() => toggle(id)}
            />
          );
        })}
        {gpsPresent && (
          <p className="workflow-notice">
            {t(
              "GPS, capture dates and camera details all live in the same EXIF block, so removing any one of them removes all three.",
            )}
          </p>
        )}
      </section>

      <button
        className="workflow-secondary"
        type="button"
        onClick={() => setSheet("Supported formats")}
      >
        {t("Supported formats")}
      </button>
      <button
        className="security-primary"
        type="button"
        disabled={busy || !file || !info?.cleanable || remove.size === 0}
        onClick={clean}
      >
        {busy ? t("Writing…") : t("Create Clean Copy")}
        <Mark name="arrow" />
      </button>
      <p className="workflow-warning">
        {t("The original file is only read. The clean copy is written to a new path you choose.")}
      </p>
      <Failure error={error} />
      <CapabilityCard id="METADATA_CLEANER" />

      {sheet && (
        <PreviewSheet title={sheet} onClose={() => setSheet(null)}>
          {sheet === "Clean copy written" && result ? (
            <>
              <p dir="ltr">{result.outputPath}</p>
              <p>
                {result.removedSegments} {t("segments removed")} · {result.originalSize} B →{" "}
                {result.cleanedSize} B
              </p>
              <p>
                {result.removedGroups.length
                  ? `${t("Removed")}: ${result.removedGroups.join(", ")}`
                  : t("Nothing was present to remove.")}
              </p>
            </>
          ) : (
            <p>
              {t(
                "Metadata is removed byte-exactly from JPEG files. No image data is re-encoded, so the picture is unchanged. PNG, WebP and other formats are refused rather than faked.",
              )}
            </p>
          )}
        </PreviewSheet>
      )}
    </Frame>
  );
}
