import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { SCREENS } from '../../config/screens';
import { useLanguage } from '../../i18n/Language';
import { useVault, VAULT_STATE } from '../../hooks/useVault';
import { TOOL_SERVICES, TOOL_CATEGORIES } from '../home/Home';
import { Mark } from '../security/ScreenUI';
import { KnouxServiceIcon } from '../icons/KnouxServiceIcon';
import { capabilityById } from '../../config/desktopCapabilities';
import { capabilityIdFor } from '../../config/serviceIconRegistry';
import { Panel, PageHeading, StagBanner } from './DesktopWorkspace';

/* ============ BACKUP & RECOVERY STUDIO ============ */
export function DesktopBackup() {
  const { t } = useLanguage();
  const vault = useVault();
  const unlocked = vault.state === VAULT_STATE.UNLOCKED;
  const [mode, setMode] = useState('Backup');
  const [scope, setScope] = useState(['notes', 'passwords', 'authenticator', 'keys', 'collections']);
  const [backups, setBackups] = useState([]);
  const [selectedBackup, setSelectedBackup] = useState(null);
  const [inspectReport, setInspectReport] = useState(null);
  const [created, setCreated] = useState(null);
  const [restored, setRestored] = useState(null);
  const [note, setNote] = useState(null);
  const [busy, setBusy] = useState(false);

  // Real sealed collections inside the encrypted store.
  const datasets = [
    { id: 'notes', title: 'Notes', match: 'NOTES', art: 'notes' },
    { id: 'passwords', title: 'Passwords', match: 'PASSWORDS', art: 'passwords' },
    { id: 'authenticator', title: 'Authenticator', match: 'AUTHENTICATOR', art: 'authenticator' },
    { id: 'keys', title: 'Key Forge', match: 'KEY_FORGE', art: 'keys' },
    { id: 'collections', title: 'Shadow Vault', match: 'VAULT', art: 'vault' },
  ];

  const loadBackups = useCallback(async () => {
    if (!unlocked) { setBackups([]); return; }
    const res = await vault.backupList();
    if (res?.ok) setBackups(res.data?.backups || []);
  }, [unlocked, vault.backupList]);

  useEffect(() => {
    loadBackups();
  }, [loadBackups]);

  const activeReport = inspectReport && inspectReport.id === selectedBackup?.id ? inspectReport : null;

  async function createBackup() {
    if (!unlocked || !scope.length) return;
    setBusy(true);
    setNote(null);
    const res = await vault.backupCreate({ collections: scope });
    setBusy(false);
    if (res?.ok) {
      setCreated(res.data);
      setNote({ kind: 'ok', text: t('Encrypted backup written to the local workspace.') });
      await loadBackups();
    } else {
      setNote({ kind: 'warn', text: t(res?.error?.message || 'Backup creation failed.') });
    }
  }

  return (
    <main className="dw-page" data-screen="BACKUP">
      <StagBanner
        title={t('BACKUP & RECOVERY STUDIO')}
        caption={t('Split recovery seals · Encrypted backup · Verified restore')}
      />

      <div className="dw-split dw-backup-body">
        <div className="dw-main-column">
          <div className="dw-segments" style={{ marginBottom: '20px' }}>
            {['Backup', 'Recovery'].map(m => (
              <button key={m} aria-pressed={mode === m} onClick={() => setMode(m)}>
                {t(m)}
              </button>
            ))}
          </div>

          {mode === 'Backup' ? (
            <>
              <Panel title={t('1 · Select Sealed Collections')}>
                <div className="dw-panel-actions">
                  <p>{t('Every collection is read from the encrypted store and sealed into one AES-256-GCM container.')}</p>
                  <button onClick={() => setScope(scope.length ? [] : datasets.map(s => s.id))} style={{ fontSize: '12px' }}>
                    {t(scope.length ? 'Clear Selection' : 'Select All')}
                  </button>
                </div>
                <div className="dw-backup-datasets">
                  {datasets.map(s => (
                    <label key={s.id} className={`dw-backup-dataset ${scope.includes(s.id) ? 'dw-dataset-selected' : ''}`}>
                      <input
                        type="checkbox"
                        checked={scope.includes(s.id)}
                        onChange={e => setScope(old => e.target.checked ? [...old, s.id] : old.filter(id => id !== s.id))}
                      />
                      <span className="dw-tool-glyph"><Mark name={s.id === 'collections' ? 'layers' : s.id === 'notes' ? 'file-text' : s.id === 'keys' ? 'key' : s.id === 'authenticator' ? 'smartphone' : 'user'} /></span>
                      <strong>{t(s.title)}</strong>
                      <small dir="ltr" style={{ fontSize: '10px' }}>{s.id}</small>
                    </label>
                  ))}
                </div>
                <p className="dw-muted" style={{ marginTop: '12px' }}>
                  {t('Selected')}: {scope.length} {t('of')} {datasets.length} {t('collections')}
                </p>
              </Panel>

              <Panel title={t('2 · Encrypted Workspace')}>
                <div className="dw-panel-actions">
                  <p>{t('Backups are written to the local encrypted workspace (backups/). They are never uploaded. Export the file yourself for offsite custody.')}</p>
                </div>
                {backups.length ? (
                  <div className="dw-table-wrap">
                    <table className="dw-table">
                      <thead>
                        <tr>
                          {['Backup ID', 'Size', 'Created', ''].map(c => <th key={c}>{t(c)}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {backups.slice(0, 6).map(b => (
                          <tr key={b.id}>
                            <td><small dir="ltr" style={{ fontFamily: 'monospace' }}>{b.id}</small></td>
                            <td><small>{(b.size / 1024).toFixed(1)} KB</small></td>
                            <td><small>{new Date(b.modifiedAt).toLocaleString()}</small></td>
                            <td><Link to={SCREENS.BACKUP} onClick={() => { setMode('Recovery'); setSelectedBackup(b); }} style={{ fontSize: '11px' }}>{t('Inspect')} ›</Link></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="dw-empty">{vault.available ? (unlocked ? t('No backups exist yet.') : t('Locked vault — backup history hidden.')) : t('Workspace unavailable in this preview.')}</p>
                )}
              </Panel>

              <Panel title={t('3 · Create Encrypted Backup')}>
                <div style={{ marginBottom: '16px', padding: '16px', borderRadius: '10px', background: '#1A0F2E44', border: '1px solid #7556FF15' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span>{t('Container format')}</span>
                    <strong>KNXBAK · AES-256-GCM</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span>{t('Key derivation')}</span>
                    <strong>Argon2id (vault master key)</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>{t('Container size')}</span>
                    <strong>{t('Determined by the sealed content')}</strong>
                  </div>
                </div>
                <button
                  disabled={!unlocked || !scope.length || busy}
                  onClick={createBackup}
                  className="dw-primary"
                  style={{ width: '100%', marginBottom: '12px' }}
                >
                  <Mark name="save" /> {busy ? t('Sealing…') : t('Create Backup')}
                </button>
                {!unlocked && vault.available && <p className="dw-muted">{t('Unlock the vault first. Nothing is written while the store is sealed shut.')}</p>}
                {!vault.available && <p className="dw-muted">{t('Encrypted backup is not available in this preview. No archive has been created.')}</p>}
                {note && <p className="dw-muted" style={{ color: note.kind === 'ok' ? '#65F0E8' : '#FF586D' }}>{note.text}</p>}
                {created && (
                  <div style={{ marginTop: '16px', padding: '16px', borderRadius: '10px', background: '#0A1A18', border: '1px solid #65F0E833' }}>
                    <strong style={{ color: '#65F0E8' }}>{t('Backup sealed')}</strong>
                    <dl style={{ marginTop: '12px' }}>
                      <div><dt>{t('Backup ID')}</dt><dd dir="ltr" style={{ fontFamily: 'monospace', fontSize: '10px' }}>{created.id}</dd></div>
                      <div><dt>{t('File')}</dt><dd dir="ltr" style={{ fontSize: '10px', wordBreak: 'break-all' }}>{created.file}</dd></div>
                      <div><dt>{t('Size')}</dt><dd>{(created.size / 1024).toFixed(1)} KB</dd></div>
                      {Array.isArray(created.manifest) && created.manifest.map(m => (
                        <div key={m.collection}><dt>{t(m.collection)}</dt><dd>{m.count} {t('records')} · sha256 {String(m.sha256).slice(0, 12)}…</dd></div>
                      ))}
                    </dl>
                  </div>
                )}
              </Panel>
            </>
          ) : (
            <>
              <Panel title={t('1 · Choose an Existing Backup')} style={{ maxWidth: '800px' }}>
                {backups.length ? (
                  <div className="dw-backup-datasets" style={{ gridAutoFlow: 'row', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}>
                    {backups.map(b => (
                      <button
                        key={b.id}
                        aria-pressed={selectedBackup?.id === b.id}
                        className={`dw-backup-dataset ${selectedBackup?.id === b.id ? 'dw-dataset-selected' : ''}`}
                        style={{ cursor: 'pointer' }}
                        onClick={() => { setSelectedBackup(b); setRestored(null); }}
                      >
                        <Mark name="database" style={{ width: '22px', height: '22px', color: '#7556FF' }} />
                        <strong dir="ltr" style={{ fontSize: '11px', fontFamily: 'monospace' }}>{b.id}</strong>
                        <small>{(b.size / 1024).toFixed(1)} KB · {new Date(b.modifiedAt).toLocaleDateString()}</small>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="dw-empty">{vault.available ? (unlocked ? t('No backups exist yet. Create one in the Backup tab.') : t('Locked vault — backup history hidden.')) : t('Workspace unavailable in this preview.')}</p>
                )}
              </Panel>

              <Panel title={t('2 · Verify Before Restore')}>
                <p className="dw-muted">{t('Verification decrypts the container in memory and checks every collection checksum against its sealed manifest. Nothing is written.')}</p>
                <button
                  className="dw-action-row"
                  disabled={!unlocked || !selectedBackup || busy}
                  style={{ width: '100%', justifyContent: 'center', marginTop: '8px' }}
                  onClick={async () => {
                    setBusy(true);
                    const res = await vault.backupInspect(selectedBackup.id);
                    setBusy(false);
                    setInspectReport({ id: selectedBackup.id, ok: !!res?.ok, data: res?.data, error: res?.error?.message });
                  }}
                >
                  <Mark name="shield" /> {t('Verify Backup Integrity')}
                </button>
                {activeReport && (
                  <div style={{ marginTop: '16px', padding: '16px', borderRadius: '10px', background: activeReport.ok ? '#0A1A18' : '#1A0A0A44', border: `1px solid ${activeReport.ok ? '#65F0E833' : '#FF586D22'}` }}>
                    <strong style={{ color: activeReport.ok ? '#65F0E8' : '#FF586D' }}>{t(activeReport.ok ? 'Verification passed' : 'Verification failed')}</strong>
                    {activeReport.ok ? (
                      <dl style={{ marginTop: '12px' }}>
                        <div><dt>{t('Format')}</dt><dd>{activeReport.data.format} v{activeReport.data.version}</dd></div>
                        <div><dt>{t('Created')}</dt><dd>{new Date(activeReport.data.createdAt).toLocaleString()}</dd></div>
                        <div><dt>{t('Total records')}</dt><dd>{activeReport.data.totalRecords}</dd></div>
                        {activeReport.data.manifest.map(m => (
                          <div key={m.collection}><dt>{t(m.collection)}</dt><dd>{m.count} {t('records')} · checksum ok</dd></div>
                        ))}
                      </dl>
                    ) : (
                      <p className="dw-muted" style={{ marginTop: '8px', color: '#FF586D' }}>{t(activeReport.error || 'The container could not be verified.')}</p>
                    )}
                  </div>
                )}
              </Panel>

              <Panel title={t('3 · Restore')}>
                <div style={{ marginBottom: '16px', padding: '16px', borderRadius: '10px', background: '#1A0A0A44', border: '1px solid #FF586D22' }}>
                  <strong style={{ color: '#FF586D' }}>{t('⚠ Recovery replaces the vault collections')}</strong>
                  <p className="dw-muted" style={{ marginTop: '8px' }}>{t('Restoring rewrites each sealed collection with the backup contents. Failed restores roll back automatically, but you should still have a second backup.')}</p>
                </div>
                <button
                  disabled={!unlocked || !selectedBackup || busy}
                  className="dw-primary"
                  style={{ width: '100%', background: '#FF586D' }}
                  onClick={async () => {
                    if (!window.confirm(t(`Restore "${selectedBackup.id}" and overwrite the matching collections?`))) return;
                    setBusy(true);
                    const res = await vault.backupRestore(selectedBackup.id, { confirm: true });
                    setBusy(false);
                    if (res?.ok) {
                      setRestored(res.data);
                      setNote({ kind: 'ok', text: t('Restore completed. Reopen other screens to see the restored records.') });
                    } else {
                      setNote({ kind: 'warn', text: t(res?.error?.message || 'Restore failed.') });
                    }
                  }}
                >
                  <Mark name="refresh" /> {busy ? t('Restoring…') : t('Restore from Backup')}
                </button>
                {restored && (
                  <div style={{ marginTop: '16px', padding: '16px', borderRadius: '10px', background: '#0A1A18', border: '1px solid #65F0E833' }}>
                    <strong style={{ color: '#65F0E8' }}>{t('Restore complete')}</strong>
                    <dl style={{ marginTop: '12px' }}>
                      <div><dt>{t('Total records')}</dt><dd>{restored.totalRecords}</dd></div>
                      <div><dt>{t('Backup created')}</dt><dd>{restored.createdAt ? new Date(restored.createdAt).toLocaleString() : '—'}</dd></div>
                      {Array.isArray(restored.restored) && restored.restored.map(m => (
                        <div key={m.collection}><dt>{t(m.collection)}</dt><dd>{m.count} {t('records')}</dd></div>
                      ))}
                    </dl>
                  </div>
                )}
                {note && <p className="dw-muted" style={{ marginTop: '12px', color: note.kind === 'ok' ? '#65F0E8' : '#FF586D' }}>{note.text}</p>}
              </Panel>

              <Panel title={t('Maintenance')}>
                <button
                  className="dw-action-row"
                  disabled={!unlocked || !selectedBackup || busy}
                  style={{ width: '100%', justifyContent: 'center', color: '#FF586D' }}
                  onClick={async () => {
                    if (!window.confirm(t(`Delete backup "${selectedBackup.id}" from the workspace? This cannot be undone.`))) return;
                    const res = await vault.backupRemove(selectedBackup.id);
                    if (res?.ok) {
                      setSelectedBackup(null);
                      setInspectReport(null);
                      await loadBackups();
                    }
                  }}
                >
                  <Mark name="trash" /> {t('Delete selected backup')}
                </button>
              </Panel>
            </>
          )}
        </div>

        <aside className="dw-inspector">
          <Panel title={t('Backup Inspector')}>
            {mode === 'Backup' ? (
              <>
                <dl>
                  <div><dt>{t('Collections Selected')}</dt><dd>{scope.length}</dd></div>
                  <div><dt>{t('Workspace Backups')}</dt><dd>{vault.available ? (unlocked ? backups.length : '—') : '—'}</dd></div>
                  <div><dt>{t('Encryption')}</dt><dd>AES-256-GCM</dd></div>
                  <div><dt>{t('Key Derivation')}</dt><dd>Argon2id</dd></div>
                  <div><dt>{t('Container Format')}</dt><dd>KNXBAK</dd></div>
                  <div><dt>{t('Retention')}</dt><dd>{t('Newest 50 kept')}</dd></div>
                </dl>
                <p className="dw-muted">{t('The container is created, verified, and stored locally in one atomic write. Only the master key derived at unlock can open it.')}</p>
              </>
            ) : (
              <>
                <dl>
                  <div><dt>{t('Selected backup')}</dt><dd dir="ltr" style={{ fontSize: '10px', fontFamily: 'monospace' }}>{selectedBackup?.id || t('None selected')}</dd></div>
                  <div><dt>{t('Size')}</dt><dd>{selectedBackup ? `${(selectedBackup.size / 1024).toFixed(1)} KB` : '—'}</dd></div>
                  <div><dt>{t('Modified')}</dt><dd>{selectedBackup ? new Date(selectedBackup.modifiedAt).toLocaleString() : '—'}</dd></div>
                  <div><dt>{t('Integrity')}</dt><dd>{activeReport ? (activeReport.ok ? t('Verified') : t('Failed')) : t('Not verified')}</dd></div>
                </dl>
                <p className="dw-muted">{t('Recovery reads the container from the encrypted workspace. External files are never silently imported here.')}</p>
              </>
            )}
          </Panel>

          <StagBanner title={t('Recovery')} caption={t('Two seals. One truth.')} />
        </aside>
      </div>
    </main>
  );
}

/* ============ TOOLS & SECURITY LABS ============ */
export function DesktopTools() {
  const { t } = useLanguage();
  const [category, setCategory] = useState('all');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(TOOL_SERVICES.find(s => s.id === 'INTEGRITY') || TOOL_SERVICES[0]);

  const group = TOOL_CATEGORIES.find(c => c.id === category);
  const normalize = s => s.toLocaleLowerCase().normalize('NFKD').replace(/[\u0300-\u036f\u064B-\u065F\u0670\u0640]/g, '');

  const visible = useMemo(() =>
    TOOL_SERVICES.filter(s =>
      (query || group.ids.includes(s.id)) &&
      normalize(`${s.title} ${t(s.title)} ${s.id === 'BACKUP' ? 'Backup' : ''}`).includes(normalize(query))
    ),
    [query, category, group]
  );

  // Group tools by category for display
  const toolsByCategory = useMemo(() => {
    const grouped = {};
    visible.forEach(s => {
      const cat = TOOL_CATEGORIES.find(c => c.ids.includes(s.id));
      const catId = cat?.id || 'other';
      if (!grouped[catId]) grouped[catId] = { category: cat, tools: [] };
      grouped[catId].tools.push(s);
    });
    return grouped;
  }, [visible, category]);

  return (
    <main className="dw-page" data-screen="TOOLS">
      <PageHeading
        title={t('TOOLS & SECURITY LABS')}
        caption={t('Explore tools for encryption, analysis, and security research · 28+ instruments')}
      >
        <span className="dw-badge">{t(`${visible.length} tools visible`)}</span>
      </PageHeading>

      <div className="dw-split">
        <div className="dw-main-column">
          <div className="dw-segments dw-category-bar" style={{ marginBottom: '16px', flexWrap: 'wrap' }}>
            {TOOL_CATEGORIES.map(c => (
              <button key={c.id} aria-pressed={category === c.id} onClick={() => setCategory(c.id)}>
                {t(c.title)} <span style={{ opacity: 0.6, fontSize: '10px', marginInlineStart: '6px' }}>
                  {TOOL_SERVICES.filter(s => c.ids.includes(s.id)).length}
                </span>
              </button>
            ))}
          </div>

          <input
            type="search"
            aria-label={t('Search tools')}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={t('Vault, notes, keys…')}
            style={{ marginBottom: '16px' }}
          />

          <p className="dw-muted" role="status" style={{ marginBottom: '16px' }}>
            {t('Matching services')}: {visible.length}
          </p>

          {/* Tools Grid */}
          <div className="dw-tool-grid">
            {visible.map(s => {
              const status = capabilityById(capabilityIdFor(s.id))?.displayStatus;
              return (
                <article key={s.id} className={`dw-panel ${selected.id === s.id ? 'dw-tool-selected' : ''}`}>
                  <button className="dw-tool-select" onClick={() => setSelected(s)} aria-pressed={selected.id === s.id}>
                    <span className="dw-tool-glyph">
                      <KnouxServiceIcon id={s.id} size="lg" active={selected.id === s.id} />
                    </span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <h2 style={{ marginBottom: '4px' }}>{t(s.title)}</h2>
                      <small>{t('Inspect configuration and available workflow')}</small>
                    </span>
                  </button>
                  <Link to={SCREENS[s.id]} data-service={s.id} style={{ marginTop: 'auto' }}>
                    {t('Open Tool')} ›
                  </Link>
                  <span className="dw-badge">{t(status === 'ACTIVE' || status === 'VERIFIED' ? status : 'VISUAL DEMO')}</span>
                </article>
              );
            })}
          </div>

          {!visible.length && <p className="dw-empty">{t('No matching tools.')}</p>}
        </div>

        <aside className="dw-inspector">
          <StagBanner title="" caption="" />
          <Panel title={t('Tool Inspector')}>
            <div className="dw-tool-inspector-icon">
              <KnouxServiceIcon id={selected.id} size="hero" />
            </div>
            <h2>{t(selected.title)}</h2>
            <p>{t(selected.description || 'Inspect configuration and available workflow')}</p>
            <Link className="dw-primary" to={SCREENS[selected.id]} style={{ marginTop: '12px', width: '100%' }}>
              {t('Open Tool')} ›
            </Link>
            <dl style={{ marginTop: '16px' }}>
              <div><dt>{t('Route')}</dt><dd dir="ltr" style={{ fontSize: '10px' }}>{SCREENS[selected.id]}</dd></div>
              <div><dt>{t('Status')}</dt><dd>
                <span className={`dw-badge ${['ACTIVE', 'VERIFIED'].includes(capabilityById(capabilityIdFor(selected.id))?.displayStatus) ? 'ok' : 'warn'}`}>
                  {t(capabilityById(capabilityIdFor(selected.id))?.displayStatus || 'PLANNED')}
                </span>
              </dd></div>
              <div><dt>{t('Category')}</dt><dd>{t(group?.title || 'Tools')}</dd></div>
              <div><dt>{t('ID')}</dt><dd dir="ltr" style={{ fontSize: '10px', fontFamily: 'monospace' }}>{selected.id}</dd></div>
            </dl>
            <p className="dw-muted" style={{ marginTop: '12px' }}>{t('Opening a screen does not confirm that its security engine is implemented.')}</p>
          </Panel>

          <Panel title={t('Lab Categories')}>
            <dl>
              {TOOL_CATEGORIES.filter(c => c.id !== 'all').map(c => (
                <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #7556FF10' }}>
                  <dt style={{ color: '#A89BC8' }}>{t(c.title)}</dt>
                  <dd style={{ color: '#7556FF', fontFamily: 'monospace', fontSize: '11px' }}>
                    {TOOL_SERVICES.filter(s => c.ids.includes(s.id)).length} {t('tools')}
                  </dd>
                </div>
              ))}
            </dl>
          </Panel>

          <StagBanner title={t('Security Labs')} caption={t('Research. Verify. Harden.')} />
        </aside>
      </div>
    </main>
  );
}