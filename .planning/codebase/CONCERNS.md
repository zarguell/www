# Codebase Concerns

**Analysis Date:** 2025-01-15

## Tech Debt

**Limited test coverage:**
- Issue: Only 2 test files for entire codebase (theme.test.ts, links.test.ts)
- Files: `src/src/scripts/__tests__/theme.test.ts`, `src/src/data/__tests__/links.test.ts`
- Why: Tests added after initial development, not yet comprehensive
- Impact: Risk of regressions when modifying code, no safety net for refactoring
- Fix approach: Add test harnesses for tools, component tests, increase coverage

**No linting/formatting configuration:**
- Issue: No .eslintrc, .prettierrc, or similar config files detected
- Why: Astro default formatting used, no formalized style rules
- Impact: Inconsistent code style, potential for bugs, harder onboarding
- Fix approach: Add ESLint and Prettier configs, integrate with pre-commit hooks

## Known Bugs

**No known bugs detected**
- No TODO comments indicating bugs found during analysis
- No reported issues in documentation

## Security Considerations

**PyScript Python execution in browser:**
- Risk: Python code runs client-side in PyScript runtime (potential for malicious code injection if tools allow user input)
- Files: All Python tool files in `src/public/tools/*/main.py`
- Current mitigation: Tools are read-only, no user-executable code
- Recommendations: Validate all user inputs, sanitize Python code if allowing custom scripts

**No CSP headers configured:**
- Risk: No Content Security Policy detected (could allow XSS if dynamic content added)
- Current mitigation: Static site with minimal JavaScript reduces attack surface
- Recommendations: Add CSP headers via Cloudflare Pages or Astro config

## Performance Bottlenecks

**No significant performance issues detected**
- Static build output is pre-rendered and fast
- Sharp for image optimization configured
- No server-side rendering bottlenecks

**Potential optimization:**
- Tools index page loads all tool data at once (no lazy loading)
- File: `src/src/pages/tools/index.astro` (456 lines)
- Measurement: Not quantified, but could be issue as tools scale
- Improvement path: Consider virtual scrolling or pagination if tools count grows significantly

## Fragile Areas

**Theme toggle in localStorage:**
- File: `src/src/scripts/theme.ts`
- Why fragile: Direct DOM manipulation and localStorage access (could break if HTML structure changes)
- Common failures: Theme toggle button not working if HTML element IDs change
- Safe modification: Check element selectors when modifying Header component
- Test coverage: Has theme.test.ts (good)

**PyScript runtime isolation:**
- Files: All Python tool pages using `PythonToolLayout.astro`
- Why fragile: PyScript is external dependency, could break or change API
- Common failures: Python tools fail to load if PyScript CDN changes
- Safe modification: Keep PyScript version pinned, test tools after dependency updates
- Test coverage: No automated tests for Python tools (manual testing required)

## Scaling Limits

**Static site hosting:**
- Current capacity: Limited by Cloudflare Pages free tier (100GB bandwidth/month)
- Limit: ~100k page views/month estimated before hitting bandwidth limit
- Symptoms at limit: Site suspended or overage charges
- Scaling path: Upgrade to Cloudflare Pages Pro ($20/mo for 500GB bandwidth)

**No server-side processing:**
- Current capacity: Static build only, no dynamic server features
- Limit: Cannot add server-side features without changing architecture
- Symptoms at limit: Limited to static content and client-side Python tools
- Scaling path: Would need to migrate to serverful framework (Next.js, Astro with SSR)

## Dependencies at Risk

**PyScript:**
- Risk: Emerging technology, API changes possible, browser compatibility issues
- Files: All Python tool pages, `src/public/tools/*/main.py`
- Impact: All 9 Python tools fail to load
- Migration plan: Monitor PyScript releases, test after updates, consider migrating to WebAssembly if needed

**Astro 5.16.6:**
- Risk: Fast-moving framework, potential breaking changes in minor versions
- Impact: Build process could break, components may need updates
- Migration plan: Follow Astro changelog, test upgrades in dev environment

## Missing Critical Features

**No error tracking:**
- Problem: No way to monitor runtime errors or user issues
- Current workaround: Manual user reports (if any)
- Blocks: Can't proactively fix bugs affecting users
- Implementation complexity: Low (add Sentry or similar service)

**No analytics:**
- Problem: No visibility into usage, popular tools, or user behavior
- Current workaround: None (flying blind)
- Blocks: Can't make data-driven decisions about features
- Implementation complexity: Low (add Google Analytics or Plausible)

**No search functionality:**
- Problem: Users can't search across tools or blog posts
- Current workaround: Manual browsing via navigation
- Blocks: Discoverability of content as site grows
- Implementation complexity: Medium (need search index, UI, integration)

## Test Coverage Gaps

**Python tools:**
- What's not tested: All 9 Python tools (expense-ratio, bilt-breakeven, trad-vs-roth, sankey-builder, sequence-risk, roth, safe-withdrawal, savings-rate-fi, monte-carlo)
- Files: `src/public/tools/*/main.py`
- Risk: Calculation errors or bugs in financial tools could affect user decisions
- Priority: High (financial calculations need accuracy)
- Difficulty to test: High (PyScript testing is complex, limited browser automation for Python runtime)

**Astro components:**
- What's not tested: All 16 components in `src/src/components/`
- Risk: UI regressions, broken component interfaces
- Priority: Medium (visual issues usually obvious during development)
- Difficulty to test: Medium (need Vitest + jsdom + Astro testing library)

**Tool pages:**
- What's not tested: All 18 tool pages in `src/src/pages/tools/`
- Risk: Broken tool integrations, metadata issues
- Priority: Low (pages are simple wrappers around tools)
- Difficulty to test: Low (can test metadata exports, rendering)

**Layouts:**
- What's not tested: All layouts in `src/src/layouts/`
- Risk: Theme switching, navigation, footer links could break
- Priority: Medium (affects entire site)
- Difficulty to test: Medium (DOM manipulation, theme state)

---

*Concerns audit: 2025-01-15*
*Update as issues are fixed or new ones discovered*
