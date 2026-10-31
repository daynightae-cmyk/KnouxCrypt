import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useVault, VAULT_STATE } from "../../hooks/useVault";

export const NOTE_CATEGORIES = Object.freeze(["Work", "Personal", "Recovery"]);

/**
 * Fallback content for the non-privileged preview only. It is never written to
 * the encrypted store and the UI labels it as preview data, so nothing here can
 * be mistaken for a protected record.
 */
export const SAMPLE_NOTES = Object.freeze([
  {
    id: "project",
    title: "Project Cipher Notes",
    listTitle: "Project Notes",
    body: "Project Cipher Notes\n\nOutline the next design review and check the visual prototype.\n\nUse fictional information only.",
    category: "Work",
    locked: true,
    pinned: true,
    updated: "Today",
    checks: [
      { text: "Review the prototype", done: true },
      { text: "Prepare the next milestone", done: false },
    ],
    format: { bold: false, italic: false, underline: false, list: false },
  },
  {
    id: "journal",
    title: "Private Journal",
    body: "A quiet space for fictional thoughts and ideas.\n\nThis is a visual demo, not encrypted storage.",
    category: "Personal",
    locked: true,
    pinned: false,
    updated: "Yesterday",
    checks: [],
    format: { bold: false, italic: false, underline: false, list: false },
  },
  {
    id: "recovery",
    title: "Recovery Checklist",
    body: "A sample checklist for a fictional recovery plan. Do not enter passwords, recovery codes, or real secrets.",
    category: "Recovery",
    locked: true,
    pinned: false,
    updated: "Yesterday",
    checks: [
      { text: "Review recovery requirements", done: false },
      { text: "Check the sample plan", done: false },
    ],
    format: { bold: false, italic: false, underline: false, list: false },
  },
]);

export function createSampleNotes() {
  return SAMPLE_NOTES.map((note) => ({
    ...note,
    checks: note.checks.map((item) => ({ ...item })),
    format: { ...note.format },
  }));
}

function emptyFormat() {
  return { bold: false, italic: false, underline: false, list: false };
}

/** Normalise a stored record so the UI always sees the same shape. */
function hydrate(record) {
  return {
    id: record.id,
    title: record.title || "Untitled Note",
    listTitle: record.listTitle,
    body: typeof record.body === "string" ? record.body : "",
    category: NOTE_CATEGORIES.includes(record.category) ? record.category : "Personal",
    locked: Boolean(record.locked),
    pinned: Boolean(record.pinned),
    updated: record.updated || "Saved",
    checks: Array.isArray(record.checks)
      ? record.checks.map((c) => ({ text: String(c?.text ?? ""), done: Boolean(c?.done) }))
      : [],
    format: { ...emptyFormat(), ...(record.format || {}) },
  };
}

const NotesContext = createContext(null);

/**
 * Notes live in the vault's encrypted record store whenever a real vault
 * session is unlocked. Outside a session the provider serves the labelled
 * preview set in memory only and never claims it is protected.
 */
export function NotesProvider({ children }) {
  const vault = useVault();
  const persisted = vault.state === VAULT_STATE.UNLOCKED;
  const sessionKey = vault.session?.sessionId ?? null;
  const [notes, setNotes] = useState(createSampleNotes);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const serial = useRef(0);
  // `useVault()` returns a new object on every render, so it must not be an
  // effect dependency. The ref always points at the current bridge client.
  const vaultRef = useRef(vault);
  vaultRef.current = vault;
  // Mirrors the latest notes so updates can be computed and persisted outside
  // the state updater (React may invoke an updater more than once, and a write
  // must not be duplicated).
  const notesRef = useRef(notes);
  notesRef.current = notes;

  useEffect(() => {
    let cancelled = false;
    if (!persisted) {
      setNotes(createSampleNotes());
      setError(null);
      return () => {
        cancelled = true;
      };
    }
    setLoading(true);
    vaultRef.current
      .storeList("notes")
      .then((res) => {
        if (cancelled) return;
        if (res && res.ok === false) {
          setError(res.error?.code || "STORE_ERROR");
          setNotes([]);
        } else {
          setError(null);
          setNotes((res?.data?.records || []).map(hydrate));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError("STORE_ERROR");
          setNotes([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [persisted, sessionKey]);

  const persist = useCallback(
    (record) => {
      if (!persisted) return;
      vaultRef.current.storePut("notes", record).then((res) => {
        if (res && res.ok === false) setError(res.error?.code || "STORE_ERROR");
      });
    },
    [persisted],
  );

  const updateNote = useCallback(
    (id, patch) => {
      const current = notesRef.current;
      const updated = current.find((note) => note.id === id);
      if (!updated) return;
      const next = {
        ...updated,
        ...patch,
        ...(Object.hasOwn(patch, "title") ? { listTitle: undefined } : {}),
      };
      setNotes((list) => list.map((note) => (note.id === id ? next : note)));
      persist(next);
    },
    [persist],
  );

  const createNote = useCallback(() => {
    const id = `note-${Date.now().toString(36)}-${++serial.current}`;
    const record = {
      id,
      title: "Untitled Note",
      body: "",
      category: "Personal",
      locked: false,
      pinned: false,
      updated: "Draft",
      checks: [],
      format: emptyFormat(),
    };
    setNotes((current) => [record, ...current]);
    persist(record);
    return id;
  }, [persist]);

  const removeNote = useCallback(
    (id) => {
      setNotes((current) => current.filter((note) => note.id !== id));
      if (!persisted) return;
      vaultRef.current.storeRemove("notes", id).then((res) => {
        if (res && res.ok === false) setError(res.error?.code || "STORE_ERROR");
      });
    },
    [persisted],
  );

  const value = useMemo(
    () => ({ notes, updateNote, createNote, removeNote, persisted, loading, error }),
    [notes, updateNote, createNote, removeNote, persisted, loading, error],
  );

  return <NotesContext.Provider value={value}>{children}</NotesContext.Provider>;
}

export function useNotes() {
  const value = useContext(NotesContext);
  if (!value) throw new Error("NotesProvider is required");
  return value;
}
