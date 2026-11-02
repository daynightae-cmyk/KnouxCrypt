import React from "react";
import { CIPHER_GLYPHS } from "./CipherGlyph";
import { glyphFor } from "../../config/serviceIconRegistry";
import "./icons.css";

/**
 * The single way a service identity is drawn on Desktop.
 *
 * `size` picks the rendering scale, not a different asset: the glyphs are
 * authored on a 24-unit grid with stroke widths that survive both 24px in the
 * sidebar and 64px on a card, which is why there is one library instead of four
 * exports per service (and why the installer did not grow by a few megabytes of
 * PNGs).
 *
 * A service id with no registry entry renders a visible `?` tile and warns once.
 * It does NOT fall back to a shield: the previous inline fallback was the reason
 * 41 services looked identical while still "having an icon".
 */

const warned = new Set();

const SIZES = Object.freeze({ sm: 20, md: 24, lg: 32, card: 48, hero: 64 });

export function KnouxServiceIcon({
  id,
  size = "md",
  label,
  active = false,
  igniting = false,
  className = "",
  ...rest
}) {
  const glyphKey = glyphFor(id);

  if (!glyphKey || !CIPHER_GLYPHS[glyphKey]) {
    if (typeof console !== "undefined" && !warned.has(String(id))) {
      warned.add(String(id));
      console.warn(
        `[KnouxServiceIcon] no CipherGlyph for service "${id}". Add it to src/config/serviceIconRegistry.js — ` +
          `rendering an explicit unmapped tile instead of a misleading generic shield.`,
      );
    }
    return (
      <span className={`knoux-icon knoux-icon-unmapped size-${size} ${className}`.trim()} data-service={id} role="img" aria-label={label || `${id} (icon unmapped)`}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="3" y="3" width="18" height="18" rx="4" fill="none" stroke="currentColor" strokeWidth="1.4" strokeDasharray="3 3" />
          <path d="M12 8v5M12 16.5v.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </span>
    );
  }

  const px = SIZES[size] || SIZES.md;
  return (
    <span
      className={`knoux-icon size-${size}${active ? " is-active" : ""}${igniting ? " is-igniting" : ""} ${className}`.trim()}
      data-service={id}
      data-glyph={glyphKey}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : "true"}
      style={{ width: px, height: px }}
      {...rest}
    >
      <svg viewBox="0 0 24 24" width={px} height={px} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {CIPHER_GLYPHS[glyphKey]}
      </svg>
    </span>
  );
}

/** Lets the suite prove a glyph actually exists, not just that a key is set. */
export function hasGlyph(id) {
  const key = glyphFor(id);
  return Boolean(key && CIPHER_GLYPHS[key]);
}

export default KnouxServiceIcon;
