import React, { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { SCREENS } from "../../config/screens";
import { useLanguage } from "../../i18n/Language";
import { StagEmblem } from "../entry/StagEmblem";
import { Mark, PreviewSheet } from "../security/ScreenUI";
import { NOTE_CATEGORIES, useNotes } from "./NotesContext";
import "./notes.css";

export function NotesEditor() {
  const { t, locale, dir } = useLanguage();
  const { id } = useParams();
  const { notes, updateNote } = useNotes();
  const note = notes.find((n) => n.id === id);
  const [dirty, setDirty] = useState(false);
  const [sheet, setSheet] = useState(null);
  function change(patch) {
    updateNote(id, patch);
    setDirty(true);
  }
  if (!note)
    return (
      <main className="notes-screen" dir={dir} lang={locale}>
        <section className="notes-shell notes-missing">
          <h1>{t("Demo note unavailable")}</h1>
          <p>
            {t(
              "Notes exist only in memory. Reloading resets the fictional samples.",
            )}
          </p>
          <Link to={SCREENS.NOTES}>{t("Back to Notes")}</Link>
        </section>
      </main>
    );
  const format = note.format;
  return (
    <main
      className="notes-screen notes-editor"
      dir={dir}
      lang={locale}
      data-screen="NOTES_EDITOR"
    >
      <div className="notes-shell">
        <header className="notes-editor-hero">
          <StagEmblem />
        </header>
        <Link className="notes-back" to={SCREENS.NOTES}>
          ‹ {t("Back to Notes")}
        </Link>
        <label className="notes-title-label">
          <span className="notes-sr-only">{t("Note title")}</span>
          <input
            className="notes-title-input"
            dir="auto"
            value={note.title}
            onChange={(e) => change({ title: e.target.value.slice(0, 120) })}
            placeholder={t("Untitled Note")}
            aria-label={t("Note title")}
          />
        </label>
        <p className="notes-editor-caption">
          {t("Write freely. Keep it private.")}
        </p>
        <section className="notes-folio" aria-label={t("Editable visual note")}>
          <div
            className="notes-toolbar"
            role="toolbar"
            aria-label={t("Note formatting")}
          >
            {[
              ["bold", "B", "Bold"],
              ["italic", "I", "Italic"],
              ["underline", "U", "Underline"],
              ["list", "☷", "List layout"],
            ].map(([key, glyph, label]) => (
              <button
                type="button"
                key={key}
                aria-label={t(label)}
                aria-pressed={!!format[key]}
                onClick={() =>
                  change({ format: { ...format, [key]: !format[key] } })
                }
                className={format[key] ? "active" : ""}
              >
                {glyph}
              </button>
            ))}
            <button
              type="button"
              aria-label={t("Add checklist item")}
              onClick={() =>
                change({
                  checks: [
                    ...note.checks,
                    { text: t("New checklist item"), done: false },
                  ],
                })
              }
            >
              ☑
            </button>
            <button
              type="button"
              aria-label={t("Attachment preview")}
              onClick={() => setSheet("Attachment preview")}
            >
              <Mark name="file" />
            </button>
          </div>
          <label className="notes-body-label">
            <span className="notes-sr-only">
              {t("Note body — fictional information only")}
            </span>
            <textarea
              dir="auto"
              className={`notes-body ${format.list ? "notes-list-layout" : ""}`}
              style={{
                fontWeight: format.bold ? 600 : 400,
                fontStyle: format.italic ? "italic" : "normal",
                textDecoration: format.underline ? "underline" : "none",
              }}
              value={note.body}
              onChange={(e) => change({ body: e.target.value.slice(0, 10000) })}
              placeholder={t("Write fictional sample text only…")}
              aria-label={t("Note body — fictional information only")}
            />
          </label>
          {note.checks.length > 0 && (
            <div className="notes-checklist" aria-label={t("Local checklist")}>
              {note.checks.map((item, index) => (
                <div className="notes-check-row" key={index}>
                  <input
                    type="checkbox"
                    checked={item.done}
                    onChange={() =>
                      change({
                        checks: note.checks.map((c, i) =>
                          i === index ? { ...c, done: !c.done } : c,
                        ),
                      })
                    }
                    aria-label={`${t("Toggle checklist item")} ${index + 1}`}
                  />
                  <input
                    dir="auto"
                    value={item.text}
                    onChange={(e) =>
                      change({
                        checks: note.checks.map((c, i) =>
                          i === index
                            ? { ...c, text: e.target.value.slice(0, 160) }
                            : c,
                        ),
                      })
                    }
                    aria-label={`${t("Checklist text")} ${index + 1}`}
                  />
                  <button
                    type="button"
                    aria-label={`${t("Remove checklist item")} ${index + 1}`}
                    onClick={() =>
                      change({
                        checks: note.checks.filter((_, i) => i !== index),
                      })
                    }
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
        <button
          className="notes-setting-row"
          type="button"
          onClick={() => setSheet("Category")}
        >
          <span className="notes-setting-icon">
            <Mark name="folder" />
          </span>
          <span>
            <small>{t("Category")}</small>
            <strong>{t(note.category)}</strong>
          </span>
          <Mark name="chevron" />
        </button>
        <div className="notes-setting-row">
          <span className="notes-setting-icon">
            <Mark name="lock" />
          </span>
          <span>
            <strong>{t("Lock Note")}</strong>
            <small>{t("Visual lock only · no encryption")}</small>
          </span>
          <button
            className="notes-switch"
            type="button"
            role="switch"
            aria-label={t("Lock Note")}
            aria-checked={note.locked}
            onClick={() => change({ locked: !note.locked })}
          >
            <i />
          </button>
        </div>
        <p className="notes-save-state" role="status">
          <Mark name="info" />
          {t(dirty ? "Unsaved changes" : "In-memory preview only")}
        </p>
        <button
          className="security-primary notes-save"
          type="button"
          disabled={!note.title.trim()}
          onClick={() => setSheet("Save Note")}
        >
          <Mark name="file" />
          {t("Save Note")}
          <Mark name="arrow" />
        </button>
        <p className="notes-demo-caption">
          {t("Visual demo · fictional notes in memory only")}
        </p>
      </div>
      {sheet && (
        <PreviewSheet title={sheet} onClose={() => setSheet(null)}>
          {sheet === "Category" ? (
            <div role="group" aria-label={t("Note categories")}>
              {NOTE_CATEGORIES.map((value) => (
                <button
                  type="button"
                  key={value}
                  className="security-choice"
                  aria-pressed={note.category === value}
                  onClick={() => {
                    change({ category: value });
                    setSheet(null);
                  }}
                >
                  {t(value)}
                </button>
              ))}
            </div>
          ) : sheet === "Save Note" ? (
            <>
              <p>
                {t(
                  "This is a visual save preview. The draft stays in page memory only; nothing is encrypted, written to disk, or uploaded. Reloading removes your edits.",
                )}
              </p>
              <button
                className="security-choice"
                type="button"
                onClick={() => {
                  updateNote(id, { updated: "Preview updated" });
                  setDirty(false);
                  setSheet(null);
                }}
              >
                {t("Keep in-memory preview")}
              </button>
            </>
          ) : (
            <p>
              {t(
                "Attachments are a visual preview only. No file picker opens and no device files are accessed.",
              )}
            </p>
          )}
        </PreviewSheet>
      )}
    </main>
  );
}
