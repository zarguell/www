# CONTENT.md

Content structure, writing guidelines, and conventions for Retro.SITE.

## Blog Post Schema

All blog posts are stored in `src/src/content/blog/` as Markdown (`.md`) or MDX (`.mdx`) files.

### Required Frontmatter Fields

```yaml
---
title: "Your Post Title"
description: "A short description for SEO and previews"
pubDate: 2025-01-06
tags: ["tag1", "tag2", "tag3"]
draft: false
---
```

**Field Descriptions:**

- `title` (string, required) - The post title. Displayed on the blog index and post page.
- `description` (string, required) - Short description (1-2 sentences) for SEO, social sharing, and post previews.
- `pubDate` (Date, required) - Publication date in ISO format (YYYY-MM-DD). Determines sort order.
- `tags` (string[], required) - Array of tag keywords for categorization. Displayed as clickable links.
- `draft` (boolean, required) - If `true`, post is excluded from production builds. Default: `false`.

### Optional Frontmatter Fields

```yaml
---
heroImage: ./image.jpg
---
```

- `heroImage` (string, optional) - Relative path to hero image for the post. For future use.

## Writing Voice and Style

### General Guidelines

The Retro.SITE writing voice is:

- **Fashion-forward** - Confident, trend-aware, slightly opinionated
- **Playful** - Not afraid of humor, personality, or exaggeration
- **Maximalist** - Enthusiastic, colorful, expressive
- **Retro-appreciating** - Nostalgic but not cheesy

### Tone Examples

**✅ Good Tone:**

> "The neon-drenched cyberpunk aesthetic of the 90s didn't just influence movies—it shaped a generation of web designers who believed the internet should be loud, proud, and unapologetically maximal."

**❌ Bad Tone:**

> "In the 1990s, many websites used bright colors. This was popular in cyberpunk media."

The first example has personality, voice, and style. The second is dry and encyclopedic.

### Writing Tips

1. **Be Specific** - Don't say "interesting design," say "beveled panels with drop shadows and neon gradients."
2. **Use Strong Verbs** - "Shaped" instead of "was shaped by," "screamed" instead of "was very loud."
3. **Include Personal Voice** - "I love this aesthetic" is better than "This aesthetic is popular."
4. **Embrace Exaggeration** - "Screams retro fashion" is better than "has retro elements."
5. **Avoid Corporate Speak** - Say "cool stuff" not "innovative solutions."

### Formatting Guidelines

- **Headings:** Use `##` for section headings (never `#` - that's the post title)
- **Paragraphs:** Keep paragraphs short (2-4 sentences) for readability
- **Lists:** Use bullet points for items, numbered lists for steps
- **Links:** Use descriptive link text, not "click here"
- **Images:** Add images in future using `![Alt text](./image.jpg)`
- **Code:** Use backticks for `inline code`, triple backticks for code blocks

### Example Post Structure

```markdown
---
title: "Why 90s Web Design is Making a Comeback"
description: "From brutalism to maximalism, the retro web aesthetic is back and bolder than ever."
pubDate: 2025-01-06
tags: ["design", "retro", "web", "90s"]
draft: false
---

Introduction paragraph that hooks the reader. Make it punchy and opinionated.

## Section Header

Supporting paragraphs with specific examples and vivid descriptions.

- Key point one
- Key point two
- Key point three

## Another Section

Continue with more content. Keep sections focused and scannable.

Conclusion paragraph that ties it all together with personality.
```

## Tag Conventions

Tags are used to categorize posts and should be:

- **Lowercase** - `design` not `Design`
- **Simple** - `retro` not `retro-aesthetic`
- **Consistent** - Use the same tags for related posts

### Recommended Tag Categories

**Design & Aesthetics:**
- `design` - General design topics
- `retro` - Retro/vintage aesthetics
- `90s` - 1990s specific content
- `minimal` - Minimalism (as counterpoint)
- `maximal` - Maximalism

**Tech & Web:**
- `web` - Web design/development
- `astro` - Astro framework specific
- `css` - CSS styling
- `frontend` - Frontend development

**Fashion & Culture:**
- `fashion` - Fashion topics
- `culture` - Pop culture
- `cyberpunk` - Cyberpunk aesthetic
- `anime` - Anime/manga influence

**Project-Specific:**
- `update` - Site updates
- `meta` - Meta-commentary about the site
- `experiment` - Design experiments

## Tool Page Conventions

Tool pages (`/tools/*`) have specific conventions:

### 1. Use Window Components

All tools should use the `Window` component for the main interface:

```astro
<Window title="Tool Name" badgeText="ACTIVE">
  <!-- Tool content here -->
</Window>
```

### 2. Use RetroButton for Actions

All primary actions should use `RetroButton`:

```astro
<RetroButton type="submit" variant="primary">
  Calculate
</RetroButton>
```

### 3. Display Results in Windows

Show calculation results in a separate `Window` component:

```astro
<div id="results" style="display: none;">
  <Window title="Results" badgeText="CALCULATED">
    <!-- Results here -->
  </Window>
</div>
```

### 4. Client-Side Logic

Use `<script>` tags for interactivity:

```astro
<script>
  function calculate(e: Event) {
    e.preventDefault();
    // Calculation logic here
  }

  document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('calculator-form');
    form?.addEventListener('submit', calculate);
  });
</script>
```

### 5. Form Conventions

- Use semantic HTML forms
- Include proper labels for all inputs
- Add `required` attribute for mandatory fields
- Use `type="number"` with `min`/`max`/`step` for numeric inputs
- Provide sensible default values via `value` attribute

### 6. Result Conventions

- Display large results prominently (larger font, accent color)
- Show intermediate values for transparency
- Include labels for all values
- Format numbers with commas (e.g., `1,234,567`)
- Include currency symbols for financial tools (`$`)

## Content Organization

### Directory Structure

```
src/src/content/
└── blog/
    ├── post-1.md
    ├── post-2.md
    └── post-3.md
```

### File Naming

- Use **kebab-case** - `my-post-title.md` not `MyPostTitle.md`
- Be **descriptive** - `90s-web-design-trends.md` not `post1.md`
- Keep it **short** - Focus on key topics
- Avoid **dates** - Don't prefix with dates like `2025-01-06-post.md`

### Content Collection Config

The blog collection is configured in `src/src/content.config.ts`:

```typescript
const blog = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    description: z.string(),
    pubDate: z.coerce.date(),
    tags: z.array(z.string()),
    draft: z.boolean().default(false),
    heroImage: z.string().optional(),
  }),
});
```

## Writing Checklist

Before publishing a post, ensure:

- [ ] All required frontmatter fields are present
- [ ] Title is catchy and descriptive
- [ ] Description is 1-2 sentences and SEO-friendly
- [ ] Publication date is set correctly
- [ ] Tags are lowercase and consistent
- [ ] `draft` is set to `false` for publishing
- [ ] Content matches the playful, maximalist voice
- [ ] Paragraphs are short and scannable
- [ ] Headings use `##` (not `#`)
- [ ] Links use descriptive text
- [ ] Code examples are properly formatted
- [ ] Post has been previewed locally

## Content Examples

See the existing blog posts in `src/src/content/blog/` for examples:

- `digital-maximalism.md` - Design philosophy
- `vt323-the-ultimate-retro-font.md` - Font appreciation
- `neon-nights-and-mall-pastels.md` - Theme explanation
- `links-ive-loved.md` - Curation
- `hello-world.md` - Introductory post

## Future Content Ideas

Potential blog post topics that fit the aesthetic:

- **Design Tutorials:** How to create beveled buttons, retro shadows, etc.
- **Designer Spotlights:** Features of 90s designers who shaped the web
- **Aesthetic Deep Dives:** Brutalism, maximalism, cyberpunk in web design
- **Technical Posts:** Astro, CSS, static site generation
- **Retro Tech Reviews:** Vintage software, hardware, websites
- **Fashion Analysis:** How 90s fashion influenced digital design
- **Site Updates:** New features, tools, or themes added to the site

Remember: Keep it playful, opinionated, and on-brand!
