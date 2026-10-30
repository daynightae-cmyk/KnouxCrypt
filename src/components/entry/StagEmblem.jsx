import React, { useId } from "react";
import logo from "../../assets/knoux-stag.png";
import "./stag.css";

// Original supplied transparent artwork, with independent eye-light layers.
// Layer coordinates are measured in the original 1254-square image space.
export function StagEmblem({ className = "", ignite = false }) {
  const lightId = useId().replaceAll(":", "");
  return <span className={`stag-emblem ${ignite ? "stag-entrance" : ""} ${className}`} aria-hidden="true">
    <img src={logo} width="1254" height="1254" alt=""/>
    <svg viewBox="0 0 1254 1254" className="stag-eye-light" fill="none">
      <defs><radialGradient id={lightId}><stop offset="0" stopColor="#f9eaff" stopOpacity=".7"/><stop offset=".4" stopColor="#bb7bff" stopOpacity=".2"/><stop offset="1" stopColor="#924aff" stopOpacity="0"/></radialGradient>
        <linearGradient id={`${lightId}-eye-left`} x1="303" y1="596" x2="438" y2="680" gradientUnits="userSpaceOnUse"><stop stopColor="#c77dff"/><stop offset=".65" stopColor="#f5dcff"/><stop offset="1" stopColor="#ffffff"/></linearGradient>
        <linearGradient id={`${lightId}-eye-right`} x1="951" y1="596" x2="816" y2="680" gradientUnits="userSpaceOnUse"><stop stopColor="#c77dff"/><stop offset=".65" stopColor="#f5dcff"/><stop offset="1" stopColor="#ffffff"/></linearGradient>
      <radialGradient id={`${lightId}-flare`}><stop stopColor="#fff"/><stop offset=".3" stopColor="#edccff" stopOpacity=".85"/><stop offset="1" stopColor="#bf62ff" stopOpacity="0"/></radialGradient>
        <clipPath id={`${lightId}-left-clip`}><use href={`#${lightId}-left-contour`}/></clipPath>
        <clipPath id={`${lightId}-right-clip`}><use href={`#${lightId}-right-contour`}/></clipPath>
      </defs>
      <path className="stag-eye-ray" style={{fill: `url(#${lightId})`}} d="M430 649 160 540 145 690Z M824 649 1094 540 1109 690Z"/>
      <path className="stag-antler-trace" d="M410 565C350 455 105 490 135 230M350 475C255 385 260 180 400 70M844 565C904 455 1149 490 1119 230M904 475C999 385 994 180 854 70"/>
      <path id={`${lightId}-left-contour`} className="stag-light-left" style={{fill:`url(#${lightId}-eye-left)`}} d="M303 596 Q378 611 438 680 Q385 658 341 635Z"/>
      <path id={`${lightId}-right-contour`} className="stag-light-right" style={{fill:`url(#${lightId}-eye-right)`}} d="M951 596 Q876 611 816 680 Q869 658 913 635Z"/>
      <g clipPath={`url(#${lightId}-left-clip)`}><ellipse className="stag-eye-glint stag-glint-left" cx="386" cy="645" rx="24" ry="5" transform="rotate(32 386 645)" style={{fill:`url(#${lightId}-flare)`}}/></g>
      <g clipPath={`url(#${lightId}-right-clip)`}><ellipse className="stag-eye-glint stag-glint-right" cx="868" cy="645" rx="24" ry="5" transform="rotate(-32 868 645)" style={{fill:`url(#${lightId}-flare)`}}/></g>
    </svg>
  </span>;
}
