import React, { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { SCREENS } from "../../config/screens";
import { useLanguage } from "../../i18n/Language";
import { StagEmblem } from "../entry/StagEmblem";
import { Mark, PreviewSheet } from "../security/ScreenUI";
import {
  buildPreviewPassword,
  PASSWORD_CATEGORIES,
  PUBLIC_DEMO_PASSWORD,
  usePasswords,
} from "./PasswordContext";
import "./passwords.css";
function DemoCopy({ value }) {
  const { t } = useLanguage();
  const [status, setStatus] = useState("");
  const timer = useRef();
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      clearTimeout(timer.current);
    };
  }, []);
  async function copy() {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("unavailable");
      await navigator.clipboard.writeText(value);
      if (mounted.current) setStatus("Public demo copied");
    } catch {
      if (mounted.current) setStatus("Clipboard unavailable");
    }
    if (mounted.current) {
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setStatus(""), 2500);
    }
  }
  return (
    <span className="password-copy">
      <button
        type="button"
        onClick={copy}
        aria-label={t("Copy public demo text")}
      >
        <Mark name="file" />
      </button>
      <small role="status">{t(status)}</small>
    </span>
  );
}
function PasswordHeader({ detail = false }) {
  const { t } = useLanguage();
  return (
    <header className="password-header">
      <Link
        to={detail ? SCREENS.PASSWORDS : SCREENS.HOME}
        aria-label={t(detail ? "Back to Passwords" : "Back to Home")}
      >
        <StagEmblem />
      </Link>
      <div>
        <h1>{t(detail ? "Password Vault" : "Passwords")}</h1>
        <p>{t("Your secrets. Under your control.")}</p>
      </div>
    </header>
  );
}
function Generator() {
  const { t } = useLanguage();
  const [length, setLength] = useState(20);
  const [sets, setSets] = useState({
    uppercase: true,
    lowercase: true,
    digits: true,
    symbols: true,
  });
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState("");
  const [count, setCount] = useState(0);
  function generate() {
    const next = revision + 1;
    setRevision(next);
    setResult(buildPreviewPassword(length, sets, next));
    setCount((c) => c + 1);
  }
  return (
    <section
      className="password-generator"
      aria-label={t("Visual password generator")}
    >
      <h2>{t("Generate Password")}</h2><Link to={SCREENS.SECURE_RANDOM}>{t("Secure Random Studio")}</Link>
      <p className="password-demo-label">
        {t("Public visual sample · not for real accounts")}
      </p>
      <label className="password-length">
        {t("Length")} <output>{length}</output>
        <input
          aria-label={t("Password length")}
          type="range"
          min="8"
          max="64"
          value={length}
          onChange={(e) => {
            setLength(Number(e.target.value));
            setResult("");
          }}
        />
      </label>
      <div className="password-sets">
        {[
          ["uppercase", "Uppercase"],
          ["lowercase", "Lowercase"],
          ["digits", "Digits"],
          ["symbols", "Symbols"],
        ].map(([key, label]) => (
          <label key={key}>
            {t(label)}
            <input
              type="checkbox"
              checked={sets[key]}
              onChange={() => {
                setSets({ ...sets, [key]: !sets[key] });
                setResult("");
              }}
            />
          </label>
        ))}
      </div>
      <button
        type="button"
        className="security-primary"
        disabled={!Object.values(sets).some(Boolean)}
        onClick={generate}
      >
        {t("Generate preview")}
        <Mark name="key" />
      </button>
      {result && (
        <div className="password-generated" key={count}>
          <code dir="ltr">{result}</code>
          <DemoCopy value={result} />
        </div>
      )}
      <p className="password-disclaimer">
        {t(
          "This deterministic public sample is not a secure password. No secret is stored or sent.",
        )}
      </p>
    </section>
  );
}
export function Passwords() {
  const { t, locale, dir } = useLanguage();
  const { accounts, selectedId, setSelectedId } = usePasswords();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [revealed, setRevealed] = useState({});
  const [sheet, setSheet] = useState(null);
  const navigate = useNavigate();
  const selected = accounts.find((a) => a.id === selectedId) || accounts[0];
  const visible = accounts.filter(
    (item) =>
      (category === "All" || item.category === category) &&
      `${item.title} ${t(item.title)} ${item.username}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  return (
    <main
      className="password-screen"
      dir={dir}
      lang={locale}
      data-screen="PASSWORDS"
    >
      <div className="password-shell">
        <PasswordHeader />
        <div className="password-search">
          <Mark name="search" />
          <input
            aria-label={t("Search passwords")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("Search your vault…")}
          />
          <button
            type="button"
            onClick={() => setSheet("Filter credentials")}
            aria-label={t("Filter credentials")}
          >
            <Mark name="settings" />
          </button>
        </div>
        <div
          className="password-categories"
          aria-label={t("Credential categories")}
        >
          {PASSWORD_CATEGORIES.map((value) => (
            <button
              type="button"
              aria-pressed={value === category}
              key={value}
              onClick={() => setCategory(value)}
            >
              {t(value)}
            </button>
          ))}
        </div>
        <section
          className="password-records"
          aria-label={t("Public sample credentials")}
        >
          {visible.map((item, index) => (
            <article
              className={`password-record ${selectedId === item.id ? "selected" : ""}`}
              key={item.id}
            >
              <button
                className="password-record-select"
                onClick={() => setSelectedId(item.id)}
                type="button"
                aria-expanded={selectedId === item.id}
              >
                <span className="password-record-symbol">
                  {index % 2 ? <Mark name="key" /> : <Mark name="shield" />}
                </span>
                <span>
                  <strong>{t(item.title)}</strong>
                  <small dir="ltr">{item.username}</small>
                  <code dir="ltr">
                    {revealed[item.id] ? PUBLIC_DEMO_PASSWORD : "••••••••••••"}
                  </code>
                </span>
              </button>
              <div className="password-record-actions">
                <button
                  type="button"
                  aria-label={`${t(revealed[item.id] ? "Hide sample password" : "Reveal sample password")}: ${t(item.title)}`}
                  aria-pressed={!!revealed[item.id]}
                  onClick={() =>
                    setRevealed({ ...revealed, [item.id]: !revealed[item.id] })
                  }
                >
                  <Mark name={revealed[item.id] ? "unlock" : "lock"} />
                </button>
                <DemoCopy value={PUBLIC_DEMO_PASSWORD} />
              </div>
            </article>
          ))}
          {!visible.length && (
            <p role="status" className="password-disclaimer">
              {t("No sample credentials match.")}
            </p>
          )}
        </section>
        <div className="password-main-actions">
          <button type="button" onClick={() => setSheet("Generate Password")}>
            <Mark name="key" />
            {t("Generate Password")}
          </button>
          <button type="button" onClick={() => setSheet("Add Secret")}>
            <span>＋</span>
            {t("Add Secret")}
          </button>
        </div>
        <section className="password-expanded">
          <h2>{t(selected.title)}</h2>
          <p dir="ltr">{selected.username}</p>
          <p>{t("Selected fictional record · no real credentials")}</p>
          <button
            type="button"
            className="security-primary"
            onClick={() =>
              navigate(`${SCREENS.PASSWORD_DETAIL}/${selected.id}`)
            }
          >
            {t("View Details")}
            <Mark name="chevron" />
          </button>
        </section>
        <p className="password-disclaimer">
          {t(
            "Use fictional data only. No password manager or encryption is active.",
          )}
        </p>
      </div>
      {sheet && (
        <PreviewSheet title={sheet} onClose={() => setSheet(null)}>
          {sheet === "Generate Password" ? (
            <Generator />
          ) : sheet === "Filter credentials" ? (
            <>
              {PASSWORD_CATEGORIES.map((value) => (
                <button
                  type="button"
                  className="security-choice"
                  key={value}
                  aria-pressed={category === value}
                  onClick={() => {
                    setCategory(value);
                    setSheet(null);
                  }}
                >
                  {t(value)}
                </button>
              ))}
            </>
          ) : (
            <>
              <p>
                {t(
                  "Add Secret is a local draft preview. Edit the fictional example account only; never enter real credentials.",
                )}
              </p>
              <button
                type="button"
                className="security-choice"
                onClick={() => navigate(`${SCREENS.PASSWORD_DETAIL}/sample-1`)}
              >
                {t("Open sample draft")}
              </button>
            </>
          )}
        </PreviewSheet>
      )}
    </main>
  );
}
export function PasswordDetail() {
  const { t, locale, dir } = useLanguage();
  const { id } = useParams();
  const { accounts, updateAccount, setSelectedId } = usePasswords();
  const note = accounts.find((a) => a.id === id);
  const [reveal, setReveal] = useState(false);
  const [editing, setEditing] = useState(false);
  const [sheet, setSheet] = useState(null);
  useEffect(() => {
    if (note) setSelectedId(note.id);
  }, [id, setSelectedId, note]);
  if (!note)
    return (
      <main className="password-screen" dir={dir} lang={locale}>
        <div className="password-shell">
          <h1>{t("Sample account unavailable")}</h1>
          <Link to={SCREENS.PASSWORDS}>{t("Back to Passwords")}</Link>
        </div>
      </main>
    );
  return (
    <main
      className="password-screen"
      dir={dir}
      lang={locale}
      data-screen="PASSWORD_DETAIL"
    >
      <div className="password-shell">
        <PasswordHeader detail />
        <Link className="password-back" to={SCREENS.PASSWORDS}>
          ‹ {t("Back to Passwords")}
        </Link>
        <section className="password-detail-card">
          <div className="password-detail-top">
            <Mark name="shield" />
            <h2>{t(note.title)}</h2>
            <button
              type="button"
              aria-label={t("Password tools")}
              onClick={() => setSheet("Password tools")}
            >
              <Mark name="dots" />
            </button>
          </div>
          <p className="password-demo-label">{t("Public sample account")}</p>
          <label>
            {t("Account name")}
            <input
              dir="auto"
              value={note.title}
              readOnly={!editing}
              onChange={(e) =>
                updateAccount(id, { title: e.target.value.slice(0, 80) })
              }
            />
          </label>
          <label>
            {t("Username")}
            <input
              dir="ltr"
              value={note.username}
              readOnly={!editing}
              onChange={(e) =>
                updateAccount(id, { username: e.target.value.slice(0, 100) })
              }
            />
          </label>
          <div className="password-detail-secret">
            <span>{t("Password")}</span>
            <div>
              <input
                dir="ltr"
                type={reveal ? "text" : "password"}
                value={PUBLIC_DEMO_PASSWORD}
                readOnly
                aria-label={t("Public sample password")}
              />
              <button
                type="button"
                aria-pressed={reveal}
                aria-label={t(
                  reveal ? "Hide sample password" : "Reveal sample password",
                )}
                onClick={() => setReveal(!reveal)}
              >
                <Mark name={reveal ? "unlock" : "lock"} />
              </button>
              <DemoCopy value={PUBLIC_DEMO_PASSWORD} />
            </div>
          </div>
          <label>
            {t("Website")}
            <input dir="ltr" value={note.website} readOnly />
          </label>
          <button
            className="security-choice"
            type="button"
            aria-pressed={editing}
            onClick={() => setEditing(!editing)}
          >
            {t(editing ? "Finish sample edit" : "Edit sample")}
          </button>
          <p className="password-disclaimer">
            {t(
              "Use fictional data only. No password manager or encryption is active.",
            )}
          </p>
        </section>
        <Generator />
      </div>
      {sheet && (
        <PreviewSheet title={sheet} onClose={() => setSheet(null)}>
          <p>{t("Autofill and security checks are visual previews only.")}</p>
          <Link to={SCREENS.AUTOFILL}>{t("Autofill settings preview")}</Link>
          <Link to={SCREENS.PASSWORD_AUDIT}>{t("Password audit preview")}</Link>
        </PreviewSheet>
      )}
    </main>
  );
}
