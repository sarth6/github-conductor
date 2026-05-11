<p align="center">
  <img src="public/icons/icon-128.png" alt="GitHub Conductor icon — a steam locomotive on a dark GitHub-themed card" width="96" height="96" />
</p>

<h1 align="center">GitHub Conductor</h1>

<p align="center">
  One click from any GitHub PR to a <a href="https://conductor.build">Conductor</a>
  workspace with your prompt already running.
</p>

A lightweight Chrome extension that adds a **Conductor** section to every
GitHub Pull Request's right sidebar — directly above _Reviewers_. Click the
button and your configured prompt, populated with the PR's metadata, opens
in a fresh Conductor workspace via the `conductor://` deep link.

## Why

Rotating through PRs is the most repeatable part of a senior engineer's day.
This extension collapses "open PR → copy URL → switch apps → paste into
Conductor → write the same `gh pr view ...` boilerplate again" into a single
keystroke. Every PR becomes a one-click into a working Conductor session.

## Install (developer mode)

The extension isn't on the Chrome Web Store yet. To install from source:

```bash
git clone https://github.com/sarth6/github-conductor.git
cd github-conductor
npm install
npm run build
```

Then in Chrome:

1. Visit `chrome://extensions`
2. Toggle **Developer mode** on (top right)
3. Click **Load unpacked**
4. Pick the `dist/` directory

You should see the **GitHub Conductor** icon in your toolbar. Visit any GitHub
PR — a Conductor button appears in the header next to GitHub's actions.

## Configuration

Right-click the toolbar icon → **Options** (or use the gear in the popup).

### URL template

Sets the `conductor://` URL opened on click. The default is:

```
conductor://prompt={prompt}
```

> **Note on Conductor's unusual URL shape**: the working format has the
> prompt sitting directly after `://` — no host, no `?`. It is not
> `conductor://new?prompt=…` or `conductor://?prompt=…`. The Conductor app
> looks for `prompt=` at the start of the URL body. This format was
> empirically verified across ~25 candidate URLs.

`{prompt}` is replaced with the URL-encoded rendered prompt. You can also use
PR metadata placeholders directly in the URL template.

### Prompt presets

Each preset has a **name** and a **template**. Templates use
`{placeholderName}` syntax, replaced with metadata from the PR at click time.

Default presets that ship with the extension:

- **Review PR** — code-review oriented prompt
- **Address PR comments** — pulls in `gh pr view --comments` workflow

Mark any preset as the **default** (radio button) — that's the one the inline
GitHub button runs. All presets are accessible from the toolbar popup.

### Placeholders

| Placeholder       | Source                  |
| ----------------- | ----------------------- |
| `{prUrl}`         | Canonical PR URL        |
| `{prNumber}`      | PR number               |
| `{prTitle}`       | PR title                |
| `{prDescription}` | PR body (markdown text) |
| `{prAuthor}`      | Author login            |
| `{prBranch}`      | Head branch             |
| `{prBaseBranch}`  | Base branch             |
| `{repo}`          | `owner/repo`            |
| `{repoOwner}`     | `owner`                 |
| `{repoName}`      | `repo`                  |
| `{prDiffUrl}`     | `…/pull/N.diff` URL     |
| `{prPatchUrl}`    | `…/pull/N.patch` URL    |

## Architecture

```
src/
├── types.ts          ← shared TypeScript types
├── storage.ts        ← chrome.storage.sync adapter + in-memory fallback
├── template.ts       ← {placeholder} substitution engine
├── conductor-url.ts  ← builds conductor:// URLs with safe encoding
├── pr-scraper.ts     ← extracts PR metadata from the DOM
├── content/          ← content script: sidebar widget above Reviewers
├── options/          ← settings page (manage presets, URL template)
└── popup/            ← toolbar popup with preset list
```

The widget injects above `#reviewers-select-menu` in GitHub's PR sidebar —
a stable selector from GitHub's Rails partial that's been around for years
(the same anchor [Refined GitHub](https://github.com/refined-github/refined-github)
uses). Three-tier fallback: reviewers → sidebar top → PR header.

Side effects live at the boundary (`storage`, `content`, `popup`). Everything
else is pure functions, which is why **34 unit tests** run in under a second.

## Development

```bash
npm install
npm run dev        # Vite dev server with HMR for the options/popup pages
npm run build      # production build → dist/
npm test           # run all unit tests
npm run typecheck  # tsc --noEmit
npm run lint       # eslint
npm run check      # typecheck + lint + format-check + test
```

### Tech stack

- **TypeScript** with strict mode + `exactOptionalPropertyTypes`
- **Vite 6** + **@crxjs/vite-plugin** for Manifest V3 bundling and HMR
- **Vitest** with **jsdom** for unit + DOM tests
- **ESLint 9** (flat config) + **Prettier**
- **GitHub Actions** CI: typecheck, lint, format-check, test, build

### Permissions

Minimal: only `storage` (to save your presets) and a single host permission
for `*://github.com/*`. The extension does **not** read any other site, make
network requests, or run on background tabs — it's a pure content script that
fires on a button click.

## How the deep link works

When you click the button:

1. The content script reads PR metadata from the DOM (title, branches,
   author, etc.) and the URL (`/owner/repo/pull/N`).
2. Your chosen preset template is rendered — `{placeholder}` tokens are
   substituted with the metadata.
3. The rendered prompt is URL-encoded and dropped into your URL template's
   `{prompt}` slot.
4. The final `conductor://` URL is fired through a hidden iframe. macOS's
   LaunchServices routes it to `Conductor.app`, which opens with the prompt
   ready to go.

Substitution is a plain string replace — placeholder values are **never**
interpreted as templates, code, or shell input. The URL is built with
`encodeURIComponent`, so PR titles containing `&`, `=`, `#`, newlines, or
unicode are handled safely.

## License

MIT — see [LICENSE](LICENSE).
