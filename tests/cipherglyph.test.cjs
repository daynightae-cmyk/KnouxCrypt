"use strict";

/**
 * CipherGlyph acceptance tests.
 *
 * The brief asks for "a distinct semantic glyph per service" and for missing
 * mappings to be caught by automated tests. Both are checkable as data, so this
 * file treats the registry as the thing under test rather than eyeballing
 * screenshots: coverage, uniqueness, dead entries, the render path, and the
 * capability-id aliasing that the Tools inspector now depends on.
 *
 * Bundled through esbuild in the same way scripts/check-all-routes.cjs does, so
 * the components are really executed rather than pattern-matched.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const esbuild = require("esbuild");

const root = path.resolve(__dirname, "..");

const source = String.raw`
import React from 'react';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { LanguageProvider } from './src/i18n/Language';
import { KnouxServiceIcon, hasGlyph } from './src/components/icons/KnouxServiceIcon';
import { CIPHER_GLYPHS } from './src/components/icons/CipherGlyph';
import { SERVICE_GLYPHS, capabilityIdFor, glyphFor, canonicalServiceIds, iconCoverage } from './src/config/serviceIconRegistry';
import { DESKTOP_CAPABILITIES, capabilityById } from './src/config/desktopCapabilities';
import { MISSION_ROUTES } from './src/config/missionRoutes';
import { SERVICES, SCREENS } from './src/config/screens';

export function collect() {
  const report = {};
  const canonical = canonicalServiceIds();
  report.canonicalCount = canonical.length;

  // 1. coverage: no canonical service without a glyph.
  report.missing = canonical.filter((id) => !glyphFor(id));

  // 2. uniqueness: two services must not share a glyph. Aliases are excluded by
  //    construction because they are the same service under its legacy name.
  const aliases = ['ENCRYPT', 'VAULT', 'INTEGRITY'];
  const primary = Object.entries(SERVICE_GLYPHS).filter(([id]) => !aliases.includes(id));
  const byGlyph = new Map();
  for (const [id, glyph] of primary) {
    if (!byGlyph.has(glyph)) byGlyph.set(glyph, []);
    byGlyph.get(glyph).push(id);
  }
  report.duplicates = [...byGlyph.entries()].filter(([, ids]) => ids.length > 1).map(([g, ids]) => g + ':' + ids.join(','));

  // 3. every referenced glyph actually exists, and no glyph is dead weight.
  report.undefinedGlyphs = [...new Set(primary.map(([, g]) => g))].filter((g) => !CIPHER_GLYPHS[g]);
  const used = new Set(primary.map(([, g]) => g));
  report.deadGlyphs = Object.keys(CIPHER_GLYPHS).filter((g) => !used.has(g));

  // 4. the eight official Home illustrations must stay the artwork of record.
  report.servicesWithoutRoute = SERVICES.filter((s) => !SCREENS[s.id]).map((s) => s.id);
  report.servicesWithoutGlyph = SERVICES.filter((s) => !glyphFor(s.id)).map((s) => s.id);

  // 5. capability registry reachability for every route id, after aliasing.
  report.unreachableCapabilities = canonical.filter((id) => !capabilityById(capabilityIdFor(id)));
  report.aliasPairs = [['PRIVACY', 'PRIVACY_CENTER'], ['AUTOFILL', 'ANDROID_AUTOFILL']]
    .map(([route, cap]) => ({ route, cap, resolves: capabilityById(capabilityIdFor(route))?.id === cap }));

  // 6. render: a mapped id draws its glyph; an unmapped id draws the explicit
  //    unmapped tile rather than pretending to be a shield.
  globalThis.localStorage = { getItem: () => 'en' };
  const rendered = renderToStaticMarkup(
    <LanguageProvider><KnouxServiceIcon id="FILE_CIPHER" size="lg" /></LanguageProvider>
  );
  report.mappedRender = {
    hasGlyphAttr: rendered.includes('data-glyph="cipherFile"'),
    hasServiceAttr: rendered.includes('data-service="FILE_CIPHER"'),
    unmapped: rendered.includes('knoux-icon-unmapped'),
    svg: rendered.includes('<svg'),
  };
  const stray = renderToStaticMarkup(
    <LanguageProvider><KnouxServiceIcon id="NOT_A_REAL_SERVICE" size="md" /></LanguageProvider>
  );
  report.unmappedRender = {
    flagged: stray.includes('knoux-icon-unmapped'),
    shieldFallback: /<path d="m12 2 9 4v6c0 5-6 9-9 11-3-2-9-6-9-11V6Z"/.test(stray),
  };
  const everyService = canonical.map((id) => renderToStaticMarkup(
    <LanguageProvider><KnouxServiceIcon id={id} size="md" /></LanguageProvider>
  ));
  report.renderedUnmapped = everyService.filter((html) => html.includes('knoux-icon-unmapped')).length;
  report.hasGlyphAll = canonical.every((id) => hasGlyph(id));
  report.coverage = iconCoverage();
  report.capabilityCards = DESKTOP_CAPABILITIES.length;
  report.missionRoutes = MISSION_ROUTES.length;
  delete globalThis.localStorage;
  return report;
}
`;

const assetPlugin = {
  name: "stub-assets-for-icon-test",
  setup(build) {
    build.onLoad({ filter: /\.[jt]sx?$/ }, (args) => {
      if (!args.path.startsWith(path.join(root, "src"))) return;
      let text = fs.readFileSync(args.path, "utf8");
      text = text.replace(/import\.meta\.glob\([\s\S]*?\)/g, "{}");
      return { contents: text, loader: args.path.endsWith("jsx") ? "jsx" : "js" };
    });
  },
};

let bundle;

async function build() {
  if (bundle) return bundle;
  const result = await esbuild.build({
    stdin: { contents: source, sourcefile: "cipherglyph-probe.jsx", resolveDir: root, loader: "jsx" },
    bundle: true,
    write: false,
    platform: "node",
    format: "cjs",
    define: { "process.env.NODE_ENV": '"production"' },
    loader: { ".css": "empty", ".png": "dataurl", ".webp": "dataurl" },
    plugins: [assetPlugin],
  });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "knoux-cipherglyph-"));
  const file = path.join(dir, "probe.cjs");
  fs.writeFileSync(file, result.outputFiles[0].contents);
  bundle = { dir, mod: require(file) };
  return bundle;
}

test("the icon registry covers every canonical mission route", async () => {
  const { mod } = await build();
  const r = mod.collect();
  assert.equal(r.missionRoutes, 44, "44 canonical missions");
  assert.equal(r.canonicalCount, 44);
  assert.deepEqual(r.missing, [], "no service may render without its own glyph");
  assert.equal(r.hasGlyphAll, true);
  assert.equal(r.renderedUnmapped, 0, "every service must render a real glyph");
});

test("no two services share a glyph", async () => {
  const { mod } = await build();
  const r = mod.collect();
  assert.deepEqual(r.duplicates, [], `glyphs reused across services: ${r.duplicates.join(" | ")}`);
});

test("every referenced glyph exists and none is dead weight", async () => {
  const { mod } = await build();
  const r = mod.collect();
  assert.deepEqual(r.undefinedGlyphs, [], "a mapping may not name a glyph that was never drawn");
  assert.deepEqual(r.deadGlyphs, [], "an unused glyph means the registry drifted from the service list");
});

test("the eight official Home services keep routes and glyphs", async () => {
  const { mod } = await build();
  const r = mod.collect();
  assert.equal(r.servicesWithoutRoute.length, 0);
  assert.equal(r.servicesWithoutGlyph.length, 0);
});

test("KnouxServiceIcon flags an unknown id instead of falling back to a shield", async () => {
  const { mod } = await build();
  const r = mod.collect();
  assert.equal(r.mappedRender.hasGlyphAttr, true, "a mapped service must expose data-glyph");
  assert.equal(r.mappedRender.hasServiceAttr, true);
  assert.equal(r.mappedRender.unmapped, false);
  assert.equal(r.mappedRender.svg, true);
  assert.equal(r.unmappedRender.flagged, true, "an unknown id must be visibly unmapped");
  assert.equal(r.unmappedRender.shieldFallback, false, "and must NOT silently render the old generic shield");
});

test("capability status is reachable for all 44 route ids", async () => {
  const { mod } = await build();
  const r = mod.collect();
  // desktopCapabilities.js keys two cards PRIVACY_CENTER / ANDROID_AUTOFILL while
  // the routes are PRIVACY / AUTOFILL. Without aliasing, capabilityById(routeId)
  // returns null and those services render no status chip at all.
  assert.deepEqual(r.unreachableCapabilities, [], "every route id must resolve a capability card");
  for (const pair of r.aliasPairs) {
    assert.equal(pair.resolves, true, `${pair.route} must resolve to capability ${pair.cap}`);
  }
});

test("the generic-shield derivation is gone from the Tools workspace", async () => {
  const file = path.join(root, "src/components/desktop/DesktopUtilities.jsx");
  const src = fs.readFileSync(file, "utf8");
  assert.doesNotMatch(src, /s\.art===['"]key['"]/, "the inline art-name ternary was the root cause");
  assert.doesNotMatch(src, /<Mark name=['"]shield['"]\/>/, "no hardcoded shield for an arbitrary service");
  assert.match(src, /KnouxServiceIcon id=\{s\.id\}/, "the Tools grid must resolve icons through the registry");
});

test("the icon layer ships no new network dependency", async () => {
  const css = fs.readFileSync(path.join(root, "src/components/icons/icons.css"), "utf8");
  assert.doesNotMatch(css, /https?:/, "glyph styling must not add an external fetch");
  assert.match(css, /prefers-reduced-motion/, "and must respect reduced motion");
});
