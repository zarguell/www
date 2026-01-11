# Cocktail Recipe Maker - Design Document

**Date**: 2025-01-11
**Status**: Approved
**Author**: Claude + Happy

## Overview

Transform the batch cocktail maker into a cocktail recipe builder tool where users can:
1. Build custom recipes from scratch by adding ingredients
2. Share recipes via URL
3. Optionally calculate batch sizes (secondary feature)

**Core Philosophy**: Recipe building and sharing is primary; batch calculations are a toggle-able secondary feature.

## UI Layout & Structure

### Recipe Mode (Default - Primary)
- **Left/Top panel: Recipe Builder**
  - Recipe name input (new field)
  - Ingredient list (add, remove, reorder)
  - Per-ingredient: name, amount, unit, ABV, emoji
  - "Add Ingredient" button → opens preset library + custom option
  - Live stats: Total volume, Total alcohol content, Final ABV

- **Right/Bottom panel: Recipe Preview Card**
  - Recipe name
  - Ingredient list with amounts
  - Summary stats
  - "Share Recipe" button (prominent, primary action)

### Batch Mode (Secondary - Toggle Enabled)
- Same recipe builder/preview
- Additional "Batch Calculator" panel appears:
  - Toggle: Scale by servings vs Scale by total volume
  - Input: Number of servings OR target volume
  - Dilution dropdown (None, Stirred 20%, Shaken 30%, Custom)
  - Batch results: Scaled ingredient amounts, Dilution water needed, Final ABV
  - Freezer safety warning (if applicable)

### Shared Link View Mode
- Clean, read-only recipe card
- Recipe name, ingredients, stats
- "Copy to Edit" button (creates editable copy)
- "Toggle Batch Mode" (if recipe author enabled it)

## Data Structure & State

### Recipe Data Model
```typescript
interface Ingredient {
  emoji: string;      // Visual emoji (🍸, 🍋, etc.)
  name: string;       // Ingredient name
  amount: number;     // Amount in original units
  unit: string;       // ml, oz, cup, L
  abv: number;        // Alcohol by volume percentage
}

interface Recipe {
  name: string;                   // NEW: Recipe name
  ingredients: Ingredient[];      // Array of ingredients
  createdAt: number;              // Timestamp
}
```

### Application State
```typescript
const app = {
  mode: 'edit' | 'view',          // Edit mode vs shared view mode
  batchMode: boolean,             // NEW: Batch calculator toggle
  recipe: Recipe,                 // Current recipe data
  batchSettings: {                // NEW: Batch calculation settings
    scaleMode: 'servings' | 'volume',
    targetValue: number,          // Servings count OR volume in ml
    dilution: number,             // Dilution percentage (0, 0.2, 0.3, custom)
  }
};
```

### URL State Encoding
- `v=` parameter: Encoded recipe for **view mode** (read-only)
- `e=` parameter: Encoded recipe + settings for **edit mode** (fully editable)
- LZ-String compression for efficient URLs
- Preserve: recipe name, ingredients, batch settings (if batch mode enabled)

### Browser Storage
- Key: `"cocktail_recipe_tool_v1"` (rename from current)
- Auto-save recipe on every change
- Load on page load if no URL state present

## Component Architecture

### Main Page Components
1. **CocktailRecipeBuilder.astro** (rename from cocktail-batch.astro)
   - Main container component
   - Handles routing logic (parse URL params for `v` or `e`)
   - Manages global app state
   - Coordinates child components

2. **RecipeEditor.astro** (NEW)
   - Recipe name input field
   - Ingredient list with add/remove/edit controls
   - Live stats display (total volume, ABV)
   - "Add Ingredient" button → opens modal/dropdown

3. **IngredientPicker.astro** (NEW)
   - Modal or dropdown for selecting ingredients
   - Tabs: "Presets" vs "Custom Ingredient"
   - Presets: Clickable grid of common ingredients (spirits, mixers, garnishes)
   - Custom: Form with name, amount, unit, ABV, emoji picker

4. **RecipeCard.astro** (NEW)
   - Clean preview of the recipe
   - Recipe name, ingredient list, stats
   - "Share Recipe" button (prominent)
   - Export to PNG option (using html-to-image)

5. **BatchCalculator.astro** (NEW - only visible when batch mode is on)
   - Scale mode toggle (servings vs volume)
   - Input fields for target value
   - Dilution dropdown
   - Scaled results display
   - Freezer safety warning (if applicable)

6. **ViewOnlyCard.astro** (NEW - for shared links)
   - Read-only recipe display
   - "Copy to Edit" button
   - Optional "Toggle Batch Mode" (if batch data in URL)

### Shared Components (already exist)
- BaseLayout, Window, RetroButton, Badge

## User Workflows

### Workflow 1: Building & Sharing a Recipe
1. User lands on `/tools/cocktail-recipe/` (NEW route)
2. Enters recipe name (e.g., "Spicy Margarita")
3. Clicks "Add Ingredient"
4. Selects from presets (e.g., "Tequila Blanco") OR adds custom
5. Fills in amount (2 oz), unit (oz), ABV (40%)
6. Repeats for all ingredients
7. Live stats show: Total volume, Final ABV
8. Clicks "Share Recipe" (primary CTA)
9. URL copies to clipboard with toast notification
10. Shares link with friends

### Workflow 2: Viewing a Shared Recipe
1. User opens shared link with `v=` parameter
2. Page loads in **view mode** (read-only)
3. Sees clean recipe card with name, ingredients, stats
4. No editing controls visible
5. Can click "Copy to Edit" to create their own editable version
6. If creator included batch data, "Toggle Batch Mode" button appears

### Workflow 3: Batch Calculation (Optional)
1. User is editing a recipe (Workflow 1)
2. Clicks "Toggle Batch Mode" switch
3. BatchCalculator panel slides/fades in
4. Selects "Scale by servings" OR "Scale by total volume"
5. Enters target value (e.g., 10 servings OR 2000ml)
6. Selects dilution method (Stirred, Shaken, None, Custom)
7. Scaled ingredient amounts appear instantly
8. Dilution water needed shows automatically
9. Freezer warning appears if ABV is too low
10. Can share batched recipe via "Share Recipe" (includes batch settings in URL)

### Workflow 4: Copying to Edit
1. User is viewing a shared recipe (Workflow 2)
2. Clicks "Copy to Edit"
3. Page transitions to edit mode
4. Recipe data is copied to a new editable state
5. URL updates to edit mode (no permanent change to original)
6. User can modify and re-share as their own variation

## Technical Implementation Details

### URL Parameter Changes
- Current: `e=` (edit), `d=` (edit)
- New: `v=` (view-only), `e=` (edit)
- Update `buildLink()` and related functions to use new params
- Maintain backward compatibility if possible (check for old params)

### Recipe Calculations
- Keep existing `baseTotals()` function (calculate volume + alcohol)
- Keep `computeBatch()` function (batch scaling logic)
- Add new `calculateRecipeStats()` for simple recipe mode:
  ```javascript
  function calculateRecipeStats(ingredients) {
    const totalVolume = ingredients.reduce((sum, ing) =>
      sum + toMl(ing.amount, ing.unit), 0);
    const totalAlcohol = ingredients.reduce((sum, ing) =>
      sum + (toMl(ing.amount, ing.unit) * ing.abv / 100), 0);
    const finalABV = totalVolume > 0 ? (totalAlcohol / totalVolume) * 100 : 0;
    return { totalVolume, totalAlcohol, finalABV };
  }
  ```

### State Encoding Updates
- Modify `encodeState()` to include `recipe.name`
- Modify `decodeState()` to extract recipe name
- Add `batchSettings` to encoded state when batch mode is enabled
- Optimize: Only include batch data in URL if batch mode is active

### Component Refactoring
- Extract ingredient management logic into `RecipeEditor.astro`
- Extract batch calculation UI into `BatchCalculator.astro`
- Keep shared state in parent `CocktailRecipeBuilder.astro`
- Use Astro props for component communication

### File Changes
- Rename: `cocktail-batch.astro` → `cocktail-recipe.astro`
- Update route: `/tools/cocktail-batch/` → `/tools/cocktail-recipe/`
- Update tools index: `tools/index.astro`
- Update tools data: `tools-data.ts`
- Update page title and meta description

## Testing Strategy

### Test Harness Requirements

1. **Data Structure Tests** (`src/src/data/__tests__/recipe.test.ts`)
   - Validate Recipe interface (name required, ingredients array)
   - Validate Ingredient interface (all fields required)
   - Test recipe stats calculation (volume, ABV)
   - Test batch scaling calculations
   - Edge cases: empty recipe, single ingredient, zero ABV, 100% ABV

2. **Component Tests** (`src/src/pages/tools/__tests__/cocktail-recipe.test.ts`)
   - RecipeEditor: add/remove/edit ingredients
   - IngredientPicker: preset selection, custom ingredient form
   - RecipeCard: display accuracy, stats calculation
   - BatchCalculator: scaling modes, dilution options
   - URL encoding/decoding: `v=` vs `e=` parameters
   - Mode switching: edit ↔ view ↔ batch

3. **Integration Scenarios**
   - Build recipe → share URL → open in view mode → copy to edit
   - Enable batch mode → scale by servings → share → verify batch data preserved
   - Custom ingredient → add to recipe → verify in stats
   - Edge case: Recipe with only non-alcoholic ingredients (0% ABV)
   - Edge case: Recipe exceeding reasonable volumes (>10L)

4. **Manual Testing Checklist**
   - [ ] Build recipe from scratch
   - [ ] Add ingredient from presets
   - [ ] Add custom ingredient
   - [ ] Edit/remove ingredient
   - [ ] Live stats update correctly
   - [ ] Share recipe → URL works
   - [ ] Open shared link → view mode works
   - [ ] Copy to edit → creates editable copy
   - [ ] Toggle batch mode → panel appears
   - [ ] Scale by servings → amounts correct
   - [ ] Scale by volume → amounts correct
   - [ ] Dilution calculation accurate
   - [ ] Freezer warning appears when appropriate
   - [ ] Export to PNG works
   - [ ] Both themes (neon-night, mall-pastel) look good

### Validation Criteria
- All ingredient ABV values are 0-100%
- Total volume is reasonable (0-10L)
- Recipe name is required for sharing
- URLs don't exceed browser limits (~2000 chars)

## Guardrails

### DO NOT
- Add backend, authentication, database
- Break static build output
- Add heavy frameworks
- Remove theme toggle functionality
- Break accessibility (keyboard navigation, focus states, reduced motion)

### MUST
- Keep build static
- Keep dependencies minimal
- Respect `prefers-reduced-motion` in CSS
- Test both themes (neon-night, mall-pastel)
- Maintain VT323 font globally
- Make all interactive elements keyboard accessible
- Persist theme choice in localStorage
