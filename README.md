# Retro.SITE

A personal website with a **90s retro web** aesthetic — fashion-forward, playful, and maximalist. Built with Astro, custom CSS, and static generation.

## Features

- **Home & About** - Hero sections with retro window styling
- **Links Page** - Curated corners of the internet, organized by category
- **Blog** - Themed posts with tag support and draft filtering
- **Tools** - Interactive calculators (401k, Elden Ring runes, more coming)
- **Styleguide** - Complete design system reference
- **Theme Toggle** - Switch between "Neon Night" (dark) and "Mall Pastel" (light)
- **Static & Fast** - No backend, no database, deployable anywhere

## Quick Start

### Prerequisites

- Node.js 18+ and npm

### Installation

```bash
# Navigate to the Astro project directory
cd src

# Install dependencies
npm install

# Start development server
npm run dev
```

Visit `http://localhost:4321/` to see the site.

### Build for Production

```bash
cd src
npm run build
npm run preview
```

The built site will be in `src/dist/` and can be deployed to any static host (Netlify, Vercel, GitHub Pages, etc.).

## Project Structure

**Important:** The Astro application is located in `./src` (not at the repository root).

```
/workspaces/www/
├── PRD.md              # Product requirements document
├── AGENTS.md           # Agent instructions (single source of truth)
├── CLAUDE.md           # Symlink to AGENTS.md
├── GEMINI.md           # Symlink to AGENTS.md
├── README.md           # This file (human-friendly documentation)
└── src/                # Astro project root
    ├── astro.config.mjs    # Astro configuration
    ├── package.json        # Dependencies
    ├── src/                # Source code
    │   ├── pages/          # File-based routing
    │   │   ├── index.astro        # Home page
    │   │   ├── about.astro        # About page
    │   │   ├── links.astro        # Links page
    │   │   ├── blog/               # Blog routes
    │   │   │   ├── index.astro           # Blog index
    │   │   │   └── [slug].astro          # Blog post pages
    │   │   ├── tools/              # Tools routes
    │   │   │   ├── index.astro           # Tools index
    │   │   │   ├── 401k-calculator.astro # 401k calculator
    │   │   │   └── rune-calculator.astro # Rune calculator
    │   │   └── styleguide.astro    # Design system reference
    │   ├── components/     # Astro components
    │   │   ├── Window.astro        # Retro panel wrapper
    │   │   ├── RetroButton.astro   # Beveled buttons
    │   │   ├── Badge.astro         # Small inline badges
    │   │   ├── Sticker.astro       # Loud callout labels
    │   │   └── Tag.astro           # Blog post tag links
    │   ├── layouts/        # Layout components
    │   │   └── BaseLayout.astro    # Main layout (head, header, footer)
    │   ├── styles/         # Global CSS
    │   │   └── global.css          # Theme tokens and global styles
    │   ├── content/        # Content collections
    │   │   └── blog/               # Blog posts (collection: "blog")
    │   ├── data/           # Data files
    │   │   └── links.ts            # Links data
    │   └── scripts/        # Client-side scripts
    │       └── theme.ts            # Theme toggle logic
    └── dist/              # Build output (generated)
```

## Development

### Adding a Blog Post

1. Create a new `.md` or `.mdx` file in `src/src/content/blog/`
2. Add frontmatter:

```yaml
---
title: "Your Post Title"
description: "A short description for SEO and previews"
pubDate: 2025-01-06
tags: ["tag1", "tag2", "tag3"]
draft: false
# optional: heroImage: ./image.jpg
---
```

3. Write your markdown content
4. The post will automatically appear in the blog index (if `draft: false`)

**Note:** The blog collection is named `"blog"` (not "posts") - this is intentional for historical reasons.

### Adding a Tool

1. Create a new page in `src/src/pages/tools/` (e.g., `my-tool.astro`)
2. Use the `Window` component for the main interface
3. Use `RetroButton` for actions
4. Add client-side logic in a `<script>` tag for calculations
5. Add your tool to `src/src/pages/tools/index.astro`

Example:

```astro
---
import BaseLayout from '../../layouts/BaseLayout.astro';
import Window from '../../components/Window.astro';
import RetroButton from '../../components/RetroButton.astro';
---

<BaseLayout title="My Tool - ARGUELLES.ME">
	<Window title="My Tool">
		<!-- Your tool interface here -->
	</Window>
</BaseLayout>

<script>
	// Client-side logic here
</script>
```

### Customizing Themes

Theme tokens are defined in `src/src/styles/global.css`. Edit the token values in the `[data-theme="..."]` selectors:

```css
[data-theme="neon-night"] {
  --bg: #0a0e1a;
  --accent: #00ffff;
  /* ... other tokens */
}

[data-theme="mall-pastel"] {
  --bg: #fef6f6;
  --accent: #ffb6d9;
  /* ... other tokens */
}
```

See `docs/THEME.md` for the complete token list and usage guidelines.

### Adding a New Page

1. Create a file in `src/src/pages/` (e.g., `newpage.astro`)
2. Import and use `BaseLayout`:

```astro
---
import BaseLayout from '../layouts/BaseLayout.astro';
---

<BaseLayout title="Page Title - ARGUELLES.ME">
	<div class="prose">
		<h1>Page Title</h1>
		<p>Your content here...</p>
	</div>
</BaseLayout>
```

3. Link to it in `src/src/components/SiteHeader.astro` navigation

## Design System

### Typography

- **Font:** VT323 (Google Fonts)
- **Style:** Large, retro terminal look
- **Usage:** Applied globally via `<link>` tag in `BaseLayout.astro`

### Colors

The site uses CSS custom properties (design tokens) for all colors and styling:

- `--bg` - Main background
- `--bg2` - Secondary background (panels, cards)
- `--panel` - Window component background
- `--text` - Primary text color
- `--muted` - Secondary text color
- `--accent` - Primary accent color
- `--accent2` - Secondary accent color
- `--border` - Border color
- `--shadow` - Drop shadow color
- `--link` - Link color (unvisited)
- `--visited` - Link color (visited)
- `--focus` - Focus ring color
- `--sticker-bg` - Sticker component background
- `--sticker-text` - Sticker component text

### Components

#### Window
Retro panel wrapper with title bar and optional badge:

```astro
<Window title="Title" badgeText="NEW">
  <p>Content here...</p>
</Window>
```

#### RetroButton
Beveled buttons with variants:

```astro
<RetroButton variant="primary">Primary</RetroButton>
<RetroButton variant="secondary">Secondary</RetroButton>
<RetroButton variant="danger">Danger</RetroButton>
```

#### Badge
Small inline badges:

```astro
<Badge text="NEW" />
<Badge text="HOT" />
```

#### Sticker
Loud callout labels:

```astro
<Sticker text="FEATURED" />
<Sticker text="POPULAR" />
```

#### Tag
Blog post tag links:

```astro
<Tag tag="design" />
<Tag tag="retro" />
```

### Accessibility

- **Keyboard Navigation:** All interactive elements are keyboard-accessible
- **Focus States:** Visible focus rings on all interactive elements
- **Reduced Motion:** Respects `prefers-reduced-motion` preference
- **Color Contrast:** WCAG AA compliant in both themes
- **ARIA Labels:** Included where needed for screen readers

See the `/styleguide` page for accessibility demos and testing.

## Deployment

### Netlify

1. Connect your repository to Netlify
2. Set build directory to `src`
3. Set build command to `npm run build`
4. Set publish directory to `src/dist`
5. Deploy!

### Vercel

1. Connect your repository to Vercel
2. Set root directory to `src` (or adjust the build command)
3. Set build command to `npm run build`
4. Set output directory to `dist`
5. Deploy!

### Other Static Hosts

Build the site locally and deploy the `src/dist/` folder to any static hosting service.

## Documentation

- **[AGENTS.md](./AGENTS.md)** - Single source of truth for AI agents working on this codebase
- **[docs/THEME.md](./src/docs/THEME.md)** - Complete theme token reference and styling guidelines
- **[docs/CONTENT.md](./src/docs/CONTENT.md)** - Content structure and writing guidelines
- **[PRD.md](./PRD.md)** - Original product requirements document

## Contributing

This is a personal project, but feel free to fork and customize for your own retro website!

## License

MIT - feel free to use this as a template for your own retro site.

## Acknowledgments

- Inspired by 90s web design and Jean Paul Gaultier's maximalist fashion aesthetic
- Built with [Astro](https://astro.build)
- Font: [VT323](https://fonts.google.com/specimen/VT323) by Peter Vug
