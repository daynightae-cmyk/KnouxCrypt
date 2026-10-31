import React,{createContext,useCallback,useContext,useEffect,useMemo,useRef,useState} from 'react';
import {useLocation} from 'react-router-dom';
import {useNotes} from '../notes/NotesContext';
import {useLanguage} from '../../i18n/Language';
import {SCREENS,SERVICES} from '../../config/screens';
const EMPTY={queued:0,notes:0,updateQueue:()=>{},visits:[]};
const Context=createContext(EMPTY);
export function WorkspaceActivityProvider({children}){
  const {pathname}=useLocation();const {notes}=useNotes();
  const [queued,setQueued]=useState(0);const [visits,setVisits]=useState([]);
  const updateQueue=useCallback(count=>setQueued(Math.max(0,Math.floor(Number(count)||0))),[]);
  useEffect(()=>{
    // Whitelist display identifiers: never retain filenames, note text, parameters,
    // credentials or IDs from detail URLs. Activity is memory-only and bounded.
    const id=SERVICES.find(s=>pathname===SCREENS[s.id]||pathname.startsWith(SCREENS[s.id]+'/'))?.id||(pathname===SCREENS.HOME?'HOME':pathname.startsWith('/tools')?'TOOLS':null);
    if(id)setVisits(all=>all[0]?.id===id?all:[{id,time:Date.now()},...all].slice(0,12));
  },[pathname]);
  const value=useMemo(()=>({queued,notes:notes.length,updateQueue,visits}),[queued,notes.length,updateQueue,visits]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useWorkspaceActivity(){return useContext(Context);}
export function WorkspaceActivityTray(){
  const {t}=useLanguage();const {visits,queued,notes}=useWorkspaceActivity();
  const root=useRef(null);const {pathname}=useLocation();
  useEffect(()=>{if(root.current)root.current.open=false;},[pathname]);
  useEffect(()=>{
    const key=e=>{if(e.key==='Escape'&&root.current?.open&&!document.querySelector('dialog[open]')){root.current.open=false;root.current.querySelector('summary')?.focus();}};
    const outside=e=>{if(root.current&&!root.current.contains(e.target))root.current.open=false;};
    document.addEventListener('keydown',key);document.addEventListener('pointerdown',outside);
    return()=>{document.removeEventListener('keydown',key);document.removeEventListener('pointerdown',outside);};
  },[]);
  const names={HOME:'Home',TOOLS:'Tools',...Object.fromEntries(SERVICES.map(s=>[s.id,s.title]))};
  return <details ref={root} className="workspace-activity"><summary>{t('Workspace activity')} <span>{visits.length}</span></summary><div><p>{t('Navigation only · memory only · no security audit')}</p><dl><div><dt>{t('Queued files')}</dt><dd>{queued}</dd></div><div><dt>{t('Fictional notes in memory')}</dt><dd>{notes}</dd></div></dl><ol>{visits.map((v,i)=><li key={`${v.id}-${v.time}-${i}`}><span>{t(names[v.id])}</span><time>{new Date(v.time).toLocaleTimeString()}</time></li>)}</ol></div></details>;
}
