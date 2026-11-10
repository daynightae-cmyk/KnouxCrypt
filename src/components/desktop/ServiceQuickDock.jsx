import React from 'react';
import { NavLink } from 'react-router-dom';
import { SCREENS, SERVICES } from '../../config/screens';
import { useLanguage } from '../../i18n/Language';
import './live-security.css';

const art = import.meta.glob('../../assets/service-*.webp', { eager: true, import: 'default' });

export function ServiceQuickDock({ onPreview }) {
  const { t } = useLanguage();
  return (
    <nav
      className="service-quick-dock"
      aria-label={t('Quick services')}
      onMouseLeave={() => onPreview?.(null)}
      onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) onPreview?.(null); }}
    >
      {SERVICES.map(s => (
        <NavLink
          key={s.id}
          to={SCREENS[s.id]}
          data-service={s.id}
          title={t(s.title)}
          onPointerEnter={() => onPreview?.(s.id)}
          onFocus={() => onPreview?.(s.id)}
        >
          <img src={art[`../../assets/service-${s.art}.webp`]} alt="" />
          <span>{t(s.title)}</span>
        </NavLink>
      ))}
    </nav>
  );
}
