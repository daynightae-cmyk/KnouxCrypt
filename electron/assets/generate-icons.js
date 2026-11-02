/**
 * NEUTRALISED — this file used to be a second, competing icon generator.
 *
 * What it was:
 *   "مولد الأيقونات" drew a `#3B82F6 → #8B5CF6 → #06B6D4` gradient circle with a
 *   white padlock inside and wrote it out as `icon.svg`, `tray-icon.svg` and
 *   `menu-icon.svg`. That is the blue circular padlock this product must not
 *   ship, and it lived under the electron folder, so electron-builder packed it
 *   into every asar even though nothing called it.
 *
 * Why it is still here:
 *   Deleting it is a destructive cleanup the owner has not approved yet, and the
 *   old artwork may still be wanted as history. Nothing is lost by keeping the
 *   path; everything dangerous about it is gone, because the padlock artwork and
 *   the file-writing code have both been removed rather than left dormant.
 *
 * The one generator is `scripts/generate-icons.cjs`, wired to `npm run icons`
 * and to `npm run dist` / `dist:win`. It derives every icon from the official
 * `src/assets/knoux-stag.png` and is guarded by `tests/startup-identity.test.cjs`,
 * which fails if padlock artwork or a second generator comes back.
 */

"use strict";

const IDENTITY_SOURCE_OF_TRUTH = "scripts/generate-icons.cjs";

module.exports = {
  neutralised: true,
  reason:
    "Superseded by scripts/generate-icons.cjs, which renders the official stag-K emblem instead of a generic padlock.",
  generate() {
    throw new Error(
      `This generator has been retired. Identity icons come from ${IDENTITY_SOURCE_OF_TRUTH}, ` +
        "which derives them from src/assets/knoux-stag.png. Run: npm run icons",
    );
  },
};

if (require.main === module) {
  console.error(
    `electron/assets/generate-icons.js is retired and writes nothing.\n` +
      `Regenerate identity icons with:  node ${IDENTITY_SOURCE_OF_TRUTH}\n` +
      `Its old output was a blue gradient circle with a white padlock, which is not the KNOUX brand.`,
  );
  process.exit(1);
}
