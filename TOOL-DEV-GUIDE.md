# Tool Development Guide

This guide covers common patterns and solutions for building interactive tools in Astro.

## Interactive Calculators with JavaScript

When building tools that need client-side JavaScript (calculators, forms, etc.), follow these patterns to work properly with Astro's script processing.

### The Problem

Astro processes and bundles `<script>` tags by default, which causes issues with:
- Inline event handlers (`onclick`, `onchange`, etc.) - functions not in global scope
- DOM element availability - scripts may run before DOM is ready

### The Solution: Event Listeners with DOMContentLoaded

**Always use event listeners instead of inline handlers**. This is the recommended Astro pattern:

```astro
---
// Your component imports
---

<!-- HTML: Use IDs, no inline handlers -->
<button id="calculate-btn">Calculate</button>

<script>
  document.addEventListener("DOMContentLoaded", function() {
    // All your code here

    function calculate() {
      const value = document.getElementById("input").value;
      // Your calculation logic
    }

    // Attach event listener
    document.getElementById("calculate-btn").addEventListener("click", calculate);

    // Run initial calculation if needed
    calculate();
  });
</script>
```

#### Key Points:

1. **Use `DOMContentLoaded`** - Ensures DOM elements exist before accessing them
2. **Use event listeners** - Proper Astro pattern, not inline `onclick`
3. **Keep functions local** - No need for global scope when using listeners
4. **IDs over inline handlers** - Use `id="calculate-btn"` not `onClick="calculate()"`

### Working with Retro Components

When using custom components like `RetroButton`:

1. **Check component props** - Look for `onClick` or other event props in the component definition
2. **Understand the limitation** - Components may not expose IDs for event listener attachment

**Option 1: Use the component's onClick prop (if available)**
```astro
<!-- If RetroButton has an onClick prop -->
<RetroButton variant="primary" onClick="calculate()">
  Calculate
</RetroButton>

<script>
  document.addEventListener("DOMContentLoaded", function() {
    function calculate() {
      // Your logic
    }

    // Must make global for onClick attribute
    window.calculate = calculate;
  });
</script>
```

**Option 2: Use a plain HTML button instead**
```astro
<!-- If component doesn't work well, use regular button with styling -->
<button class="retro-button retro-button--primary" id="calculate-btn">
  Calculate
</button>

<script>
  document.addEventListener("DOMContentLoaded", function() {
    function calculate() {
      // Your logic
    }

    document.getElementById("calculate-btn").addEventListener("click", calculate);
  });
</script>
```

### Common Patterns

#### Pattern 1: Simple Calculator
```astro
<div class="form-group">
  <label for="input1">Value</label>
  <input type="number" id="input1" value="100" />
</div>

<button id="calculate-btn">Calculate</button>

<div id="results"></div>

<script>
  document.addEventListener("DOMContentLoaded", function() {
    function calculate() {
      const value = parseFloat(document.getElementById("input1").value) || 0;
      const result = value * 2;
      document.getElementById("results").textContent = `Result: ${result}`;
    }

    document.getElementById("calculate-btn").addEventListener("click", calculate);

    // Initial calculation
    calculate();
  });
</script>
```

#### Pattern 2: Form with Multiple Inputs
```astro
<form id="tool-form">
  <input type="number" id="field1" />
  <input type="number" id="field2" />
  <button type="button" id="submit-btn">Submit</button>
</form>

<script>
  document.addEventListener("DOMContentLoaded", function() {
    function processForm() {
      const field1 = parseFloat(document.getElementById("field1").value) || 0;
      const field2 = parseFloat(document.getElementById("field2").value) || 0;

      // Your logic here
      console.log(field1, field2);
    }

    document.getElementById("submit-btn").addEventListener("click", processForm);
  });
</script>
```

#### Pattern 3: Dynamic UI Changes
```astro
<select id="strategy">
  <option value="option1">Option 1</option>
  <option value="option2">Option 2</option>
</select>

<div id="dynamic-content" style="display:none;"></div>

<script>
  document.addEventListener("DOMContentLoaded", function() {
    document.getElementById("strategy").addEventListener("change", function() {
      const isCustom = this.value === "custom";
      document.getElementById("dynamic-content").style.display =
        isCustom ? "block" : "none";
    });
  });
</script>
```

### Debugging Tips

1. **Check browser console** for errors like:
   - `Uncaught TypeError: Cannot read properties of null` → DOM element not found when script ran
   - `... is not defined` → Trying to access function/variable before it's declared

2. **Verify script execution**:
   ```javascript
   console.log("Script loaded"); // Should see in console
   ```

3. **Check element availability**:
   ```javascript
   const el = document.getElementById("myElement");
   console.log("Element:", el); // Should not be null
   ```

4. **Common mistakes**:
   - **Forgot `DOMContentLoaded`** → Script runs before HTML exists
   - **Using `onclick` attribute** → Function not in global scope
   - **Wrong element ID** → Typo in `getElementById`

### Styling Considerations

- Use CSS custom properties (design tokens) for theming
- Define styles in the component's `<style>` tag
- Respect `prefers-reduced-motion` for animations
- Ensure keyboard accessibility (focus states, tab order)

### Best Practices

1. **Keep JavaScript minimal** - Only use what's necessary for interactivity
2. **Use semantic HTML** - Proper labels, form structure
3. **Test both themes** - Ensure styling works in neon-night and mall-pastel
4. **Mobile responsive** - Test on smaller screens
5. **Error handling** - Validate inputs, show user-friendly messages
6. **Always use event listeners** - Avoid inline `onclick`, `onchange`, etc.

### Quick Reference

| Need | Solution |
|------|----------|
| Button click handler | `id="btn"` + `addEventListener("click", function)` |
| Form submission | Event listener on submit button |
| Dynamic UI changes | Event listener on change/input events |
| Working with Retro components | Use component's `onClick` prop or plain HTML button |
| Accessing DOM elements | Always wrap in `DOMContentLoaded` |
| Multiple event handlers | Separate `addEventListener` for each |
| Initial calculation on load | Call function at end of `DOMContentLoaded` |

### Additional Resources

- [Astro Scripts Documentation](https://docs.astro.build/en/guides/client-side-scripts/)
- [MDN Web Docs - DOM Manipulation](https://developer.mozilla.org/en-US/docs/Web/API/Document_Object_Model)
- Project's `AGENTS.md` - Overall development guidelines
