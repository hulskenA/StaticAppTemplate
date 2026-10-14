// How src/ becomes the files nginx serves. `npm run build`, `npm run dev` and the tests all go
// through this file, so a page looks the same on your PC and on the server.
//
// A page is an .html file of src/. Building it does five things:
//   <!-- include _parts/header.html -->   is replaced by that file of src/
//   {{name}}                              is replaced by that setting of site.config.json
//   {{env.NAME}}                          is replaced by that environment variable (empty when
//                                         unset): on the server, the app's env: variables
//   the link to the page itself, inside <nav>, gets aria-current="page"
//   /style.css becomes /style.css?v=1a2b3c4d, so browsers never keep an old stylesheet or script
// Every other file is copied as it is. Files and folders starting with _ or . stay out of the site.
// src/404.html is the page the server sends for an address that does not exist.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const SRC = path.join(ROOT, 'src');
export const OUT = path.join(ROOT, 'dist');
export const CONFIG_FILE = path.join(ROOT, 'site.config.json');

/** A mistake in the site's own files: shown as it is, without a stack trace. */
export class SiteError extends Error {}

const DEFAULTS = { name: 'My site', description: '', lang: 'en', signIn: 'required', signInUrl: '' };

/** The settings of site.config.json. Every one of them can be written {{like this}} in a page. */
export function loadConfig(file = CONFIG_FILE) {
  let raw;
  try { raw = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { throw new SiteError(`site.config.json cannot be read: ${e.message}`); }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new SiteError('site.config.json must be a list of "setting": "value" lines between { and }.');
  const config = { ...DEFAULTS };
  for (const [key, value] of Object.entries(raw)) {
    if (!/^[A-Za-z][A-Za-z0-9]*$/.test(key)) throw new SiteError(`site.config.json: "${key}" is not a valid setting name: letters and digits only.`);
    if (value !== null && typeof value === 'object') throw new SiteError(`site.config.json: "${key}" must be a text, a number, true or false.`);
    config[key] = String(value ?? '');
  }
  if (!['required', 'none'].includes(config.signIn)) throw new SiteError('site.config.json: "signIn" is "required" (the site sits behind the sign-in) or "none" (a public site).');
  return config;
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const isFile = (file) => { try { return fs.statSync(file).isFile(); } catch { return false; } };

/** Every file of a folder that belongs to the site, as paths like about/index.html. */
export function listFiles(dir, prefix = '') {
  const found = [];
  for (const entry of fs.readdirSync(path.join(dir, prefix), { withFileTypes: true })) {
    if (entry.name.startsWith('_') || entry.name.startsWith('.')) continue;
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) found.push(...listFiles(dir, rel));
    else if (entry.isFile()) found.push(rel);
  }
  return found.sort();
}

/** The address of a page: index.html is /, about/index.html is /about/, notes.html is /notes.html. */
export function urlOf(rel) {
  if (rel === 'index.html') return '/';
  return rel.endsWith('/index.html') ? `/${rel.slice(0, -'index.html'.length)}` : `/${rel}`;
}

function withIncludes(html, src, page, depth = 0) {
  return html.replace(/<!--\s*include\s+(\S+?)\s*-->/g, (all, part) => {
    const file = path.resolve(src, part);
    if (!file.startsWith(path.resolve(src) + path.sep)) throw new SiteError(`${page}: the part ${part} is outside src/.`);
    if (!isFile(file)) throw new SiteError(`${page}: the part ${part} does not exist in src/.`);
    if (depth >= 5) throw new SiteError(`${page}: the part ${part} includes itself.`);
    return withIncludes(fs.readFileSync(file, 'utf8').trimEnd(), src, page, depth + 1);
  });
}

/** One page of src/, ready to send to a browser. `version: false` leaves the links as written. */
export function render(rel, { src = SRC, config = loadConfig(), version = true, env = process.env } = {}) {
  let html = withIncludes(fs.readFileSync(path.join(src, rel), 'utf8'), src, rel);
  // Everything a static site builds is public: an env: variable written in a page is public too.
  html = html.replace(/\{\{\s*env\.([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g, (all, key) => esc(env[key] ?? ''));
  html = html.replace(/\{\{\s*([A-Za-z][A-Za-z0-9]*)\s*\}\}/g, (all, key) => {
    if (!(key in config)) throw new SiteError(`${rel}: {{${key}}} is not a setting of site.config.json.`);
    return esc(config[key]);
  });
  const url = urlOf(rel);
  html = html.replace(/<nav\b[\s\S]*?<\/nav>/g, (nav) => nav.replace(/<a\s+href="([^"]*)"/g, (a, href) => (href === url ? `${a} aria-current="page"` : a)));
  if (version) {
    html = html.replace(/\b(href|src)="(\/[^"?#]+\.(?:css|js))"/g, (all, attr, ref) => {
      const file = path.join(src, ref);
      if (!isFile(file)) return all;
      return `${attr}="${ref}?v=${crypto.createHash('sha1').update(fs.readFileSync(file)).digest('hex').slice(0, 8)}"`;
    });
  }
  return html;
}

/** Builds the whole site into `out`, emptied first. → { pages: [addresses], files: count of the others } */
export function build({ src = SRC, out = OUT, config = loadConfig(), env = process.env } = {}) {
  const from = path.resolve(src); const to = path.resolve(out);
  if (to === from || from.startsWith(to + path.sep) || to.startsWith(from + path.sep)) throw new SiteError('The build folder cannot be src/, inside it or around it.');
  const all = listFiles(from);
  if (!all.includes('index.html')) throw new SiteError('src/index.html is missing: the site needs a home page.');
  fs.rmSync(to, { recursive: true, force: true });
  const pages = []; let files = 0;
  for (const rel of all) {
    const target = path.join(to, rel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    if (rel.endsWith('.html')) { fs.writeFileSync(target, render(rel, { src: from, config, env })); pages.push(urlOf(rel)); }
    else { fs.copyFileSync(path.join(from, rel), target); files++; }
  }
  return { pages, files };
}
