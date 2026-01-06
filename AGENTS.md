# AGENTS.md

Single source of truth for AI agents working on this codebase.

**🚨 READ THIS FIRST**: Check for `CONTINUE.md` in the repo root. If it exists, read it for current project status before starting work. CONTINUE.md has up-to-date information about what's been completed and what remains.

## Project Structure

**IMPORTANT**: The Astro application is located in `./src` (not at the repository root).

```
/workspaces/www/
├── PRD.md                  # Product requirements document
├── AGENTS.md              # This file (agent instructions)
├── CLAUDE.md              # Symlink to AGENTS.md
├── GEMINI.md              # Symlink to AGENTS.md
├── README.md              # Human-friendly documentation
└── src/                   # Astro project root
    ├── astro.config.mjs   # Astro configuration
    ├── package.json       # Dependencies
    └── src/               # Source code
        ├── pages/         # File-based routing
        ├── components/    # Astro components
        ├── layouts/       # Layout components
        ├── styles/        # Global CSS
        ├── content/       # Content collections
        │   └── blog/      # Blog posts (collection name: "blog")
        ├── data/          # Data files (links, etc.)
        └── scripts/       # Client-side scripts
```

## Commands

All commands must be run from the `./src` directory:

```bash
cd src
npm run dev      # Start development server (http://localhost:4321)
npm run build    # Build for production
npm run preview  # Preview production build
npm run astro    # Run Astro CLI commands
```

## File Placement Rules

### Pages (File-based routing)
- Location: `./src/src/pages/`
- Pattern: `filename.astro` creates route at `/filename`
- Dynamic routes: `[slug].astro` or `[...slug].astro`
- Index: `index.astro` in any directory creates route at that path

### Components
- Location: `./src/src/components/`
- Naming: PascalCase (e.g., `Window.astro`, `RetroButton.astro`)
- Usage: Import in pages or other components

### Layouts
- Location: `./src/src/layouts/`
- Base layout: `BaseLayout.astro` (includes global head, header, footer)
- Post layout: `BlogPost.astro` (or `PostLayout.astro`)

### Content Collections
- Config: `./src/src/content.config.ts`
- Blog posts: `./src/src/content/blog/`
- **⚠️ COLLECTION NAME IS "blog"** (not "posts" - this is intentional historical naming)
- When using `getCollection('blog')` - use 'blog' not 'posts'
- File format: `.md` or `.mdx`

### Styles
- Global CSS: `./src/src/styles/global.css`
- Import in layouts, not in components (usually)

### Data Files
- Location: `./src/src/data/`
- Export TypeScript data structures
- Example: `links.ts` exports array of link objects

### Scripts
- Location: `./src/src/scripts/`
- Client-side TypeScript/JavaScript
- Import in components with `<script>` tags

## Coding Conventions

### Dependencies
- Keep dependencies minimal
- Prefer vanilla Astro over frameworks (React, Vue, etc.)
- Use custom CSS + design tokens over component libraries
- Avoid unnecessary client-side hydration

### CSS and Styling
- Use CSS custom properties (design tokens) for all values
- All styling must be themeable via tokens
- Define tokens in `[data-theme="..."]` selectors
- Prefer custom CSS effects (gradients, shadows, bevels) over images
- Respect `prefers-reduced-motion` - disable animations when set

### Components
- Keep components small and reusable
- Use props for configuration
- Use TypeScript interfaces for props
- Include accessibility attributes (ARIA labels, keyboard navigation)

### Content
- Blog posts use frontmatter schema defined in `content.config.ts`
- Required fields: title, description, pubDate, tags
- Optional fields: draft (boolean), heroImage
- Draft posts are filtered out in production

### JavaScript
- Use TypeScript for type safety
- Keep client-side JS minimal
- Use for: theme toggle, form validation, simple calculators
- Avoid: analytics, trackers, heavy frameworks

## How to Modify

### Add a New Page
1. Create file in `./src/src/pages/` (e.g., `newpage.astro`)
2. Import `BaseLayout` if needed
3. Add content
4. Link to it in `SiteHeader.astro` navigation

### Add a Blog Post
1. Create `.md` or `.mdx` file in `./src/src/content/blog/`
2. Add frontmatter:
```yaml
title: "Post Title"
description: "Post description"
pubDate: 2025-01-06
tags: ["tag1", "tag2"]
draft: false
# optional: heroImage: ./image.jpg
```
3. Write markdown content
4. Post automatically appears in blog index (if draft: false)

### Add a Tool
1. Create page in `./src/src/pages/tools/` (e.g., `my-tool.astro`)
2. Add interactive form using `RetroButton` and `Window` components
3. Add client-side script with `<script>` tag for logic
4. Add entry to tools index (`./src/src/pages/tools/index.astro`)

### Modify Theme Tokens
1. Edit `./src/src/styles/global.css`
2. Add/modify tokens in `[data-theme="neon-night"]` or `[data-theme="mall-pastel"]`
3. Test changes in both themes
4. Document new tokens in `docs/THEME.md`

### Add a New Theme
1. Define new theme tokens in `./src/src/styles/global.css`
2. Add theme option to `SiteHeader.astro` theme toggle
3. Update `./src/src/scripts/theme.ts` with new theme name
4. Document in `docs/THEME.md`

## Guardrails

### DO NOT
- Add backend, authentication, database, or CMS integration
- Add animated GIF assets (v1 constraint - CSS effects only)
- Break static build output (no server runtime required)
- Add heavy SPA frameworks or conversions
- Ignore accessibility (focus states, reduced motion, color contrast)
- Remove or hardcode theme toggle functionality

### MUST
- Keep build static (no server-side runtime)
- Keep dependencies minimal
- Respect `prefers-reduced-motion` in CSS
- Test both themes (neon-night, mall-pastel)
- Keep blog collection named "blog" (not "posts")
- Use VT323 font globally (via Google Fonts embed)
- Make all interactive elements keyboard accessible
- Persist theme choice in localStorage

### Project Constraints
- Static output only (deployable to Netlify or any static host)
- No external API calls or services
- No authentication or user accounts
- No database or CMS
- Minimal JavaScript (only for tools and theme toggle)

## Mistakes and Lessons Learned

*This section tracks mistakes encountered during development and their solutions. Keep it slim and actionable.*

### [Date] Initial Setup
- **Issue**: None encountered yet
- **Solution**: N/A
- **Agent**: N/A

---

## Additional Documentation

- **README.md** - Human-friendly project overview
- **docs/THEME.md** - Theme tokens and styling guidelines
- **docs/CONTENT.md** - Content structure and writing guidelines
- **PRD.md** - Original product requirements document

## Design System

### Typography
- Font: VT323 (Google Fonts embed)
- Size: Large, retro terminal style
- Use `.vt323-regular` utility class if needed

### Colors (Theme Tokens)
See `docs/THEME.md` for complete token list.

### Key Components
- `Window` - Retro panel wrapper with title bar
- `RetroButton` - Beveled buttons (primary/secondary/danger variants)
- `Badge` - Small inline badges (NEW, HOT, WIP)
- `Sticker` - Loud callout labels
- `Tag` - Blog post tag links

### Aesthetic
- 90s Jean Paul Gaultier / retro web aesthetic
- Maximalist but readable
- Beveled panels, chunky borders, drop shadows
- Neon night (dark) and mall pastel (light) themes
- CSS-only effects (no GIFs in v1)
