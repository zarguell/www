# TESTING.md

Testing guide and documentation for Retro.SITE.

## Test Infrastructure

This project uses **Vitest** as the testing framework. Vitest was chosen because:

- Native TypeScript support
- Fast execution with Vite
- Compatible with Astro projects
- Excellent watch mode and UI
- Built-in coverage support

## Test Structure

```
src/
├── src/
│   ├── scripts/
│   │   └── __tests__/
│   │       └── theme.test.ts       # Theme utility tests
│   └── data/
│       └── __tests__/
│           └── links.test.ts       # Data validation tests
├── vitest.config.ts                # Vitest configuration
└── package.json                    # Test scripts
```

## Running Tests

### Run All Tests (Watch Mode)

```bash
cd src
npm test
```

This runs tests in watch mode and re-runs them when files change.

### Run Tests Once

```bash
cd src
npm run test:run
```

Runs tests once and exits with appropriate exit code.

### Run Tests with UI

```bash
cd src
npm run test:ui
```

Opens a browser-based UI for viewing and debugging tests.

### Generate Coverage Report

```bash
cd src
npm run test:coverage
```

Generates a coverage report in terminal and HTML format in `src/coverage/`.

## Test Categories

### 1. Unit Tests

Unit tests cover individual functions and utilities in isolation.

**Example: Theme Utilities**

```typescript
import { describe, it, expect } from 'vitest';
import { getNextTheme } from '../theme';

describe('getNextTheme', () => {
  it('should return mall-pastel after neon-night', () => {
    const result = getNextTheme('neon-night');
    expect(result).toBe('mall-pastel');
  });
});
```

### 2. Data Validation Tests

Data validation tests ensure data structures match expected schemas and contain valid content.

**Example: Links Data**

```typescript
describe('Links Data Validation', () => {
  it('should have valid URLs', () => {
    linksData.forEach((category) => {
      category.links.forEach((link) => {
        expect(link.url).toMatch(/^https?:\/\//);
      });
    });
  });
});
```

### 3. Integration Tests (Future)

Integration tests verify that multiple components work together correctly.

*Note: Integration tests will be added as the application grows.*

## Writing Tests

### Test File Naming

- Test files should be named: `*.test.ts` or `*.spec.ts`
- Place test files in `__tests__` directories next to the code they test
- Or co-locate them with the code: `theme.ts` → `theme.test.ts`

### Test Structure

Use the `describe` / `it` pattern:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';

describe('Feature Name', () => {
  beforeEach(() => {
    // Setup before each test
  });

  it('should do something specific', () => {
    // Arrange
    const input = 'test';

    // Act
    const result = processInput(input);

    // Assert
    expect(result).toBe('expected output');
  });
});
```

### Common Assertions

```typescript
// Equality
expect(value).toBe(expected);
expect(value).toEqual(expected);

// Truthiness
expect(value).toBeTruthy();
expect(value).toBeFalsy();

// Numbers
expect(value).toBeGreaterThan(5);
expect(value).toBeLessThanOrEqual(10);

// Strings
expect(value).toMatch(/regex/);
expect(value).toContain('substring');

// Arrays
expect(array).toHaveLength(3);
expect(array).toContain(item);

// Objects
expect(object).toHaveProperty('key');
expect(object).toMatchObject({ key: 'value' });
```

### Mocking

Use Vitest's built-in mocking functions:

```typescript
import { vi, beforeEach, afterEach } from 'vitest';

describe('with mocks', () => {
  beforeEach(() => {
    vi.spyOn(localStorage, 'getItem').mockReturnValue('value');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should use mocked function', () => {
    // Test code that uses localStorage.getItem
  });
});
```

## Coverage Goals

Aim for:

- **80%+ coverage** for utility functions
- **100% coverage** for critical paths (theme toggle, data validation)
- **60%+ coverage** for components (when component tests are added)

Check coverage with:

```bash
cd src
npm run test:coverage
```

View HTML coverage report:

```bash
cd src
open coverage/index.html  # macOS
xdg-open coverage/index.html  # Linux
start coverage/index.html  # Windows
```

## CI/CD Pipeline

The project uses GitHub Actions for continuous integration:

### Workflow: `.github/workflows/ci.yml`

**Jobs:**

1. **test** - Runs all tests and uploads coverage reports
2. **build** - Builds the site and checks build size
3. **lint** - Runs TypeScript checks and linting

**Triggers:**

- Push to `main` branch
- Pull requests to `main` branch

### Viewing CI Results

1. Go to the **Actions** tab in your GitHub repository
2. Click on the latest workflow run
3. View logs for each job
4. Download artifacts (coverage reports, build output)

## Testing Best Practices

### DO

- **Write tests before or during development** (test-driven development)
- **Test edge cases** (null, undefined, empty strings, boundaries)
- **Mock external dependencies** (localStorage, window, fetch)
- **Keep tests independent** (each test should work in isolation)
- **Use descriptive test names** (`should return error for invalid input`)
- **Arrange-Act-Assert** pattern in test bodies
- **Clean up mocks** in `afterEach` hooks

### DON'T

- Don't test implementation details (test behavior, not code)
- Don't write tests that are too broad (test one thing per test)
- Don't ignore failing tests
- Don't commit commented-out tests
- Don't hardcode values that should be calculated
- Don't rely on test order (each test should be independent)

## Debugging Tests

### Run Tests in Debug Mode

```bash
cd src
npm test -- --reporter=verbose
```

### Run Specific Test File

```bash
cd src
npm test -- theme.test
```

### Run Specific Test

```bash
cd src
npm test -- -t "should return mall-pastel after neon-night"
```

### Use Browser DevTools

```bash
cd src
npm run test:ui
```

The Vitest UI provides:
- Test visualization
- Time travel debugging
- Console output inspection
- File filtering

## Common Test Scenarios

### Testing Theme Toggle

```typescript
it('should toggle theme and save to localStorage', () => {
  document.documentElement.setAttribute('data-theme', 'neon-night');
  toggleTheme();
  expect(document.documentElement.getAttribute('data-theme')).toBe('mall-pastel');
  expect(localStorage.getItem('theme')).toBe('mall-pastel');
});
```

### Testing Data Validation

```typescript
it('should validate all URLs are HTTPS', () => {
  linksData.forEach((category) => {
    category.links.forEach((link) => {
      expect(link.url).toMatch(/^https:\/\//);
    });
  });
});
```

### Testing Error Handling

```typescript
it('should throw error for invalid input', () => {
  expect(() => parseInvalidInput('bad')).toThrow();
});
```

## Troubleshooting

### Tests Fail in CI But Pass Locally

- Check Node.js version matches (CI uses Node 20)
- Ensure all dependencies are committed (`package-lock.json`)
- Check for environment-specific code (localStorage, window)

### Coverage is Lower Than Expected

- Make sure test files are included in `vitest.config.ts`
- Check that `exclude` patterns aren't too broad
- Run `npm run test:coverage` and review the HTML report

### Tests are Slow

- Use `vi.mock()` instead of real implementations
- Reduce setup/teardown in hooks
- Run specific test files instead of all tests

## Resources

- [Vitest Documentation](https://vitest.dev/)
- [Vitest Configuration](https://vitest.dev/config/)
- [Testing Best Practices](https://vitest.dev/guide/why.html)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)

## Future Testing Plans

As the project grows, consider adding:

- **Component Tests** - Test Astro components with @astrojs/testing
- **E2E Tests** - Test full user flows with Playwright or Cypress
- **Visual Regression Tests** - Catch UI changes with Percy or Chromatic
- **Performance Tests** - Monitor bundle size and load times
- **A11y Tests** - Automated accessibility testing with axe-core

## Test Checklist

Before committing code, ensure:

- [ ] All tests pass locally (`npm run test:run`)
- [ ] New tests cover the changed code
- [ ] Coverage hasn't significantly decreased
- [ ] No `console.log` in production code
- [ ] TypeScript types are valid
- [ ] Tests are descriptive and well-organized
- [ ] Edge cases are covered
- [ ] External dependencies are mocked
