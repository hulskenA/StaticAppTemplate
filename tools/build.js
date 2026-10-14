// `npm run build`: writes the site into dist/. Control Center runs it at each deploy, then nginx
// serves dist/ (the `files:` line of control-center.yml).
import path from 'node:path';
import { build, ROOT, OUT, SiteError } from './site.js';

try {
  const { pages, files } = build();
  console.log(`Built ${pages.length} ${pages.length === 1 ? 'page' : 'pages'} and ${files} other ${files === 1 ? 'file' : 'files'} into ${path.relative(ROOT, OUT)}/`);
  for (const page of pages) console.log(`  ${page}`);
} catch (err) {
  if (!(err instanceof SiteError)) throw err;
  console.error(`The build failed: ${err.message}`);
  process.exit(1);
}
