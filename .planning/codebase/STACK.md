# Technology Stack

**Analysis Date:** 2025-01-15

## Languages

**Primary:**
- TypeScript - All Astro components, pages, and scripts
- HTML - Static markup within .astro files
- CSS - Global styles and component-scoped styles
- MDX - Blog posts with frontmatter schema validation

**Secondary:**
- Python - PyScript-based tools (9 tools in `public/tools/`)
- JavaScript - Client-side scripts and legacy browser APIs

## Runtime

**Environment:**
- Node.js (required for Astro build process)
- No .nvmrc or engine version specified in package.json
- Browser runtime: All features work client-side (static build)

**Package Manager:**
- npm (package-lock.json present in `src/package-lock.json`)
- Lockfile: package-lock.json committed

## Frameworks

**Core:**
- Astro 5.16.6 - Static site generator with file-based routing
  - Config: `src/astro.config.mjs`
  - Site URL: https://www.arguelles.me
- TypeScript (via Astro) - Strict mode enabled in `src/tsconfig.json`

**Content:**
- @astrojs/mdx ^4.3.13 - MDX support for blog posts
- @astrojs/rss ^4.0.14 - RSS feed generation
- @astrojs/sitemap ^3.6.0 - Automatic sitemap generation

**Image Processing:**
- sharp ^0.34.3 - Image optimization and processing

**Testing:**
- Vitest 4.0.16 - Test runner and framework
- @vitest/coverage-v8 ^4.0.16 - Code coverage reporting
- @vitest/ui ^4.0.16 - Browser-based test UI
- jsdom ^27.4.0 - DOM environment for unit tests

**Python Runtime (Browser):**
- PyScript - Python runtime in browser for tool calculations
- NumPy - Numerical computations
- Matplotlib - Chart generation
- Plotly - Interactive visualizations

## Key Dependencies

**Critical:**
- Astro - Core framework and build system
- TypeScript - Type safety across the codebase
- Sharp - Image optimization pipeline

**Infrastructure:**
- Node.js built-ins - fs, path for build-time operations
- Browser APIs - localStorage for theme persistence, fetch for data

## Configuration

**Environment:**
- No environment variables required (static site only)
- No .env files detected
- All configuration via code and config files

**Build:**
- `src/astro.config.mjs` - Astro configuration (integrations, site URL)
- `src/tsconfig.json` - TypeScript compiler options (strict mode)
- `src/vitest.config.ts` - Test runner configuration
- `src/wrangler.toml` - Cloudflare Workers deployment config

## Platform Requirements

**Development:**
- macOS/Linux/Windows (any platform with Node.js)
- No external dependencies required
- Python tools run client-side via PyScript (no server needed)

**Production:**
- Static site deployment (Netlify, Vercel, GitHub Pages, or Cloudflare Pages)
- wrangler.toml configured for Cloudflare Workers deployment
- All assets served from `./dist` directory

---

*Stack analysis: 2025-01-15*
*Update after major dependency changes*
