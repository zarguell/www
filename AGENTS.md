# AGENTS.md

Single source of truth for AI agents working on this codebase. Streamlined for efficient context delivery.

## Quick Start

**IMPORTANT**: The Astro application is located in `./src` (not at the repository root).

```bash
cd src
npm run dev      # Start dev server (http://localhost:4321)
npm run build    # Build for production
npm run test:run # Run tests
```

## Project Structure

```
./
├── AGENTS.md              # This file (agent instructions)
├── CLAUDE.md              # Symlink to AGENTS.md
├── GEMINI.md              # Symlink to AGENTS.md
├── README.md              # Human-friendly documentation
├── docs/                  # Additional documentation
│   ├── mistakes.md        # Mistakes & lessons learned
│   ├── tool-dev-guide.md  # Tool development guide (JavaScript + PyScript)
│   └── plans/             # Design & implementation plans
└── src/                   # Astro project root
    ├── src/
    │   ├── pages/         # File-based routing
    │   ├── components/    # Astro components
    │   ├── layouts/       # Layout components (BaseLayout, PythonToolLayout)
    │   ├── styles/        # Global CSS
    │   ├── content/       # Content collections
    │   │   └── blog/      # Blog posts (collection name: "blog")
    │   ├── data/          # Data files
    │   └── scripts/       # Client-side scripts
    └── public/tools/      # Python tool files (main.py, config.json)
```

## File Placement Rules

| Type | Location | Notes |
|------|----------|-------|
| Pages | `./src/src/pages/` | `filename.astro` → `/filename` |
| Components | `./src/src/components/` | PascalCase naming |
| Layouts | `./src/src/layouts/` | BaseLayout, PythonToolLayout, BlogPost |
| Blog Posts | `./src/src/content/blog/` | Collection name is `"blog"` not `"posts"` |
| Styles | `./src/src/styles/global.css` | Check here before adding component styles |
| Data Files | `./src/src/data/` | Export TypeScript data structures |
| Python Tools | `./src/public/tools/<tool>/` | `main.py`, `config.json` |
| Tool Pages | `./src/src/pages/tools/<tool>.astro` | Use PythonToolLayout for PyScript |

## Tool Development

**CRITICAL**: When developing a new tool, `docs/tool-dev-guide.md` is the source of truth.

Quick reference:
- **JavaScript tools**: Use `BaseLayout`, add client-side `<script>` tag
- **Python tools**: Use `PythonToolLayout`, add PyScript script tag, create files in `public/tools/<tool>/`
- **Always**: Add new tools to `./src/src/pages/tools/index.astro`

See `docs/tool-dev-guide.md` for detailed patterns and examples.

## Test Harnesses

When implementing new features, create test harnesses to verify functionality:

### For Data Structure Changes
- Add/update tests in `./src/src/data/__tests__/`
- Follow the pattern in `links.test.ts`
- Validate structure, types, and constraints

### For Component Changes
- Create test files in `./src/src/components/__tests__/`
- Test props, rendering, and user interactions
- Use vitest framework

### For Tools
- Create test files in `./src/src/pages/tools/__tests__/`
- Test core calculation/logic functions
- For JavaScript tools, test exported functions
- For Python tools, document test cases in comments (PyScript testing is limited)

### Running Tests
```bash
cd src
npm run test           # Watch mode
npm run test:run       # Single run
```

## Coding Conventions

### Dependencies
- Keep minimal
- Prefer vanilla Astro over frameworks
- Custom CSS + design tokens over component libraries
- Avoid unnecessary client-side hydration

### CSS and Styling
- Use CSS custom properties (design tokens) for all values
- All styling must be themeable via tokens
- Define tokens in `[data-theme="..."]` selectors
- **Check `./src/src/styles/global.css` before adding component-specific styles** - global styles exist for: `.retro-button`, `.form-group`, `.calculator-hero`, `.tool-hero`, `.calculator-form`, etc.
- If a style appears in 3+ components, move it to global CSS

### JavaScript
- Use TypeScript for type safety
- Keep client-side JS minimal
- Use for: theme toggle, form validation, simple calculators
- Avoid: analytics, trackers, heavy frameworks

## Common Tasks

### Add a New Page
1. Create `./src/src/pages/newpage.astro`
2. Import `BaseLayout`
3. Add content
4. Link in `SiteHeader.astro` navigation

### Add a Blog Post
1. Create `.md` or `.mdx` in `./src/src/content/blog/`
2. Add frontmatter:
```yaml
title: "Post Title"
description: "Post description"
pubDate: 2025-01-06
tags: ["tag1", "tag2"]
draft: false
# optional: heroImage: ./image.jpg
```
3. Post automatically appears in blog index (if draft: false)

### Modify Theme Tokens
1. Edit `./src/src/styles/global.css`
2. Add/modify tokens in `[data-theme="neon-night"]` or `[data-theme="mall-pastel"]`
3. Test changes in both themes
4. Document new tokens alongside the existing ones in `./src/src/styles/global.css`

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
- Use VT323 font globally
- Make all interactive elements keyboard accessible
- Persist theme choice in localStorage
- Use `PythonToolLayout` ONLY for Python/PyScript tools
- Keep PyScript isolated to tool pages (never add to BaseLayout)
- Add new tools to `./src/src/pages/tools/index.astro`

## Design System Reference

### Typography
- Font: VT323 (Google Fonts embed)
- Size: Large, retro terminal style

### Key Components
- `Window` - Retro panel wrapper with title bar
- `RetroButton` - Beveled buttons (primary/secondary/danger)
- `Badge` - Small inline badges (NEW, HOT, WIP)
- `Sticker` - Loud callout labels
- `Tag` - Blog post tag links

### Aesthetic
- 90s Jean Paul Gaultier / retro web aesthetic
- Maximalist but readable
- Beveled panels, chunky borders, drop shadows
- Neon night (dark) and mall pastel (light) themes
- CSS-only effects (no GIFs in v1)

## Additional Documentation

| Document | Purpose |
|----------|---------|
| `README.md` | Human-friendly project overview |
| `docs/tool-dev-guide.md` | **Source of truth for tool development** (JavaScript + PyScript) |
| `docs/mistakes.md` | Mistakes encountered and lessons learned |
| `docs/plans/` | Design and implementation plans |
| `.agents/skills/migrate-tool/` | Skill: migrating a small external tool (repo link) into the site — read the source, design the fit, ship it |

When migrating/porting an external one-off tool into this site, read and follow
`.agents/skills/migrate-tool/SKILL.md`.

## Project Constraints

- Static output only (deployable to Netlify or any static host)
- No external API calls or services
- No authentication or user accounts
- No database or CMS
- Minimal JavaScript (only for tools and theme toggle)
