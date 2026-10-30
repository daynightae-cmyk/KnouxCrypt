import React from "react";
import logo from "../../assets/knoux-stag.png";
import "./stag.css";

// Original supplied transparent artwork, with independent eye-light layers.
// Layer coordinates are measured in the original 1254-square image space.
export function StagEmblem({ className = "", ignite = false }) {
  return <span className={`stag-emblem ${ignite ? "stag-entrance" : ""} ${className}`} aria-hidden="true">
    <img src={logo} width="1254" height="1254" alt=""/>
    <svg viewBox="0 0 1254 1254" className="stag-eye-light" fill="none">
      <path className="stag-light-left" d="M303 596 Q378 611 438 680 Q385 658 341 635Z"/>
      <path className="stag-light-right" d="M951 596 Q876 611 816 680 Q869 658 913 635Z"/>
    </svg>
  </span>;
}
