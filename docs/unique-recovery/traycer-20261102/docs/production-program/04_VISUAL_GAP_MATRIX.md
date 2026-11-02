# KNOUX CRYPT — Visual Gap Matrix

Source of truth for approved visuals: `agent-handoff/`, `visuals/ANIMA_MISSIONS_01-44/`, `visuals/REPO_AGENT_MISSIONS/`, and per-screen `TASK.md`/`REFERENCE.png`. Existing per-screen reviews: `docs/SCREENS_*.md`, `docs/VISUAL_REFINEMENT_CURRENT.md`, `docs/INTERACTION_POLISH_REVIEW.md`.

## Findings (high level, evidence-backed)

1. **Splash entry** — implemented with externalized CSS/JS and strict CSP (`electron/splash.html`, `splash.css`, `splash.js`). Animated loading text + particles. Brand stag-K preserved. QA verified handoff. Status: implemented & runtime-verified (packaged).
2. **App shell** — persistent shell, sidebar, navigation, code rain, AR/EN + RTL. Routes lazy-loaded. Status: implemented & route-verified (44/44 render AR+EN).
3. **Home** — 8 cards + Tools, approved logo, persistent code rain. Status: implemented.
4. **Service cards & inner pages** — all 44 services have UI + real engines (vault, IPC, tests). Per-screen visual reviews exist in `docs/SCREENS_*.md`.
5. **Orbit / brand motion** — preserved per agent-handoff. Not re-audited visually in this pass (no new screenshots captured; previous preview restriction documented).
6. **Themes** — dark glass identity; light theme support limited (product is dark-first). Status: dark verified; light not a stated requirement.
7. **Icons** — `electron/assets/icon.ico` generated via `scripts/generate-icons.cjs`; packaging icons verified. Service icons are SVG/asset-based.
8. **Typography** — Inter loaded from `fonts.googleapis.com` (IP/availability leak) + self-hosted Noto Sans Arabic. Status: recorded, not fixed (design decision).
9. **Motion** — framer-motion; reduced-motion respected where tested; CSP allows style-src unsafe-inline for animation. Status: implemented.

## Gaps requiring tasks

- G-1: Self-host Inter font (remove googleapis request) — privacy/availability. Requires design sign-off on rendered type.
- G-2: Full visual parity re-check on a real Windows display for all 44 services (not re-verified this pass).
- G-3: Light theme — only if product requirement changes (currently dark-first, approved).
- G-4: Reduced-motion audit across all motion (partial).

## Not claimed

No pixel-perfect fidelity claim is made. No new screenshots were captured in this pass; prior preview restriction documented in `docs/INTEGRATION_AUDIT.md`.
