import React, { createContext, useContext, useRef, useState } from "react";

export const NOTE_CATEGORIES = Object.freeze(["Work", "Personal", "Recovery"]);
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
const NotesContext = createContext(null);
export function NotesProvider({ children }) {
  const [notes, setNotes] = useState(createSampleNotes);
  const serial = useRef(0);
  function updateNote(id, patch) {
    setNotes((current) =>
      current.map((note) =>
        note.id === id
          ? {
              ...note,
              ...patch,
              ...(Object.hasOwn(patch, "title")
                ? { listTitle: undefined }
                : {}),
            }
          : note,
      ),
    );
  }
  function createNote() {
    const id = `draft-${++serial.current}`;
    setNotes((current) => [
      {
        id,
        title: "Untitled Note",
        body: "",
        category: "Personal",
        locked: false,
        pinned: false,
        updated: "Draft",
        checks: [],
        format: { bold: false, italic: false, underline: false, list: false },
      },
      ...current,
    ]);
    return id;
  }
  // Deliberately no storage, network, clipboard, encryption, or file APIs.
  return (
    <NotesContext.Provider value={{ notes, updateNote, createNote }}>
      {children}
    </NotesContext.Provider>
  );
}
export function useNotes() {
  const value = useContext(NotesContext);
  if (!value) throw new Error("NotesProvider is required");
  return value;
}
