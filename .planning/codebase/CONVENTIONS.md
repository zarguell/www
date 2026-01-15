# Coding Conventions

**Analysis Date:** 2025-01-15

## Naming Patterns

**Files:**
- PascalCase.astro for Astro components and layouts: `Window.astro`, `BaseLayout.astro`
- kebab-case.astro for pages: `about.astro`, `401k-calculator.astro`
- kebab-case.ts for TypeScript modules: `theme.ts`, `links.ts`
- kebab-case.test.ts for test files: `theme.test.ts`, `links.test.ts`
- UPPERCASE.md for important docs: `README.md`, `CLAUDE.md`, `AGENTS.md`

**Functions:**
- camelCase for all functions
- No special prefix for async functions
- handleEventName for event handlers: `toggleTheme`, `handleSubmit`

**Variables:**
- camelCase for variables
- UPPER_SNAKE_CASE for constants (when used)
- No underscore prefix for private members

**Types:**
- PascalCase for interfaces and type aliases (inferred from Astro usage)
- No "I" prefix on interfaces

## Code Style

**Formatting:**
- No Prettier config detected (.prettierrc not present)
- No ESLint config detected (eslint.config.js not present)
- Astro default formatting assumed
- 2 space indentation (from tsconfig.json defaults)

**Linting:**
- No ESLint configuration detected
- TypeScript strict mode enabled in `src/tsconfig.json`
- Type checking via Astro build process

## Import Organization

**Order:**
1. External packages (Astro imports, dependencies)
2. Internal modules (@/ aliases if used)
3. Relative imports (./, ../)
4. Type imports (import type {})

**Grouping:**
- Blank lines between groups observed in some files
- No strict alphabetical enforcement

**Path Aliases:**
- No explicit path aliases detected (imports use relative paths)

## Error Handling

**Patterns:**
- Minimal error handling in static site code
- Python tools have try/catch blocks (e.g., `public/tools/expense-ratio/main.py`, `public/tools/sankey-builder/main.py`)
- Astro handles build-time errors

**Error Types:**
- No custom error classes detected
- Build errors surface through Astro CLI

## Logging

**Framework:**
- No structured logging framework
- Browser console for client-side debugging
- Build output for server-side issues

**Patterns:**
- console.log allowed during development
- No production logging service

## Comments

**When to Comment:**
- Explain complex business logic in Python tools
- Document component props via interfaces
- Minimal comments in .astro files (HTML is self-documenting)

**JSDoc/TSDoc:**
- Not required for Astro components
- Optional for complex TypeScript functions

**TODO Comments:**
- TODO, FIXME, HACK comments searched during codebase mapping
- No specific tracking format detected

## Function Design

**Size:**
- Keep functions under 50 lines where possible
- Extract helpers for complex logic (observed in theme.ts)

**Parameters:**
- Destructure objects in parameter list (observed in components)
- Use props interface for Astro components

**Return Values:**
- Explicit returns preferred
- Early returns for guard clauses (observed in theme.ts)

## Module Design

**Exports:**
- Named exports for data files (tools.ts, links.ts)
- Default exports for Astro components
- No barrel files (index.ts) detected

**Barrel Files:**
- Not used (no index.ts re-exports)

---

*Convention analysis: 2025-01-15*
*Update when patterns change*
