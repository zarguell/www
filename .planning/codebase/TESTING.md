# Testing Patterns

**Analysis Date:** 2025-01-15

## Test Framework

**Runner:**
- Vitest 4.0.16
- Config: `src/vitest.config.ts`

**Assertion Library:**
- Vitest built-in expect
- Matchers: toBe, toEqual, toThrow, toMatchObject

**Run Commands:**
```bash
npm test                              # Run all tests (watch mode)
npm run test:run                      # Single run
npm run test:coverage                 # Coverage report
```

## Test File Organization

**Location:**
- Co-located with source files in `__tests__/` directories
- Pattern: `src/src/{module}/__tests__/{module}.test.ts`

**Naming:**
- module-name.test.ts for all tests
- No distinction between unit/integration in filename

**Structure:**
```
src/src/
  data/
    __tests__/
      links.test.ts
  scripts/
    __tests__/
      theme.test.ts
  pages/tools/
    __tests__/
      (no tests yet - test harnesses planned)
```

## Test Structure

**Suite Organization:**
```typescript
import { describe, it, expect, beforeEach } from 'vitest';

describe('module name', () => {
  beforeEach(() => {
    // setup if needed
  });

  it('should handle valid input', () => {
    // arrange
    const input = createTestData();

    // act
    const result = functionUnderTest(input);

    // assert
    expect(result).toEqual(expectedOutput);
  });
});
```

**Patterns:**
- Use beforeEach for shared setup
- Explicit arrange/act/assert not strictly required but observed in tests
- One assertion focus per test

## Mocking

**Framework:**
- Vitest built-in mocking (vi)
- jsdom for DOM environment

**Patterns:**
```typescript
// Example from theme.test.ts (hypothetical)
vi.mock('./local-storage', () => ({
  getItem: vi.fn(),
  setItem: vi.fn()
}));
```

**What to Mock:**
- Browser localStorage (tested via jsdom)
- Window/document APIs

**What NOT to Mock:**
- Pure functions and utilities
- Internal business logic

## Fixtures and Factories

**Test Data:**
```typescript
// Inline test data (observed pattern)
const mockLink = {
  title: 'Test Link',
  url: 'https://example.com',
  description: 'Test description'
};
```

**Location:**
- Inline in test files (no separate fixtures/ directory)
- Factory functions when data is complex

## Coverage

**Requirements:**
- No enforced coverage target
- Coverage tracked for awareness only
- Current coverage: Limited (2 test files only)

**Configuration:**
- Vitest coverage via c8 (@vitest/coverage-v8)
- Exclusions: Configured in vitest.config.ts

**View Coverage:**
```bash
npm run test:coverage
open coverage/index.html
```

## Test Types

**Unit Tests:**
- Test single function or module in isolation
- Mock external dependencies (localStorage, browser APIs)
- Examples: `theme.test.ts`, `links.test.ts`

**Integration Tests:**
- Not currently implemented (planned for tools)

**E2E Tests:**
- Not implemented (no E2E framework configured)

## Common Patterns

**Async Testing:**
```typescript
it('should handle async operation', async () => {
  const result = await asyncFunction();
  expect(result).toBe('expected');
});
```

**Error Testing:**
```typescript
it('should throw on invalid input', () => {
  expect(() => parse(null)).toThrow('Invalid input');
});
```

**DOM Testing:**
```typescript
// Example pattern for testing theme toggle
it('should toggle theme in localStorage', () => {
  const mockSetItem = vi.spyOn(Storage.prototype, 'setItem');
  toggleTheme();
  expect(mockSetItem).toHaveBeenCalledWith('theme', 'mall-pastel');
});
```

---

*Testing analysis: 2025-01-15*
*Update when test patterns change*
