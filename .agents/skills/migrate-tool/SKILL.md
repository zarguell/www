---
name: migrate-tool
description: Migrate a small one-off tool from an external repo (GitHub link or local path) into this Astro site as a native tools page. Use whenever Zach shares a repo/tool link to port, migrate, or "ship" into the site — even if he just drops a URL with no other instruction. Covers reading the source, choosing JavaScript vs PyScript, redesigning it to fit the retro design system, implementing per docs/tool-dev-guide.md, registering the card in src/src/data/tools.ts, and verifying (tests, type-check, build, both themes).
---

# Migrate a Tool Into the Site

You are porting one small tool from an external repo into this site so it feels like it
was always here: static, dependency-light, retro-styled, and listed in the tools
collection. Port the *behavior*, not the code — the source repo is a spec, and its
implementation style (framework, bundler, backend) is almost always wrong for this site.

The loop is: **read the source → decide the fit → design it → ship it.**

## 0. Get the source

- GitHub/remote URL → shallow clone to a temp dir: `git clone --depth 1 <url> /tmp/<repo-name>`.
  Never commit the clone; treat it as disposable reading material.
- Local path → read it in place.
- If the repo contains several tools, pick the one the message points at; if genuinely
  ambiguous, ask which one instead of guessing.
- Don't clone anything into the working tree.

## 1. Read the source like a spec

Read the README first, then the entry point, then only the files you need. For each tool
answer, in writing (a short paragraph in your design proposal is enough):

1. **What does it do?** The user-facing job, in one or two sentences.
2. **Inputs and outputs.** What the user provides, what they get back.
3. **Core algorithm.** Where the real logic lives (functions to port, formulas, data tables).
4. **What can't come along?** Anything requiring a backend, an external API, a database,
   auth, or server-side persistence. This site is static-only: those features get dropped
   or downgraded (e.g. persistence → `localStorage`), and the drop is called out in the
   final report, never silently skipped.

Be selective — a one-off tool rarely needs more than its logic file(s) read in full.

## 2. Choose the runtime

Decide JavaScript or PyScript from what the tool *needs*, not what language the source
happens to be written in:

- **PyScript** (`PythonToolLayout`): needs numpy, matplotlib, pandas, or genuinely heavy
  numeric work. Python source usually lands here, and so does JS source with plotting math.
- **JavaScript** (`BaseLayout`): forms, instant feedback, simple math, string/data munging.
  Simple Python → port the logic to TypeScript; the instant load is worth the rewrite.
- If the tool would need new npm packages to work as JS, prefer PyScript or reimplement —
  dependencies stay minimal.

If the tool fundamentally requires a server (secret-keeping, live external data, heavy
compute), stop and tell Zach before building anything. Do not fake it client-side.

## 3. Design the fit

This is the important step — the tool must become native to the site, not an embedded
foreign object. Before writing code, produce a short design proposal:

- **Name & slug**: kebab-case page at `src/src/pages/tools/<slug>.astro`; check
  `src/src/data/tools.ts` for slug collisions.
- **Placement**: which category in `src/src/data/tools.ts` it belongs in (read the
  existing categories first; propose a new one only if nothing fits).
- **Layout & components**: `Window` panels for inputs/results, `RetroButton` for actions,
  existing global classes (`.form-group`, `.calculator-hero`, …) before any new CSS.
- **Code shape**: pure logic → `src/src/lib/<slug>.ts` (no DOM access, unit-tested in
  `src/src/lib/__tests__/`); DOM wiring → `src/src/scripts/<slug>-app.ts` exporting
  `init<Slug>App()`; the page keeps a thin `DOMContentLoaded` bootstrap. Python tools:
  `src/public/tools/<slug>/main.py` + `config.json`, chart rendering through the shared
  `chart_helpers` module.
- **What changed from the source and why**: dropped features, added features (e.g.
  URL state, responsive charts, keyboard support), renamed concepts.

Default: present the proposal briefly, then implement and ship in the same run — Zach
reviews each migration anyway. Pause for a decision only on a real fork: ambiguous which
tool, a feature must be dropped that he might care about, or the runtime choice is a
genuine toss-up.

## 4. Implement

Read `docs/tool-dev-guide.md` before writing any code — it is the source of truth for
both JavaScript and PyScript patterns, and it contains hard rules enforced by tests
(e.g. never duplicate the Plotly serialization or chart-export pipeline; go through
`chart_helpers`). Also check `src/src/styles/global.css` before adding component styles.

Non-negotiables while porting:

- Static build only; no backend, no external API calls.
- CDN scripts are fine (splitcheck's lz-string, tesseract) — pin the exact version and
  verify the global actually exists in the browser during verification. If an
  integrity-pinned script won't execute (SRI can fail even when a same-URL fetch
  matches the hash), self-host the file under `src/public/assets/` instead.
- Event listeners + `DOMContentLoaded`, never inline `onclick`/`py-click` with parens.
- Astro scopes page `<style>` at build time: selectors never match DOM that the app
  script injects at runtime (result cards, list rows). Style those under a template
  element with `.container :global(.injected-class)` — plain `.injected-class` silently
  does nothing.
- All colors/spacing via design tokens; must work in both `neon-night` and `mall-pastel`.
- VT323 everywhere; keyboard accessible; respect `prefers-reduced-motion`.
- Reimplement logic in idiomatic TypeScript — do not copy the source file wholesale or
  add the source repo's dependencies.

## 5. Register the tool

The tools index renders from data, so registration = one new `Tool` entry in
`src/src/data/tools.ts` (matching `title`, `slug`, `description`, `badge`, 3–5
`features`, and today's date as `lastModified`). Write the description and features for
a visitor skimming the index, not for a developer. Match the badge vocabulary already in
use (`PYTHON`, category badges like `RETIREMENT`).

## 6. Verify, then report

From `./src`:

```bash
npm run test:run        # unit tests, including the lib tests you wrote
npx tsc --noEmit        # extracted lib/script modules must be strict-clean
npm run build           # static build must succeed
```

Write unit tests for the ported logic in the appropriate `__tests__/` dir (follow
`links.test.ts` for data shapes, existing `lib/__tests__` for logic). Then eyeball the
page on the dev server in **both themes**, including keyboard-only interaction.

Finish with a short report: what the tool does, where it lives (page + lib/scripts or
public/tools paths), what was changed or dropped from the source and why, test/build
results, and the dev URL to try it. Note anything the source repo did that this port
intentionally does differently.
