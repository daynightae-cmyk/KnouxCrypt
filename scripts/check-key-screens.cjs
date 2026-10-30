// Run from the repository root after npm install: node scripts/check-key-screens.cjs
// Uses existing Vite/esbuild + React packages. Not a browser or screenshot test.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const esbuild = require('esbuild');
const root = path.resolve(__dirname, '..');
const source = `
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { KeyForge, KeyDetails, KeyWorkflowPreview, KEY_METADATA } from './src/components/keys/KeyForge';
import { SCREENS, SERVICES, KEY_WORKFLOWS } from './src/config/screens';
import { ar } from './src/i18n/ar';
const render = element => renderToString(<MemoryRouter>{element}</MemoryRouter>);
const forge = render(<KeyForge/>);
assert.equal((forge.match(/class="keys-service"/g)||[]).length,3);
for(const id of ['KEY_DETAILS','SIGNATURE','SECURE_SHARE']) assert.ok(forge.includes('href="'+SCREENS[id]+'"'));
assert.equal(SERVICES.length,8);
assert.ok(!SERVICES.some(s=>s.id==='SECURE_SHARE'));
assert.equal(KEY_METADATA.length,5);
const details=render(<KeyDetails/>);
for(const row of KEY_METADATA) assert.ok(details.includes('aria-controls="key-'+row.id+'-description"'));
assert.ok(details.includes('Not evaluated'));
assert.ok(details.includes('Visual sample only'));
for(const workflow of KEY_WORKFLOWS){const html=render(<KeyWorkflowPreview {...workflow}/>);assert.ok(html.includes('VISUAL DEMO'));assert.ok(html.includes('No security operation is running'));}
for(const key of ['Key Forge','Device Keys','Alias','View Public Key','Rotate Key','Signature Verification','Key Forge profile'])assert.ok(ar[key]);
console.log('PASS: Key Forge three real links, eight Home cards, five metadata rows, honest security labels, future-workflow notices and Arabic keys.');
`;
const result=esbuild.buildSync({stdin:{contents:source,sourcefile:'keys-render-check.jsx',resolveDir:root,loader:'jsx'},bundle:true,write:false,platform:'node',format:'cjs',define:{'process.env.NODE_ENV':'"production"'},loader:{'.css':'empty','.png':'dataurl'}});
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'knoux-keys-check-'));
try{const file=path.join(dir,'check.cjs');fs.writeFileSync(file,result.outputFiles[0].contents);require(file);}finally{fs.rmSync(dir,{recursive:true,force:true});}
const css=fs.readFileSync(path.join(root,'src/components/keys/keys.css'),'utf8');
assert.ok(css.includes('prefers-reduced-motion'));
const keySource=fs.readFileSync(path.join(root,'src/components/keys/KeyForge.jsx'),'utf8');
assert.ok(!/localStorage|sessionStorage|navigator\.credentials|crypto\.subtle|fetch\(/.test(keySource));
console.log('PASS: reduced-motion override; no storage, credential, crypto or network operations in key UI.');
