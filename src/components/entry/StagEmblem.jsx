import React, { useId } from 'react';
import logo from '../../assets/knoux-stag.png';
import './stag.css';

// Traced against the immutable 1254×1254 source, not its CSS bounding box.
// The previous overlay covered the brows at y596; the actual eyes are y677–753.
export const LEFT_EYE = 'M398 677 C421 690 449 692 466 704 C484 717 495 740 500 753 C483 734 469 734 447 726 C425 716 416 694 398 677Z';
export const RIGHT_EYE = 'M856 677 C833 690 805 692 788 704 C770 717 759 740 754 753 C771 734 785 734 807 726 C829 716 838 694 856 677Z';
export function StagEmblem({className='',ignite=false,phase, intensity}) {
  const id = `stag-${useId().replaceAll(':','')}`;
  return <span className={`stag-emblem ${ignite?'stag-entrance':''} ${className}`} data-eye-phase={phase || 'idle'} style={intensity===undefined?undefined:{'--eye-intensity':intensity}} aria-hidden="true">
    <img src={logo} width="1254" height="1254" alt=""/>
    <svg viewBox="0 0 1254 1254" className="stag-eye-light" fill="none">
      <defs>
        <path id={`${id}-left`} d={LEFT_EYE}/><path id={`${id}-right`} d={RIGHT_EYE}/>
        <clipPath id={`${id}-left-clip`}><use href={`#${id}-left`}/></clipPath>
        <clipPath id={`${id}-right-clip`}><use href={`#${id}-right`}/></clipPath>
        <clipPath id={`${id}-aperture`}><rect className="stag-eye-aperture" width="1254" height="1254"/></clipPath>
        <radialGradient id={`${id}-core`}><stop stopColor="#fff"/><stop offset=".4" stopColor="#f7e9ff"/><stop offset="1" stopColor="#bc65ff"/></radialGradient>
        <filter id={`${id}-bloom`} x="-100%" y="-150%" width="300%" height="400%"><feGaussianBlur stdDeviation="12"/></filter>
        <filter id={`${id}-reflection`} x="-100%" y="-150%" width="300%" height="400%"><feGaussianBlur stdDeviation="22"/></filter>
      </defs>
      {/* The source has painted white eyes. A reversible local occlusion layer
          lets those exact contours go dark; source pixels and silhouette stay intact. */}
      <g className="stag-eye-shutter" fill="#090511"><use href={`#${id}-left`}/><use href={`#${id}-right`}/></g>
      <g clipPath={`url(#${id}-aperture)`}><g className="stag-eye-envelope">
        <g fill="#ad53ff" opacity=".45" filter={`url(#${id}-reflection)`}><use href={`#${id}-left`}/><use href={`#${id}-right`}/></g>
        {['left','right'].map(side=><g key={side} className={`stag-eye stag-eye-${side}`}>
          <use href={`#${id}-${side}`} fill="#b25cff" filter={`url(#${id}-bloom)`}/>
          <use href={`#${id}-${side}`} fill={`url(#${id}-core)`} className="stag-eye-core"/>
          <g clipPath={`url(#${id}-${side}-clip)`}><ellipse className="stag-eye-glint" cx={side==='left'?453:801} cy="713" rx="36" ry="7" fill="white" transform={`rotate(${side==='left'?35:-35} ${side==='left'?453:801} 713)`}/></g>
        </g>)}
        <g className="stag-eye-trails" stroke="#e9beff" strokeWidth="2"><path d="M440 713 Q368 710 330 693"/><path d="M814 713 Q886 710 924 693"/></g>
      </g></g>
    </svg>
  </span>;
}
