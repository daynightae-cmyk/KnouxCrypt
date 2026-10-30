import React, { createContext, useContext, useLayoutEffect, useMemo, useState } from "react";
import { ar } from "./ar";
import "./language.css";
export function translate(value, locale) {
  if (typeof value !== 'string' || locale !== 'ar') return value;
  const trimmed = value.trim();
  if (trimmed === 'demo / preview' || trimmed.startsWith('/') || trimmed.startsWith('archive.pdf') || trimmed === 'AES-256-GCM') return value;
  if (Object.hasOwn(ar, trimmed)) return value.replace(trimmed, ar[trimmed]);
  const t = text => translate(text, locale);
  if (/^(GitHub|Passkey|Fingerprint|Sign In) preview$/.test(trimmed)) return `معاينة ${t(trimmed.slice(0,-8))}`;
  const provider = trimmed.match(/^(GitHub|Passkey|Fingerprint) is a visual preview only\./);
  if (provider) return `${t(provider[1])} معاينة مرئية فقط. لا يجري اتصال بمزوّد أو فحص للجهاز أو تحقق من الهوية.`;
  const preview = trimmed.match(/^(.+) preview$/);
  if (preview) return `معاينة ${t(preview[1])}`;
  const locked = trimmed.match(/^Locked (photos|videos|audio|files) collection (\d+), (\d+) demo items$/);
  if (locked) return `مجموعة ${t(locked[1][0].toUpperCase()+locked[1].slice(1))} مقفلة ${locked[2]}، ${locked[3]} عناصر تجريبية`;
  const actions = trimmed.match(/^Actions for collection (\d+)$/);
  if (actions) return `إجراءات المجموعة ${actions[1]}`;
  const collections = trimmed.match(/^(Photos|Videos|Audio|Files) demo collections$/);
  if (collections) return `مجموعات ${t(collections[1])} التجريبية`;
  if (trimmed.startsWith('Fictional ') && trimmed.endsWith('not verified protection.')) return 'مجموعة وهمية. الأعداد والمساحة وتسميات الأمان بيانات توضيحية وليست حماية تم التحقق منها.';
  if (trimmed.startsWith('This screen is awaiting its approved reference.')) return 'هذه الشاشة بانتظار تنفيذ تصميمها المعتمد. لا تُجرى أي عملية، ولم يتم تأمين بيانات أو تخزينها أو إنشاؤها.';
  return value;
}
function initialLocale() {
  try { const saved = localStorage.getItem('knoux.language'); if (saved==='en'||saved==='ar') return saved; } catch { /* Storage may be blocked. */ }
  return 'ar';
}
const LanguageContext = createContext(null);
export function LanguageProvider({ children }) {
  const [locale,setLocale] = useState(initialLocale);
  useLayoutEffect(()=>{document.documentElement.lang=locale;document.documentElement.dir=locale==='ar'?'rtl':'ltr';try{localStorage.setItem('knoux.language',locale);}catch{/* Keep in-memory preference. */}},[locale]);
  const value=useMemo(()=>({locale,dir:locale==='ar'?'rtl':'ltr',setLocale,t:value=>translate(value,locale)}),[locale]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}
export function useLanguage() {
  const context=useContext(LanguageContext);
  return context || {locale:'en',dir:'ltr',t:value=>value,setLocale:()=>{}};
}
export function LanguageToggle() {
  const {locale,setLocale}=useLanguage();
  return <button className="app-language-toggle" type="button" onClick={()=>setLocale(locale==='ar'?'en':'ar')} aria-label={locale==='ar'?'Switch to English':'التبديل إلى العربية'} lang={locale==='ar'?'en':'ar'} dir="auto">{locale==='ar'?'English':'العربية'}</button>;
}
