import React from 'react';
import {useLanguage} from '../../i18n/Language';
import {useWorkspaceActivity} from './WorkspaceActivity';

export const JOURNEYS=Object.freeze({
 ENCRYPT:['Source','Validation','Encryption','Authentication','Verification'],
 VAULT:['Locked','Authorization','Access Granted','Protected Workspace'],
 NOTES:['Draft','Encrypted Save','Persistence','Protected Export'],
 PASSWORDS:['Authorization','Credential Inventory','Explicit Reveal','Safe Copy'],
 KEY_FORGE:['Parameters','Secure Generation','Fingerprint','Authorized Export'],
 AUTHENTICATOR:['Import','Validation','Secure Storage','Live Time Codes'],
 PRIVACY:['Session','Clipboard','Permissions','Activity'],
 BACKUP:['Select Scope','Encrypt','Write','Verify','Recovery Readiness'],
});
// These are capability-gated conceptual stages. No event consumer or progress
// prop is exposed until a real validated main/preload job contract is connected.
// Rendering a journey cannot change a record, unlock a vault or emit success.
export function CipherJourney({service}){
 const {t}=useLanguage();const {queued,notes}=useWorkspaceActivity();const stages=Object.hasOwn(JOURNEYS,service)?JOURNEYS[service]:null;
 if(!stages)return null;
 return <section className="cipher-journey" data-journey={service} data-mode="demo" aria-label={t('CipherJourney · conceptual workflow')}>
  <header><strong>{t('CipherJourney')}</strong><span>{t('DEMO · engine unavailable')}</span></header>
  <ol>{stages.map((stage,i)=><li key={stage} data-stage="concept"><i aria-hidden="true">{i+1}</i><span>{t(stage)}</span></li>)}</ol>
  <small>{t('Stages explain the workflow; none has been executed.')}{service==='ENCRYPT'&&<> · {t('Queued files')}: {queued}</>}{service==='NOTES'&&<> · {t('Fictional notes in memory')}: {notes}</>}</small>
 </section>;
}
