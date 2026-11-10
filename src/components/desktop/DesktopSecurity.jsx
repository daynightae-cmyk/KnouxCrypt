import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { SCREENS } from '../../config/screens';
import { useLanguage } from '../../i18n/Language';
import { usePasswords, PASSWORD_CATEGORIES } from '../passwords/PasswordContext';
import { useVault, VAULT_STATE } from '../../hooks/useVault';

// Honest session label shared by the security screens.
export function stateLabel(unlocked, vault) {
  if (!vault.available) return { cls: 'warn', label: 'Vault engine unavailable' };
  if (unlocked) return { cls: 'ok', label: 'Vault unlocked' };
  if (vault.state === VAULT_STATE.LOCKED) return { cls: 'warn', label: 'Vault locked' };
  if (vault.state === VAULT_STATE.UNENROLLED) return { cls: 'warn', label: 'Vault not enrolled' };
  if (vault.state === VAULT_STATE.GUEST) return { cls: '', label: 'Guest session' };
  return { cls: '', label: 'Unknown state' };
}
import { Mark } from '../security/ScreenUI';
import { Panel, PageHeading, StagBanner } from './DesktopWorkspace';
import { KnouxServiceIcon } from '../icons/KnouxServiceIcon';

/* ============ PASSWORD MANAGER ============ */
export function DesktopPasswords() {
  const { t } = useLanguage();
  const { accounts, selectedId, setSelectedId, updateAccount, createAccount, removeAccount, persisted } = usePasswords();
  const [category, setCategory] = useState('All');
  const [query, setQuery] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [sortBy, setSortBy] = useState('title');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(null);
  const [copyNote, setCopyNote] = useState(null);

  const selected = accounts.find(a => a.id === selectedId);

  // Local strength estimate — an approximation over the stored value only.
  const estimate = pw => {
    if (!pw || typeof pw !== 'string') return { score: 'weak', bits: 0 };
    const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^a-zA-Z0-9]/].filter(rx => rx.test(pw)).length;
    const bits = Math.min(100, pw.length * 4.5 + (classes - 1) * 6);
    return { score: bits >= 80 ? 'strong' : bits >= 55 ? 'medium' : 'weak', bits: Math.round(bits) };
  };
  const reusedCount = fp => accounts.filter(a => a.password === fp).length;

  const visible = useMemo(() =>
    accounts
      .filter(a => (category === 'All' || a.category === category) && `${a.title} ${a.username} ${a.website}`.toLowerCase().includes(query.toLowerCase()))
      .sort((a, b) => String(a[sortBy] ?? '').localeCompare(String(b[sortBy] ?? ''))),
    [accounts, category, query, sortBy]
  );

  const stats = useMemo(() => ({
    total: accounts.length,
    categories: new Set(accounts.map(a => a.category)).size,
    weak: accounts.filter(a => estimate(a.password).score === 'weak').length,
    reused: new Set(accounts.filter(a => reusedCount(a.password) > 1).map(a => a.id)).size,
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [accounts]);

  const vault = useVault();

  async function copySelected() {
    if (!selected) return;
    if (!vault.available || !persisted) {
      setCopyNote({ kind: 'warn', text: t('Copy requires an unlocked vault session.') });
      return;
    }
    const res = await vault.clipboardCopy({ text: selected.password, seconds: 20, confirm: true });
    setCopyNote(res?.ok
      ? { kind: 'ok', text: t('Password armed in secure clipboard · clears in 20s') }
      : { kind: 'warn', text: t(res?.error?.message || 'Clipboard copy failed.') });
  }

  function startEdit() {
    if (!selected) return;
    setEditing(true);
    setRevealed(true);
    setDraft({ title: selected.title, username: selected.username, website: selected.website, category: selected.category, password: selected.password });
  }

  return (
    <main className="dw-page" data-screen="PASSWORDS">
      <PageHeading
        title={t('PASSWORD MANAGER')}
        caption={t('Encrypted credential vault · Zero-knowledge architecture')}
      >
        <button className="dw-primary" style={{ fontSize: '12px', padding: '8px 14px' }} onClick={createAccount}>
          <Mark name="plus" /> {t('New Credential')}
        </button>
        <Link to={SCREENS.AUTOFILL} className="dw-primary" style={{ fontSize: '12px', padding: '8px 14px' }}>
          <Mark name="shield" /> {t('Autofill Setup')}
        </Link>
        <Link to={SCREENS.PASSWORD_AUDIT} className="dw-primary" style={{ fontSize: '12px', padding: '8px 14px' }}>
          <Mark name="alert" /> {t('Security Audit')}
        </Link>
      </PageHeading>

      <div className="dw-split">
        <div className="dw-main-column">
          {/* Stats Grid */}
          <div className="dw-stats-grid">
            <Panel title={t('Total Entries')}><strong>{stats.total}</strong></Panel>
            <Panel title={t('Categories')}><strong>{stats.categories}</strong></Panel>
            <Panel title={t('Weak Passwords')}><strong className="dw-badge warn">{stats.weak}</strong></Panel>
            <Panel title={t('Reused')}><strong className="dw-badge warn">{stats.reused}</strong></Panel>
          </div>

          {/* Filters */}
          <div className="dw-filter-row">
            <input
              type="search"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={t('Search passwords, websites, or notes…')}
              aria-label={t('Search passwords')}
            />
            <div className="dw-segments" style={{ flexWrap: 'wrap', gap: '6px' }}>
              {['All', ...PASSWORD_CATEGORIES].map(c => (
                <button
                  key={c}
                  aria-pressed={category === c}
                  onClick={() => setCategory(c)}
                  style={{ fontSize: '11px', padding: '7px 12px' }}
                >
                  {t(c)}
                </button>
              ))}
            </div>
            <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={{ minWidth: '160px' }}>
              <option value="title">{t('Sort: Title')}</option>
              <option value="username">{t('Sort: Username')}</option>
              <option value="category">{t('Sort: Category')}</option>
              <option value="updated">{t('Sort: Updated')}</option>
            </select>
          </div>

          {/* Password Table */}
          <Panel title={t('Credentials')}>
            <div className="dw-panel-actions">
              <p>{t('Strength is a local estimate over the stored value. The clear password is never sent anywhere.')}</p>
            </div>
            <div className="dw-table-wrap">
              <table className="dw-table">
                <thead>
                  <tr>
                    {['Website / App', 'Username', 'Password', 'Strength', 'Category', 'Reuse'].map(c => (
                      <th key={c}>{t(c)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visible.map(a => {
                    const est = estimate(a.password);
                    const reused = reusedCount(a.password) > 1;
                    return (
                      <tr key={a.id} className={a.id === selectedId ? 'dw-selected-row' : ''}>
                        <td>
                          <button onClick={() => { setSelectedId(a.id); setRevealed(false); setEditing(false); }}>
                            <span className="dw-monogram">{(a.title || '?')[0]}</span>
                            {t(a.title || 'Untitled')}
                          </button>
                        </td>
                        <td>{a.username || '—'}</td>
                        <td>
                          <span aria-label={t('Masked password')} style={{ fontFamily: 'monospace', letterSpacing: '2px' }}>
                            {revealed && selectedId === a.id ? a.password : '••••••••••'}
                          </span>
                        </td>
                        <td>
                          <span className={`dw-badge ${est.score === 'strong' ? 'ok' : 'warn'}`} title={`${est.bits} bits (local estimate)`}>
                            {t(est.score === 'strong' ? 'Strong' : est.score === 'medium' ? 'Medium' : 'Weak')}
                          </span>
                        </td>
                        <td><small>{t(a.category)}</small></td>
                        <td><small>{reused ? <span className="dw-badge warn">{t('Reused')}</span> : t('Unique')}</small></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {!visible.length && <p className="dw-empty">{t('No matching accounts')}</p>}
          </Panel>

          <Panel title={t('Password Tools')}>
            <Link className="dw-action-row" to={SCREENS.PASSWORD_AUDIT}>
              <Mark name="shield" /> {t('Password audit')} ›
            </Link>
            <Link className="dw-action-row" to={SCREENS.AUTOFILL}>
              <Mark name="monitor" /> {t('Autofill configuration')} ›
            </Link>
            <Link className="dw-action-row" to={SCREENS.SECURE_SHARE}>
              <Mark name="share" /> {t('Secure share')} ›
            </Link>
          </Panel>
        </div>

        <aside className="dw-inspector">
          <Panel title={t('Inspector')}>
            {selected ? (
              <>
                <div className="dw-selected-file">
                  <span className="dw-monogram">{(selected.title || '?')[0]}</span>
                  <div>
                    <h3>{t(selected.title || 'Untitled')}</h3>
                    <small dir="ltr" style={{ fontSize: '10px' }}>{selected.website || t('No website recorded')}</small>
                  </div>
                </div>
                {copyNote && <p className="dw-muted" style={{ marginTop: '10px', color: copyNote.kind === 'ok' ? '#65F0E8' : '#FF586D' }}>{copyNote.text}</p>}
                {!editing ? (
                  <dl>
                    <div><dt>{t('Username')}</dt><dd>{selected.username || '—'}</dd></div>
                    <div><dt>{t('Category')}</dt><dd>{t(selected.category)}</dd></div>
                    <div><dt>{t('Strength')}</dt><dd>
                      <span className={`dw-badge ${estimate(selected.password).score === 'strong' ? 'ok' : 'warn'}`}>
                        {t(estimate(selected.password).score === 'strong' ? 'Strong' : estimate(selected.password).score === 'medium' ? 'Medium' : 'Weak')}
                      </span>
                    </dd></div>
                    <div><dt>{t('Storage')}</dt><dd>{persisted ? t('Encrypted vault record · AES-256-GCM') : t('Preview fixture · not written to disk')}</dd></div>
                    <div><dt>{t('2FA')}</dt><dd>{selected.totp ? t('Configured') : t('Not set')}</dd></div>
                  </dl>
                ) : (
                  <div style={{ display: 'grid', gap: '10px', margin: '14px 0' }}>
                    <label>{t('Title')}
                      <input value={draft.title} onChange={e => setDraft(d => ({ ...d, title: e.target.value }))} />
                    </label>
                    <label>{t('Username')}
                      <input value={draft.username} onChange={e => setDraft(d => ({ ...d, username: e.target.value }))} />
                    </label>
                    <label>{t('Website')}
                      <input dir="ltr" value={draft.website} onChange={e => setDraft(d => ({ ...d, website: e.target.value }))} />
                    </label>
                    <label>{t('Category')}
                      <select value={draft.category} onChange={e => setDraft(d => ({ ...d, category: e.target.value }))}>
                        {PASSWORD_CATEGORIES.filter(c => c !== 'All').map(c => <option key={c}>{c}</option>)}
                      </select>
                    </label>
                    <label>{t('Password')}
                      <input dir="ltr" style={{ fontFamily: 'monospace' }} value={draft.password} onChange={e => setDraft(d => ({ ...d, password: e.target.value }))} />
                    </label>
                  </div>
                )}
                <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #7556FF12' }}>
                  {!editing && (
                    <>
                      <button
                        className="dw-primary"
                        style={{ width: '100%', marginBottom: '8px' }}
                        onClick={() => setRevealed(!revealed)}
                      >
                        <Mark name={revealed ? 'eye-off' : 'eye'} />
                        {revealed ? t('Hide password') : t('Reveal password')}
                      </button>
                      <button className="dw-action-row" style={{ width: '100%', justifyContent: 'center' }} onClick={copySelected}>
                        <Mark name="copy" /> {t('Copy password')}
                      </button>
                      <button className="dw-action-row" style={{ width: '100%', justifyContent: 'center' }} onClick={startEdit}>
                        <Mark name="edit" /> {t('Edit entry')}
                      </button>
                      <button
                        className="dw-action-row"
                        style={{ width: '100%', justifyContent: 'center', color: '#FF586D' }}
                        onClick={() => { if (window.confirm(t('Delete this credential permanently?'))) { setEditing(false); setSelectedId(null); removeAccount(selected.id); } }}
                      >
                        <Mark name="trash" /> {t('Delete entry')}
                      </button>
                    </>
                  )}
                  {editing && (
                    <>
                      <button
                        className="dw-primary"
                        style={{ width: '100%', marginBottom: '8px' }}
                        onClick={() => {
                          updateAccount(selected.id, {
                            title: draft.title.trim() || selected.title,
                            username: draft.username.trim(),
                            website: draft.website.trim(),
                            category: draft.category,
                            password: draft.password,
                          });
                          setEditing(false);
                          setRevealed(false);
                        }}
                      >
                        <Mark name="save" /> {t('Save changes')}
                      </button>
                      <button className="dw-action-row" style={{ width: '100%', justifyContent: 'center' }} onClick={() => { setEditing(false); setRevealed(false); }}>
                        {t('Cancel')}
                      </button>
                      <p className="dw-muted" style={{ marginTop: '8px' }}>{persisted ? t('Saves into the encrypted vault immediately.') : t('Preview fixture only — not written to disk.')}</p>
                    </>
                  )}
                </div>
              </>
            ) : (
              <>
                <h3 style={{ textAlign: 'center', marginBottom: '16px', color: '#8993AD' }}>{t('No credential selected')}</h3>
                <dl>
                  <div><dt>{t('Total entries')}</dt><dd>{accounts.length}</dd></div>
                  <div><dt>{t('Categories')}</dt><dd>{new Set(accounts.map(a => a.category)).size}</dd></div>
                  <div><dt>{t('Encryption')}</dt><dd>{persisted ? 'AES-256-GCM' : t('Preview fixture')}</dd></div>
                </dl>
                <p className="dw-muted">{t('Select a credential to inspect details. Clear values stay local and are never logged.')}</p>
              </>
            )}
          </Panel>

          <StagBanner title={t('Credential Vault')} caption={t('Your secrets stay sealed.')} />
        </aside>
      </div>
    </main>
  );
}

/* ============ AUTHENTICATOR DASHBOARD ============ */
export function DesktopAuthenticator() {
  const { t } = useLanguage();
  const vault = useVault();
  const unlocked = vault.state === VAULT_STATE.UNLOCKED;
  const [accounts, setAccounts] = useState([]);
  const [codes, setCodes] = useState({}); // id → { code, remaining, period, digits } from the real TOTP engine
  const [selectedId, setSelectedId] = useState(null);
  const [sortBy, setSortBy] = useState('recent');
  const [query, setQuery] = useState('');
  const [copyNote, setCopyNote] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const refreshing = useRef(null);

  // Real accounts, loaded from the encrypted store whenever a session exists.
  useEffect(() => {
    if (!unlocked) {
      setAccounts([]);
      setCodes({});
      setSelectedId(null);
      setLoadError(null);
      return undefined;
    }
    let cancelled = false;
    vault
      .authList()
      .then((res) => {
        if (cancelled) return;
        if (res?.ok) {
          const list = res.data?.accounts || [];
          setAccounts(list);
          setSelectedId((prev) => (prev && list.some(a => a.id === prev) ? prev : list[0]?.id || null));
          setLoadError(null);
        } else {
          setAccounts([]);
          setSelectedId(null);
          setLoadError(res?.error?.message || 'Failed to load authenticator accounts');
        }
      });
    return () => { cancelled = true; };
  }, [unlocked, vault.session?.sessionId]);

  const selected = accounts.find(a => a.id === selectedId) || null;

  const refreshAll = useCallback(async (list) => {
    const target = list?.length ? list : accounts;
    const key = unlocked ? vault.session?.sessionId : null;
    if (!key || !target.length) return;
    if (refreshing.current === key + ':' + target.length + ':' + target.map(a => a.id).join(',')) return;
    refreshing.current = key + ':' + target.length + ':' + target.map(a => a.id).join(',');
    const results = await Promise.allSettled(target.map(a => vault.authCode(a.id)));
    const merged = {};
    results.forEach((r, i) => {
      const account = target[i];
      const value = r.status === 'fulfilled' ? r.value : null;
      merged[account.id] = value?.ok ? value.data : { error: value?.error?.message || 'Code unavailable' };
    });
    setCodes(current => ({ ...current, ...merged }));
    refreshing.current = null;
  }, [accounts, unlocked, vault.session?.sessionId, vault.authCode]);

  // First codes for the current session.
  useEffect(() => {
    if (unlocked && accounts.length) refreshAll(accounts);
  }, [unlocked, accounts, refreshAll]);

  // Local countdown; refetch through the real service when a window expires.
  useEffect(() => {
    if (!unlocked || !accounts.length) return undefined;
    const interval = setInterval(() => {
      setCodes(current => {
        let expired = false;
        const next = {};
        for (const [id, entry] of Object.entries(current)) {
          if (!entry || entry.error) { next[id] = entry; continue; }
          const remaining = Math.max(0, entry.remaining - 1);
          next[id] = { ...entry, remaining };
          if (remaining <= 0) expired = true;
        }
        if (expired) setTimeout(() => refreshAll(), 0);
        return next;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [unlocked, accounts.length, refreshAll]);

  const filtered = sortBy === 'alpha'
    ? [...accounts].sort((a, b) => a.name.localeCompare(b.name))
    : [...accounts].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  const visibleAccounts = filtered.filter(a =>
    `${a.name} ${a.issuer}`.toLowerCase().includes(query.toLowerCase())
  );

  const selectedCode = selected ? codes[selected.id] : null;
  const period = selected?.period || 30;
  const progress = selectedCode && !selectedCode.error ? Math.max(0, Math.min(1, selectedCode.remaining / period)) : 0;

  const emptyState = !vault.available
    ? { title: 'Vault engine unavailable', body: 'The encrypted store is not reachable in this preview, so no accounts are loaded.' }
    : !unlocked && vault.state === VAULT_STATE.LOCKED
      ? { title: 'Vault locked', body: 'Unlock KnouxCrypt to load your authenticator accounts and generate real codes.' }
      : !unlocked && vault.state === VAULT_STATE.UNENROLLED
        ? { title: 'Vault not enrolled', body: 'Create your vault first — then authenticator secrets are stored, encrypted, on this device.' }
        : loadError
          ? { title: 'Load failed', body: loadError }
          : null;

  const statusBadge = !vault.available
    ? { cls: 'warn', label: 'Not connected' }
    : unlocked
      ? { cls: 'ok', label: 'Encrypted vault store' }
      : { cls: 'warn', label: vault.state === VAULT_STATE.LOCKED ? 'Vault locked' : 'Not enrolled' };

  return (
    <main className="dw-page" data-screen="AUTHENTICATOR">
      <PageHeading
        title={t('AUTHENTICATOR DASHBOARD')}
        caption={t('Offline two-factor authentication workspace · Time-based codes')}
      >
        <Link to={SCREENS.AUTH_IMPORT} className="dw-primary">
          <Mark name="plus" /> {t('Import Account')}
        </Link>
      </PageHeading>

      <div className="dw-split">
        <div className="dw-main-column">
          {/* Stats */}
          <div className="dw-stats-grid">
            <Panel title={t('Accounts')}>
              <strong>{vault.available ? (unlocked ? accounts.length : '—') : '—'}</strong>
            </Panel>
            <Panel title={t('Active Period')}>
              <strong>{selected ? `${selected.period}s` : '—'}</strong>
            </Panel>
            <Panel title={t('Secret Storage')}>
              <span className={`dw-badge ${statusBadge.cls}`}>{t(statusBadge.label)}</span>
            </Panel>
            <Panel title={t('Code Source')}>
              <span className="dw-badge">{t('TOTP · RFC 6238 engine')}</span>
            </Panel>
          </div>

          {/* Search & Filter */}
          <div className="dw-filter-row">
            <input
              type="search"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={t('Search name or issuer…')}
              aria-label={t('Search accounts')}
            />
            <div className="dw-segments">
              {[
                ['recent', 'Sort: Newest'],
                ['alpha', 'Sort: A → Z'],
              ].map(([id, label]) => (
                <button key={id} aria-pressed={sortBy === id} onClick={() => setSortBy(id)}>
                  {t(label)}
                </button>
              ))}
            </div>
          </div>

          {/* Code Display */}
          <div className="dw-panel dw-auth-empty">
            {emptyState ? (
              <>
                <div className="dw-token-orbit" style={{ width: '80px', height: '80px', margin: '0 auto 18px' }}>
                  <Mark name="lock" style={{ width: '32px', height: '32px', color: '#7556FF' }} />
                </div>
                <h2>{t(emptyState.title)}</h2>
                <p>{t(emptyState.body)}</p>
                {vault.state !== VAULT_STATE.LOCKED && (
                  <p className="dw-muted" style={{ marginTop: '10px' }}>
                    {t('No codes are simulated. A locked vault shows no accounts and no codes.')}
                  </p>
                )}
                <Link to={SCREENS.AUTH_IMPORT} style={{ marginTop: '16px' }}>{t('Review import options')} ›</Link>
              </>
            ) : !accounts.length ? (
              <>
                <div className="dw-token-orbit" style={{ width: '80px', height: '80px', margin: '0 auto 18px' }}>
                  <Mark name="smartphone" style={{ width: '32px', height: '32px', color: '#7556FF' }} />
                </div>
                <h2>{t('No authenticator accounts yet')}</h2>
                <p>{t('Import a real otpauth:// URI or QR secret to start generating codes on this device.')}</p>
                <Link to={SCREENS.AUTH_IMPORT} className="dw-primary" style={{ marginTop: '16px' }}>
                  <Mark name="plus" /> {t('Import Account')}
                </Link>
              </>
            ) : (
              <>
                <div className="dw-token-orbit" style={{ position: 'relative' }}>
                  <svg viewBox="0 0 100 100" style={{ width: '80px', height: '80px', transform: 'rotate(-90deg)' }}>
                    <circle cx="50" cy="50" r="42" fill="none" stroke="#7556FF22" strokeWidth="6" />
                    <circle
                      cx="50" cy="50" r="42"
                      fill="none"
                      stroke="#7556FF"
                      strokeWidth="6"
                      strokeLinecap="round"
                      strokeDasharray={264 * progress}
                      strokeDashoffset={0}
                      style={{ transition: 'stroke-dasharray 0.2s linear' }}
                    />
                  </svg>
                  <Mark name="shield" style={{ width: '32px', height: '32px', color: '#7556FF' }} />
                </div>
                <h2>{t(selected?.name || 'Select an account')}</h2>
                <p>{selected ? `${selected.issuer || t('No issuer')} · RFC 6238 · ${selected.digits} digits` : t('Choose an account from the list below.')}</p>
                <div style={{ margin: '20px 0' }}>
                  <span className="dw-code-placeholder" aria-label={t('Current TOTP code')} style={{ fontSize: '42px', letterSpacing: '8px', fontWeight: '600' }}>
                    {selectedCode?.error
                      ? t('Unavailable')
                      : selectedCode?.code
                        ? String(selectedCode.code)
                        : `— — —   — — —`}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', marginTop: '12px' }}>
                  <div style={{ width: '120px', height: '4px', background: '#7556FF15', borderRadius: '2px', overflow: 'hidden' }}>
                    <div style={{ width: `${progress * 100}%`, height: '100%', background: '#7556FF', transition: 'width 0.2s linear' }} />
                  </div>
                  <span style={{ fontSize: '12px', color: '#8993AD', fontFamily: 'monospace' }}>
                    {selectedCode && !selectedCode.error ? `${selectedCode.remaining}s` : '—'}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginTop: '16px', flexWrap: 'wrap' }}>
                  <button
                    className="dw-primary"
                    disabled={!selectedCode?.code || selectedCode?.error}
                    onClick={async () => {
                      const res = await vault.clipboardCopy({ text: String(selectedCode.code), seconds: 20, confirm: true });
                      setCopyNote(res?.ok
                        ? { kind: 'ok', text: t('Code armed in secure clipboard · clears in 20s') }
                        : { kind: 'warn', text: t(res?.error?.message || 'Clipboard copy failed.') });
                    }}
                  >
                    <Mark name="copy" /> {t('Copy Code')}
                  </button>
                </div>
                {copyNote && (
                  <p className="dw-muted" style={{ marginTop: '10px', color: copyNote.kind === 'ok' ? '#65F0E8' : '#FF586D' }}>{copyNote.text}</p>
                )}
                <p className="dw-muted">{t('Codes are generated by the local TOTP engine from secrets sealed in the encrypted store.')}
                </p>
                <Link to={SCREENS.AUTH_IMPORT} style={{ marginTop: '16px' }}>{t('Review import options')} ›</Link>
              </>
            )}
          </div>

          {/* Account list */}
          {accounts.length > 0 && (
            <Panel title={t('Enrolled Accounts')}>
              <div className="dw-table-wrap">
                <table className="dw-table">
                  <thead>
                    <tr>
                      {['Name', 'Issuer', 'Algorithm', 'Period', 'Current Code'].map(c => (
                        <th key={c}>{t(c)}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {visibleAccounts.map(a => {
                      const entry = codes[a.id];
                      return (
                        <tr
                          key={a.id}
                          className={a.id === selected?.id ? 'dw-selected-row' : ''}
                          onClick={() => setSelectedId(a.id)}
                          style={{ cursor: 'pointer' }}
                        >
                          <td>
                            <span className="dw-monogram">{(a.name || '?')[0]}</span>
                            {t(a.name || 'Untitled')}
                          </td>
                          <td>{a.issuer || '—'}</td>
                          <td><small>{a.algorithm || 'SHA1'}</small></td>
                          <td><small>{a.period}s</small></td>
                          <td>
                            {entry?.error
                              ? <small style={{ color: '#FF586D' }}>{t(entry.error)}</small>
                              : <small dir="ltr" style={{ fontFamily: 'monospace', letterSpacing: '3px' }}>{entry?.code || '— — —'}</small>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {!visibleAccounts.length && <p className="dw-empty">{t('No matching accounts')}</p>}
            </Panel>
          )}
        </div>

        <aside className="dw-inspector">
          <Panel title={t('Inspector')}>
            {emptyState ? (
              <>
                <h3 style={{ textAlign: 'center', marginBottom: '16px', color: '#8993AD' }}>{t(emptyState.title)}</h3>
                <dl>
                  <div><dt>{t('Secret Storage')}</dt><dd>{t(statusBadge.label)}</dd></div>
                  <div><dt>{t('Current TOTP Code')}</dt><dd>{t('Unavailable')}</dd></div>
                </dl>
                <p className="dw-muted">{t('No QR secret is displayed and no OTP is invented while the vault is closed.')}</p>
              </>
            ) : selected && selectedCode ? (
              <>
                <div className="dw-token-orbit" style={{ width: '72px', height: '72px', margin: '0 auto 16px' }}>
                  <Mark name="shield" style={{ width: '28px', height: '28px', color: '#7556FF' }} />
                </div>
                <h3 style={{ textAlign: 'center' }}>{t(selected.name)}</h3>
                <dl>
                  <div><dt>{t('Issuer')}</dt><dd>{selected.issuer || t('None recorded')}</dd></div>
                  <div><dt>{t('Algorithm')}</dt><dd>{selected.algorithm || 'SHA1'}</dd></div>
                  <div><dt>{t('Digits')}</dt><dd>{selected.digits}</dd></div>
                  <div><dt>{t('Period')}</dt><dd>{selected.period}s</dd></div>
                  <div><dt>{t('Current TOTP')}</dt><dd dir="ltr" style={{ fontFamily: 'monospace', fontSize: '14px', letterSpacing: '4px' }}>{selectedCode.error ? t('Unavailable') : selectedCode.code}</dd></div>
                  <div><dt>{t('Time Remaining')}</dt><dd>{selectedCode.error ? '—' : `${selectedCode.remaining}s`}</dd></div>
                  <div><dt>{t('Added')}</dt><dd>{selected.createdAt ? new Date(selected.createdAt).toLocaleDateString() : '—'}</dd></div>
                </dl>
                <button
                  className="dw-action-row"
                  style={{ width: '100%', justifyContent: 'center', marginTop: '14px', color: '#FF586D' }}
                  onClick={async () => {
                    if (!window.confirm(t(`Remove "${selected.name}" from the authenticator? This cannot be undone.`))) return;
                    const res = await vault.authRemove(selected.id);
                    if (res?.ok) {
                      const list = accounts.filter(a => a.id !== selected.id);
                      setAccounts(list);
                      setSelectedId(list[0]?.id || null);
                      setCodes(current => ({ ...current, [selected.id]: undefined }));
                    }
                  }}
                >
                  <Mark name="trash" /> {t('Remove account')}
                </button>
                <p className="dw-muted">{t('Codes are computed live from the sealed secret. Nothing is invented or replayed.')}</p>
              </>
            ) : (
              <>
                <h3 style={{ textAlign: 'center', marginBottom: '16px', color: '#8993AD' }}>{t('No account selected')}</h3>
                <dl>
                  <div><dt>{t('Algorithm')}</dt><dd>—</dd></div>
                  <div><dt>{t('Digits')}</dt><dd>—</dd></div>
                  <div><dt>{t('Current TOTP Code')}</dt><dd>{t('Unavailable')}</dd></div>
                </dl>
                <p className="dw-muted">{t('No QR secret or invented OTP is displayed.')}</p>
              </>
            )}
          </Panel>

          <StagBanner title={t('Authenticator')} caption={t('Your codes. Your device.')} />
        </aside>
      </div>
    </main>
  );
}

/* ============ KEY FORGE LAB ============ */
export function DesktopKeyForge() {
  const { t } = useLanguage();
  const vault = useVault();
  const unlocked = vault.state === VAULT_STATE.UNLOCKED;
  const [tab, setTab] = useState('Generate');
  const [algorithm, setAlgorithm] = useState('ED25519');
  const [keyName, setKeyName] = useState('');
  const [purpose, setPurpose] = useState('general');
  const [generatedKey, setGeneratedKey] = useState(null);
  const [keys, setKeys] = useState([]);
  const [selectedKeyId, setSelectedKeyId] = useState(null);
  const [smartKey, setSmartKey] = useState(null);
  const [busyKey, setBusyKey] = useState(false);
  const [forgeNote, setForgeNote] = useState(null);

  // These are the exact algorithms the desktop engine accepts (KEY_ALGORITHMS).
  const algorithms = [
    { id: 'ED25519', name: 'Ed25519', caption: 'Modern deterministic signing', icon: 'shield', desc: 'EdDSA · 256-bit' },
    { id: 'RSA_4096', name: 'RSA-4096', caption: 'Universal compatibility', icon: 'lock', desc: 'RSASSA-PKCS1 · 4096-bit' },
    { id: 'RSA_2048', name: 'RSA-2048', caption: 'Widely interoperable', icon: 'lock', desc: 'RSASSA-PKCS1 · 2048-bit' },
    { id: 'P-256', name: 'P-256', caption: 'Elliptic curve signing', icon: 'key', desc: 'ECDSA prime256v1' },
    { id: 'P-384', name: 'P-384', caption: 'Stronger elliptic curve', icon: 'key', desc: 'ECDSA secp384r1' },
    { id: 'HMAC_256', name: 'HMAC-256', caption: 'Shared-secret MAC', icon: 'chip', desc: 'Sealed 256-bit secret' },
  ];

  const loadKeys = useCallback(async () => {
    if (!unlocked) { setKeys([]); return; }
    const res = await vault.keyList();
    if (res?.ok) setKeys(res.data?.keys || []);
  }, [unlocked, vault.keyList]);

  useEffect(() => {
    loadKeys();
  }, [loadKeys]);

  const selectedKey = keys.find(k => k.id === selectedKeyId) || null;

  async function forgeKey() {
    const label = keyName.trim();
    if (!label) {
      setForgeNote({ kind: 'warn', text: t('A key name is required before forging.') });
      return;
    }
    setBusyKey(true);
    setForgeNote(null);
    const res = await vault.keyGenerate({ algorithm, name: label, purpose });
    setBusyKey(false);
    if (res?.ok) {
      setGeneratedKey(res.data);
      setSelectedKeyId(res.data.id);
      setKeyName('');
      setForgeNote({ kind: 'ok', text: t(res.data.publicPem ? 'Key pair forged — private material is sealed in the vault.' : 'Secret forged and sealed in the vault.') });
      await loadKeys();
    } else {
      setForgeNote({ kind: 'warn', text: t(res?.error?.message || 'Key generation failed.') });
    }
  }

  async function exportKey(key) {
    if (!key) return;
    if (!window.confirm(t(`Export the private material of "${key.name}"? This act is recorded in the security journal.`))) return;
    setBusyKey(true);
    const res = await vault.keyExportPrivate(key.id, { confirm: true });
    setBusyKey(false);
    if (res?.ok) {
      const text = res.data.privatePem || res.data.secret || '';
      setSmartKey({ name: key.name, algorithm: key.algorithm, text });
      setTab('Import / Export');
    } else {
      setForgeNote({ kind: 'warn', text: t(res?.error?.message || 'Private export failed.') });
    }
  }

  return (
    <main className="dw-page" data-screen="KEY_FORGE">
      <PageHeading
        title={t('KEY FORGE LAB')}
        caption={t('Generate, manage, and secure your encryption keys · Private material never leaves the sealed store by default')}
      >
        <span className={`dw-badge ${stateLabel(unlocked, vault).cls}`}>{t(stateLabel(unlocked, vault).label)}</span>
      </PageHeading>

      <div className="dw-split">
        <div className="dw-main-column">
          <div className="dw-segments" style={{ marginBottom: '20px' }}>
            {['Generate', 'Key Inventory', 'Import / Export', 'Signatures'].map(x => (
              <button key={x} aria-pressed={tab === x} onClick={() => setTab(x)}>
                {t(x)}
              </button>
            ))}
          </div>

          {tab === 'Generate' && (
            <>
              <Panel title={t('1 · Choose Algorithm')}>
                <div className="dw-panel-actions">
                  <p>{t('Only the algorithms implemented by the desktop engine are listed. Unsupported requests are refused, never downgraded.')}</p>
                </div>
                <div className="dw-algorithm-grid">
                  {algorithms.map(a => (
                    <button
                      key={a.id}
                      aria-pressed={algorithm === a.id}
                      onClick={() => setAlgorithm(a.id)}
                      style={{ textAlign: 'start', minHeight: '150px', padding: '18px' }}
                    >
                      <Mark name={a.icon} style={{ width: '28px', height: '28px', color: '#7556FF', marginBottom: '8px' }} />
                      <strong style={{ fontSize: '16px' }}>{a.name}</strong>
                      <small style={{ display: 'block', marginTop: '6px', color: '#8993AD' }}>{t(a.caption)}</small>
                      <small style={{ display: 'block', marginTop: '10px', color: '#7556FF', fontSize: '10px' }}>{a.desc}</small>
                    </button>
                  ))}
                </div>
              </Panel>

              <Panel title={t('2 · Name the Key')}>
                <div className="dw-form-grid">
                  <label>
                    {t('Key Name')}
                    <input
                      value={keyName}
                      onChange={e => setKeyName(e.target.value)}
                      placeholder={t('e.g. Sign-2026')}
                      max={256}
                    />
                  </label>
                  <label>
                    {t('Purpose')}
                    <select value={purpose} onChange={e => setPurpose(e.target.value)}>
                      <option value="general">{t('General')}</option>
                      <option value="sign">{t('Signing')}</option>
                      <option value="encrypt">{t('Encryption')}</option>
                    </select>
                  </label>
                </div>
                <p className="dw-muted" style={{ marginTop: '12px' }}>
                  {t('The key is generated with Node/OpenSSL in the privileged vault process and sealed with AES-256-GCM immediately.')}
                </p>
              </Panel>

              <Panel title={t('3 · Forge the Key')}>
                <button
                  className="dw-primary"
                  disabled={!unlocked || busyKey}
                  style={{ width: '100%', marginBottom: '12px' }}
                  onClick={forgeKey}
                >
                  <Mark name="key" /> {busyKey ? t('Forging…') : t('Generate Key Pair')}
                </button>
                {forgeNote && (
                  <p className="dw-muted" style={{ color: forgeNote.kind === 'ok' ? '#65F0E8' : '#FF586D' }}>{forgeNote.text}</p>
                )}
                {!unlocked && vault.available && (
                  <p className="dw-muted">{t('Unlock the vault to forge keys. Nothing is generated while the store is sealed shut.')}</p>
                )}
                {!vault.available && (
                  <p className="dw-muted">{t('Key generation is not available in this preview. No keys have been created.')}</p>
                )}
                {generatedKey && (
                  <div style={{ marginTop: '16px', padding: '16px', borderRadius: '10px', background: '#0A1A18', border: '1px solid #65F0E833' }}>
                    <strong style={{ color: '#65F0E8' }}>{t(`Key forged · ${generatedKey.algorithm}`)}</strong>
                    {generatedKey.fingerprint && (
                      <div style={{ marginTop: '8px', fontSize: '11px', color: '#8993AD' }}>
                        {t('SHA-256 fingerprint')}: <code dir="ltr" style={{ fontFamily: 'monospace' }}>{generatedKey.fingerprint}</code>
                      </div>
                    )}
                    <div style={{ marginTop: '10px' }}>
                      <button
                        className="dw-action-row"
                        style={{ justifyContent: 'center' }}
                        onClick={async () => {
                          const res = await vault.clipboardCopy({ text: generatedKey.fingerprint, seconds: 20, confirm: true });
                          if (res?.ok) setForgeNote({ kind: 'ok', text: t('Fingerprint armed in secure clipboard · clears in 20s') });
                        }}
                      >
                        <Mark name="copy" /> {t('Copy fingerprint')}
                      </button>
                    </div>
                    <pre style={{ marginTop: '12px', fontSize: '10px', overflow: 'auto', maxHeight: '180px' }}>{generatedKey.publicPem || t('Material sealed — no public key exists for this secret type')}</pre>
                  </div>
                )}
              </Panel>
            </>
          )}

          {tab === 'Key Inventory' && (
            <>
              <Panel title={t('Key Inventory')}>
                {keys.length ? (
                  <div className="dw-table-wrap">
                    <table className="dw-table">
                      <thead>
                        <tr>
                          {['Name', 'Algorithm', 'Purpose', 'Fingerprint', 'Created', 'Private'].map(c => (
                            <th key={c}>{t(c)}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {keys.map(k => (
                          <tr
                            key={k.id}
                            className={k.id === selectedKeyId ? 'dw-selected-row' : ''}
                            onClick={() => setSelectedKeyId(k.id)}
                            style={{ cursor: 'pointer' }}
                          >
                            <td><strong>{k.name}</strong></td>
                            <td>{k.algorithm}</td>
                            <td><small>{k.purpose}</small></td>
                            <td><small dir="ltr" style={{ fontFamily: 'monospace' }}>{String(k.fingerprint || '').slice(0, 16)}…</small></td>
                            <td><small>{k.createdAt ? new Date(k.createdAt).toLocaleDateString() : '—'}</small></td>
                            <td>
                              <span className={`dw-badge ${k.hasPrivate ? '' : ''}`}>{k.hasPrivate ? t('Sealed') : t('Public only')}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="dw-empty">{vault.available ? (unlocked ? t('No keys forged yet.') : t('Locked vault — key inventory is hidden.')) : t('No authenticated key inventory is connected.')}</p>
                )}
              </Panel>
              {selectedKey && (
                <Panel title={t(`Inspect · ${selectedKey.name}`)}>
                  <dl>
                    <div><dt>{t('Algorithm')}</dt><dd>{selectedKey.algorithm}</dd></div>
                    <div><dt>{t('Purpose')}</dt><dd>{t(selectedKey.purpose)}</dd></div>
                    <div><dt>{t('Fingerprint')}</dt><dd dir="ltr" style={{ fontFamily: 'monospace', fontSize: '10px', wordBreak: 'break-all' }}>{selectedKey.fingerprint}</dd></div>
                    <div><dt>{t('Private material')}</dt><dd>{selectedKey.hasPrivate ? t('Sealed in encrypted store') : t('None')}</dd></div>
                  </dl>
                  <div style={{ display: 'flex', gap: '10px', marginTop: '16px', flexWrap: 'wrap' }}>
                    <button
                      className="dw-primary"
                      disabled={busyKey}
                      onClick={() => exportKey(selectedKey)}
                      style={{ flex: '1', minWidth: '180px' }}
                    >
                      <Mark name="arrow-right" /> {t('Export Private Material')}
                    </button>
                    <button
                      className="dw-action-row"
                      disabled={busyKey}
                      onClick={async () => {
                        const res = await vault.clipboardCopy({ text: selectedKey.fingerprint, seconds: 20, confirm: true });
                        if (res?.ok) setForgeNote({ kind: 'ok', text: t('Fingerprint armed in secure clipboard · clears in 20s') });
                      }}
                      style={{ flex: '1', minWidth: '140px', justifyContent: 'center' }}
                    >
                      <Mark name="copy" /> {t('Copy fingerprint')}
                    </button>
                    <button
                      className="dw-action-row"
                      disabled={busyKey}
                      onClick={async () => {
                        if (!window.confirm(t(`Delete "${selectedKey.name}" permanently? The sealed material is destroyed.`))) return;
                        const res = await vault.keyRemove(selectedKey.id);
                        if (res?.ok) {
                          setForgeNote({ kind: 'ok', text: t('Key destroyed.') });
                          setSelectedKeyId(null);
                          await loadKeys();
                        } else if (res?.error) {
                          setForgeNote({ kind: 'warn', text: t(res.error.message || 'Key removal failed.') });
                        }
                      }}
                      style={{ flex: '1', minWidth: '140px', justifyContent: 'center', color: '#FF586D' }}
                    >
                      <Mark name="trash" /> {t('Delete key')}
                    </button>
                  </div>
                </Panel>
              )}
              <Link className="dw-action-row" to={SCREENS.KEY_DETAILS}>
                {t('Device Keys')} ›
              </Link>
              <Link className="dw-action-row" to={SCREENS.FINGERPRINT_VERIFY}>
                {t('Fingerprint Verification')} ›
              </Link>
            </>
          )}

          {tab === 'Import / Export' && (
            <>
              <Panel title={t('Export Key')}>
                <p className="dw-muted">{t('Select a key in the Inventory tab, then choose Export Private Material. Exporting is explicit, confirmed, and recorded in the security journal.')}</p>
                {smartKey ? (
                  <div style={{ marginTop: '16px', padding: '16px', borderRadius: '10px', background: '#0A1A18', border: '1px solid #65F0E833' }}>
                    <strong style={{ color: '#65F0E8' }}>{t(`Private material · ${smartKey.name} (${smartKey.algorithm})`)}</strong>
                    <pre style={{ marginTop: '12px', fontSize: '10px', overflow: 'auto', maxHeight: '260px', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{smartKey.text}</pre>
                    <div style={{ display: 'flex', gap: '10px', marginTop: '10px', flexWrap: 'wrap' }}>
                      <button
                        className="dw-primary"
                        onClick={async () => {
                          const res = await vault.clipboardCopy({ text: smartKey.text, seconds: 20, confirm: true });
                          setForgeNote({ kind: res?.ok ? 'ok' : 'warn', text: res?.ok ? t('Armed in secure clipboard · clears in 20s') : t(res?.error?.message || 'Clipboard copy failed.') });
                        }}
                      >
                        <Mark name="copy" /> {t('Copy and arm clipboard')}
                      </button>
                      <button
                        className="dw-action-row"
                        onClick={() => {
                          const blob = new Blob([smartKey.text], { type: 'text/plain' });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = `${smartKey.name.replace(/[^\w.-]+/g, '_')}.pem.txt`;
                          a.click();
                          URL.revokeObjectURL(url);
                        }}
                      >
                        <Mark name="save" /> {t('Save as file')}
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="dw-empty">{t('No private material exported yet.')}</p>
                )}
              </Panel>
              {forgeNote && <p className="dw-muted" style={{ color: forgeNote.kind === 'ok' ? '#65F0E8' : '#FF586D' }}>{forgeNote.text}</p>}
              <Panel title={t('Import Public Key')}>
                <p className="dw-muted">{t('Public key import is exposed on the Secure Share screen, which verifies partner keys before an exchange. No import path is provided here because a stray paste into the sealed store is worse than a missing feature.')}</p>
                <Link className="dw-action-row" to={SCREENS.SECURE_SHARE}>
                  <Mark name="share" /> {t('Open Secure Share')} ›
                </Link>
              </Panel>
            </>
          )}

          {tab === 'Signatures' && (
            <>
              <Panel title={t('Signature Verification')}>
                <Link className="dw-action-row" to={SCREENS.SIGNATURE}>
                  <Mark name="file-text" /> {t('Verify File Signature')} ›
                </Link>
                <Link className="dw-action-row" to={SCREENS.SIGNATURE_STUDIO}>
                  <Mark name="edit" /> {t('Signature Studio')} ›
                </Link>
              </Panel>
              <Panel title={t('Certificate Inspection')}>
                <Link className="dw-action-row" to={SCREENS.CERTIFICATE_INSPECTOR}>
                  <Mark name="badge" /> {t('Inspect Certificate')} ›
                </Link>
              </Panel>
            </>
          )}
        </div>

        <aside className="dw-inspector">
          <Panel title={t('Key Lattice Visualization')}>
            <div style={{ aspectRatio: '1', borderRadius: '16px', background: 'linear-gradient(135deg, #0A0C14, #070912)', border: '1px solid #7556FF15', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden' }}>
              <svg viewBox="0 0 200 200" style={{ width: '100%', height: '100%', opacity: 0.6 }}>
                <defs>
                  <radialGradient id="keyGlow" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="#7556FF" stopOpacity="0.3" />
                    <stop offset="100%" stopColor="#7556FF" stopOpacity="0" />
                  </radialGradient>
                </defs>
                {/* Key rings */}
                <circle cx="100" cy="100" r="70" fill="none" stroke="#7556FF33" strokeWidth="2" strokeDasharray="20,10" />
                <circle cx="100" cy="100" r="50" fill="none" stroke="#65F0E833" strokeWidth="1.5" strokeDasharray="15,15" />
                <circle cx="100" cy="100" r="30" fill="none" stroke="#7556FF55" strokeWidth="2" />
                {/* Center keystore */}
                <circle cx="100" cy="100" r="18" fill="#070912" stroke="#7556FF" strokeWidth="2" />
                <text x="100" y="105" textAnchor="middle" fill="#7556FF" fontSize="10" fontFamily="monospace">KEY</text>
                {/* Orbiting key particles */}
                {[0, 45, 90, 135, 180, 225, 270, 315].map(angle => (
                  <circle
                    key={angle}
                    cx={100 + 60 * Math.cos(angle * Math.PI / 180)}
                    cy={100 + 60 * Math.sin(angle * Math.PI / 180)}
                    r="4"
                    fill="#7556FF"
                    opacity="0.7"
                    style={{ animation: `orbit-${angle} 8s linear infinite` }}
                  />
                ))}
              </svg>
              <style>{`
                @keyframes orbit-0 { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
                @keyframes orbit-45 { from { transform: rotate(45deg); } to { transform: rotate(405deg); } }
                @keyframes orbit-90 { from { transform: rotate(90deg); } to { transform: rotate(450deg); } }
                @keyframes orbit-135 { from { transform: rotate(135deg); } to { transform: rotate(495deg); } }
                @keyframes orbit-180 { from { transform: rotate(180deg); } to { transform: rotate(540deg); } }
                @keyframes orbit-225 { from { transform: rotate(225deg); } to { transform: rotate(585deg); } }
                @keyframes orbit-270 { from { transform: rotate(270deg); } to { transform: rotate(630deg); } }
                @keyframes orbit-315 { from { transform: rotate(315deg); } to { transform: rotate(675deg); } }
              `}</style>
            </div>
            <p className="dw-muted" style={{ textAlign: 'center', marginTop: '12px' }}>
              {t('Decorative lattice · The real key ring is listed under Key Inventory')}
            </p>
          </Panel>

          <Panel title={t('Recent Keys')}>
            <div className="dw-table-wrap">
              <table className="dw-table">
                <thead>
                  <tr>
                    {['Name', 'Algorithm', 'Purpose', 'Fingerprint', 'Created', 'Status'].map(c => (
                      <th key={c}>{t(c)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {keys.length ? keys.slice(0, 5).map(k => (
                    <tr key={k.id}>
                      <td><strong>{k.name}</strong></td>
                      <td>{k.algorithm}</td>
                      <td><small>{k.purpose}</small></td>
                      <td><small dir="ltr" style={{ fontFamily: 'monospace' }}>{String(k.fingerprint || '').slice(0, 12)}…</small></td>
                      <td><small>{k.createdAt ? new Date(k.createdAt).toLocaleDateString() : '—'}</small></td>
                      <td><small>{k.hasPrivate ? t('Sealed') : t('Public only')}</small></td>
                    </tr>
                  )) : (
                    <tr><td colSpan={6} style={{ textAlign: 'center', color: '#8993AD', padding: '32px' }}>{t(vault.available ? (unlocked ? 'No keys forged yet' : 'Inventory hidden while locked') : 'No keys generated yet')}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </Panel>

          <StagBanner title={t('Key Forge')} caption={t('Keys forged in silence.')} />
        </aside>
      </div>
    </main>
  );
}

/* ============ PRIVACY CENTER ============ */
export function DesktopPrivacy() {
  const { t, locale, setLocale } = useLanguage();
  const vault = useVault();
  const unlocked = vault.state === VAULT_STATE.UNLOCKED;
  const [selected, setSelected] = useState('Session Privacy');

  const controls = [
    { id: 'Session Privacy', caption: 'Local session lock controls', route: 'SESSION_PRIVACY', icon: 'lock', status: 'configured' },
    { id: 'Secure Clipboard', caption: 'Control copied sensitive content', route: 'SECURE_CLIPBOARD', icon: 'clipboard', status: 'available' },
    { id: 'File Integrity', caption: 'Verify files against a baseline', route: 'FILE_INTEGRITY', icon: 'shield', status: 'available' },
    { id: 'Permissions', caption: 'Review granted app capabilities', route: null, icon: 'key', status: 'info' },
    { id: 'Security Activity', caption: 'Review local security activity', route: 'SECURITY_ACTIVITY', icon: 'activity', status: 'available' },
    { id: 'Privacy Policy', caption: 'Your data stays local.', route: null, icon: 'file-text', status: 'info' },
  ];

  const current = controls.find(c => c.id === selected);

  // Evidence about this app and this session only — never invented OS facts.
  const evidencePlates = [
    {
      title: 'Vault Encryption',
      detail: unlocked ? 'AES-256-GCM store · session active' : vault.available ? 'Store sealed shut' : 'Engine unavailable in preview',
      source: 'KnouxCrypt',
      status: unlocked ? 'configured' : 'review',
      icon: 'lock',
    },
    {
      title: 'Secure Clipboard',
      detail: unlocked ? 'Lease-based copy with 30s default clear' : 'Requires an unlocked session',
      source: 'KnouxCrypt',
      status: unlocked ? 'configured' : 'review',
      icon: 'clipboard',
    },
    {
      title: 'Security Journal',
      detail: unlocked ? 'Local journal records every sensitive act' : 'Requires an unlocked session',
      source: 'KnouxCrypt',
      status: unlocked ? 'configured' : 'review',
      icon: 'activity',
    },
    {
      title: 'Authenticator',
      detail: unlocked ? 'Secrets sealed locally; codes computed on demand' : 'Stored secrets stay hidden until unlock',
      source: 'KnouxCrypt',
      status: unlocked ? 'configured' : 'review',
      icon: 'smartphone',
    },
  ];

  return (
    <main className="dw-page" data-screen="PRIVACY">
      <StagBanner title={t('PRIVACY CENTER')} caption={t('Threat radar · Evidence-based privacy controls')} />

      <div className="dw-split dw-privacy-body">
        <div>
          {/* Radar Visualization */}
          <div style={{ marginBottom: '24px' }}>
            <div style={{ aspectRatio: '1', maxWidth: '320px', margin: '0 auto', borderRadius: '50%', background: 'radial-gradient(circle at center, #7556FF15 0%, transparent 70%)', border: '1px solid #7556FF22', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
              <svg viewBox="0 0 200 200" style={{ width: '180px', height: '180px' }}>
                {/* Radar rings */}
                <circle cx="100" cy="100" r="80" fill="none" stroke="#7556FF15" strokeWidth="1" />
                <circle cx="100" cy="100" r="55" fill="none" stroke="#7556FF15" strokeWidth="1" />
                <circle cx="100" cy="100" r="30" fill="none" stroke="#7556FF15" strokeWidth="1" />
                {/* Radar sweep */}
                <line x1="100" y1="100" x2="100" y2="20" stroke="#7556FF" strokeWidth="2" strokeLinecap="round" style={{ transformOrigin: '100px 100px', animation: 'radar-sweep 4s linear infinite' }}>
                  <animateTransform attributeName="transform" type="rotate" from="0 100 100" to="360 100 100" dur="4s" repeatCount="indefinite" />
                </line>
                {/* Evidence points */}
                {evidencePlates.map((p, i) => {
                  const angle = (i * 90 - 45) * Math.PI / 180;
                  const r = 60;
                  return (
                    <g key={p.title}>
                      <circle cx={100 + r * Math.cos(angle)} cy={100 + r * Math.sin(angle)} r="8" fill={p.status === 'configured' ? '#65F0E8' : p.status === 'current' ? '#7556FF' : '#FF586D'} opacity="0.8" />
                      <circle cx={100 + r * Math.cos(angle)} cy={100 + r * Math.sin(angle)} r="12" fill="none" stroke={p.status === 'configured' ? '#65F0E8' : p.status === 'current' ? '#7556FF' : '#FF586D'} strokeWidth="1" />
                    </g>
                  );
                })}
              </svg>
              <style>{`
                @keyframes radar-sweep { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
              `}</style>
            </div>
            <p style={{ textAlign: 'center', marginTop: '12px', color: '#8993AD', fontSize: '12px' }}>
              {t('LOCAL CHECKS ONLY · No cloud analysis · No threat scoring')}
            </p>
          </div>

          {/* Privacy Tabs */}
          <div className="dw-segments dw-privacy-tabs" style={{ justifyContent: 'center', flexWrap: 'wrap', marginBottom: '20px' }}>
            {controls.map(({ id }) => (
              <button key={id} aria-pressed={selected === id} onClick={() => setSelected(id)}>
                {t(id)}
              </button>
            ))}
          </div>

          {/* Evidence Plates */}
          <h2 style={{ fontSize: '16px', marginBottom: '16px', color: '#C4B8E0' }}>{t('Evidence Plates')}</h2>
          <div className="dw-privacy-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
            {evidencePlates.map(plate => (
              <button key={plate.title} className="dw-panel dw-privacy-card" style={{ textAlign: 'start', minHeight: '140px' }}>
                <div className="dw-privacy-icon">
                  <Mark name={plate.icon} />
                </div>
                <h2 style={{ fontSize: '14px', marginBottom: '6px' }}>{t(plate.title)}</h2>
                <p style={{ fontSize: '11px', marginBottom: '8px' }}>{t(plate.detail)}</p>
                <span className={`dw-badge ${plate.status === 'configured' ? 'ok' : plate.status === 'current' ? '' : 'warn'}`}>
                  {t(plate.status === 'configured' ? 'Configured' : plate.status === 'current' ? 'Current' : 'Needs Review')}
                </span>
                <small style={{ display: 'block', marginTop: '8px', color: '#8993AD' }}>
                  {t('FROM')} {t(plate.source)}
                </small>
              </button>
            ))}
          </div>

          {/* Selected Control Detail */}
          {current && current.route && (
            <Panel title={t(current.id)}>
              <p className="dw-muted">{t(current.caption)}</p>
              <Link className="dw-primary" to={SCREENS[current.route]} style={{ marginTop: '16px', width: '100%' }}>
                {t('Review configuration')} ›
              </Link>
            </Panel>
          )}

          {/* Language */}
          <Panel title={t('Language')}>
            <div className="dw-segments" style={{ justifyContent: 'center' }}>
              <button aria-pressed={locale === 'en'} onClick={() => setLocale('en')}>English</button>
              <button aria-pressed={locale === 'ar'} onClick={() => setLocale('ar')}>العربية</button>
            </div>
            <p className="dw-muted" style={{ textAlign: 'center', marginTop: '10px' }}>{t('Language preference is saved locally.')}</p>
          </Panel>
        </div>

        <aside className="dw-inspector">
          <Panel title={t('Inspector')}>
            <div className="dw-privacy-icon">
              <Mark name={current?.icon || 'lock'} />
            </div>
            <h2>{t(selected)}</h2>
            <p>{t(current?.caption || 'Privacy control center')}</p>
            {current?.route ? (
              <>
                <p className="dw-muted">{t('This workspace does not claim system-wide monitoring or tracker blocking.')}</p>
                <Link className="dw-primary" to={SCREENS[current.route]} style={{ marginTop: '12px', width: '100%' }}>
                  {t('Review configuration')} ›
                </Link>
              </>
            ) : (
              <p className="dw-muted">
                {selected === 'Permissions'
                  ? t('No OS permissions have been queried. Device permission status is unavailable.')
                  : t('Private content is not uploaded by this workspace. Optional external services must be configured explicitly.')}
              </p>
            )}
            <dl>
              <div><dt>{t('Status')}</dt><dd>{t('Not verified')}</dd></div>
              <div><dt>{t('Data Upload')}</dt><dd>{t('None')}</dd></div>
              <div><dt>{t('Telemetry')}</dt><dd>{t('Disabled')}</dd></div>
            </dl>
          </Panel>

          <StagBanner title={t('Privacy')} caption={t('Your data. Your rules.')} />
        </aside>
      </div>
    </main>
  );
}