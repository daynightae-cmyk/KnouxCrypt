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
      <defs><radialGradient id={lightId}><stop offset="0" stopColor="#f9eaff" stopOpacity=".7"/><stop offset=".4" stopColor="#bb7bff" stopOpacity=".2"/><stop offset="1" stopColor="#924aff" stopOpacity="0"/></radialGradient></defs>
      <path className="stag-eye-ray" style={{fill: `url(#${lightId})`}} d="M430 649 160 540 145 690Z M824 649 1094 540 1109 690Z"/>
      <path className="stag-light-left" d="M303 596 Q378 611 438 680 Q385 658 341 635Z"/>
      <path className="stag-light-right" d="M951 596 Q876 611 816 680 Q869 658 913 635Z"/>
    </svg>
  </span>;
}
