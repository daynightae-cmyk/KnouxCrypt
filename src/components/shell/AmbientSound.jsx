import React from 'react';
import {useLanguage} from '../../i18n/Language';
import {useKnouxAudio} from './KnouxAudioProvider';

export function AmbientSound(){
  const {t,dir}=useLanguage();
  const {preferences:p,toggle,resume,status,busy}=useKnouxAudio();
  const audible=p.ambient&&!p.masterMute&&p.profile!=='silent'&&status==='running';
  return <div className="app-sound-strip" dir={dir} data-audio-state={status}><button type="button" className="app-sound-toggle" aria-pressed={p.ambient} disabled={busy&&!p.ambient} onClick={toggle}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M3 9h4l5-5v16l-5-5H3Z"/>{audible?<path d="M16 7a7 7 0 0 1 0 10m3-13a11 11 0 0 1 0 16"/>:<path d="m16 9 6 6m0-6-6 6"/>}</svg>{t(busy&&p.ambient?'Starting…':audible?'Sound on':p.ambient?'Ambient enabled · muted':'Sound off')}</button>{status==='blocked'&&<span role="status" className="app-sound-error">{t('Audio paused — activate to retry')} <button onClick={resume} disabled={busy}>{t('Retry audio')}</button></span>}</div>;
}
