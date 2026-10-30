import { useLanguage } from "../../i18n/Language";
import React, { useState } from "react";
import { Link } from "react-router-dom";
import { SCREENS } from "../../config/screens";
import { ScreenFrame, ScreenHeader, Mark, IconButton, PreviewSheet } from "./ScreenUI";

const explanations={
 Algorithm: 'AES-256-GCM is reference interface copy. This prototype does not run encryption or offer alternative algorithm choices.',
 'Key Protection': 'Device-protected is reference copy only. No device key, biometric API, or key storage is accessed.',
 Integrity: 'Authenticated is reference copy, not a test result. A production implementation would need verified integrity checks; none are performed here.',
 'Encryption Details': 'This is a visual workflow demonstration. No file content is read, transformed, encrypted, decrypted or written.',
 'Recovery Requirements': 'A real implementation would require the correct keys and recovery process. This demo creates no keys or recoverable output.',
 Settings: 'File Cipher is an offline visual preview. The sample file and destination exist only in page memory. No device or cloud files are accessed.',
};
export function FileCipher() {
  const { t, locale, dir } = useLanguage();

 const [mode,setMode]=useState('encrypt');const [file,setFile]=useState(true);const [destination,setDestination]=useState('Choose folder');const [sheet,setSheet]=useState(null);
 const action=mode==='encrypt'?'Encrypt':'Decrypt';
 const rows=[['Algorithm','AES-256-GCM','Modern standard with authenticated encryption.','shield'],['Key Protection','Device-protected','Keys secured with your device’s security.','key'],['Destination',destination,`Select output location for ${mode==='encrypt'?'encrypted':'decrypted'} file.`,'folder'],['Integrity','Authenticated','Includes integrity check (SHA-256 + GCM tag).','shield']];
 return <ScreenFrame type="cipher-screen"><ScreenHeader title={t("FILE")} accent="CIPHER" caption="Encrypt and decrypt with authenticated protection."><IconButton icon="settings" label="File Cipher settings" onClick={()=>setSheet('Settings')}/></ScreenHeader>
 <Link to={SCREENS.PACKAGE_INSPECTOR}>{t("Package Inspector")}</Link><Link to={SCREENS.ARCHIVE}>{t("Encrypted Archive")}</Link>
 <section className="cipher-file" aria-label={t("Sample file in memory")}>
  {file ? <><button className="cipher-pdf" onClick={()=>setSheet('Sample file')} aria-label={t("Choose a demo file")}><span>{t("PDF")}</span></button><button className="cipher-file-name" dir="ltr" onClick={()=>setSheet('Sample file')}><strong>{t("archive.pdf")}</strong><span>{t("12.8 MB")}</span><span>{t("/Documents")}</span></button><button className="cipher-remove" aria-label={t("Remove sample from preview, not device")} onClick={()=>setFile(false)}>{t("×")}</button></> : <button className="cipher-pick-empty" onClick={()=>setSheet('Sample file')}><Mark name="file"/>{t("Choose demo file")}<small>{t("Sample removed from preview only")}</small></button>}
 </section>
 <div className="cipher-modes" role="tablist" aria-label={t("Cipher mode")}>{['encrypt','decrypt'].map(m=><button key={m} role="tab" aria-selected={mode===m} tabIndex={mode===m?0:-1} className={mode===m?'active':''} onKeyDown={e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();setMode(m==='encrypt'?'decrypt':'encrypt');e.currentTarget.parentElement.querySelector(`[data-mode="${m==='encrypt'?'decrypt':'encrypt'}"]`).focus();}}} data-mode={m} onClick={()=>setMode(m)}><Mark name={m==='encrypt'?'lock':'unlock'}/>{t(m.toUpperCase())}</button>)}</div>
 <section className="cipher-options" aria-label={t("Reference encryption configuration")}>{rows.map(([label,value,description,icon])=><button className="cipher-option" key={label} onClick={()=>setSheet(label)}><span className="cipher-option-icon"><Mark name={icon}/></span><span className="cipher-option-copy"><small>{t(label)}</small><strong dir={value.startsWith("AES-")||value.startsWith("/")?"ltr":dir}>{t(value)}</strong><span>{t(description)}</span></span><span className="cipher-option-next"><Mark name="chevron"/></span></button>)}</section>
 <button className="security-primary cipher-action" disabled={!file} onClick={()=>setSheet('Process preview')}><Mark name={mode==='encrypt'?'lock':'unlock'}/>{t(`${action} File`)}<Mark name="arrow"/></button>
 <section className="cipher-ready" aria-label={t("Ready to start, visual demo only")}><Mark name="info"/><div><strong>{t("Ready to start")}</strong><p>{t("Progress will begin after your consent.")}</p></div></section>
 <div className="cipher-help">{[['Encryption Details','Learn how it works.','file'],['Recovery Requirements','What you need to decrypt.','help']].map(([title,caption,icon])=><button key={title} onClick={()=>setSheet(title)}><Mark name={icon}/><span>{t(title)}<small>{t(caption)}</small></span><Mark name="chevron"/></button>)}</div>
 {sheet&&<PreviewSheet title={t(sheet)} onClose={()=>setSheet(null)}>
 {sheet==='Sample file'?<><p>{t("Select the fictional sample. No file picker opens and no device files are read or deleted.")}</p><button className="security-choice" onClick={()=>{setFile(true);setSheet(null);}}>{t("archive.pdf · 12.8 MB · /Documents")}</button></>:sheet==='Destination'?<><p>{t("Select an in-memory label only. Nothing can be saved to these folders.")}</p>{['/Documents/Demo output','/Downloads/Demo output'].map(d=><button className="security-choice" key={d} onClick={()=>{setDestination(d);setSheet(null);}}>{t(d)}</button>)}</>:sheet==='Process preview'?<><p>{t(action)}{t(" visual preview only. No operation is running, no percentage is calculated, and no output is produced. The page remains Ready to start until a real backend exists.")}</p><div className="cipher-preview-rail" aria-hidden="true"><i/></div></>:<p>{t(explanations[sheet])}</p>}
 {sheet==='Integrity'&&<Link to={SCREENS.INTEGRITY}>{t("Integrity tool preview")}</Link>}
 </PreviewSheet>}
 </ScreenFrame>;
}
