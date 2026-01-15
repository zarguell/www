# Architecture

**Analysis Date:** 2025-01-15

## Pattern Overview

**Overall:** Static Site with File-Based Routing and Component Composition

**Key Characteristics:**
- Single-page application feel with multi-page routing
- Static build output (no server runtime required)
- Component-based architecture with reusable UI elements
- Client-side Python tools via PyScript integration
- File-based routing (Astro pages become routes)

## Layers

**Presentation Layer (Components):**
- Purpose: Reusable UI components and layout wrappers
- Contains: RetroButton, Window, Badge, Sticker, Header, Footer
- Location: `src/src/components/*.astro`
- Depends on: Global CSS, design tokens
- Used by: Page components, layouts

**Layout Layer:**
- Purpose: Page structure and consistent shell elements
- Contains: BaseLayout, ToolLayout, PythonToolLayout, BlogPost
- Location: `src/src/layouts/*.astro`
- Depends on: Components, global styles
- Used by: All pages

**Page Layer:**
- Purpose: Individual routes and tool implementations
- Contains: Home page, tool pages, blog pages, about, links, styleguide
- Location: `src/src/pages/**/*.astro`
- Depends on: Layouts, components, data files
- Used by: Router (file-based)

**Data Layer:**
- Purpose: Structured data exports for tools and links
- Contains: tools.ts (tool metadata), links.ts (external links)
- Location: `src/src/data/*.ts`
- Depends on: TypeScript interfaces
- Used by: Index page, tool listing pages

**Content Layer:**
- Purpose: Blog posts with frontmatter validation
- Contains: Markdown and MDX files
- Location: `src/src/content/blog/*.md`
- Depends on: Zod schema validation
- Used by: Blog pages, RSS feed

**Script Layer:**
- Purpose: Client-side interactivity and theme management
- Contains: theme.ts (theme toggle logic)
- Location: `src/src/scripts/*.ts`
- Depends on: Browser localStorage API
- Used by: BaseLayout, pages needing interactivity

**Tool Layer (Python):**
- Purpose: Browser-based calculation and visualization tools
- Contains: main.py files for 9 financial/planning tools
- Location: `src/public/tools/*/main.py` + config.json
- Depends on: PyScript, NumPy, Matplotlib, Plotly
- Used by: Python tool pages via PythonToolLayout

## Data Flow

**Page Request Flow:**

1. User navigates to URL (e.g., `/tools/401k-calculator/`)
2. File-based routing matches `src/src/pages/tools/401k-calculator.astro`
3. Astro builds page component:
   - Loads layout (e.g., PythonToolLayout for Python tools)
   - Layout loads global CSS and components (Header, Footer)
   - Page component renders tool-specific content
4. For Python tools:
   - PyScript runtime initializes
   - Loads `main.py` from `public/tools/<tool>/`
   - Loads `config.json` for tool configuration
   - Python code executes calculations
   - Renders charts/results to DOM
5. For client-side interactivity:
   - `<script>` tags execute after hydration
   - theme.ts manages theme toggle via localStorage
   - Event handlers attach for buttons, forms

**Theme Toggle Flow:**

1. User clicks theme toggle button (in Header component)
2. theme.ts `toggleTheme()` function executes
3. Reads current theme from localStorage
4. Swaps theme attribute on `<html>` element
5. Persists new theme to localStorage
6. Updates all CSS custom properties via data-theme selectors

**State Management:**
- No global state management (Redux, Zustand, etc.)
- Component-local state via Astro props
- Browser localStorage for theme persistence
- URL search params for tool state sharing (some tools)

## Key Abstractions

**Layout:**
- Purpose: Page structure wrapper with consistent elements
- Examples: BaseLayout (main site), PythonToolLayout (PyScript tools), ToolLayout (JS tools)
- Pattern: Astro component with `<slot />` for page content

**Component:**
- Purpose: Reusable UI elements with retro styling
- Examples: Window (panel wrapper), RetroButton (beveled buttons), Badge (status indicators)
- Pattern: Astro component with props interface, scoped styles

**Tool:**
- Purpose: Self-contained calculator or utility
- Examples: 401k calculator, Roth calculator, Sankey builder, HEIC converter
- Pattern: Page component + optional Python code + config.json metadata

**Theme Token:**
- Purpose: Design system values for colors, spacing, effects
- Examples: `--bg`, `--accent`, `--bevel-light`, `--sticker-bg`
- Pattern: CSS custom properties scoped by `[data-theme="..."]` selector

**Data Export:**
- Purpose: Structured TypeScript data for pages
- Examples: tools.ts (360 lines of tool metadata), links.ts (social links and cool finds)
- Pattern: Named export of typed array or object

## Entry Points

**Build Entry:**
- Location: `src/astro.config.mjs`
- Triggers: `npm run build` or `astro build`
- Responsibilities: Configure integrations (MDX, sitemap), set site URL

**Dev Server Entry:**
- Location: Same as build (Astro CLI)
- Triggers: `npm run dev` or `astro dev`
- Responsibilities: Start dev server on port 4321, enable hot reload

**Test Runner Entry:**
- Location: `src/vitest.config.ts`
- Triggers: `npm test` or `vitest`
- Responsibilities: Configure test environment, coverage, and UI

**Home Page:**
- Location: `src/src/pages/index.astro`
- Triggers: User visits `/`
- Responsibilities: Render landing page with feature overview, launch chat button

**Tools Index:**
- Location: `src/src/pages/tools/index.astro`
- Triggers: User visits `/tools/`
- Responsibilities: Display all tools organized by category with search/filter

**RSS Feed:**
- Location: `src/src/pages/rss.xml.js`
- Triggers: User or RSS reader requests `/rss.xml`
- Responsibilities: Generate RSS feed from blog collection

## Error Handling

**Strategy:** Minimal error handling (static site with no backend)

**Patterns:**
- No try/catch blocks detected in main codebase
- Astro handles build-time errors
- Python tools have try/catch in main.py functions (e.g., expense-ratio, sankey-builder)
- No global error boundary components
- Errors surface during build (Astro reports them) or at runtime (browser console)

## Cross-Cutting Concerns

**Theming:**
- Approach: CSS custom properties with data-theme attribute on `<html>`
- Implementation: `src/src/scripts/theme.ts` toggles between "neon-night" and "mall-pastel"
- Persistence: localStorage with key "theme"
- Default: "neon-night" (hardcoded in BaseLayout)

**Accessibility:**
- Semantic HTML elements (main, header, footer, nav)
- sr-only spans for screen reader-only text (e.g., "Follow Astro on Mastodon")
- VT323 font loaded with preconnect for performance
- Keyboard navigation support (focus styles defined in theme tokens)

**SEO:**
- Meta tags for description and viewport in BaseLayout
- Canonical URLs generated from Astro.url.pathname
- Automatic sitemap generation via @astrojs/sitemap
- RSS feed for blog posts via @astrojs/rss
- OpenGraph images for tools (ogImage prop in ToolLayout)

**Performance:**
- Static build (pre-rendered HTML, CSS, JS)
- Sharp for image optimization
- No heavy client-side frameworks
- PyScript runtime loads only for Python tool pages
- Lazy loading not implemented (all tools index loads at once)

---

*Architecture analysis: 2025-01-15*
*Update when major patterns change*
