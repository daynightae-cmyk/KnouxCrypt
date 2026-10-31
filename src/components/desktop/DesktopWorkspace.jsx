import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate, useParams } from 'react-router-dom';
import { SCREENS, SERVICES } from '../../config/screens';
import { useLanguage } from '../../i18n/Language';
import { StagEmblem } from '../entry/StagEmblem';
import { Mark } from '../security/ScreenUI';
import { ServiceGrid, ToolsDirectory } from '../home/Home';
import { useNotes, NOTE_CATEGORIES, SAMPLE_NOTES } from '../notes/NotesContext';
import './desktop.css';
import { LiveSecurityPreview, ServiceQuickDock, sceneForPath } from './LiveSecurityPreview';
import { WorkspaceActivityTray, useWorkspaceActivity } from './WorkspaceActivity';
import { ExperienceSettings } from './ExperienceSettings';
import { useMotionPreferences } from '../shell/MotionPreferences';
import {CipherJourney} from './CipherJourney';
import {DesktopBackup,DesktopTools} from './DesktopUtilities';
import {useVault,VAULT_STATE} from '../../hooks/useVault';
import {ERROR_COPY,formatBytes as bytes} from '../security/cipherCopy';
import {DesktopPasswords, DesktopAuthenticator, DesktopKeyForge, DesktopPrivacy} from './DesktopSecurity';

const artwork = import.meta.glob('../../assets/service-*.webp', {eager:true, import:'default'});
export function useDesktopWorkspace() {
  const [wide, setWide] = useState(false);
  useEffect(() => { const media = matchMedia('(min-width: 1100px)'); const sync = () => setWide(media.matches); sync(); media.addEventListener('change', sync); return () => media.removeEventListener('change', sync); }, []);
  return wide;
}
export function DesktopChrome({children}) {
  const {t, dir} = useLanguage();
  const {pathname} = useLocation();
  const [previewId,setPreviewId] = useState(null);
  const motion = useMotionPreferences();
  const [collapsed, setCollapsed] = useState(false);
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [windowError, setWindowError] = useState('');
  const search = useRef(null);
  const content=useRef(null);
  const wide=useDesktopWorkspace();
  const entry = pathname === SCREENS.SPLASH_ENTRY || pathname === SCREENS.SECURE_ACCESS_LOGIN;
  useEffect(() => { if(entry || !wide)return; const key = e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k' && !entry) {e.preventDefault(); search.current?.focus();} if(e.key === 'Escape' && !document.querySelector('dialog[open]')) {e.preventDefault();setSearching(false);} }; window.addEventListener('keydown',key,true); return () => window.removeEventListener('keydown',key,true); },[entry,wide]);
  useEffect(() => {setSearching(false); setQuery('');},[pathname]);
  useLayoutEffect(()=>{content.current?.scrollTo(0,0);},[pathname,wide]);
  if(entry || !wide) return children;
  async function windowAction(action) {try {await window.electronAPI.window[action]();} catch {setWindowError(t('Window control unavailable'));}}
  const current = SERVICES.find(s => pathname === SCREENS[s.id] || pathname.startsWith(SCREENS[s.id] + '/'));
  return <div className={`dw-workspace ${collapsed?'dw-collapsed':''}`} dir={dir}>
    <header className="dw-titlebar"><Link to={SCREENS.HOME}><StagEmblem className="dw-compact-brand"/>KNOUX <em>CRYPT</em></Link><span>{t('Private Encryption Suite')}</span><div className="dw-window-controls">{window.electronAPI?.window && [['minimize','−'],['maximize','□'],['close','×']].map(([action,label])=><button key={action} onClick={()=>windowAction(action)} aria-label={t(action)}>{label}</button>)}</div></header>
    <aside className="dw-sidebar"><div className="dw-sidebar-brand"><StagEmblem/><div>KNOUX <em>CRYPT</em><small>{t('Private Encryption Suite')}</small></div></div><button className="dw-collapse" onClick={()=>setCollapsed(v=>!v)} aria-expanded={!collapsed} aria-label={t('Toggle navigation')}>☰ <span>{t('Workspace')}</span></button><nav aria-label={t('Desktop navigation')}><NavLink to={SCREENS.HOME} aria-label={t('Home')} end><Mark name="home"/><span>{t('Home')}</span></NavLink><NavLink to={SCREENS.TOOLS} aria-label={t('Tools')} end><Mark name="grid"/><span>{t('Tools')}</span></NavLink><NavLink to={SCREENS.SECURE_ACCESS_LOGIN} state={{returnTo:SCREENS.HOME}} aria-label={t('Account')}><Mark name="lock"/><span>{t('Account')}</span></NavLink><p>{t('SECURITY')}</p>{SERVICES.map(s=><NavLink key={s.id} to={SCREENS[s.id]} data-service={s.id} aria-label={t(s.title)}><img src={artwork[`../../assets/service-${s.art}.webp`]} alt=""/><span>{t(s.title)}</span></NavLink>)}</nav><div className="dw-sidebar-foot"><Mark name="info"/><span>{t(window.knouxcrypt?.isElectron?'Local desktop':'Browser preview')}</span></div></aside>
    <header className="dw-command"><div className="dw-command-search"><Mark name="search"/><input ref={search} type="search" aria-label={t('Search tools')} placeholder={t('Search files, vault, notes, or tools…')} value={query} onFocus={()=>setSearching(true)} onChange={e=>{setQuery(e.target.value);setSearching(true);}}/><kbd>Ctrl K</kbd></div><Link to={SCREENS.PRIVACY} aria-label={t('Privacy Center')}><Mark name="settings"/></Link><WorkspaceActivityTray/><ExperienceSettings/><Link className="dw-account" to={SCREENS.SECURE_ACCESS_LOGIN} state={{returnTo:SCREENS.HOME}}><span>K</span>{t('Account')}</Link>{searching&&<div className="dw-command-results"><button className="dw-search-close" onClick={()=>setSearching(false)} aria-label={t('Close')}>×</button><ToolsDirectory query={query} resultsId="desktop-command-results"/></div>}</header>
    <div className="dw-route-tab"><span><Mark name="grid"/>{t(current?.title || (pathname===SCREENS.TOOLS?'Tools':'Workspace'))}</span><Link to={SCREENS.TOOLS}>{t('All tools')} ＋</Link></div>
    <ServiceQuickDock onPreview={setPreviewId}/><div className="dw-content" ref={content} onPointerMove={e=>{const card=e.target.closest('.hub-service');if(!card||!motion.running||motion.preferences.performance||e.pointerType==='touch')return;const b=card.getBoundingClientRect();card.style.setProperty('--tilt-x',`${(1-2*(e.clientY-b.top)/b.height).toFixed(2)}deg`);card.style.setProperty('--tilt-y',`${(2*(e.clientX-b.left)/b.width-1).toFixed(2)}deg`);}} onPointerOut={e=>{const card=e.target.closest('.hub-service');if(card&&!card.contains(e.relatedTarget)){card.style.removeProperty('--tilt-x');card.style.removeProperty('--tilt-y');}}}><LiveSecurityPreview previewId={previewId}/><CipherJourney service={sceneForPath(pathname).id}/>{children}</div><footer className="dw-status"><span>{t(window.knouxcrypt?.isElectron?'Electron workspace':'Browser preview · desktop services unavailable')}</span><span role="status">{windowError || t('Local only · no uploads')}</span></footer>
  </div>;
}
export function Panel({title,children,className=''}) {const {t}=useLanguage(); return <section className={`dw-panel ${className}`}><h2>{t(title)}</h2>{children}</section>;}
export function PageHeading({title,caption,children}) {const {t}=useLanguage();return <header className="dw-page-heading"><div><h1>{t(title)}</h1><p>{t(caption)}</p></div><div className="dw-actions">{children}</div></header>;}
export function StagBanner({title,caption}) {const {t}=useLanguage();return <section className="dw-stag-banner">{(title||caption)&&<div><h2>{t(title)}</h2><p>{t(caption)}</p></div>}<StagEmblem ignite/><i aria-hidden="true"/></section>;}
export function DesktopHome() {
  const {t}=useLanguage();
  return <main className="dw-page dw-home" data-screen="HOME"><div className="dw-home-center"><section className="dw-home-hero"><h1>KNOUX <em>CRYPT</em></h1><p>{t('Private Encryption Suite')}</p><div className="dw-brand-line"/><h2>{t('Your private workspace')}</h2><small>{t('Choose a service to begin')}</small></section><ServiceGrid/></div><aside className="dw-inspector"><Panel title="System Status"><dl>{['Encryption Engine','Vault Protection','Key Management','2FA Services'].map(label=><div key={label}><dt>{t(label)}</dt><dd>{t('Not verified')}</dd></div>)}</dl><p className="dw-muted">{t('Protection is reported only after a real service succeeds.')}</p></Panel><Panel title="Quick Actions">{[['FILE_CIPHER','New Encrypted File','file'],['SHADOW_VAULT','Open Vault','folder'],['NOTES','Create Secure Note','file'],['KEY_FORGE','Generate Key','key']].map(([id,label,icon])=><Link className="dw-action-row" key={id} to={SCREENS[id]}><Mark name={icon}/>{t(label)}<span>›</span></Link>)}</Panel><StagBanner title="Privacy. Security. Control." caption="Your data stays local."/></aside></main>;
}
export function DesktopFileCipher() {
  const {t}=useLanguage();
  const vault=useVault();
  const [mode,setMode]=useState('encrypt');
  const [inputPath,setInputPath]=useState(null);
  const [outputPath,setOutputPath]=useState(null);
  const [result,setResult]=useState(null);
  const opId=useRef(null);
  const unlocked=vault.state===VAULT_STATE.UNLOCKED;
  const busy=vault.busy;
  const percent=vault.progress?.total?Math.min(100,Math.round(vault.progress.processed/vault.progress.total*100)):0;
  const errorMessage=vault.error?ERROR_COPY[vault.error.code]||vault.error.message:null;
  async function chooseInput(){setResult(null);const r=await vault.pickInputFile();if(r?.ok&&!r.data.cancelled&&r.data.path){setInputPath(r.data.path);setOutputPath(null);}}
  async function chooseOutput(){const r=await vault.pickOutputFile({title:mode==='encrypt'?t('Save encrypted container as'):t('Save decrypted file as'),defaultPath:inputPath||undefined});if(r?.ok&&!r.data.cancelled&&r.data.path)setOutputPath(r.data.path);}
  async function run(){if(!unlocked||!inputPath||!outputPath)return;setResult(null);const id=`${mode}-${Date.now()}`;opId.current=id;const payload={inputPath,outputPath,operationId:id};const res=mode==='encrypt'?await vault.encryptFile(payload):await vault.decryptFile(payload);setResult(res?.ok?{ok:true,mode,outputPath:res.data.outputPath,meta:res.data.meta}:{ok:false,mode,code:res?.error?.code});}
  async function cancel(){if(opId.current)await vault.cancel(opId.current);}
  const stateLabel=!vault.available?t('Vault engine unavailable'):vault.state===VAULT_STATE.GUEST?t('Guest preview — cannot encrypt'):unlocked?t('Vault unlocked'):t('Vault locked');
  return <main className="dw-page" data-screen="FILE_CIPHER" data-vault-state={vault.state}>
    <PageHeading title="File Cipher" caption="Encrypt and decrypt with authenticated protection."><div className="dw-segments">{['encrypt','decrypt'].map(m=><button key={m} aria-pressed={mode===m} onClick={()=>{setMode(m);setResult(null);}}>{t(m==='encrypt'?'Encrypt':'Decrypt')}</button>)}</div><span className="dw-badge">{t(stateLabel)}</span></PageHeading>
    <div className="dw-split"><div className="dw-main-column"><Panel title="Select File">
      <div className="dw-panel-actions"><span data-testid="file-cipher-state">{t(stateLabel)}</span></div>
      <button className="dw-add-files" onClick={chooseInput} disabled={!vault.available}>{t('Choose File')} ＋</button>
      {inputPath&&<div className="dw-selected-file"><Mark name="file"/><strong dir="ltr">{inputPath.split(/[\\/]/).pop()}</strong></div>}
      <p className="dw-muted" dir="ltr">{inputPath||t('No file selected.')}</p>
      <button className="dw-add-files" onClick={chooseOutput} disabled={!vault.available}>{t(outputPath?'Change destination':'Choose destination')}</button>
      <p className="dw-muted" dir="ltr">{outputPath||t('No destination chosen.')}</p>
      {!unlocked&&<p className="dw-muted" role="status">{t('Unlock the vault from Secure Access to enable file operations.')}</p>}
      {errorMessage&&<p className="dw-muted" role="alert" data-cipher-error={vault.error?.code}>{t(errorMessage)}</p>}
      {busy&&<div className="dw-destination" role="status" aria-live="polite" data-cipher-progress={percent}><Mark name="clock"/><div><strong>{t(mode==='encrypt'?'Encrypting…':'Decrypting…')}</strong><p>{percent}% · {bytes(vault.progress?.processed)} / {bytes(vault.progress?.total)}</p></div><button onClick={cancel}>{t('Cancel')}</button></div>}
      {result?.ok&&<div className="dw-destination" role="status" data-cipher-result="success"><Mark name="shield"/><div><strong>{t(result.mode==='encrypt'?'Encrypted successfully':'Decrypted and verified')}</strong><p dir="ltr">{result.outputPath}</p><p>{t('Original size')}: {bytes(result.meta?.origSize)} · {t('SHA-256')}: <bdi dir="ltr">{(result.meta?.plaintextSha256||'').slice(0,16)}…</bdi></p></div></div>}
      {result&&!result.ok&&<div className="dw-destination" role="alert" data-cipher-result="failure"><Mark name="info"/><div><strong>{t('Operation did not complete')}</strong><p>{t(ERROR_COPY[result.code]||'The operation failed.')}</p></div></div>}
      <button className="dw-primary" disabled={!vault.available||busy||!inputPath||!outputPath||!unlocked} onClick={run}><Mark name={mode==='encrypt'?'lock':'unlock'}/>{t(mode==='encrypt'?'Encrypt File':'Decrypt File')}</button>
    </Panel></div>
    <aside className="dw-inspector"><Panel title="Inspector"><dl>
      <div><dt>{t('Algorithm')}</dt><dd>AES-256-GCM</dd></div>
      <div><dt>{t('Key derivation')}</dt><dd>{vault.status?.engine?.kdf||'HKDF-SHA256'}</dd></div>
      <div><dt>{t('Container')}</dt><dd>{vault.status?.engine?.format||'KNXVLT01'}</dd></div>
      <div><dt>{t('Session')}</dt><dd>{t(vault.session?(vault.session.guest?'Guest':'Authenticated'):'Locked')}</dd></div>
    </dl>
    <p className="dw-muted">{t('Encryption runs in the desktop process. Files are written atomically and existing files are never overwritten silently.')}</p>
    {!unlocked&&<Link className="dw-primary" to={SCREENS.SECURE_ACCESS_LOGIN} state={{returnTo:SCREENS.HOME}}>{t('Unlock Vault')}</Link>}
    </Panel></aside></div></main>;
}
export function DesktopVault() {
  const {t}=useLanguage();const [collection,setCollection]=useState('All Items');const [view,setView]=useState('grid');const [query,setQuery]=useState('');
  return <main className="dw-page" data-screen="SHADOW_VAULT"><PageHeading title="Vault" caption="Manage your encrypted collections and protected items"><Link className="dw-primary" to={SCREENS.SECURE_ACCESS_LOGIN} state={{returnTo:SCREENS.HOME}}>{t('Unlock Vault')}</Link></PageHeading><div className="dw-vault-layout"><Panel title="Collections" className="dw-collections">{['All Items','Personal','Work','Finance','Identity','Crypto','Private Media','Documents','Trash'].map((c,i)=><button key={c} aria-pressed={collection===c} onClick={()=>setCollection(c)}><Mark name={i===0?'grid':'folder'}/>{t(c)}<span>—</span></button>)}</Panel><div className="dw-main-column"><StagBanner title="Shadow Vault" caption="Unlock to access protected data."/><div className="dw-list-heading"><h2>{t('Protected Items')}</h2><div className="dw-segments">{['grid','list'].map(v=><button key={v} aria-pressed={view===v} onClick={()=>setView(v)}>{t(v==='grid'?'Grid':'List')}</button>)}</div></div><label className="dw-search-label">{t('Search vault')}<input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder={t('Search after unlocking')} disabled/></label><div className={`dw-vault-empty dw-panel dw-view-${view}`}><Mark name="lock"/><h2>{t('Vault is locked')}</h2><p>{t('Unlock to view your collections. No protected items are loaded.')}</p><small>{t(collection)}</small><Link className="dw-primary" to={SCREENS.SECURE_ACCESS_LOGIN} state={{returnTo:SCREENS.HOME}}>{t('Open Account')}</Link></div></div><aside className="dw-inspector"><Panel title="Inspector"><StagEmblem/><h3>{t('No item selected')}</h3><dl><div><dt>{t('Status')}</dt><dd>{t('Locked')}</dd></div><div><dt>{t('Storage')}</dt><dd>{t('Not connected')}</dd></div></dl><p className="dw-muted">{t('Item details become available after an authenticated unlock.')}</p></Panel><Link className="dw-action-row" to={SCREENS.COLLECTIONS}>{t('Collections preview')} ›</Link></aside></div></main>;
}
function noteText(note,field,t){const original=SAMPLE_NOTES.find(n=>n.id===note.id);return original?.[field]===note[field]?t(note[field]):note[field];}
export function DesktopNotes() {
  const {t}=useLanguage();const {notes,updateNote,createNote}=useNotes();const {id:routeId}=useParams();const navigate=useNavigate();const [selected,setSelected]=useState(notes[0]?.id);const [query,setQuery]=useState('');const [starred,setStarred]=useState(false);
  const note=notes.find(n=>n.id===(routeId||selected));const filtered=notes.filter(n=>(!starred||n.pinned)&&`${n.title} ${n.body}`.toLowerCase().includes(query.toLowerCase()));
  function open(id){setSelected(id);navigate(`${SCREENS.NOTES_EDITOR}/${id}`);}
  return <main className="dw-page dw-notes" data-screen={routeId?'NOTES_EDITOR':'SECURE_NOTES'}><section className="dw-note-list"><PageHeading title="Secure Notes" caption="Write. Encrypt. Keep it yours."/><button className="dw-primary" onClick={()=>open(createNote())}>＋ {t('New Note')}</button><div className="dw-segments"><button aria-pressed={!starred} onClick={()=>setStarred(false)}>{t('All Notes')} {notes.length}</button><button aria-pressed={starred} onClick={()=>setStarred(true)}>{t('Starred')}</button></div><input aria-label={t('Search notes')} type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder={t('Search notes…')}/>{filtered.map(n=><button className="dw-note-card" key={n.id} aria-pressed={n.id===note?.id} onClick={()=>open(n.id)}><Mark name="file"/><span><strong>{n.listTitle?t(n.listTitle):noteText(n,'title',t)}</strong><small>{t(n.updated)}</small><p>{noteText(n,'body',t).slice(0,95)}</p></span><span>{n.pinned?'★':'☆'}</span></button>)}{!filtered.length&&<p className="dw-empty">{t('No notes match your search.')}</p>}</section><section className="dw-note-editor">{note?<><header><h1>{noteText(note,'title',t)}</h1><span className="dw-badge">{t('In-memory preview only')}</span><button aria-label={t('Pin note')} aria-pressed={note.pinned} onClick={()=>updateNote(note.id,{pinned:!note.pinned})}>{note.pinned?'★':'☆'}</button></header><p className="dw-muted">{t('Fictional notes · reload resets changes · no encrypted persistence')}</p><div className="dw-format-toolbar" role="toolbar" aria-label={t('Note formatting')}>{[['bold','B'],['italic','I'],['underline','U']].map(([k,label])=><button key={k} aria-label={t(k)} aria-pressed={note.format[k]} onClick={()=>updateNote(note.id,{format:{...note.format,[k]:!note.format[k]}})}>{label}</button>)}</div><label>{t('Note title')}<input aria-label={t('Note title')} value={note.title} maxLength={120} onChange={e=>updateNote(note.id,{title:e.target.value})}/></label><textarea aria-label={t('Note body — fictional information only')} dir="auto" value={note.body} maxLength={10000} style={{fontWeight:note.format.bold?700:400,fontStyle:note.format.italic?'italic':'normal',textDecoration:note.format.underline?'underline':'none'}} onChange={e=>updateNote(note.id,{body:e.target.value})}/></>:<p className="dw-empty">{t('Select or create a note')}</p>}</section><aside className="dw-inspector"><StagBanner title="" caption=""/><Panel title="Note Details"><dl><div><dt>{t('Title')}</dt><dd>{note?.title||'—'}</dd></div><div><dt>{t('Characters')}</dt><dd>{note?.body.length||0}</dd></div><div><dt>{t('Storage')}</dt><dd>{t('Memory only')}</dd></div><div><dt>{t('Encryption')}</dt><dd>{t('Not connected')}</dd></div></dl>{note&&<label>{t('Category')}<select value={note.category} onChange={e=>updateNote(note.id,{category:e.target.value})}>{NOTE_CATEGORIES.map(c=><option key={c}>{c}</option>)}</select></label>}</Panel><Panel title="Export & Share"><p className="dw-muted">{t('Encrypted export and sharing require the desktop notes service.')}</p><button disabled>{t('Export Encrypted')}</button></Panel></aside></main>;
}
export function DesktopRoute({id,children}) {
  const wide=useDesktopWorkspace();
  if(!wide) return children;
  switch(id){case 'BACKUP':return <DesktopBackup/>;case 'TOOLS':return <DesktopTools/>;case 'PASSWORDS':return <DesktopPasswords/>;case 'AUTHENTICATOR':return <DesktopAuthenticator/>;case 'KEY_FORGE':return <DesktopKeyForge/>;case 'PRIVACY':return <DesktopPrivacy/>;case 'HOME':return <DesktopHome/>;case 'FILE_CIPHER':return <DesktopFileCipher/>;case 'SHADOW_VAULT':return <DesktopVault/>;case 'NOTES':case 'NOTES_EDITOR':return <DesktopNotes/>;default:return children;}
}
