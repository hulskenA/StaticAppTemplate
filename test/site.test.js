// The site as the server builds it: built into a temporary folder, then read like a visitor
// would. `npm test` runs every file of this folder; run it before each push.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ROOT, build, listFiles, urlOf, SiteError } from '../tools/site.js';

let out; let pages;
before(() => {
  out = fs.mkdtempSync(path.join(os.tmpdir(), 'site-'));
  build({ out });
  pages = listFiles(out).filter((f) => f.endsWith('.html')).map((rel) => ({ rel, url: urlOf(rel), html: fs.readFileSync(path.join(out, rel), 'utf8') }));
});
after(() => fs.rmSync(out, { recursive: true, force: true }));

test('the build has a home page, and no part or placeholder is left in it', () => {
  assert.ok(pages.some((p) => p.url === '/'), 'index.html is built');
  assert.deepEqual(listFiles(out).filter((f) => f.startsWith('_')), [], 'parts stay out of the site');
  assert.equal(fs.existsSync(path.join(out, '_parts')), false, 'parts stay out of the site');
  for (const p of pages) {
    assert.doesNotMatch(p.html, /\{\{/, `${p.url} still has a {{setting}}`);
    assert.doesNotMatch(p.html, /<!--\s*include\b/, `${p.url} still has an include`);
  }
});

test('every page has what a page needs', () => {
  for (const p of pages) {
    assert.match(p.html, /^<!doctype html>/i, `${p.url} starts with <!doctype html>`);
    assert.match(p.html, /<html lang="[a-z-]+"/i, `${p.url} says its language`);
    assert.match(p.html, /<title>[^<]*\S[^<]*<\/title>/, `${p.url} has a title`);
    assert.match(p.html, /<meta name="viewport"/, `${p.url} fits a phone`);
    assert.equal((p.html.match(/<h1\b/g) || []).length, 1, `${p.url} has one h1`);
  }
  const titles = pages.map((p) => p.html.match(/<title>([^<]*)<\/title>/)[1]);
  assert.equal(new Set(titles).size, titles.length, 'each page has its own title');
});

test('every link, stylesheet, script and picture leads to a file of the site', () => {
  for (const p of pages) {
    for (const [, ref] of p.html.matchAll(/\b(?:href|src)="([^"]*)"/g)) {
      if (ref === '' || ref.startsWith('#') || ref.startsWith('//') || /^[a-z][a-z0-9+.-]*:/i.test(ref)) continue; // the page itself, or another site
      let target = decodeURIComponent(new URL(ref, `http://site${p.url}`).pathname).slice(1);
      if (target === '' || target.endsWith('/')) target += 'index.html';
      const file = path.join(out, target);
      const stat = fs.existsSync(file) ? fs.statSync(file) : null;
      assert.ok(!stat?.isDirectory(), `${p.url}: write the link "${ref}" with its final /`);
      assert.ok(stat?.isFile(), `${p.url}: "${ref}" leads nowhere`);
    }
  }
});

test('the menu marks the page you are on, and styles carry their version', () => {
  for (const p of pages) {
    const current = [...p.html.matchAll(/<a\s+href="([^"]*)" aria-current="page"/g)].map((m) => m[1]);
    assert.ok(current.every((href) => href === p.url), `${p.url} marks only itself`);
  }
  assert.match(pages.find((p) => p.url === '/').html, /<a\s+href="\/" aria-current="page"/);
  assert.match(pages[0].html, /href="\/style\.css\?v=[0-9a-f]{8}"/);
});

test('control-center.yml builds and serves what this repository builds', () => {
  const yml = fs.readFileSync(path.join(ROOT, 'control-center.yml'), 'utf8');
  const value = (key) => (yml.match(new RegExp(`^${key}:\\s*([^#\\n]*)`, 'm')) || [])[1]?.trim();
  assert.equal(value('kind'), 'static');
  assert.equal(value('build'), 'npm run build');
  assert.equal(value('files'), 'dist', 'nginx serves the folder the build writes');
});

test('a mistake in a page stops the build with a clear message', () => {
  const src = fs.mkdtempSync(path.join(os.tmpdir(), 'site-src-'));
  const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'site-out-'));
  const config = { name: 'Test', signIn: 'none' };
  try {
    fs.writeFileSync(path.join(src, 'index.html'), '<!-- include _parts/nothing.html -->');
    assert.throws(() => build({ src, out: dist, config }), (e) => e instanceof SiteError && /_parts\/nothing\.html does not exist/.test(e.message));
    fs.writeFileSync(path.join(src, 'index.html'), '<p>{{nmae}}</p>');
    assert.throws(() => build({ src, out: dist, config }), (e) => e instanceof SiteError && /\{\{nmae\}\} is not a setting/.test(e.message));
    fs.rmSync(path.join(src, 'index.html'));
    assert.throws(() => build({ src, out: dist, config }), /needs a home page/);
    fs.writeFileSync(path.join(src, 'index.html'), '<p>{{name}}</p>');
    build({ src, out: dist, config: { ...config, name: 'Tom & <Léa>' } });
    assert.equal(fs.readFileSync(path.join(dist, 'index.html'), 'utf8'), '<p>Tom &amp; &lt;Léa&gt;</p>', 'settings are made safe for a page');
  } finally {
    fs.rmSync(src, { recursive: true, force: true });
    fs.rmSync(dist, { recursive: true, force: true });
  }
});

test('a missing address gets the site\'s own page, built like the others', () => {
  const missing = pages.find((p) => p.url === '/404.html');
  assert.ok(missing, 'src/404.html is built: the server sends it for an address that does not exist');
  assert.match(missing.html, /<a\s+[^>]*href="\/"/, 'it leads back to the home page');
  for (const [, ref] of missing.html.matchAll(/\b(?:href|src)="([^"#][^"]*)"/g)) {
    if (/^[a-z][a-z0-9+.-]*:/i.test(ref) || ref.startsWith('//')) continue;
    assert.ok(ref.startsWith('/'), `404.html answers at any address: write "${ref}" from the root`);
  }
});

test('{{env.NAME}} is filled in from the build\'s environment, made safe, empty when unset', () => {
  const src = fs.mkdtempSync(path.join(os.tmpdir(), 'site-src-'));
  const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'site-out-'));
  try {
    fs.writeFileSync(path.join(src, 'index.html'), '<p>{{env.CONTACT}}|{{ env.NOT_SET }}</p>');
    build({ src, out: dist, config: { name: 'Test', signIn: 'none' }, env: { CONTACT: 'Tom <tom@example.com>' } });
    assert.equal(fs.readFileSync(path.join(dist, 'index.html'), 'utf8'), '<p>Tom &lt;tom@example.com&gt;|</p>');
    // On the server, only the app's own env: variables: a server variable stops the build.
    fs.writeFileSync(path.join(src, 'index.html'), '<p>{{env.CONTACT}}</p>');
    build({ src, out: dist, config: { name: 'Test', signIn: 'none' }, env: { CONTACT: 'x', CC_PUBLIC_ENV: 'CONTACT' } });
    fs.writeFileSync(path.join(src, 'index.html'), '<p>{{env.HOME}}</p>');
    assert.throws(() => build({ src, out: dist, config: { name: 'Test', signIn: 'none' }, env: { HOME: '/home/apps', CC_PUBLIC_ENV: 'CONTACT' } }), /not one of the app's env: variables/);
  } finally {
    fs.rmSync(src, { recursive: true, force: true });
    fs.rmSync(dist, { recursive: true, force: true });
  }
});
