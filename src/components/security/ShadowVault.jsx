import { useLanguage } from "../../i18n/Language";
import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { SCREENS } from "../../config/screens";
import { ScreenFrame, ScreenHeader, Mark, IconButton, PreviewSheet } from "./ScreenUI";
const artwork=import.meta.glob('../../assets/vault-thumb-*.webp',{eager:true,import:'default'});
const samples=[['Photos',24],['Photos',8],['Videos',6],['Photos',12],['Photos',18],['Audio',4],['Files',7],['Videos',9]].map(([category,count],id)=>({id,category,count}));
const categoryIcon={Photos:'photo',Videos:'video',Audio:'audio',Files:'file'};
function LockedTile({sample,onOpen}) {
  const { t, locale, dir } = useLanguage();

 const timer=useRef(null);const held=useRef(false);
 useEffect(()=>()=>clearTimeout(timer.current),[]);
 function stop(){clearTimeout(timer.current);}
 return <article className={`vault-tile vault-tile-${sample.id}`}>
  <button className="vault-tile-main" aria-label={t(`Locked ${sample.category.toLowerCase()} collection ${sample.id+1}, ${sample.count} demo items`)} onPointerDown={e=>{if(e.button!==0)return;held.current=false;timer.current=setTimeout(()=>{held.current=true;onOpen('Collection actions',sample);},600);}} onPointerUp={stop} onPointerCancel={stop} onPointerLeave={stop} onContextMenu={e=>{e.preventDefault();stop();held.current=true;onOpen('Collection actions',sample);}} onClick={()=>{if(held.current){held.current=false;return;}onOpen('Locked preview',sample);}}>
   <img src={artwork[`../../assets/vault-thumb-${sample.id}.webp`]} alt="" draggable="false"/><span className="vault-shutter" aria-hidden="true"/><span className="vault-lock"><Mark name="lock"/></span><span className="vault-tile-count"><Mark name={categoryIcon[sample.category]}/>{t(sample.count)}</span>
  </button><button className="vault-tile-menu" aria-label={t(`Actions for collection ${sample.id+1}`)} onClick={()=>onOpen('Collection actions',sample)}><Mark name="dots"/></button>
 </article>;
}
export function ShadowVault() {
  const { t, locale, dir } = useLanguage();

 const [category,setCategory]=useState('Photos');const [filterActive,setFilterActive]=useState(false);const [sheet,setSheet]=useState(null);const [selected,setSelected]=useState(null);const [search,setSearch]=useState('');
 function open(title,sample){setSelected(sample||null);setSheet(title);}
 const visible=filterActive?samples.filter(s=>s.category===category):samples;
 return <ScreenFrame type="vault-screen"><ScreenHeader title={t("SHADOW")} accent="VAULT" caption="BY KNOUX CRYPT"><IconButton icon="search" label="Search vault demos" onClick={()=>open('Search vault')}/><IconButton icon="dots" label="Vault tools" onClick={()=>open('Vault tools')}/></ScreenHeader>
 <p className="vault-tagline">{t("YOUR SECRETS. YOUR SPACE.")}</p>
 <div className="vault-tabs" role="tablist" aria-label={t("Media category")}>{Object.keys(categoryIcon).map(c=><button role="tab" key={c} aria-selected={category===c} tabIndex={category===c?0:-1} data-category={c} className={category===c?'active':''} onClick={()=>{setCategory(c);setFilterActive(true);}} onKeyDown={e=>{const keys=Object.keys(categoryIcon);let index=keys.indexOf(c);if(e.key==='ArrowRight')index=(index+1)%4;else if(e.key==='ArrowLeft')index=(index+3)%4;else return;e.preventDefault();setCategory(keys[index]);setFilterActive(true);e.currentTarget.parentElement.querySelector(`[data-category="${keys[index]}"]`).focus();}}><Mark name={categoryIcon[c]}/>{t(c)}</button>)}</div>
 <section className={`vault-gallery ${filterActive?'vault-filtered':''}`} aria-label={t(filterActive?`${category} demo collections`:'Reference demo collections')}>{visible.map(s=><LockedTile key={s.id} sample={s} onOpen={open}/>)}</section>
 <section className="vault-usage"><Mark name="database"/><div><strong>{t("Encrypted Vault")}</strong><p>{t("12 demo items ")}<span>{t("•")}</span>{t(" 3.2 GB")}</p></div><div className="vault-meter"><div role="meter" aria-label={t("Illustrative vault usage")} aria-valuenow="40" aria-valuemin="0" aria-valuemax="100"><i/></div><small>{t("40% used")}</small></div></section>
 <button className="security-primary vault-import" onClick={()=>open('Import securely')}><Mark name="upload"/>{t("Import Securely")}<Mark name="chevron"/></button>
 <p className="vault-disclaimer"><Mark name="info"/>{t("Original files are not automatically removed from your device.")}</p>
 <nav className="vault-bottom" aria-label={t("Vault navigation")}><button aria-current="page" onClick={()=>{setCategory('Photos');setFilterActive(false);}}><Mark name="home"/>{t("Vault")}</button><Link to={SCREENS.TOOLS}><Mark name="shield"/>{t("Secure Tools")}</Link><button onClick={()=>open('Vault settings')}><Mark name="settings"/>{t("Settings")}</button></nav>
 {sheet&&<PreviewSheet title={t(sheet)} onClose={()=>setSheet(null)}>
 {sheet==='Search vault'?<><label className="security-search">{t("Search fictional categories")}<input type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder={t("Photos, videos, audio, files")}/></label>{samples.filter(s=>`${s.category} ${t(s.category)}`.toLowerCase().includes(search.toLowerCase())).map(s=><button className="security-choice" key={s.id} onClick={()=>open('Locked preview',s)}>{t(s.category)} {t("collection")} {s.id+1} · {s.count} {t("demo items")}</button>)}</>:sheet==='Vault tools'?<><p>{t("Demo navigation only; no media is accessed.")}</p><Link to={SCREENS.COLLECTIONS}>{t("Collections preview")}</Link><Link to={SCREENS.DOCUMENT_VIEWER}>{t("Document viewer preview")}</Link><button className="security-choice" onClick={()=>{setCategory('Photos');setFilterActive(false);setSheet(null);}}>{t("Restore reference collection layout")}</button></>:sheet==='Collection actions'?<><p>{t("Collection ")}{t(selected?.id+1)}{t(" · ")}{t(selected?.category)}{t(" · ")}{t(selected?.count)}{t(" fictional items. Locked thumbnails stay protected in this prototype.")}</p><button className="security-choice" onClick={()=>setSheet('Details')}>{t("Details")}</button><button className="security-choice" onClick={()=>setSheet('Export preview')}>{t("Export preview")}</button></>:<p>{t(sheet==='Import securely'?'Educational import preview only. No browser file access dialog opens. No files are read, copied, encrypted, imported or removed from your device.':sheet==='Export preview'?'Export preview only. No content is unlocked, downloaded or written.':sheet==='Details'?`Fictional ${selected?.category} collection. Counts, storage and security labels are illustrative demo data, not verified protection.`:sheet==='Locked preview'?'This collection remains locked. No full-resolution media, authentication or decryption is available in the visual demo.':'Settings are a visual preview. No real vault exists, and device files are never deleted by this interface.')}</p>}
 </PreviewSheet>}
 </ScreenFrame>;
}
