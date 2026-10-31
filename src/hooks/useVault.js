import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Client for the Electron vault bridge.
 *
 * Everything here is honest about capability: when the privileged vault
 * process is unavailable (a plain browser / static preview) `available` is
 * false and no action will pretend to succeed.
 */
function bridge() {
  if (typeof window === "undefined") return null;
  return window.electronAPI?.vault || null;
}

export const VAULT_STATE = Object.freeze({
  UNAVAILABLE: "unavailable",
  UNENROLLED: "unenrolled",
  LOCKED: "locked",
  UNLOCKED: "unlocked",
  GUEST: "guest",
  ERROR: "error",
});

export function useVault() {
  const api = bridge();
  const available = !!api;
  const [status, setStatus] = useState(null);
  const [session, setSession] = useState(null); // { sessionId, guest }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [progress, setProgress] = useState(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    if (!api) return null;
    const res = await api.status();
    if (mounted.current && res?.ok) setStatus(res.data);
    return res;
  }, [api]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!api?.onProgress) return undefined;
    return api.onProgress((p) => {
      if (mounted.current) setProgress(p);
    });
  }, [api]);

  // A session can end without the renderer asking: idle auto-lock, the tray
  // "lock now" action, or a quit. Drop the local session as soon as the main
  // process reports it so no screen keeps operating on a dead session id.
  useEffect(() => {
    if (!api?.onRevoked) return undefined;
    return api.onRevoked((event) => {
      if (!mounted.current) return;
      setSession((current) => {
        if (!current) return current;
        if (event?.sessionId && event.sessionId !== current.sessionId) return current;
        setError({ code: "SESSION_REVOKED", message: "Your vault session ended. Unlock again to continue." });
        return null;
      });
      refresh();
    });
  }, [api, refresh]);

  const run = useCallback(
    async (fn) => {
      if (!api) {
        setError({ code: "UNAVAILABLE", message: "The vault engine is not available in this preview." });
        return { ok: false, error: { code: "UNAVAILABLE" } };
      }
      setBusy(true);
      setError(null);
      try {
        const res = await fn(api);
        if (!res?.ok) {
          if (mounted.current) setError(res?.error || { code: "UNKNOWN", message: "Vault operation failed" });
        }
        return res;
      } finally {
        if (mounted.current) setBusy(false);
      }
    },
    [api],
  );

  const enroll = useCallback(
    async (password, options) => {
      const res = await run((a) => a.enroll(password, options));
      if (res?.ok) {
        setSession({ sessionId: res.data.sessionId, guest: false, name: res.data.name });
        await refresh();
      }
      return res;
    },
    [run, refresh],
  );

  const unlock = useCallback(
    async (password) => {
      const res = await run((a) => a.unlock(password));
      if (res?.ok) {
        setSession({ sessionId: res.data.sessionId, guest: false, name: res.data.name });
        await refresh();
      }
      return res;
    },
    [run, refresh],
  );

  const startGuest = useCallback(async () => {
    const res = await run((a) => a.startGuest());
    if (res?.ok) {
      setSession({ sessionId: res.data.sessionId, guest: true, name: "Guest preview" });
      await refresh();
    }
    return res;
  }, [run, refresh]);

  const lock = useCallback(async () => {
    if (session && api) await api.lock(session.sessionId, "user");
    setSession(null);
    await refresh();
  }, [session, api, refresh]);

  const lockAll = useCallback(async () => {
    if (api) await api.lockAll("user");
    setSession(null);
    await refresh();
  }, [api, refresh]);

  const encryptText = useCallback(
    (text) => run((a) => a.encryptText(session?.sessionId, text)),
    [run, session],
  );

  const decryptText = useCallback(
    (container) => run((a) => a.decryptText(session?.sessionId, container)),
    [run, session],
  );

  const pickInputFile = useCallback(() => (api ? api.pickInputFile() : null), [api]);
  const pickOutputFile = useCallback((options) => (api ? api.pickOutputFile(options) : null), [api]);
  const inspect = useCallback((inputPath) => run((a) => a.inspect(inputPath)), [run]);

  const encryptFile = useCallback(
    (payload) => run((a) => a.encryptFile({ ...payload, sessionId: session?.sessionId })),
    [run, session],
  );
  const decryptFile = useCallback(
    (payload) => run((a) => a.decryptFile({ ...payload, sessionId: session?.sessionId })),
    [run, session],
  );
  const cancel = useCallback((operationId) => (api ? api.cancel(operationId) : null), [api]);

  const storeList = useCallback(
    (collection) => run((a) => a.storeList(session?.sessionId, collection)),
    [run, session],
  );
  const storePut = useCallback(
    (collection, record) => run((a) => a.storePut(session?.sessionId, collection, record)),
    [run, session],
  );
  const storeRemove = useCallback(
    (collection, id) => run((a) => a.storeRemove(session?.sessionId, collection, id)),
    [run, session],
  );
  const storeClear = useCallback(
    (collection) => run((a) => a.storeClear(session?.sessionId, collection)),
    [run, session],
  );

  // Tasks 09-12: authenticator and key forge. These are deliberately not routed
  // through `run` so the caller decides how a failure surfaces (a wrong code is
  // an expected outcome, not a screen-level error).
  const authAdd = useCallback(
    (account) => (api ? api.authAdd(session?.sessionId, account) : { ok: false, error: { code: "UNAVAILABLE" } }),
    [api, session],
  );
  const authList = useCallback(
    () => (api ? api.authList(session?.sessionId) : { ok: false, error: { code: "UNAVAILABLE" } }),
    [api, session],
  );
  const authCode = useCallback(
    (id) => (api ? api.authCode(session?.sessionId, id) : { ok: false, error: { code: "UNAVAILABLE" } }),
    [api, session],
  );
  const authRemove = useCallback(
    (id) => (api ? api.authRemove(session?.sessionId, id) : { ok: false, error: { code: "UNAVAILABLE" } }),
    [api, session],
  );
  const authParseUri = useCallback(
    (uri) => (api ? api.authParseUri(session?.sessionId, uri) : { ok: false, error: { code: "UNAVAILABLE" } }),
    [api, session],
  );
  const keyGenerate = useCallback(
    (request) => run((a) => a.keyGenerate(session?.sessionId, request)),
    [run, session],
  );
  const keyList = useCallback(
    () => (api ? api.keyList(session?.sessionId) : { ok: false, error: { code: "UNAVAILABLE" } }),
    [api, session],
  );
  const keyExportPrivate = useCallback(
    (id, options) => run((a) => a.keyExportPrivate(session?.sessionId, id, options)),
    [run, session],
  );
  const keyRemove = useCallback(
    (id) => run((a) => a.keyRemove(session?.sessionId, id)),
    [run, session],
  );
  const keyGet = useCallback(
    (id) => (api ? api.keyGet(session?.sessionId, id) : { ok: false, error: { code: "UNAVAILABLE" } }),
    [api, session],
  );
  const keyUpdate = useCallback(
    (id, patch) => run((a) => a.keyUpdate(session?.sessionId, id, patch)),
    [run, session],
  );
  const backupCreate = useCallback(
    (options) => run((a) => a.backupCreate(session?.sessionId, options)),
    [run, session],
  );
  const backupList = useCallback(
    () => (api ? api.backupList(session?.sessionId) : { ok: false, error: { code: "UNAVAILABLE" } }),
    [api, session],
  );
  const backupInspect = useCallback(
    (id) => (api ? api.backupInspect(session?.sessionId, id) : { ok: false, error: { code: "UNAVAILABLE" } }),
    [api, session],
  );
  const backupRestore = useCallback(
    (id, confirm) => run((a) => a.backupRestore(session?.sessionId, id, confirm)),
    [run, session],
  );
  const backupRemove = useCallback(
    (id) => run((a) => a.backupRemove(session?.sessionId, id)),
    [run, session],
  );
  const shareCreate = useCallback(
    (request) => run((a) => a.shareCreate(session?.sessionId, request)),
    [run, session],
  );
  const shareInspect = useCallback(
    (envelope) => (api ? api.shareInspect(session?.sessionId, envelope) : { ok: false, error: { code: "UNAVAILABLE" } }),
    [api, session],
  );
  const shareOpen = useCallback(
    (envelope, credential) => run((a) => a.shareOpen(session?.sessionId, envelope, credential)),
    [run, session],
  );
  const preferencesGet = useCallback(
    () => (api ? api.preferencesGet() : { ok: false, error: { code: "UNAVAILABLE" } }),
    [api],
  );
  const preferencesUpdate = useCallback(
    (patch) => run((a) => a.preferencesUpdate(patch)),
    [run],
  );
  const hashCompute = useCallback(
    (request) => (api ? api.hashCompute(request) : { ok: false, error: { code: "UNAVAILABLE" } }),
    [api],
  );
  const hashCompare = useCallback(
    (left, right) => (api ? api.hashCompare(left, right) : { ok: false, error: { code: "UNAVAILABLE" } }),
    [api],
  );
  const sign = useCallback(
    (request) => run((a) => a.sign(session?.sessionId, request)),
    [run, session],
  );
  const signVerify = useCallback(
    (request) => (api ? api.signVerify(session?.sessionId, request) : { ok: false, error: { code: "UNAVAILABLE" } }),
    [api, session],
  );
  const certInspect = useCallback(
    (pem) => (api ? api.certInspect(pem) : { ok: false, error: { code: "UNAVAILABLE" } }),
    [api],
  );
  const certInspectFile = useCallback(
    (inputPath) => (api ? api.certInspect({ inputPath }) : { ok: false, error: { code: "UNAVAILABLE" } }),
    [api],
  );

  const state = !available
    ? VAULT_STATE.UNAVAILABLE
    : session?.guest
      ? VAULT_STATE.GUEST
      : session
        ? VAULT_STATE.UNLOCKED
        : status?.enrolled
          ? VAULT_STATE.LOCKED
          : VAULT_STATE.UNENROLLED;

  return {
    available,
    state,
    status,
    session,
    busy,
    error,
    progress,
    refresh,
    enroll,
    unlock,
    startGuest,
    lock,
    lockAll,
    encryptText,
    decryptText,
    encryptFile,
    decryptFile,
    pickInputFile,
    pickOutputFile,
    inspect,
    cancel,
    storeList,
    storePut,
    storeRemove,
    storeClear,
    authAdd,
    authList,
    authCode,
    authRemove,
    authParseUri,
    keyGenerate,
    keyList,
    keyExportPrivate,
    keyRemove,
    keyGet,
    keyUpdate,
    backupCreate,
    backupList,
    backupInspect,
    backupRestore,
    backupRemove,
    shareCreate,
    shareInspect,
    shareOpen,
    preferencesGet,
    preferencesUpdate,
    hashCompute,
    hashCompare,
    sign,
    signVerify,
    certInspect,
    certInspectFile,
  };
}

export default useVault;
