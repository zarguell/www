# Enhanced Links System Design

**Date:** 2026-01-12
**Status:** Approved
**Author:** Designed with Claude

## Overview

Add a "cool finds" section to the links page with dynamic sizing and search/filter capabilities. The page will have two distinct sections: existing big links (unchanged) and a new compact link dump with client-side filtering.

## Goals

- Keep existing big links as-is (category-based Windows with RetroButtons)
- Add smaller "cool finds" section with compact cards
- Support search by title, description, domain
- Support filtering by tags (free-form, chips show all available)
- Sticky header for search/filter controls
- Auto-extract domain from URLs for display

## Data Structure

### New Interface (in `src/data/links.ts`)

```typescript
export interface CoolFind {
  title: string;
  url: string;
  description: string;
  date: string; // ISO date string, e.g., "2025-01-15"
  tags: string[];
  domain: string; // Computed, not stored in data
}

export const coolFindsData: CoolFind[] = [
  // Example entries
  {
    title: "Financial Tracking Sheet",
    url: "https://docs.google.com/spreadsheets/d/...",
    description: "Personal finance tracker I use for monthly budgeting and expense categorization.",
    date: "2025-01-10",
    tags: ["finance", "tools", "google-sheets"],
    domain: "docs.google.com", // auto-extracted
  },
  // ...
];
```

### Helper Function

```typescript
export function extractDomain(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch {
    return "unknown";
  }
}
```

### Existing Interfaces (unchanged)

```typescript
export interface Link {
  title: string;
  url: string;
  description: string;
}

export interface LinkCategory {
  name: string;
  links: Link[];
}

export const linksData: LinkCategory[] = [...]; // No changes
```

## Page Layout

### Section 1: Big Links (existing)
- Renders `linksData` in existing `.links-grid` with Windows
- No changes to visual presentation or behavior
- Scrolls away normally

### Section 2: Cool Finds (new)
- Container with sticky header (search bar + tag chips)
- Below header: compact link cards in dense grid
- Each card shows:
  - Title (linked, smaller than big links)
  - Domain badge (small, muted, pill-shaped)
  - Description (1-2 lines)
  - Date and tags (inline, small text)

## Components

### New: `CoolFindCard.astro`

**Props:**
- `title: string`
- `url: string`
- `description: string`
- `date: string`
- `tags: string[]`
- `domain: string`

**Features:**
- Compact card with flat border (not beveled Window)
- Smaller typography than big links
- No client-side JS
- Responsive design

### Updated: `links.astro`

**Changes:**
- Keep existing big links section
- Add new cool finds section with:
  - Sticky header (search input + tag container)
  - Grid container for cards
  - "No results" message (hidden by default)
- Import `CoolFindCard` and `coolFindsData`
- Add client-side `<script>` for filtering

## Search & Filtering Behavior

### Client-Side JavaScript

**Search bar:**
- Filters by title, description, and domain (case-insensitive)
- Updates results as you type (no submit button)
- Empty search shows all cool finds

**Tag chips:**
- Display all unique tags from dataset (computed on load)
- Click to filter to that tag
- Click again to toggle off
- Combines with search text (AND logic)

**URL state (optional):**
- Sync to URL params: `?q=finance&tag=tools`
- Allows sharing filtered views
- Browser back/forward works

**No results state:**
- Shows friendly message
- Suggests "Try different keywords or clear filters"

### Filter Logic

```
Show item IF:
  (searchText matches title OR description OR domain)
  AND
  (no tag selected OR item.tags includes selectedTag)
```

## Visual Design

### Cool Finds Cards

- **Typography:** Title ~1.2rem (vs ~1.5rem for big links)
- **Border:** Simple flat border (not beveled Window)
- **Domain badge:** Small, pill-shaped, `var(--muted)` color
- **Tags:** Smaller chips, clickable, highlight when active
- **Hover effect:** Subtle border color change
- **Grid:** `grid-template-columns: repeat(auto-fill, minmax(300px, 1fr))`

### Sticky Header

- **Position:** `position: sticky; top: 1rem;`
- **Search input:** Retro-styled text input
- **Tag chips:** Horizontal scrollable if overflow
- **Background:** Solid or slight transparency for readability

### Date Display

- **Format:** "Jan 15, 2025" (human-readable from ISO)
- **Style:** Small text, muted
- **Position:** Inline next to tags

### Responsive

- **Mobile:** Single column
- **Desktop:** 2-3 columns based on viewport
- **Sticky header:** Works on mobile

## Implementation Steps

1. **Extend data structure** (`src/data/links.ts`)
   - Add `CoolFind` interface
   - Create `coolFindsData` array with sample entries
   - Add `extractDomain()` helper

2. **Create CoolFindCard component**
   - File: `src/components/CoolFindCard.astro`
   - Props and render logic
   - Styling with flat border

3. **Update links.astro**
   - Keep existing big links section
   - Add cool finds section with header and grid
   - Import and use CoolFindCard

4. **Add client-side filtering**
   - `<script>` tag in links.astro
   - Search and tag filter logic
   - URL param sync
   - Show/hide DOM manipulation

5. **Styling**
   - Add styles to links.astro `<style>` block
   - Test both themes (neon-night, mall-pastel)

## Edge Cases

### Empty States
- No cool finds → Show "Coming soon" message
- No search results → Show "No cool finds match your filters"
- No tags on item → Don't show tag container

### Data Validation
- Required: title, url, description, date, tags (can be empty)
- Invalid URLs → Domain extraction returns "unknown"
- Future dates → Allowed (scheduling use case)

### Performance
- Client-side filtering works for hundreds of items
- All data loads upfront (no API calls)
- YAGNI: Pagination only if thousands of items

### Accessibility
- Search input has proper label
- Tag chips are buttons with `aria-pressed`
- Filtered results announce count
- Keyboard navigation throughout

### Browser Support
- Modern JS (ES6+)
- `URLSearchParams` for query strings
- Sticky positioning (all modern browsers)

## Constraints

- Static output only (no server runtime)
- No external API calls
- No new dependencies
- Client-side filtering only
- Must work in both themes

## Files to Create/Modify

**New:**
- `src/components/CoolFindCard.astro`

**Modify:**
- `src/data/links.ts` - Add CoolFind interface and coolFindsData
- `src/pages/links.astro` - Add cool finds section + filtering script

**No changes needed:**
- Build configuration
- Dependencies
- Other pages
- Layouts
- Global styles
