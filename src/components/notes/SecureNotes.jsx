import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { SCREENS } from "../../config/screens";
import { useLanguage } from "../../i18n/Language";
import { StagEmblem } from "../entry/StagEmblem";
import { Mark, PreviewSheet, IconButton, CapabilityCard } from "../security/ScreenUI";
import { NOTE_CATEGORIES, useNotes } from "./NotesContext";
import "./notes.css";

export function SecureNotes() {
  const { t, locale, dir } = useLanguage();
  const { notes, updateNote, createNote } = useNotes();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [sheet, setSheet] = useState(null);
  const [selected, setSelected] = useState(null);
  const visible = [...notes]
    .sort((a, b) => Number(b.pinned) - Number(a.pinned))
    .filter(
      (note) =>
        (category === "All" || note.category === category) &&
        `${note.listTitle || note.title} ${t(note.listTitle || note.title)} ${note.body} ${note.category} ${t(note.category)}`
          .toLocaleLowerCase(locale)
          .includes(query.toLocaleLowerCase(locale)),
    );
  function newNote() {
    navigate(`${SCREENS.NOTES_EDITOR}/${createNote()}`);
  }
  return (
    <main
      className="notes-screen"
      lang={locale}
      dir={dir}
      data-screen="SECURE_NOTES"
    >
      <div className="notes-shell">
        <Link className="notes-back" to={SCREENS.HOME}>
          ‹ {t("Back to Home")}
        </Link>
        <header className="notes-hero">
          <StagEmblem />
          <div className="notes-wordmark" dir="ltr">
            KNOUX <span>CRYPT</span>
          </div>
          <p>{t("Private Encryption Suite")}</p>
        </header>
        <div className="notes-heading">
          <h1>{t("Secure Notes")}</h1>
          <p>{t("Your thoughts. Your secrets. Only yours.")}</p>
        </div>
        <CapabilityCard id="NOTES" />
        <div className="notes-search">
          <Mark name="search" />
          <label className="notes-search-label">
            <span className="notes-sr-only">{t("Search notes")}</span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("Search your notes…")}
              type="search"
            />
          </label>
          <IconButton
            icon="settings"
            label={t("Filter notes")}
            onClick={() => setSheet("Filter notes")}
          />
        </div>
        {category !== "All" && (
          <button
            type="button"
            className="notes-filter-active"
            onClick={() => setCategory("All")}
          >
            {t(category)} ×{" "}
            <span className="notes-sr-only">{t("Clear filter")}</span>
          </button>
        )}
        <section className="notes-list" aria-label={t("Sample notes")}>
          {visible.map((note) => (
            <article className="notes-card" key={note.id}>
              <Link
                to={`${SCREENS.NOTES_EDITOR}/${note.id}`}
                className="notes-card-open"
              >
                <span className="notes-card-icon">
                  <Mark name="file" />
                </span>
                <span className="notes-card-copy">
                  <strong>{t(note.listTitle || note.title)}</strong>
                  <span>
                    {note.id === "project"
                      ? t("Plans, ideas and project details.")
                      : note.id === "journal"
                        ? t("A private space for your thoughts.")
                        : note.id === "recovery"
                          ? t("Important steps, kept together.")
                          : t("In-memory draft only")}
                  </span>
                  <small>
                    <Mark name={note.locked ? "lock" : "unlock"} />
                    {t(note.category)} · {t(note.updated)}
                  </small>
                </span>
              </Link>
              <button
                className="notes-menu"
                type="button"
                aria-label={`${t("Note actions")}: ${t(note.listTitle || note.title)}`}
                onClick={() => {
                  setSelected(note.id);
                  setSheet("Note actions");
                }}
              >
                <Mark name="dots" />
              </button>
            </article>
          ))}
          {!visible.length && (
            <p className="notes-empty" role="status">
              {t("No notes match your search.")}
            </p>
          )}
        </section>
        <button
          className="security-primary notes-new"
          type="button"
          onClick={newNote}
        >
          <span aria-hidden="true">＋</span>
          {t("New Secure Note")}
          <Mark name="arrow" />
        </button>
        <p className="notes-demo-caption">
          {t("Visual demo · fictional notes in memory only")}
        </p>
      </div>
      {sheet && (
        <PreviewSheet title={sheet} onClose={() => setSheet(null)}>
          {sheet === "Note details" ? (
            <p>
              {t(
                "Fictional note in memory only. Lock indicators are visual controls, not verified protection. Reloading resets all changes.",
              )}
            </p>
          ) : sheet === "Filter notes" ? (
            <div
              className="notes-filter-choices"
              role="group"
              aria-label={t("Note categories")}
            >
              {["All", ...NOTE_CATEGORIES].map((value) => (
                <button
                  type="button"
                  key={value}
                  className="security-choice"
                  aria-pressed={category === value}
                  onClick={() => {
                    setCategory(value);
                    setSheet(null);
                  }}
                >
                  {t(value)}
                </button>
              ))}
            </div>
          ) : (
            <>
              <p>
                {t(
                  "Actions change the visual sample only. No encryption or device storage is available.",
                )}
              </p>
              <button
                type="button"
                className="security-choice"
                onClick={() => navigate(`${SCREENS.NOTES_EDITOR}/${selected}`)}
              >
                {t("Open note")}
              </button>
              <button
                type="button"
                className="security-choice"
                onClick={() => {
                  const note = notes.find((n) => n.id === selected);
                  if (note) updateNote(selected, { pinned: !note.pinned });
                  setSheet(null);
                }}
              >
                {t(
                  notes.find((n) => n.id === selected)?.pinned
                    ? "Unpin note"
                    : "Pin note",
                )}
              </button>
              <button
                type="button"
                className="security-choice"
                onClick={() => setSheet("Note details")}
              >
                {t("Details")}
              </button>
            </>
          )}
        </PreviewSheet>
      )}
    </main>
  );
}
