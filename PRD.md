# PRD.md

## 1) Purpose

Build a personal website that unifies home/about/links/blog/tools into a single cohesive Astro site with a bespoke **90s Jean Paul Gaultier / retro web** aesthetic (fashion-forward, playful, maximalist) implemented with custom CSS. 

The site must be static and deployable to Netlify (or any static host), and the repository must be easy to work on for both humans and AI coding agents.

## 2) Goals

### Product goals
- A working Astro site with these pages:
  - Home (`/`)
  - About (`/about`)
  - Links (`/links`)
  - Blog index (`/blog`)
  - Blog post pages (`/blog/[slug]`)
  - Tools index (`/tools`)
  - Tool pages (at least 2) (`/tools/<slug>`)
  - Styleguide (`/styleguide`) showing theme components + tokens + states
- All pages include demo/dummy/placeholder content that matches the vibe.

### Repo goals
- Clear docs:
  - `README.md` (human-friendly)
  - `AGENTS.md` (agent context, single source of truth)
  - `CLAUDE.md` and `GEMINI.md` symlink to `AGENTS.md`
  - Additional docs as needed (theme/content).

## 3) Non-goals

- No backend, authentication, database, or CMS integration.
- No importing existing real content yet (placeholder only).
- No animated GIF assets in v1 (CSS effects only).
- No heavy SPA conversion; keep navigation and content mostly static.

## 4) Current repo state (given)

- Astro “blog” template has already been initialized inside `./src` (the Astro project is **not** at repo root).
- `PRD.md` will live at repo root and will be used to prompt an AI agent to generate the site.

## 5) Constraints & assumptions

- Static build output required (no server runtime).
- Dependencies should remain minimal.
- Code should be understandable and editable without a framework lock-in.

## 6) Routes & information architecture

Implement routes using Astro file-based routing under the Astro project directory (expected: `./src/src/pages/**`).

### Required routes
- `/` Home
- `/about` About
- `/links` Links
- `/blog` Blog index
- `/blog/[slug]` Blog post page
- `/tools` Tools index
- `/tools/<slug>` Tool pages (can be `[slug].astro` dynamic route or static tool pages)
- `/styleguide` Styleguide + tokens + UI states

## 7) Branding & design requirements (90s Jean Paul Gaultier + fashion coder)

### 7.1 Visual direction
The site should feel like a modern “1997 personal page” meets fashion lookbook:
- Loud but controlled colors, gradients, and “sticker” motifs. 
- Beveled panels/windows, chunky borders, drop shadows.
- Intentional “JPEG-era” cues (e.g., dither-like patterns via CSS, faux scanlines very subtle, pixel edges).
- Maximalist layout with windows/panels, but still readable and navigable.

### 7.2 Pure CSS effects only (v1)
Allowed effects:
- CSS gradients, patterns, pseudo-elements, shadows, outlines
- Subtle flicker, shimmer, blink (must be optional/disabled by reduced motion)
Not allowed in v1:
- Animated GIF assets, background videos, heavy canvas effects.

### 7.3 Typography requirements (VT323 via embed)
Use VT323 as the site font using Google Fonts embed in the site `<head>`:

Required head code (must be added in the global layout head):
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=VT323&display=swap" rel="stylesheet">
```

Required global CSS:
- Default text font for the site: `"VT323", monospace`
- Provide a utility class as well:
```css
.vt323-regular {
  font-family: "VT323", monospace;
  font-weight: 400;
  font-style: normal;
}
```

Note: v1 is allowed to depend on Google Fonts delivery for speed of implementation; self-hosting may be added later.

### 7.4 Theme system (tokens + toggle)
Implement theming via CSS custom properties (design tokens).

Requirements:
- At least **two themes**:
  - `neon-night` (dark, neon accents)
  - `mall-pastel` (light, pastel accents)
- Theme selection UI in header (toggle or dropdown).
- Persist selected theme in `localStorage`.
- Default theme selection respects `prefers-color-scheme` when no saved choice exists.

Minimum tokens:
- Background: `--bg`, `--bg2`, `--panel`
- Text: `--text`, `--muted`
- Accents: `--accent`, `--accent2`
- Borders/shadow: `--border`, `--shadow`
- Links/state: `--link`, `--visited`, `--focus`
- “Sticker”/badge: `--sticker-bg`, `--sticker-text`

### 7.5 Components (must exist)
Implement reusable components that define the look:

- `SiteHeader.astro`
  - Includes site title/wordmark
  - Navigation to Home/Blog/Tools/Links/About/Styleguide
  - Theme toggle UI
- `SiteFooter.astro`
  - Includes a playful retro footer (e.g., “best viewed on…” style copy)
- `Window.astro`
  - A retro panel/window wrapper with a title bar
  - Props: `title`, optional `badgeText`, optional `variant`
- `RetroButton.astro`
  - Supports variants: primary/secondary/danger
  - Supports disabled state
- `Badge.astro`
  - For “NEW”, “HOT”, “Jean Paul Gaultier”, “WIP”
- `Sticker.astro` (optional but encouraged)
  - Loud callout label used sparingly
- `Tag.astro` or tag styling for blog tags

### 7.6 Motion and accessibility
- Must respect `prefers-reduced-motion` by disabling non-essential animations.
- All interactive elements must have visible focus states.
- Color themes must remain readable (avoid low contrast neon-on-neon).

## 8) Content requirements (placeholder/dummy)

### 8.1 Home (`/`)
Include placeholder content:
- Hero heading (brand statement)
- 1–2 paragraphs intro
- 3–4 feature tiles linking to Blog, Tools, Links, About
- A “What’s new” window that shows:
  - latest blog post (dummy)
  - latest tool (dummy)
- Include at least 1 sticker/badge element to demonstrate theme.

### 8.2 About (`/about`)
Include:
- Short bio placeholder
- “Now” section (current interests: fashion, small tools, writing)
- “Style influences” bullet list (placeholder)
- “Colophon” (Astro, static deploy, theme tokens)

### 8.3 Links (`/links`)
Include:
- 8–12 placeholder links grouped by category (Social / Code / Writing / Other)
- Render links as retro buttons or badges with descriptions

Data implementation:
- Link data should live in a small data file for easy editing:
  - `./src/src/data/links.ts` exporting an array of link objects.

### 8.4 Blog (content collection)
Use Astro content collections for posts.

Requirements:
- Define a `posts` collection in `./src/src/content/config.ts`.
- Create at least 5 placeholder posts under `./src/src/content/posts/`.
- Frontmatter schema (minimum):
  - `title` string
  - `description` string
  - `pubDate` date
  - `tags` string[]
  - `draft` boolean optional

Blog index (`/blog`) requirements:
- Sorted by `pubDate` desc
- Shows title, date, description, tags, link to post
- Filters out drafts

Blog post page (`/blog/[slug]`) requirements:
- Uses a `PostLayout.astro`
- Good markdown styling for headings, lists, links, code, blockquotes

Suggested dummy post topics:
- “Fit notes: cargo pants + neon UI”
- “JPEG artifacts as texture”
- “Tiny calculators as fashion accessories”
- “On building tools that feel like toys”
- “Bookmarks that shaped my taste”

### 8.5 Tools
Tools index (`/tools`) requirements:
- List tools as windows/cards
- Each tool has name, description, and link

At least 2 tools must exist with working demo logic:
1. `401k Calculator (demo)`
   - Inputs: salary, contribution %, employer match %, years, annual return %
   - Output: simple computed balance projection (basic math is fine for demo)
2. `Rune Calculator (demo)`
   - Inputs: current level, target level (or runes needed)
   - Output: computed runes needed (simple math placeholder acceptable)

Implementation:
- Tools should be client-side interactive with minimal JS.
- Tool UI must use the same retro components/styles.

## 9) Styleguide page requirements (`/styleguide`)

The styleguide is a required deliverable and must demonstrate:

- Typography:
  - h1–h4, body, small, code, links
- Components:
  - Window (variants)
  - RetroButton (all states)
  - Badge + Sticker
  - Form inputs (text, number, select)
  - Tag styling
- Theme tokens:
  - A grid/list showing color swatches for key tokens (bg/panel/text/accent/etc.)
- Theme switching:
  - Show both themes and confirm toggle works + persists
- Accessibility:
  - Demonstrate focus ring styling and reduced-motion behavior explanation (text is fine)

## 10) Technical requirements

### 10.1 Project structure
Repo root contains docs.
Astro app is in `./src` and should follow Astro structure conventions there.

Expected structure inside `./src`:
- `./src/src/pages/**`
- `./src/src/components/**`
- `./src/src/layouts/**`
- `./src/src/styles/**`
- `./src/src/content/**`
- `./src/public/**` (static assets; in v1 no gifs required)

### 10.2 Layouts
Must implement:
- `BaseLayout.astro`
  - Includes global `<head>` additions (VT323 embed)
  - Includes header/footer
  - Applies theme attribute/class to `<html>` or `<body>`
- `PostLayout.astro`
  - Styles markdown content

### 10.3 Styling implementation
- Global CSS file imported once (e.g., `./src/src/styles/global.css`).
- Theme CSS file(s) or sections in global CSS defining tokens for:
  - `[data-theme="neon-night"]`
  - `[data-theme="mall-pastel"]`

### 10.4 Minimal JS
Allowed JS modules:
- `theme.ts` for theme initialization + persistence
- tool-specific scripts/components for calculators

Avoid:
- analytics
- trackers
- unnecessary client hydration outside tool pages and theme toggle

### 10.5 Quality bar
- Local dev works
- Static build works
- No dead internal links
- Consistent design across all pages

## 11) Documentation deliverables

### 11.1 `README.md` (repo root)
Must include:
- Project overview + aesthetic description
- Repo structure explanation (Astro app is in `./src`)
- Local dev instructions:
  - `cd src`
  - `npm install`
  - `npm run dev`
- Build instructions:
  - `npm run build`
  - `npm run preview`
- How to add a blog post (create a file in `src/src/content/posts/` with correct frontmatter)
- How to add a tool (add a page, add listing entry)
- How to adjust theme tokens and add a theme

### 11.2 `AGENTS.md` (repo root)
Single source of truth for agents. Must include:
- “Astro app is in ./src” reminder
- Commands (dev/build/preview)
- File placement rules (pages/components/layouts/content/styles)
- Coding conventions:
  - Keep dependencies minimal
  - Prefer custom CSS + tokens
  - Keep components small and reusable
- How to modify/add:
  - pages
  - posts
  - tools
  - themes/tokens
- Guardrails (“do not add backend”, “no gifs in v1”, “respect reduced motion”)

Symlinks:
- Create `CLAUDE.md` and `GEMINI.md` as symlinks pointing to `AGENTS.md`.
- If symlinks are not supported (Windows without admin), provide a fallback note to copy contents.

### 11.3 Additional docs (create)
- `docs/THEME.md`
  - Token list
  - Theme palette guidance
  - Component styling rules
  - CSS effect recipes used (bevel, sticker, etc.)
- `docs/CONTENT.md`
  - Post schema
  - Writing voice for placeholders
  - Tool page conventions

## 12) Acceptance criteria (definition of done)

- Repo root includes: `PRD.md`, `README.md`, `AGENTS.md`, and symlink approach for `CLAUDE.md` + `GEMINI.md`.
- Astro site in `./src` implements all required routes including `/styleguide`.
- VT323 loaded via the Google Fonts `<link>` embed in the global layout head and used site-wide.
- Two themes exist, toggle works, persists, and respects `prefers-reduced-motion` and `prefers-color-scheme`.
- Blog uses Astro content collections with ≥5 placeholder posts.
- Tools section has ≥2 working demo calculators.

## 13) Implementation plan (agent checklist)

1. Confirm existing Astro template under `./src` runs.
2. Add layouts (`BaseLayout`, `PostLayout`) and global CSS with tokens.
3. Add theme toggle script + persistence.
4. Create components (Window/RetroButton/Badge/etc.).
5. Create pages (home/about/links/tools/blog/styleguide).
6. Add content collection config + placeholder posts.
7. Add two demo tools with minimal client JS.
8. Add documentation files and symlinks strategy.
9. Run build + fix issues.

