# Codebase Structure

**Analysis Date:** 2025-01-15

## Directory Layout

```
./
├── .devcontainer/      # Dev container configuration
├── .vscode/            # VSCode settings (extensions, launch.json)
├── .planning/          # Project planning and codebase docs (this file)
├── docs/               # Additional documentation
│   ├── mistakes.md     # Mistakes & lessons learned
│   ├── theme.md        # Theme tokens and styling guide
│   ├── content.md      # Content structure guide
│   └── tool-dev-guide.md # Tool development guide
├── src/                # Astro project root (IMPORTANT: not at repo root)
│   ├── .astro/         # Astro build cache and generated files
│   ├── dist/           # Build output (static assets)
│   │   └── tools/      # Built Python tool files
│   ├── node_modules/   # Dependencies
│   ├── public/         # Static assets served at root
│   │   ├── assets/      # Images, fonts, icons
│   │   └── tools/      # Python tool source files
│   │       ├── expense-ratio/    # Tool: main.py, config.json
│   │       ├── bilt-breakeven/    # Tool: main.py, config.json
│   │       ├── trad-vs-roth/      # Tool: main.py, config.json
│   │       ├── sankey-builder/    # Tool: main.py, config.json
│   │       ├── sequence-risk/     # Tool: main.py, config.json
│   │       ├── roth/              # Tool: main.py, config.json
│   │       ├── safe-withdrawal/   # Tool: main.py, config.json
│   │       ├── savings-rate-fi/   # Tool: main.py, config.json
│   │       └── monte-carlo/       # Tool: main.py, config.json
│   ├── src/            # Source code
│   │   ├── components/  # Reusable UI components (16 files)
│   │   │   ├── AimChat.astro
│   │   │   ├── Badge.astro
│   │   │   ├── BaseHead.astro
│   │   │   ├── CoolFindCard.astro
│   │   │   ├── Footer.astro
│   │   │   ├── FormattedDate.astro
│   │   │   ├── Header.astro
│   │   │   ├── HeaderLink.astro
│   │   │   ├── RecipeCard.astro
│   │   │   ├── RetroButton.astro
│   │   │   ├── SiteFooter.astro
│   │   │   ├── SiteHeader.astro
│   │   │   ├── Sticker.astro
│   │   │   ├── Tag.astro
│   │   │   ├── Window.astro
│   │   │   └── ZoomableImage.astro
│   │   ├── consts.ts     # Constants (if any)
│   │   ├── content/      # Content collections
│   │   │   └── blog/       # Blog posts (collection: "blog")
│   │   │       ├── cloudflare-ztna.md
│   │   │       └── influxdb-speedtest.md
│   │   ├── content.config.ts  # Astro content collection config
│   │   ├── data/         # Data files
│   │   │   ├── __tests__/  # Data validation tests
│   │   │   │   └── links.test.ts
│   │   │   ├── links.ts     # External links and cool finds
│   │   │   └── tools.ts    # Tool metadata (360 lines)
│   │   ├── layouts/      # Layout components
│   │   │   ├── BaseLayout.astro       # Main site layout
│   │   │   ├── BlogPost.astro         # Blog post layout
│   │   │   ├── PythonToolLayout.astro # PyScript tool layout
│   │   │   └── ToolLayout.astro       # General tool layout
│   │   ├── pages/        # File-based routing
│   │   │   ├── about.astro
│   │   │   ├── index.astro
│   │   │   ├── links.astro
│   │   │   ├── styleguide.astro
│   │   │   ├── blog/
│   │   │   │   ├── [...slug].astro  # Individual blog post
│   │   │   │   └── index.astro       # Blog index
│   │   │   ├── tools/
│   │   │   │   ├── __tests__/  # Tool tests
│   │   │   │   ├── 401k-calculator.astro
│   │   │   │   ├── bilt-breakeven.astro
│   │   │   │   ├── cocktail-recipe.astro
│   │   │   │   ├── exif-marker.astro
│   │   │   │   ├── expense-ratio.astro
│   │   │   │   ├── heic-converter.astro
│   │   │   │   ├── index.astro         # Tools index (456 lines)
│   │   │   │   ├── monte-carlo.astro
│   │   │   │   ├── roth-calculator.astro
│   │   │   │   ├── rune-calculator.astro
│   │   │   │   ├── safe-withdrawal.astro
│   │   │   │   ├── sanitext.astro
│   │   │   │   ├── sankey-builder.astro
│   │   │   │   ├── savings-rate-fi.astro
│   │   │   │   ├── sequence-risk.astro
│   │   │   │   ├── splitcheck.astro
│   │   │   │   ├── super-juice.astro
│   │   │   │   └── trad-vs-roth.astro
│   │   │   └── rss.xml.js   # RSS feed generation
│   │   ├── scripts/      # Client-side scripts
│   │   │   ├── __tests__/  # Script tests
│   │   │   │   └── theme.test.ts
│   │   │   └── theme.ts    # Theme toggle logic
│   │   └── styles/       # Global styles
│   │       └── global.css  # Theme tokens, retro styling (459 lines)
│   ├── astro.config.mjs   # Astro configuration
│   ├── package.json       # Dependencies and scripts
│   ├── package-lock.json  # Dependency lockfile
│   ├── tsconfig.json      # TypeScript configuration
│   ├── vitest.config.ts   # Test runner configuration
│   └── wrangler.toml      # Cloudflare Workers config
├── .gitignore
├── AGENTS.md            # Agent instructions (symlink to CLAUDE.md)
├── CLAUDE.md            # Project instructions (symlink to AGENTS.md)
├── GEMINI.md            # Project instructions (symlink to AGENTS.md)
└── README.md            # Human-friendly documentation
```

## Directory Purposes

**src/** (ROOT OF THE ASTRO PROJECT)
- Purpose: Main Astro application directory
- Contains: All source code, configs, build output
- Key files: package.json, astro.config.mjs, tsconfig.json
- Subdirectories: See above tree structure

**src/src/**:**
- Purpose: Source code for pages, components, layouts
- Contains: The actual Astro application code
- Key files: pages/index.astro, components/*.astro, layouts/BaseLayout.astro
- Organization: Follows Astro conventions (components, layouts, pages, styles)

**src/public/**:**
- Purpose: Static assets served at website root
- Contains: images, fonts, and Python tool source code
- Key files: favicon.svg, assets/, tools/*/main.py, tools/*/config.json
- Served as: /assets/, /tools/expense-ratio/main.py, etc.

**docs/**:**
- Purpose: Additional project documentation
- Contains: theme guide, content guide, tool development guide, mistakes log
- Key files: tool-dev-guide.md (CRITICAL for tool development), theme.md, content.md
- Usage: Reference for development patterns and guidelines

**.planning/**:**
- Purpose: Project planning and codebase documentation
- Contains: This directory and its 7 markdown files
- Created by: /gsd:map-codebase command
- Usage: Reference for understanding codebase structure and state

## Key File Locations

**Entry Points:**
- `src/astro.config.mjs` - Astro configuration
- `src/src/pages/index.astro` - Home page
- `src/src/pages/tools/index.astro` - Tools listing page

**Configuration:**
- `src/tsconfig.json` - TypeScript config (strict mode)
- `src/vitest.config.ts` - Test runner config
- `src/wrangler.toml` - Cloudflare deployment config
- `src/package.json` - Dependencies and scripts

**Core Logic:**
- `src/src/layouts/BaseLayout.astro` - Main layout wrapper
- `src/src/scripts/theme.ts` - Theme toggle logic
- `src/src/data/tools.ts` - Tool metadata
- `src/src/data/links.ts` - Links data

**Testing:**
- `src/vitest.config.ts` - Test configuration
- `src/src/scripts/__tests__/theme.test.ts` - Theme toggle tests
- `src/src/data/__tests__/links.test.ts` - Data structure tests

**Documentation:**
- `README.md` - User-facing documentation
- `AGENTS.md` - AI agent instructions (symlink to CLAUDE.md)
- `docs/tool-dev-guide.md` - Tool development guide (CRITICAL)

## Naming Conventions

**Files:**
- PascalCase.astro for Astro components and layouts: `Window.astro`, `BaseLayout.astro`
- kebab-case.astro for pages: `about.astro`, `401k-calculator.astro`
- kebab-case.ts for TypeScript modules: `theme.ts`, `links.ts`
- kebab-case.test.ts for test files: `theme.test.ts`, `links.test.ts`
- UPPERCASE.md for important docs: `README.md`, `CLAUDE.md`, `AGENTS.md`

**Directories:**
- kebab-case for all directories: `components/`, `layouts/`, `scripts/`
- Plural names for collections: `components/`, `pages/`, `tools/`

**Special Patterns:**
- `__tests__/` directory for test files co-located with source
- `index.astro` for directory index pages (e.g., `blog/index.astro`)
- `[...slug].astro` for dynamic routes (e.g., blog posts)
- `rss.xml.js` for endpoint routes (non-HTML output)

## Where to Add New Code

**New Page:**
- Primary code: `src/src/pages/pagename.astro`
- Tests: No test pattern established for pages
- Documentation: Update README.md if user-facing

**New Tool:**
- Primary code: `src/src/pages/tools/toolname.astro`
- Python code (if needed): `src/public/tools/toolname/main.py`
- Config: `src/public/tools/toolname/config.json`
- Metadata: Add entry to `src/src/data/tools.ts`
- Tests: `src/src/pages/tools/__tests__/toolname.test.ts` (optional)
- Documentation: Update tools index (automatic if tools.ts updated)

**New Component:**
- Implementation: `src/src/components/ComponentName.astro` (PascalCase)
- Tests: No component test pattern established
- Documentation: Self-documenting via props interface

**New Blog Post:**
- Implementation: `src/src/content/blog/post-slug.md` or `.mdx`
- Add frontmatter: title, description, pubDate, tags, draft
- Documentation: Automatic (appears in blog index if draft: false)

**New Layout:**
- Implementation: `src/src/layouts/LayoutName.astro` (PascalCase)
- Tests: No layout test pattern established
- Documentation: Document usage pattern in comments

**Utilities:**
- Shared helpers: `src/src/scripts/` (for client-side JS)
- Type definitions: Inline or in `src/src/types.ts` (doesn't exist yet)
- No shared utilities directory (functions are component-specific or in theme.ts)

## Special Directories

**src/.astro/**
- Purpose: Astro build cache and generated TypeScript definitions
- Source: Auto-generated by Astro build process
- Committed: No (in .gitignore)

**src/dist/**
- Purpose: Build output directory (static site)
- Source: Generated by `astro build` command
- Committed: Mixed (some tool configs committed, mostly gitignored)

**src/coverage/**
- Purpose: Test coverage reports
- Source: Generated by `npm run test:coverage`
- Committed: No (in .gitignore)

**src/node_modules/**
- Purpose: Node.js dependencies
- Source: Installed by npm from package.json
- Committed: No (in .gitignore)

**src/public/tools/**
- Purpose: Python tool source code (served statically)
- Source: Hand-written Python and JSON files
- Committed: Yes (this is the source of truth for Python tools)

---

*Structure analysis: 2025-01-15*
*Update when directory structure changes*
