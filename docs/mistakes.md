# Mistakes & Lessons Learned

This document tracks mistakes encountered during development and their solutions. Keep entries slim and actionable.

## [2025-01-06] PyScript Integration - Roth Calculator

**Issue**: Chart accumulation, auto-run on load, timing errors with addEventListener, mobile overflow, need zoom functionality

**Solution**: Use `py-click` attribute, clear chart container, remove auto-run call, proper responsive chart sizing, add click-to-zoom functionality

**Agent**: Claude (Sonnet 4.5)

**Key Lessons**:
- Use `py-click="function_name"` (no parentheses) - `py-click="function()"` fails
- Always `chart_element.innerHTML = ""` before displaying new chart (prevents accumulation)
- Remove function call at bottom of `.py` file if you want user input first
- **For responsive charts**:
  - Set `plt.rcParams['figure.figsize'] = [10, 6]` and `plt.rcParams['figure.autolayout'] = True` at module level
  - Use `fig, ax = plt.subplots(dpi=200)` for high-DPI zoom functionality
  - PyScript renders matplotlib as `<img>` tag, not canvas or figure
  - CSS must target `#chart img` with `max-width: 100% !important; height: auto !important; display: block !important`
  - Add `overflow-x: hidden` on chart container to prevent mobile overflow
  - Viewport meta tag must include `initial-scale=1.0` for proper mobile scaling
- **For click-to-zoom fullscreen**:
  - Export matplotlib to base64 PNG: `fig.savefig(buf, format='png', dpi=200, bbox_inches='tight')`
  - Use CSS checkbox hack for fullscreen modal (no JS modal logic needed)
  - For dynamic PyScript content, use MutationObserver to wrap image when generated
  - Pattern: `<div class="click-zoom"><input type="checkbox"><label><img></label></div>`
  - CSS: `input:checked + label` becomes fullscreen fixed overlay

## [2025-01-06] Initial Development - Build Success

**Issue**: None encountered during phases 1-10

**Solution**: N/A

**Agent**: Claude (Sonnet 4.5)

**Note**: First build test will happen in Phase 11. No issues found in implementation so far.

## [2025-01-11] CI Test Failures

**Issue**: Tests expected hardcoded category names (Code, Writing, Other) that didn't match actual data structure (Social, Projects). Also required minimum 10 links but only had 7.

**Solution**: Fixed tests to match actual data structure and reduced minimum link count to 5.

**Agent**: Claude (Sonnet 4.5)

**Key Lessons**:
- Tests should validate structure and quality, not enforce arbitrary schema
- Avoid hardcoding expected values that may change over time
- Keep tests flexible to accommodate organic data growth

## [2026-09-04] Production Build Failure - Unterminated Inline Style

**Issue**: A scripted sweep removed `color: var(--accent)` from inline heading styles across tool pages, but dropped the closing quote of the `style` attribute on four `<h3>` tags. The unterminated attribute swallowed past the tag boundary, so Astro reported "Expected corresponding JSX closing tag for 'h3'" and the Cloudflare build failed — even though the local build had reported success.

**Solution**: Restored the closing quotes (`style="text-align: center; margin-bottom: 1rem;">`), grep-verified no other `;>` instances existed, rebuilt from clean output (`rm -rf dist node_modules/.vite`), and confirmed both affected pages emitted `dist/<route>/index.html` before pushing.

**Agent**: ZCode

**Key Lessons**:
- Diff-review the output of bulk regex/script edits before building — the broken markup was invisible in the build log
- A green exit code is not proof the site built: wipe `dist` and `node_modules/.vite`, rebuild, and confirm `dist/<route>/index.html` exists for every touched page
- Permanent guideline lives in AGENTS.md → "Build Verification (before pushing)"
