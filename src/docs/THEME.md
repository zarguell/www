# THEME.md

Complete theme token reference and styling guidelines for Retro.SITE.

## Theme Tokens

All colors and values in Retro.SITE use CSS custom properties (design tokens). This makes the entire site themeable and consistent.

### Base Colors

| Token | Neon Night (Dark) | Mall Pastel (Light) | Usage |
|-------|-------------------|---------------------|-------|
| `--bg` | `#0a0e1a` | `#fef6f6` | Main page background |
| `--bg2` | `#1a1f2e` | `#f0e6e6` | Secondary background (cards, inputs) |
| `--panel` | `#252b3d` | `#ffffff` | Window component background |
| `--text` | `#e0e6ed` | `#2d2d2d` | Primary text color |
| `--muted` | `#9ca3af` | `#666666` | Secondary text, descriptions |

### Accent Colors

| Token | Neon Night (Dark) | Mall Pastel (Light) | Usage |
|-------|-------------------|---------------------|-------|
| `--accent` | `#00ffff` | `#ffb6d9` | Primary accent (buttons, links, highlights) |
| `--accent2` | `#ff00ff` | `#b6f9d8` | Secondary accent (gradients, decorations) |

### UI Colors

| Token | Neon Night (Dark) | Mall Pastel (Light) | Usage |
|-------|-------------------|---------------------|-------|
| `--border` | `#3d4457` | `#d4c4c4` | Borders, dividers |
| `--shadow` | `#000000` | `#00000040` | Drop shadows (always semi-transparent) |

### Interactive Colors

| Token | Neon Night (Dark) | Mall Pastel (Light) | Usage |
|-------|-------------------|---------------------|-------|
| `--link` | `#00d4ff` | `#e945a4` | Unvisited links |
| `--visited` | `#d400ff` | `#a045e9` | Visited links |
| `--focus` | `#00ffff` | `#e945a4` | Focus rings (accessibility) |

### Component Colors

| Token | Neon Night (Dark) | Mall Pastel (Light) | Usage |
|-------|-------------------|---------------------|-------|
| `--sticker-bg` | `#ff00ff` | `#e945a4` | Sticker component background |
| `--sticker-text` | `#ffffff` | `#ffffff` | Sticker component text |

## Usage Guidelines

### When to Use Each Theme

**Neon Night (Dark Theme)**
- Default theme (used when no preference set)
- Best for: evening browsing, developers, cyberpunk aesthetic
- Inspired by: 90s cyberpunk, neon lights, midnight computing

**Mall Pastel (Light Theme)**
- Alternative theme (toggle via header button)
- Best for: daytime browsing, fashion/content sites, readability
- Inspired by: 90s mall fashion, pop culture, playful aesthetics

### Theme Switching Behavior

The theme toggle follows this priority:
1. **User's explicit choice** (saved in localStorage)
2. **System preference** (`prefers-color-scheme`)
3. **Default** (neon-night)

Implementation: See `src/src/scripts/theme.ts`

## Styling Rules for New Components

### 1. Always Use Tokens

Never hardcode colors. Always use design tokens:

```css
/* ❌ BAD */
.my-component {
  background: #0a0e1a;
  color: #e0e6ed;
  border: 2px solid #3d4457;
}

/* ✅ GOOD */
.my-component {
  background: var(--bg);
  color: var(--text);
  border: 2px solid var(--border);
}
```

### 2. Follow the Token Hierarchy

- Use `--bg` for main backgrounds
- Use `--bg2` for secondary backgrounds (nested cards, inputs)
- Use `--panel` for Window-like components
- Use `--text` for primary text
- Use `--muted` for secondary text and descriptions
- Use `--accent` for primary actions and highlights
- Use `--border` for all borders and dividers

### 3. Maintain Contrast

All text must meet WCAG AA standards (4.5:1 for normal text, 3:1 for large text).

- Body text on `--bg` is always compliant
- Headings on any background are compliant
- Links (`--link`) on `--bg` are compliant

### 4. Beveled Effects

The retro aesthetic uses beveled panels with drop shadows:

```css
.retro-panel {
  background: var(--panel);
  border: 3px solid var(--border);
  box-shadow: 4px 4px 0 var(--shadow);
  border-radius: 4px;
}
```

For a "pressed" state:

```css
.retro-panel:active {
  box-shadow: 2px 2px 0 var(--shadow);
  transform: translate(2px, 2px);
}
```

### 5. Focus States (Accessibility)

All interactive elements must have visible focus states:

```css
button:focus,
a:focus,
input:focus {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}
```

The `--focus` token is high-contrast in both themes (cyan in neon-night, pink in mall-pastel).

### 6. Responsive Typography

Use the VT323 font and maintain legibility:

```css
/* Headings */
h1 {
  font-size: 3rem;
  line-height: 1.2;
}

h2 {
  font-size: 2rem;
  line-height: 1.3;
}

/* Body */
body {
  font-family: 'VT323', monospace;
  font-size: 1.3rem;
  line-height: 1.6;
}

/* Mobile */
@media (max-width: 768px) {
  h1 {
    font-size: 2.5rem;
  }
}
```

## CSS Effect Recipes

### Beveled Button

```css
.retro-button {
  background: var(--bg2);
  border: 3px solid var(--border);
  box-shadow: 4px 4px 0 var(--shadow);
  color: var(--text);
  padding: 0.75rem 1.5rem;
  font-family: 'VT323', monospace;
  font-size: 1.2rem;
  cursor: pointer;
  transition: all 0.1s ease;
}

.retro-button:hover {
  background: var(--panel);
  border-color: var(--accent);
  color: var(--accent);
}

.retro-button:active {
  box-shadow: 2px 2px 0 var(--shadow);
  transform: translate(2px, 2px);
}
```

### Sticker Label

```css
.sticker {
  background: var(--sticker-bg);
  color: var(--sticker-text);
  padding: 0.5rem 1rem;
  font-size: 1rem;
  font-weight: bold;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  transform: rotate(-3deg);
  border: 2px solid var(--border);
  box-shadow: 2px 2px 0 var(--shadow);
  display: inline-block;
}
```

### Gradient Background

```css
.gradient-bg {
  background: linear-gradient(135deg, var(--accent), var(--accent2));
}
```

### Blink Animation (Respects Reduced Motion)

```css
@keyframes blink {
  0%, 50% { opacity: 1; }
  51%, 100% { opacity: 0; }
}

.blink {
  animation: blink 1s infinite;
}

@media (prefers-reduced-motion: reduce) {
  .blink {
    animation: none;
  }
}
```

## Theme Testing

When modifying themes, always test:

1. **Both themes** - Toggle between neon-night and mall-pastel
2. **All components** - Windows, buttons, badges, stickers, tags
3. **All states** - Default, hover, active, focus, disabled
4. **Accessibility** - Keyboard navigation, focus rings, screen readers
5. **Responsive** - Mobile, tablet, desktop breakpoints
6. **Reduced motion** - Verify animations disable when preference set

## Adding a New Theme

1. Define tokens in `src/src/styles/global.css`:

```css
[data-theme="my-theme"] {
  --bg: #...;
  --bg2: #...;
  /* ... all tokens */
}
```

2. Add theme option in `src/src/components/SiteHeader.astro` theme toggle
3. Update `src/src/scripts/theme.ts` to include new theme name
4. Update this documentation
5. Test in both light and dark system preferences

## Common Mistakes

### ❌ Hardcoding Colors

```css
/* Don't do this */
.button {
  background: #00ffff;
}
```

### ✅ Using Tokens

```css
/* Do this */
.button {
  background: var(--accent);
}
```

### ❌ Forgetting Dark Mode

```css
/* Don't do this */
.shadow {
  box-shadow: 0 4px 6px #000;
}
```

### ✅ Using Semi-Transparent Shadow

```css
/* Do this */
.shadow {
  box-shadow: 4px 4px 0 var(--shadow);
}
/* Note: --shadow is semi-transparent in both themes */
```

### ❌ Ignoring Reduced Motion

```css
/* Don't do this */
.element {
  animation: spin 2s infinite linear;
}
```

### ✅ Respecting Reduced Motion

```css
/* Do this */
@media (prefers-reduced-motion: no-preference) {
  .element {
    animation: spin 2s infinite linear;
  }
}
```

## Resources

- [Theme Token Reference](/styleguide) - Interactive demo of all tokens
- [Component Demos](/styleguide#components) - See all components in action
- [Accessibility Guide](/styleguide#accessibility) - Focus states and keyboard nav
