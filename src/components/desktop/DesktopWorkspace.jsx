import React, { useEffect, useLayoutEffect, useRef, useState, useMemo } from 'react';
import { Link, NavLink, useLocation, useNavigate, useParams } from 'react-router-dom';
import { SCREENS, SERVICES } from '../../config/screens';
import { useLanguage } from '../../i18n/Language';
import { StagEmblem } from '../entry/StagEmblem';
import { Mark } from '../security/ScreenUI';
import { KnouxServiceIcon } from '../icons/KnouxServiceIcon';
import { ServiceGrid, ToolsDirectory, TOOL_SERVICES, TOOL_CATEGORIES } from '../home/Home';
import { useNotes, NOTE_CATEGORIES, SAMPLE_NOTES } from '../notes/NotesContext';
import './desktop.css';
import { ServiceQuickDock } from './ServiceQuickDock';
import { WorkspaceActivityTray } from './WorkspaceActivity';
import { ExperienceSettings } from './ExperienceSettings';
import { useMotionPreferences } from '../shell/MotionPreferences';
import { DesktopBackup, DesktopTools } from './DesktopUtilities';
import { useVault, VAULT_STATE } from '../../hooks/useVault';
import { ERROR_COPY, formatBytes as bytes } from '../security/cipherCopy';
import { DesktopPasswords, DesktopAuthenticator, DesktopKeyForge, DesktopPrivacy } from './DesktopSecurity';

const artwork = import.meta.glob('../../assets/service-*.webp', { eager: true, import: 'default' });

export function useDesktopWorkspace() {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const media = matchMedia('(min-width: 1100px)');
    const sync = () => setWide(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);
  return wide;
}

export function DesktopChrome({ children }) {
  const { t, dir } = useLanguage();
  const { pathname } = useLocation();
  const motion = useMotionPreferences();
  const [collapsed, setCollapsed] = useState(false);
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [windowError, setWindowError] = useState('');
  const search = useRef(null);
  const content = useRef(null);
  const wide = useDesktopWorkspace();
  const entry = pathname === SCREENS.SPLASH_ENTRY || pathname === SCREENS.SECURE_ACCESS_LOGIN;

  useEffect(() => {
    if (entry || !wide) return;
    const key = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k' && !entry) {
        e.preventDefault();
        search.current?.focus();
      }
      if (e.key === 'Escape' && !document.querySelector('dialog[open]')) {
        e.preventDefault();
        setSearching(false);
      }
    };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, [entry, wide]);

  useEffect(() => { setSearching(false); setQuery(''); }, [pathname]);
  useLayoutEffect(() => { content.current?.scrollTo(0, 0); }, [pathname, wide]);

  if (entry || !wide) return children;

  async function windowAction(action) {
    try { await window.electronAPI?.window?.[action](); }
    catch { setWindowError(t('Window control unavailable')); }
  }

  const current = SERVICES.find(s => pathname === SCREENS[s.id] || pathname.startsWith(SCREENS[s.id] + '/'));

  return (
    <div className={`dw-workspace ${collapsed ? 'dw-collapsed' : ''}`} dir={dir}>
      <header className="dw-titlebar">
        <Link to={SCREENS.HOME}><StagEmblem className="dw-compact-brand" />KNOUX <em>CRYPT</em></Link>
        <span>{t('Private Encryption Suite')}</span>
        <div className="dw-window-controls">
          {window.electronAPI?.window && [
            ['minimize', '−'],
            ['maximize', '□'],
            ['close', '×']
          ].map(([action, label]) => (
            <button key={action} onClick={() => windowAction(action)} aria-label={t(action)}>{label}</button>
          ))}
        </div>
      </header>

      <aside className="dw-sidebar">
        <div className="dw-sidebar-brand">
          <StagEmblem />
          <div>KNOUX <em>CRYPT</em><small>{t('Private Encryption Suite')}</small></div>
        </div>
        <button className="dw-collapse" onClick={() => setCollapsed(v => !v)} aria-expanded={!collapsed} aria-label={t('Toggle navigation')}>
          ☰ <span>{t('Workspace')}</span>
        </button>
        <nav aria-label={t('Desktop navigation')}>
          <NavLink to={SCREENS.HOME} aria-label={t('Home')} end><Mark name="home" /><span>{t('Home')}</span></NavLink>
          <NavLink to={SCREENS.TOOLS} aria-label={t('Tools')} end><Mark name="grid" /><span>{t('Tools')}</span></NavLink>
          <NavLink to={SCREENS.SECURE_ACCESS_LOGIN} state={{ returnTo: SCREENS.HOME }} aria-label={t('Account')}>
            <Mark name="lock" /><span>{t('Account')}</span>
          </NavLink>
          <p>{t('SECURITY')}</p>
          {SERVICES.map(s => (
            <NavLink key={s.id} to={SCREENS[s.id]} data-service={s.id} aria-label={t(s.title)}>
              <img src={artwork[`../../assets/service-${s.art}.webp`]} alt="" />
              <span>{t(s.title)}</span>
            </NavLink>
          ))}
        </nav>
        <div className="dw-sidebar-foot">
          <Mark name="info" />
          <span>{t(window.knouxcrypt?.isElectron ? 'Local desktop' : 'Browser preview')}</span>
        </div>
      </aside>

      <header className="dw-command">
        <div className="dw-command-search">
          <Mark name="search" />
          <input
            ref={search}
            type="search"
            aria-label={t('Search tools')}
            placeholder={t('Search files, vault, notes, or tools…')}
            value={query}
            onFocus={() => setSearching(true)}
            onChange={e => { setQuery(e.target.value); setSearching(true); }}
          />
          <kbd>Ctrl K</kbd>
        </div>
        <Link to={SCREENS.PRIVACY} aria-label={t('Privacy Center')}>
          <Mark name="settings" />
        </Link>
        <WorkspaceActivityTray />
        <ExperienceSettings />
        <Link className="dw-account" to={SCREENS.SECURE_ACCESS_LOGIN} state={{ returnTo: SCREENS.HOME }}>
          <span>K</span>{t('Account')}
        </Link>
        {searching && (
          <div className="dw-command-results">
            <button className="dw-search-close" onClick={() => setSearching(false)} aria-label={t('Close')}>×</button>
            <ToolsDirectory query={query} resultsId="desktop-command-results" />
          </div>
        )}
      </header>

      <div className="dw-route-tab">
        <span>
          <Mark name="grid" />
          {t(current?.title || (pathname === SCREENS.TOOLS ? 'Tools' : 'Workspace'))}
        </span>
        <Link to={SCREENS.TOOLS}>{t('All tools')} ＋</Link>
      </div>

      <ServiceQuickDock />
      <div
        className="dw-content"
        ref={content}
        onPointerMove={e => {
          const card = e.target.closest('.hub-service');
          if (!card || !motion.running || motion.preferences.performance || e.pointerType === 'touch') return;
          const b = card.getBoundingClientRect();
          card.style.setProperty('--tilt-x', `${(1 - 2 * (e.clientY - b.top) / b.height).toFixed(2)}deg`);
          card.style.setProperty('--tilt-y', `${(2 * (e.clientX - b.left) / b.width - 1).toFixed(2)}deg`);
        }}
        onPointerOut={e => {
          const card = e.target.closest('.hub-service');
          if (card && !card.contains(e.relatedTarget)) {
            card.style.removeProperty('--tilt-x');
            card.style.removeProperty('--tilt-y');
          }
        }}
      >
        {children}
      </div>

      <footer className="dw-status">
        <span>{t(window.knouxcrypt?.isElectron ? 'Electron workspace' : 'Browser preview · desktop services unavailable')}</span>
        <span role="status">{windowError || t('Local only · no uploads')}</span>
      </footer>
    </div>
  );
}

export function Panel({ title, children, className = '' }) {
  const { t } = useLanguage();
  return <section className={`dw-panel ${className}`}><h2>{t(title)}</h2>{children}</section>;
}

export function PageHeading({ title, caption, children }) {
  const { t } = useLanguage();
  return (
    <header className="dw-page-heading">
      <div><h1>{t(title)}</h1><p>{t(caption)}</p></div>
      <div className="dw-actions">{children}</div>
    </header>
  );
}

export function StagBanner({ title, caption }) {
  const { t } = useLanguage();
  return (
    <section className="dw-stag-banner">
      {(title || caption) && (
        <div>
          <h2>{t(title)}</h2>
          <p>{t(caption)}</p>
        </div>
      )}
      <StagEmblem ignite />
      <i aria-hidden="true" />
    </section>
  );
}

/* ============ HOME - COMMAND CENTER ============ */
export function DesktopHome() {
  const { t, locale } = useLanguage();
  const vault = useVault();

  // Determine vault status
  const isLocked = vault.state !== VAULT_STATE.UNLOCKED;
  const vaultStatus = {
    [VAULT_STATE.UNAVAILABLE]: { label: 'Vault engine unavailable', tone: 'warn' },
    [VAULT_STATE.UNENROLLED]: { label: 'No vault enrolled', tone: 'idle' },
    [VAULT_STATE.LOCKED]: { label: 'Vault locked', tone: 'idle' },
    [VAULT_STATE.UNLOCKED]: { label: 'Vault unlocked', tone: 'ok' },
    [VAULT_STATE.GUEST]: { label: 'Guest preview', tone: 'warn' },
  }[vault.state] || { label: 'Unknown state', tone: 'idle' };

  // Time-based greeting
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good Morning' : hour < 18 ? 'Good Afternoon' : 'Good Evening';

  return (
    <main className="dw-page dw-home" data-screen="HOME" data-vault-state={vault.state}>
      <div className="dw-home-center">
        <header className="dw-home-greeting">
          <span>{t(greeting)}</span>
          <span className="dw-greeting-brand">KNOUX <em>CRYPT</em></span>
          <button className="dw-emergency-lock" title={t('Emergency lock')} onClick={() => vault.lock()} disabled={isLocked}>
            <Mark name="lock" />
          </button>
        </header>

        <section className="dw-home-hero">
          <div className="dw-core-ring" aria-hidden="true">
            <div className="dw-core-seal" />
            <div className="dw-core-halo" />
          </div>
          <StagEmblem className="hub-final-stag" ignite />
          <h1>KNOUX <em>CRYPT</em></h1>
          <p>{t('Private Encryption Suite')}</p>
          <div className="dw-brand-line" aria-hidden="true" />
          <h2>{t('COMMAND CENTER')}</h2>
          <small>{t(isLocked ? 'Vault sealed · Unlock to begin' : 'Vault active · All systems operational')}</small>
        </section>

        <ServiceGrid />

        <footer className="dw-capability-bar">
          <span>{t('ON-DEVICE')}</span>
          <span className="dw-capability-divider" aria-hidden="true" />
          <span>{t('NO SYNC ENABLED')}</span>
        </footer>
      </div>

      <aside className="dw-inspector">
        <Panel title={t('System Status')}>
          <dl>
            <div><dt>{t('Encryption Engine')}</dt><dd>{vault.status?.engine?.algorithm || t('AES-256-GCM')}</dd></div>
            <div><dt>{t('Key Derivation')}</dt><dd>{vault.status?.engine?.kdf || t('HKDF-SHA256')}</dd></div>
            <div><dt>{t('Container Format')}</dt><dd>{vault.status?.engine?.format || t('KNXVLT01')}</dd></div>
            <div><dt>{t('Session')}</dt><dd>{t(vault.session ? (vault.session.guest ? 'Guest' : 'Authenticated') : 'Locked')}</dd></div>
          </dl>
          <div className="dw-segments encrypt-mode">
            {['encrypt', 'decrypt'].map(m => (
              <button key={m} aria-pressed={false} disabled={isLocked} onClick={() => {}}>
                {t(m === 'encrypt' ? 'Encrypt' : 'Decrypt')}
              </button>
            ))}
          </div>
          <span className="dw-badge" data-vault-tone={vaultStatus.tone}>{t(vaultStatus.label)}</span>
          {isLocked && (
            <Link className="dw-primary" to={SCREENS.SECURE_ACCESS_LOGIN} state={{ returnTo: SCREENS.HOME }}>
              <Mark name="unlock" />{t('Unlock Vault')}
            </Link>
          )}
          {!isLocked && (
            <button className="dw-primary" data-vault-action="lock" onClick={() => vault.lock()}>
              <Mark name="lock" />{t('Lock Vault')}
            </button>
          )}
        </Panel>

        <Panel title={t('Quick Actions')}>
          {[
            ['FILE_CIPHER', 'New Encrypted File', 'lock'],
            ['SHADOW_VAULT', 'Open Vault', 'folder'],
            ['NOTES', 'Create Secure Note', 'file'],
            ['KEY_FORGE', 'Generate Key', 'key'],
          ].map(([id, label, icon]) => (
            <Link className="dw-action-row" key={id} to={SCREENS[id]}>
              <KnouxServiceIcon id={id} size="md" />
              {t(label)}
              <span>›</span>
            </Link>
          ))}
        </Panel>

        <StagBanner title={t('Privacy. Security. Control.')} caption={t('Your data stays local.')} />
      </aside>
    </main>
  );
}

/* ============ FILE CIPHER - WORKBENCH ============ */
export function DesktopFileCipher() {
  const { t } = useLanguage();
  const vault = useVault();
  const [mode, setMode] = useState('encrypt');
  const [inputPath, setInputPath] = useState(null);
  const [outputPath, setOutputPath] = useState(null);
  const [result, setResult] = useState(null);
  const opId = useRef(null);

  const unlocked = vault.state === VAULT_STATE.UNLOCKED;
  const busy = vault.busy;
  const percent = vault.progress?.total ? Math.min(100, Math.round(vault.progress.processed / vault.progress.total * 100)) : 0;
  const errorMessage = vault.error ? ERROR_COPY[vault.error.code] || vault.error.message : null;

  async function chooseInput() {
    setResult(null);
    const r = await vault.pickInputFile();
    if (r?.ok && !r.data.cancelled && r.data.path) {
      setInputPath(r.data.path);
      setOutputPath(null);
    }
  }

  async function chooseOutput() {
    const r = await vault.pickOutputFile({
      title: mode === 'encrypt' ? t('Save encrypted container as') : t('Save decrypted file as'),
      defaultPath: inputPath || undefined
    });
    if (r?.ok && !r.data.cancelled && r.data.path) setOutputPath(r.data.path);
  }

  async function run() {
    if (!unlocked || !inputPath || !outputPath) return;
    setResult(null);
    const id = `${mode}-${Date.now()}`;
    opId.current = id;
    const payload = { inputPath, outputPath, operationId: id };
    const res = mode === 'encrypt' ? await vault.encryptFile(payload) : await vault.decryptFile(payload);
    setResult(res?.ok ? { ok: true, mode, outputPath: res.data.outputPath, meta: res.data.meta } : { ok: false, mode, code: res?.error?.code });
  }

  async function cancel() {
    if (opId.current) await vault.cancel(opId.current);
  }

  const stateLabel = !vault.available ? t('Vault engine unavailable') :
    vault.state === VAULT_STATE.GUEST ? t('Guest preview — cannot encrypt') :
    unlocked ? t('Vault unlocked') : t('Vault locked');

  return (
    <main className="dw-page" data-screen="FILE_CIPHER" data-vault-state={vault.state}>
      <PageHeading
        title={t('FILE CIPHER LAB')}
        caption={t('Authenticated file encryption workbench')}
      >
        <div className="dw-segments encrypt-mode">
          {['encrypt', 'decrypt'].map(m => (
            <button key={m} aria-pressed={mode === m} onClick={() => { setMode(m); setResult(null); }}>
              {t(m === 'encrypt' ? 'Encrypt' : 'Decrypt')}
            </button>
          ))}
        </div>
        <span className="dw-badge" data-vault-tone={unlocked ? 'ok' : 'idle'}>{t(stateLabel)}</span>
      </PageHeading>

      <div className="dw-split">
        <div className="dw-main-column">
          <Panel title={t('Cipher Capsule')}>
            {/* Mechanical Capsule Visualization */}
            <div className="dw-cipher-capsule" aria-hidden="true">
              <div className="dw-capsule-chamber input">
                <div className="dw-chamber-label">{t('SELECT FILE')}</div>
                <div className="dw-chamber-surface">
                  {inputPath ? (
                    <span className="dw-chamber-active">{inputPath.split(/[\\/]/).pop()}</span>
                  ) : (
                    <span className="dw-chamber-empty">{t('Drop file or click')}</span>
                  )}
                </div>
              </div>
              <div className="dw-capsule-lock">
                <div className="dw-lock-segments">
                  <span className="dw-lock-segment" />
                  <span className="dw-lock-segment" />
                  <span className="dw-lock-segment" />
                  <span className="dw-lock-segment" />
                </div>
                <Mark name={mode === 'encrypt' ? 'lock' : 'unlock'} className="dw-lock-icon" />
              </div>
              <div className="dw-capsule-chamber output">
                <div className="dw-chamber-label">{t('ENCRYPTED OUTPUT')}</div>
                <div className="dw-chamber-surface">
                  {outputPath ? (
                    <span className="dw-chamber-active">{outputPath.split(/[\\/]/).pop()}</span>
                  ) : (
                    <span className="dw-chamber-empty">{t('Choose destination')}</span>
                  )}
                </div>
              </div>
              <div className="dw-verified-path" />
            </div>

            <div className="dw-panel-actions">
              <span data-testid="file-cipher-state">{t(stateLabel)}</span>
            </div>

            {/* Input Chamber */}
            <div style={{ marginBottom: '18px' }}>
              <label style={{ display: 'block', fontSize: '11px', color: '#8993AD', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '1px' }}>
                {t('SELECT FILE')}
              </label>
              <button className="dw-add-files" onClick={chooseInput} disabled={!vault.available}>
                <Mark name="file" /> {t(inputPath ? 'Change file' : 'Choose file')} ＋
              </button>
              {inputPath && (
                <div className="dw-selected-file" style={{ marginTop: '12px' }}>
                  <Mark name="file" />
                  <strong dir="ltr" style={{ fontSize: '13px' }}>{inputPath.split(/[\\/]/).pop()}</strong>
                  <span style={{ marginInlineStart: 'auto', fontSize: '11px', color: '#7556FF' }}>INPUT</span>
                </div>
              )}
              <p className="dw-muted" dir="ltr" style={{ marginTop: '6px' }}>{inputPath || t('No file selected. Drop a file or click to choose.')}</p>
            </div>

            {/* Transfer Path Visualization */}
            <div style={{ margin: '16px 0', padding: '12px', borderRadius: '10px', background: 'linear-gradient(90deg, #1A0F2E, #0C0815)', border: '1px solid #7556FF15' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '11px', color: '#8993AD' }}>
                <span style={{ flex: 1, textAlign: 'center' }}>{t('ENCRYPTED OUTPUT')}</span>
                <Mark name="arrow-right" style={{ color: '#7556FF' }} />
                <span style={{ flex: 1, textAlign: 'center' }}>{t('VERIFIED PATH')}</span>
              </div>
            </div>

            {/* Output Chamber */}
            <div>
              <label style={{ display: 'block', fontSize: '11px', color: '#8993AD', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '1px' }}>
                {t('ENCRYPTED OUTPUT')}
              </label>
              <button className="dw-add-files" onClick={chooseOutput} disabled={!vault.available}>
                <Mark name="save" /> {t(outputPath ? 'Change destination' : 'Choose destination')} ＋
              </button>
              {outputPath && (
                <div className="dw-selected-file" style={{ marginTop: '12px' }}>
                  <Mark name="shield" />
                  <strong dir="ltr" style={{ fontSize: '13px' }}>{outputPath.split(/[\\/]/).pop()}</strong>
                  <span style={{ marginInlineStart: 'auto', fontSize: '11px', color: '#65F0E8' }}>OUTPUT</span>
                </div>
              )}
              <p className="dw-muted" dir="ltr" style={{ marginTop: '6px' }}>{outputPath || t('No destination chosen.')}</p>
            </div>

            {!unlocked && (
              <p className="dw-muted" role="status" style={{ marginTop: '14px', padding: '10px', borderRadius: '8px', background: '#1A0F2E33', border: '1px solid #7556FF15' }}>
                {t('Unlock the vault from Secure Access to enable file operations.')}
              </p>
            )}

            {errorMessage && (
              <p className="dw-muted" role="alert" data-cipher-error={vault.error?.code} style={{ marginTop: '10px', padding: '10px', borderRadius: '8px', background: '#1A0A0A33', border: '1px solid #FF586D33', color: '#FF586D' }}>
                {t(errorMessage)}
              </p>
            )}

            {busy && (
              <div className="dw-destination" role="status" aria-live="polite" data-cipher-progress={percent}>
                <Mark name="clock" />
                <div>
                  <strong>{t(mode === 'encrypt' ? 'Encrypting…' : 'Decrypting…')}</strong>
                  <p>{percent}% · {bytes(vault.progress?.processed)} / {bytes(vault.progress?.total)}</p>
                </div>
                <button onClick={cancel} style={{ padding: '8px 14px', fontSize: '11px' }}>{t('Cancel')}</button>
              </div>
            )}

            {result?.ok && (
              <div className="dw-destination" role="status" data-cipher-result="success">
                <Mark name="shield" />
                <div>
                  <strong>{t(result.mode === 'encrypt' ? 'Encrypted successfully' : 'Decrypted and verified')}</strong>
                  <p dir="ltr">{result.outputPath}</p>
                  <p>{t('Original size')}: {bytes(result.meta?.origSize)} · {t('SHA-256')}: <bdi dir="ltr">{(result.meta?.plaintextSha256 || '').slice(0, 16)}…</bdi></p>
                </div>
              </div>
            )}

            {result && !result.ok && (
              <div className="dw-destination" role="alert" data-cipher-result="failure">
                <Mark name="info" />
                <div>
                  <strong>{t('Operation did not complete')}</strong>
                  <p>{t(ERROR_COPY[result.code] || 'The operation failed.')}</p>
                </div>
              </div>
            )}

            <button className="dw-primary" disabled={!vault.available || busy || !inputPath || !outputPath || !unlocked} onClick={run}>
              <Mark name={mode === 'encrypt' ? 'lock' : 'unlock'} />
              {t(mode === 'encrypt' ? 'Encrypt File' : 'Decrypt File')}
            </button>
          </Panel>
        </div>

        <aside className="dw-inspector">
          <Panel title={t('Algorithm Specification')}>
            <dl>
              <div><dt>{t('Algorithm')}</dt><dd>AES-256-GCM</dd></div>
              <div><dt>{t('Mode')}</dt><dd>Authenticated Encryption (AEAD)</dd></div>
              <div><dt>{t('Key Derivation')}</dt><dd>{vault.status?.engine?.kdf || 'HKDF-SHA256'}</dd></div>
              <div><dt>{t('Nonce')}</dt><dd>XChaCha20-Poly1305 compatible</dd></div>
              <div><dt>{t('Container')}</dt><dd>{vault.status?.engine?.format || 'KNXVLT01'}</dd></div>
              <div><dt>{t('Session')}</dt><dd>{t(vault.session ? (vault.session.guest ? 'Guest' : 'Authenticated') : 'Locked')}</dd></div>
            </dl>
            <p className="dw-muted">{t('Encryption runs in the desktop process. Files are written atomically and existing files are never overwritten silently.')}</p>
            {!unlocked && (
              <Link className="dw-primary" to={SCREENS.SECURE_ACCESS_LOGIN} state={{ returnTo: SCREENS.HOME }}>
                {t('Unlock Vault')}
              </Link>
            )}
          </Panel>

          <Panel title={t('Operation Receipt')}>
            {result?.ok ? (
              <>
                <dl>
                  <div><dt>{t('Operation')}</dt><dd>{t(result.mode === 'encrypt' ? 'Encrypt' : 'Decrypt')}</dd></div>
                  <div><dt>{t('Output')}</dt><dd dir="ltr" style={{ fontSize: '10px' }}>{result.outputPath}</dd></div>
                  <div><dt>{t('SHA-256')}</dt><dd dir="ltr" style={{ fontSize: '10px' }}>{(result.meta?.plaintextSha256 || '').slice(0, 32)}…</dd></div>
                  <div><dt>{t('Auth Tag')}</dt><dd dir="ltr" style={{ fontSize: '10px' }}>{(result.meta?.authTag || '').slice(0, 32)}…</dd></div>
                  <div><dt>{t('Timestamp')}</dt><dd>{new Date().toLocaleString()}</dd></div>
                </dl>
                <button className="dw-action-row" style={{ marginTop: '12px' }}>
                  <Mark name="clipboard" /> {t('Copy receipt')}
                </button>
              </>
            ) : (
              <p className="dw-muted">{t('No operation completed yet.')}</p>
            )}
          </Panel>
        </aside>
      </div>
    </main>
  );
}

/* ============ SHADOW VAULT - EXPLORER ============ */
export function DesktopVault() {
  const { t } = useLanguage();
  const [collection, setCollection] = useState('All Items');
  const [view, setView] = useState('grid');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');

  const collections = [
    { id: 'All Items', icon: 'grid', count: '—' },
    { id: 'Personal', icon: 'user', count: '12' },
    { id: 'Work', icon: 'briefcase', count: '8' },
    { id: 'Finance', icon: 'credit-card', count: '5' },
    { id: 'Identity', icon: 'id-card', count: '3' },
    { id: 'Crypto', icon: 'bitcoin', count: '7' },
    { id: 'Private Media', icon: 'image', count: '24' },
    { id: 'Documents', icon: 'file-text', count: '19' },
    { id: 'Trash', icon: 'trash-2', count: '0' },
  ];

  // Media categories per reference prompt
  const mediaCategories = ['All', 'Photos', 'Videos', 'Audio'];

  // Sample encrypted media tiles for visual demo (SAMPLE PREVIEW)
  const sampleTiles = [
    { id: 1, type: 'image', title: 'encrypted-photo-01.knx', size: '2.4 MB', category: 'Photos' },
    { id: 2, type: 'image', title: 'encrypted-photo-02.knx', size: '1.8 MB', category: 'Photos' },
    { id: 3, type: 'video', title: 'encrypted-video-01.knx', size: '47.2 MB', category: 'Videos' },
    { id: 4, type: 'image', title: 'encrypted-photo-03.knx', size: '3.1 MB', category: 'Photos' },
    { id: 5, type: 'audio', title: 'encrypted-audio-01.knx', size: '5.6 MB', category: 'Audio' },
    { id: 6, type: 'image', title: 'encrypted-photo-04.knx', size: '2.9 MB', category: 'Photos' },
    { id: 7, type: 'video', title: 'encrypted-video-02.knx', size: '33.8 MB', category: 'Videos' },
    { id: 8, type: 'image', title: 'encrypted-photo-05.knx', size: '1.5 MB', category: 'Photos' },
    { id: 9, type: 'audio', title: 'encrypted-audio-02.knx', size: '4.3 MB', category: 'Audio' },
    { id: 10, type: 'image', title: 'encrypted-photo-06.knx', size: '3.7 MB', category: 'Photos' },
    { id: 11, type: 'video', title: 'encrypted-video-03.knx', size: '52.1 MB', category: 'Videos' },
    { id: 12, type: 'image', title: 'encrypted-photo-07.knx', size: '2.2 MB', category: 'Photos' },
  ];

  const filteredTiles = sampleTiles.filter(tile => category === 'All' || tile.category === category);

  return (
    <main className="dw-page" data-screen="SHADOW_VAULT">
      <PageHeading
        title={t('SHADOW VAULT')}
        caption={t('Encrypted media explorer · Sealed shutter')}
      >
        <Link className="dw-primary" to={SCREENS.SECURE_ACCESS_LOGIN} state={{ returnTo: SCREENS.HOME }}>
          <Mark name="unlock" /> {t('Unlock Vault')}
        </Link>
      </PageHeading>

      <div className="dw-vault-layout">
        <Panel title={t('Collections')} className="dw-collections">
          {collections.map((c, i) => (
            <button
              key={c.id}
              aria-pressed={collection === c.id}
              onClick={() => setCollection(c.id)}
            >
              <Mark name={c.icon} />
              {t(c.id)}
              <span>{c.count}</span>
            </button>
          ))}
        </Panel>

        <div className="dw-main-column">
          {/* Category Chips - per reference prompt */}
          <div className="dw-media-categories" role="group" aria-label={t('Media type')}>
            {mediaCategories.map(cat => (
              <button
                key={cat}
                className={`dw-media-chip ${category === cat ? 'active' : ''}`}
                aria-pressed={category === cat}
                onClick={() => setCategory(cat)}
              >
                {t(cat)}
              </button>
            ))}
            <span className="dw-sample-badge">{t('12 ENCRYPTED ITEMS · SAMPLE PREVIEW')}</span>
          </div>

          {/* Masonry Grid of Encrypted Media Tiles */}
          <div className={`dw-vault-masonry dw-view-${view}`}>
            {filteredTiles.map((tile, index) => (
              <article key={tile.id} className="dw-vault-tile" style={{ '--tile-order': index }}>
                <div className="dw-tile-media" data-type={tile.type}>
                  <Mark name={tile.type === 'video' ? 'play-circle' : tile.type === 'audio' ? 'music' : 'image'} className="dw-tile-type-icon" />
                  <Mark name="lock" className="dw-tile-seal" />
                </div>
                <div className="dw-tile-info">
                  <strong className="dw-tile-title" dir="ltr">{tile.title}</strong>
                  <span className="dw-tile-meta">{tile.size} · {t(tile.category)}</span>
                </div>
                <div className="dw-tile-edge-beam" aria-hidden="true" />
              </article>
            ))}
          </div>

          {/* FAB Import Securely */}
          <button className="dw-vault-fab" disabled>
            <Mark name="upload" /> {t('IMPORT SECURELY')}
          </button>

          <StagBanner title={t('Shadow Vault')} caption={t('Unlock to access protected data. No items are loaded while sealed.')} />

          <div className="dw-list-heading">
            <h2>{t('Protected Items')}</h2>
            <div className="dw-segments view-toggle">
              {['grid', 'list'].map(v => (
                <button key={v} aria-pressed={view === v} onClick={() => setView(v)}>
                  <Mark name={v === 'grid' ? 'grid' : 'list'} />
                  {t(v === 'grid' ? 'Grid' : 'List')}
                </button>
              ))}
            </div>
          </div>

          <label className="dw-search-label">
            {t('Search vault')}
            <input
              type="search"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={t('Search after unlocking')}
              disabled
            />
          </label>

          <div className={`dw-vault-empty dw-panel dw-view-${view}`}>
            <Mark name="lock" style={{ width: '56px', height: '56px', color: '#7556FF44' }} />
            <h2>{t('Vault is locked')}</h2>
            <p>{t('Unlock to view your collections. No protected items are loaded.')}</p>
            <small>{t(collection)}</small>
            <Link className="dw-primary" to={SCREENS.SECURE_ACCESS_LOGIN} state={{ returnTo: SCREENS.HOME }} style={{ marginTop: '18px' }}>
              {t('Open Secure Access')}
            </Link>
          </div>
        </div>

        <aside className="dw-inspector">
          <Panel title={t('Inspector')}>
            <StagEmblem style={{ width: '120px', height: '120px', margin: '0 auto 16px' }} />
            <h3>{t('No item selected')}</h3>
            <dl>
              <div><dt>{t('Status')}</dt><dd>{t('Sealed')}</dd></div>
              <div><dt>{t('Storage')}</dt><dd>{t('Not connected')}</dd></div>
              <div><dt>{t('Encryption')}</dt><dd>AES-256-GCM</dd></div>
              <div><dt>{t('Shutter')}</dt><dd>{t('Closed')}</dd></div>
            </dl>
            <p className="dw-muted">{t('Item details become available after an authenticated unlock.')}</p>
          </Panel>

          <Link className="dw-action-row" to={SCREENS.COLLECTIONS}>
            {t('Collections preview')} ›
          </Link>
          <Link className="dw-action-row" to={SCREENS.DOCUMENT_VIEWER}>
            {t('Document viewer')} ›
          </Link>
        </aside>
      </div>
    </main>
  );
}

/* ============ SECURE NOTES - STUDIO ============ */
function noteText(note, field, t) {
  const original = SAMPLE_NOTES.find(n => n.id === note.id);
  return original?.[field] === note[field] ? t(note[field]) : note[field];
}

export function DesktopNotes() {
  const { t } = useLanguage();
  const { notes, updateNote, createNote } = useNotes();
  const { id: routeId } = useParams();
  const navigate = useNavigate();
  const [selected, setSelected] = useState(notes[0]?.id);
  const [query, setQuery] = useState('');
  const [starred, setStarred] = useState(false);
  const [activeTab, setActiveTab] = useState('notes');

  const note = notes.find(n => n.id === (routeId || selected));
  const filtered = notes.filter(n => (!starred || n.pinned) && `${n.title} ${n.body}`.toLowerCase().includes(query.toLowerCase()));

  function open(id) {
    setSelected(id);
    navigate(`${SCREENS.NOTES_EDITOR}/${id}`);
  }

  const sampleNotes = [
    { id: 'sample-1', title: 'PROJECT NOTES', body: 'Key milestones and deliverables for Q4. All encryption keys rotated. Team access via Key Forge.', updated: '2026-11-10', pinned: true },
    { id: 'sample-2', title: 'PRIVATE JOURNAL', body: 'Personal reflections. End-to-end encrypted. No cloud sync. Vault key rotation scheduled.', updated: '2026-11-08', pinned: false },
    { id: 'sample-3', title: 'RECOVERY CHECKLIST', body: '1. Verify backup integrity 2. Test key rotation 3. Confirm Shamir shares 4. Document recovery phrase location', updated: '2026-11-05', pinned: true },
  ];

  return (
    <main className="dw-page dw-notes dw-black-archive" data-screen={routeId ? 'NOTES_EDITOR' : 'SECURE_NOTES'}>
      <aside className="dw-folio-spine" aria-hidden="true">
        <div className="dw-folio-spine-inner">
          <div className="dw-folio-emboss">
            <Mark name="book" />
          </div>
          <div className="dw-folio-title">
            <span>B</span><span>L</span><span>A</span><span>C</span><span>K</span>
            <span style={{marginBlock: '8px'}} />
            <span>A</span><span>R</span><span>C</span><span>H</span><span>I</span><span>V</span><span>E</span>
          </div>
          <div className="dw-folio-ribbons">
            <span className="dw-ribbon violet" />
            <span className="dw-ribbon cyan" />
            <span className="dw-ribbon magenta" />
          </div>
        </div>
      </aside>

      <div className="dw-archive-content">
        <div className="dw-archive-tabs" role="tablist" aria-label={t('Archive sections')}>
          <button
            role="tab"
            aria-selected={activeTab === 'notes'}
            aria-controls="notes-panel"
            id="tab-notes"
            className={`dw-archive-tab ${activeTab === 'notes' ? 'active' : ''}`}
            onClick={() => setActiveTab('notes')}
          >
            <Mark name="file" /> {t('SECURE NOTES')}
          </button>
          <button
            role="tab"
            aria-selected={activeTab === 'passwords'}
            aria-controls="passwords-panel"
            id="tab-passwords"
            className={`dw-archive-tab ${activeTab === 'passwords' ? 'active' : ''}`}
            onClick={() => setActiveTab('passwords')}
          >
            <Mark name="key" /> {t('CREDENTIALS')}
          </button>
        </div>

        <div role="tabpanel" id="notes-panel" aria-labelledby="tab-notes" hidden={activeTab !== 'notes'}>
          <section className="dw-note-list">
            <PageHeading title={t('BLACK ARCHIVE')} caption={t('Secure notes · Encrypted folio')} />
            <button className="dw-float-new-note" onClick={() => open(createNote())}>
              <Mark name="plus" /> {t('NEW SECURE NOTE')}
            </button>
            <div className="dw-segments">
              <button aria-pressed={!starred} onClick={() => setStarred(false)}>{t('All Notes')} <span style={{color:'#8993AD'}}>({notes.length})</span></button>
              <button aria-pressed={starred} onClick={() => setStarred(true)}>{t('Starred')}</button>
            </div>
            <input
              aria-label={t('Search notes')}
              type="search"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={t('Search notes…')}
            />
            <div className="dw-archive-layers">
              {sampleNotes.map((n, i) => (
                <button
                  key={n.id}
                  className={`dw-note-card dw-folded-card ${n.pinned ? 'pinned' : ''}`}
                  style={{ '--card-index': i }}
                  onClick={() => open(n.id || `sample-${i}`)}
                >
                  <div className="dw-fold-corner" aria-hidden="true" />
                  <Mark name="file" style={{ color: n.pinned ? '#7556FF' : '#8993AD' }} />
                  <div className="dw-fold-content">
                    <strong>{t(n.title)}</strong>
                    <small>{t(n.updated)}</small>
                    <p>{n.body.slice(0, 100)}</p>
                  </div>
                  <span style={{ color: n.pinned ? '#7556FF' : '#8993AD' }}>{n.pinned ? '★' : '☆'}</span>
                </button>
              ))}
            </div>
            {filtered.map(n => (
              <button
                className={`dw-note-card dw-folded-card ${n.pinned ? 'pinned' : ''}`}
                key={n.id}
                aria-pressed={n.id === note?.id}
                onClick={() => open(n.id)}
              >
                <div className="dw-fold-corner" aria-hidden="true" />
                <Mark name="file" style={{ color: n.pinned ? '#7556FF' : '#8993AD' }} />
                <div className="dw-fold-content">
                  <strong>{n.listTitle ? t(n.listTitle) : noteText(n, 'title', t)}</strong>
                  <small>{t(n.updated)}</small>
                  <p>{noteText(n, 'body', t).slice(0, 100)}</p>
                </div>
                <span style={{ color: n.pinned ? '#7556FF' : '#8993AD' }}>{n.pinned ? '★' : '☆'}</span>
              </button>
            ))}
            {!filtered.length && sampleNotes.length === 0 && <p className="dw-empty">{t('No notes match your search.')}</p>}
          </section>
        </div>

        <div role="tabpanel" id="passwords-panel" aria-labelledby="tab-passwords" hidden={activeTab !== 'passwords'}>
          <p className="dw-muted" style={{ textAlign: 'center', padding: '40px' }}>
            {t('Switch to Passwords screen for credential management.')}
          </p>
          <Link className="dw-primary" style={{ display: 'inline-flex', margin: '0 auto' }} to={SCREENS.PASSWORDS}>
            <Mark name="key" /> {t('Open Passwords')}
          </Link>
        </div>
      </div>

      <section className="dw-note-editor">
        {note ? (
          <>
            <header>
              <h1>{noteText(note, 'title', t)}</h1>
              <span className="dw-badge">{t('In-memory preview · Not persisted')}</span>
              <button
                aria-label={t('Pin note')}
                aria-pressed={note.pinned}
                onClick={() => updateNote(note.id, { pinned: !note.pinned })}
                style={{ padding: '8px 12px', fontSize: '16px' }}
              >
                {note.pinned ? '★' : '☆'}
              </button>
            </header>
            <p className="dw-muted">{t('Fictional notes · Reload resets changes · No encrypted persistence')}</p>
            <div className="dw-format-toolbar" role="toolbar" aria-label={t('Note formatting')}>
              {[
                ['bold', 'B'],
                ['italic', 'I'],
                ['underline', 'U'],
                ['code', '<>'],
                ['link', '🔗']
              ].map(([k, label]) => (
                <button
                  key={k}
                  aria-label={t(k)}
                  aria-pressed={note.format[k]}
                  onClick={() => updateNote(note.id, { format: { ...note.format, [k]: !note.format[k] } })}
                >
                  {label}
                </button>
              ))}
            </div>
            <label>
              {t('Note title')}
              <input
                aria-label={t('Note title')}
                value={note.title}
                maxLength={120}
                onChange={e => updateNote(note.id, { title: e.target.value })}
              />
            </label>
            <textarea
              aria-label={t('Note body')}
              value={note.body}
              onChange={e => updateNote(note.id, { body: e.target.value })}
              placeholder={t('Write your encrypted thoughts…')}
              maxLength={10000}
            />
          </>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: '300px', textAlign: 'center', padding: '40px' }}>
            <StagEmblem style={{ width: '120px', height: '120px', marginBottom: '20px', opacity: 0.4 }} />
            <h2 style={{ color: '#8993AD' }}>{t('Select a note or create a new one')}</h2>
            <p className="dw-muted" style={{ maxWidth: '300px', marginTop: '8px' }}>
              {t('The Black Archive preserves your encrypted thoughts. Each note is sealed until you unlock it.')}
            </p>
          </div>
        )}
      </section>

      <aside className="dw-inspector">
        <StagBanner title="" caption="" />
        <Panel title={t('Note Inspector')}>
          {note ? (
            <>
              <div className="dw-selected-file">
                <span className="dw-monogram">{noteText(note, 'title', t)[0]}</span>
                <div>
                  <h3>{noteText(note, 'title', t)}</h3>
                  <small>{t(note.updated)}</small>
                </div>
              </div>
              <dl>
                <div><dt>{t('Category')}</dt><dd>{t(note.category || 'General')}</dd></div>
                <div><dt>{t('Pinned')}</dt><dd>{note.pinned ? t('Yes') : t('No')}</dd></div>
                <div><dt>{t('Format')}</dt><dd>
                  {Object.entries(note.format).filter(([,v]) => v).map(([k]) => k).join(', ') || 'Plain'}
                </dd></div>
                <div><dt>{t('Length')}</dt><dd>{note.body.length} {t('chars')}</dd></div>
                <div><dt>{t('Encryption')}</dt><dd>AES-256-GCM (when vault unlocked)</dd></div>
              </dl>
            </>
          ) : (
            <>
              <h3>{t('No note selected')}</h3>
              <dl>
                <div><dt>{t('Total notes')}</dt><dd>{notes.length}</dd></div>
                <div><dt>{t('Pinned')}</dt><dd>{notes.filter(n => n.pinned).length}</dd></div>
              </dl>
            </>
          )}
          <p className="dw-muted">{t('Notes are encrypted at rest when vault is unlocked. In preview mode, changes are not persisted.')}</p>
        </Panel>
      </aside>
    </main>
  );
}

/* ============ DESKTOP ROUTE ============ */
export function DesktopRoute({ id, children }) {
  const wide = useDesktopWorkspace();
  if (!wide) return children;

  switch (id) {
    case 'BACKUP': return <DesktopBackup />;
    case 'TOOLS': return <DesktopTools />;
    case 'PASSWORDS': return <DesktopPasswords />;
    case 'AUTHENTICATOR': return <DesktopAuthenticator />;
    case 'KEY_FORGE': return <DesktopKeyForge />;
    case 'PRIVACY': return <DesktopPrivacy />;
    case 'HOME': return <DesktopHome />;
    case 'FILE_CIPHER': return <DesktopFileCipher />;
    case 'SHADOW_VAULT': return <DesktopVault />;
    case 'NOTES':
    case 'NOTES_EDITOR': return <DesktopNotes />;
    default: return children;
  }
}