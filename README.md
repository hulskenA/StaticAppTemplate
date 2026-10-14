# My site

Started from the **static site template**: pages in the house style, built into plain files that
nginx serves, made to be created and deployed from Control Center.

What it already does:

- **Pages and shared parts.** Each `.html` file of `src/` is a page. The header, the footer and
  the fonts are written once in `src/_parts/` and included in every page.
- **The charter.** Tokens, fonts, cards, buttons and the duck: pages look like the panel.
- **A build with no dependencies** (`npm run build`): it puts the parts in, fills in the site's
  name, marks the current page in the menu, and gives styles and scripts a version so browsers
  never keep an old one.
- **What the panel expects:** `kind: static`, built with `npm ci` and `npm run build`, files in
  `dist/`. Its `control-center.yml` fills the "Add an app" form by itself.
- **Tests** (`npm test`) that build the site and follow every link, and a **local mode**
  (`npm run dev`) that reloads the page each time you save.
- **Sign out** in the header when the site sits behind the sign-in.
- **A guide** (`docs/`): the site's page on the documentation site, updated by each deploy.

The two pages are examples: replace them.

## Is a static site the right start?

Yes, when every person who may open the site sees the same pages: documentation, a landing
page, a portfolio, a report.

No, when a page must save something, show who is signed in, or keep a secret. Nothing runs on
the server for a static site. Start from the app template instead.

## Starting a new site from the template

1. On GitHub, open the template repository and press **Use this template**, then
   **Create a new repository**. Give it the site's name, private.
2. Add the new repository to the server's GitHub token (the same token the panel uses), so the
   server can read it.
3. Clone it on your PC and change the name in four places:
   - `package.json`: `"name"`
   - `control-center.yml`: `name`, `address`, `access` and `group`
   - `site.config.json`: `"name"` and `"description"`
   - `docs/index.md`: its `# title`, the name people see on the documentation site
4. Commit and push.
5. In the panel, **Add an app**, type the repository: the form fills itself from
   `control-center.yml`. The site starts on the construction page: press **Deploy** on its
   page, then **Launch** when it is ready.

## Working on it

```bash
npm run dev        # http://127.0.0.1:3002, reloads the page each time you save
npm test           # builds the site, then checks its pages and follows every link
npm run build      # what the server runs: writes the site into dist/ (never committed)
```

Another port: `PORT=3005 npm run dev` (in PowerShell: `$env:PORT="3005"; npm run dev`).

Then push, and press **Deploy** on the site's page in the panel.

## Where things go

| Path | What |
|---|---|
| `src/index.html` | The home page, at `/` |
| `src/about/index.html` | A second page, at `/about/`. One folder per page gives short addresses |
| `src/_parts/` | Written once, included in every page: `head.html` (fonts, styles, what a page may load), `header.html` (the duck, the menu, **Sign out**), `footer.html` |
| `src/style.css` | The site's own styles, on top of the charter |
| `src/site.js` | The one script: shows **Sign out** behind the sign-in |
| `src/ds/` | The charter: `tokens.css` and `bundle.css`. Update both from the panel when the charter changes |
| `src/duck.svg` | The icon in the browser's tab |
| `site.config.json` | The site's settings: name, description, language, sign-in |
| `tools/` | The build (`site.js`), `npm run build` (`build.js`) and `npm run dev` (`dev.js`) |
| `docs/` | The site's guide, shown on the documentation site: see below. It is not part of the site itself: the build only reads `src/` |
| `test/` | Tests, run by `npm test` and worth running before each push |
| `control-center.yml` | How the panel creates and deploys the site |

## Writing pages

A new page is a new file. For `/contact/`, copy `src/about/index.html` to
`src/contact/index.html`, change its `<title>` and its `<main>`, and add its link to the menu
in `src/_parts/header.html`. The build marks the menu's link to the page being read.

Two things are filled in when the site is built:

| You write | The page gets |
|---|---|
| `<!-- include _parts/header.html -->` | That file of `src/`. A part can include another part |
| `{{name}}` | That setting of `site.config.json`, made safe for a page |
| `{{env.CONTACT}}` | That variable of the build's environment: on the server, the site's `env:` variables (panel 0.17 and later). Empty when it is not set |

A part that does not exist, or a `{{setting}}` that is not in `site.config.json`, stops the
build with a message naming the page. Locally, the message shows in the browser.

Pictures and other files go anywhere in `src/` and are copied as they are. Files and folders
whose name starts with `_` or `.` stay out of the site.

## The guide

`docs/` is what people read about the site on the documentation site, under **Apps**. There is
nothing to set up: the site reads the folder from the site's live build, so each **Deploy**
updates the guide, and it is shown to the people who can open the site and to nobody else.

- `docs/index.md` is the first page. Its `# title` is the site's name in the list of apps.
- Each other `.md` file is another page. Pictures go in the folder too: `![The list](img/list.png)`.
- Write links as on GitHub, relative to the file: `[sharing](sharing.md)`.
- Markdown only: HTML typed in a page is shown as text.
- To order the pages, or to shorten a title in the menu, start a file with settings between two
  `---` lines: `title`, `nav`, `order`, `summary`, and `access` (a group, to limit one page).

The page in `docs/` is an example: replace it. `npm test` checks that each page has a title and
that every link and picture of the guide leads to a file. The documentation site explains the
rest, under Building an app, "Document your app".

## Settings

Everything is in `site.config.json`, which is on GitHub with the rest.

| Setting | Default | Meaning |
|---|---|---|
| `name` | `My site` | Shown beside the duck, in the footer and in each page's title |
| `description` | empty | One sentence for search engines and link previews |
| `lang` | `en` | The language of the pages: `en`, `fr` |
| `signIn` | `required` | `required` behind the sign-in; `none` for a public site |
| `signInUrl` | `https://auth.<the site's domain>` | The sign-in's address, for **Sign out** |

Add your own (`"contact": "hello@example.com"`) and write `{{contact}}` in a page.

The `env:` variables of `control-center.yml`, or of **Edit settings** in the panel, reach the
build (panel 0.17 and later): write `{{env.NAME}}` in a page. They end up in public files, like
everything the build writes, so they are for things such as a contact address or the address of
an API, never a key. The panel's **Secrets** are not offered for a static site. To try one on
your PC: `CONTACT=me@example.com npm run dev` (in PowerShell:
`$env:CONTACT="me@example.com"; npm run dev`).

**Public sites:** with `access: public`, set `"signIn": "none"`, so the header does not offer a
**Sign out** that leads nowhere. Change both together if you change the access later.

## Rules worth keeping

- No secret anywhere in the repository: every file the build writes is sent to the browser of
  whoever may open the site. Who may open it is the panel's access setting, not the pages.
- Write links from the root, and folders with their final slash: `/about/`, `/pictures/duck.png`.
  `npm test` refuses a link that leads nowhere.
- To load something from another site (a font, a script, a picture), add its host to the
  `Content-Security-Policy` line of `src/_parts/head.html` first. Without it, browsers refuse.
- An address that does not exist shows `src/404.html`, with the status 404 (panel 0.17 and
  later; before, the server's own page). Write its links from the root: it answers at any
  address. Without the file, the server's page is shown.
- Since panel 0.17, browsers keep a file asked for with `?v=…` for a year and check the pages
  on each visit. The build adds `?v=` to the links of `/….css` and `/….js` files, changed when
  the file changes, so a deploy is seen at once. Link a stylesheet or a script from the root
  for it to apply.
- Adding an npm package for the build: `npm install <name>`, then commit `package.json` and
  `package-lock.json` (the server installs with `npm ci`, `devDependencies` included since panel 0.15).

## Tests and deploys on GitHub

`.github/workflows/ci.yml` runs the tests on every push and pull request. It can also deploy
once they pass (Control Center 0.19), and does nothing of the kind until you set it up:

1. On the app's page in the panel, **Deploy from CI** > **Make a deploy link**. Copy the token.
2. In the repository on GitHub, Settings > Secrets and variables > Actions: the variable
   `CC_DEPLOY_URL` (the link shown in the panel) and the secret `CC_DEPLOY_TOKEN` (the token).
3. Push to `main`: when the tests pass, the panel deploys that commit, with its usual check and
   automatic rollback. A commit is deployed only while it is still the latest on `main`.

For a staging copy, do the same on the copy's page with `CC_STAGING_URL` and `CC_STAGING_TOKEN`:
pushes to other branches are sent, and the copy deploys only the branch it follows. If the app
deploys from another branch than `main`, change `refs/heads/main` in the workflow too.
