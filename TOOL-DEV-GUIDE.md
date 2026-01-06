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

## Python Tools with PyScript

For tools requiring Python libraries (numpy, matplotlib, pandas), use PyScript to run Python in the browser.

### Architecture

```
src/
├── layouts/
│   └── PythonToolLayout.astro    # Includes PyScript (not BaseLayout)
├── pages/tools/
│   └── my-tool.astro             # Uses PythonToolLayout
└── public/tools/
    └── my-tool/
        ├── main.py               # Python logic
        └── config.json           # Package dependencies
```

**Critical**: Use `PythonToolLayout` for Python tools, `BaseLayout` for everything else. Keep PyScript isolated.

### Quick Reference

**1. Button handler (use `py-click` without parentheses)**:
```astro
<button py-click="calculate">Calculate</button>
```

**2. Configure responsive charts and clear before displaying**:
```python
# At module level, configure matplotlib for responsive output
plt.rcParams['figure.figsize'] = [10, 6]
plt.rcParams['figure.autolayout'] = True

def display_chart():
    chart_element = document.querySelector("#chart")
    chart_element.innerHTML = ""  # Clear previous chart
    fig, ax = plt.subplots()  # Uses rcParams from above
    # ... chart setup ...
    display(fig, target="#chart")
```

CSS (in `.astro` file):
```css
:global(#chart img) {
  max-width: 100% !important;
  height: auto !important;
  display: block !important;
}
```

Viewport meta tag (required in layout):
```html
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
```

**3. Don't auto-run if user needs to input values first**:
```python
# Remove this line from bottom of file to wait for button click:
# calculate()
```

### Working Example

**`public/tools/roth/main.py`**:
```python
import numpy as np
import matplotlib.pyplot as plt
from pyscript import display, document, HTML

# Configure matplotlib for responsive output
plt.rcParams['figure.figsize'] = [10, 6]
plt.rcParams['figure.autolayout'] = True

def run_projection(event=None):
    # Read inputs
    current_age = int(document.getElementById("currentAge").value)
    retirement_age = int(document.getElementById("retirementAge").value)
    r = float(document.getElementById("returnRate").value) / 100.0

    # Your calculation logic
    years = list(range(current_age, retirement_age + 1))
    values = [1000 * (1 + r) ** i for i in range(len(years))]

    # Clear previous chart
    chart_element = document.querySelector("#chart")
    chart_element.innerHTML = ""

    # Create chart (uses rcParams set at module level)
    fig, ax = plt.subplots()
    ax.plot(years, values)
    ax.set_title("Growth Over Time", fontsize=14)
    ax.set_xlabel("Age", fontsize=12)
    ax.set_ylabel("Balance ($)", fontsize=12)
    display(fig, target="#chart")

    # Display summary
    summary_html = f"<strong>Final: ${values[-1]:,.0f}</strong>"
    display(HTML(summary_html), target="#summary")

# No auto-run - user clicks button first
```

**`src/pages/tools/roth-calculator.astro`**:
```astro
---
import PythonToolLayout from '../../layouts/PythonToolLayout.astro';
import Window from '../../components/Window.astro';
---

<PythonToolLayout title="Roth Calculator">
	<Window title="Inputs" badgeText="PYTHON">
		<input type="number" id="currentAge" value="30" />
		<input type="number" id="retirementAge" value="58" />
		<input type="number" id="returnRate" value="7" />
		<button py-click="run_projection">Calculate</button>
	</Window>

	<Window title="Chart">
		<div id="chart"></div>
	</Window>

	<div id="summary"></div>

	<script type="py" src="/tools/roth/main.py" config="/tools/roth/config.json"></script>
</PythonToolLayout>

<style>
	/* PyScript renders matplotlib as <img> - target for responsiveness */
	:global(#chart img) {
		max-width: 100% !important;
		height: auto !important;
		display: block !important;
	}

	#chart-container {
		width: 100%;
		overflow-x: hidden;
	}
</style>
```

**`public/tools/roth/config.json`**:
```json
{
  "packages": ["numpy", "matplotlib"]
}
```

### Common Gotchas

1. **`py-click` syntax**: Use `py-click="function_name"` (no parentheses), not `py-click="function_name()"`
2. **Chart accumulation**: Always `innerHTML = ""` the chart container before displaying a new chart
3. **Auto-running**: If you want user input first, remove the function call at the bottom of the Python file
4. **Timing issues**: `py-click` is preferred over `addEventListener` (avoids DOM-not-ready errors)
5. **Responsive charts**: PyScript renders matplotlib as `<img>` tag. Use `plt.rcParams` at module level and target `#chart img` in CSS with `max-width: 100% !important; height: auto !important`

### When to Use PyScript vs JavaScript

**Use PyScript for**: numpy/matplotlib tools, scientific computing, complex math
**Use JavaScript for**: Simple forms, instant loading, UI interactions

Note: PyScript adds 2-5 seconds to page load for Python runtime initialization.

### Adding Click-to-Zoom to PyScript Charts

For matplotlib charts that users need to view in fullscreen, add click-to-zoom functionality using the CSS checkbox hack.

#### Option 1: Use the ZoomableImage Component (Static Images)

For static images or when you can pre-generate the chart:

```astro
---
import ZoomableImage from '../../components/ZoomableImage.astro';
---

<ZoomableImage
  id="my-chart"
  src="/path/to/chart.png"
  alt="My Chart"
  hint="🔍 Click to view fullscreen"
/>
```

#### Option 2: Dynamic PyScript Charts with Click-to-Zoom

For charts generated dynamically by PyScript:

**Python code** - Export high-DPI PNG:
```python
from io import BytesIO
import base64

# Create figure with high DPI
fig, ax = plt.subplots(dpi=200)

# ... your plotting code ...

# Save to base64 data URI
buf = BytesIO()
fig.savefig(buf, format='png', dpi=200, bbox_inches='tight')
buf.seek(0)
img_data = base64.b64encode(buf.read()).decode()

# Display as image
img_html = f'''
<img id="chartImg"
     src="data:image/png;base64,{img_data}"
     alt="Chart"
     style="max-width: 100%; height: auto; display: block;">
'''
display(HTML(img_html), target="#chart")
```

**Astro template** - Add click-to-zoom with MutationObserver:
```astro
<div id="chart"></div>

<script define:vars={{}}>
  const initZoomableChart = () => {
    const chartImg = document.getElementById('chartImg');
    if (chartImg && !chartImg.dataset.zoomInitialized) {
      chartImg.dataset.zoomInitialized = 'true';

      // Wrap in click-zoom structure
      const clickZoom = document.createElement('div');
      clickZoom.className = 'click-zoom';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.id = 'zoom-checkbox-chart';
      checkbox.className = 'zoom-checkbox';

      const label = document.createElement('label');
      label.htmlFor = 'zoom-checkbox-chart';
      label.className = 'zoom-label';

      // Move image into label
      chartImg.parentNode.insertBefore(clickZoom, chartImg);
      clickZoom.appendChild(checkbox);
      clickZoom.appendChild(label);
      label.appendChild(chartImg);

      // Add hint
      const hint = document.createElement('div');
      hint.className = 'zoom-hint';
      hint.textContent = '🔍 Click image to view fullscreen';
      clickZoom.parentNode.insertBefore(hint, clickZoom);
    }
  };

  // Watch for dynamic chart generation
  const observer = new MutationObserver(() => {
    if (document.getElementById('chartImg')) {
      initZoomableChart();
    }
  });
  observer.observe(document.getElementById('chart'), { childList: true });
</script>
```

**CSS** - Add to your component styles:
```css
.zoom-hint {
  font-family: 'VT323', monospace;
  font-size: 1rem;
  color: var(--color-text);
  opacity: 0.7;
  margin-bottom: 0.5rem;
  text-align: center;
}

.click-zoom input[type="checkbox"] {
  display: none;
}

.zoom-label {
  cursor: zoom-in;
  display: block;
}

.click-zoom input:checked + .zoom-label {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.95);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  cursor: zoom-out;
  padding: 2rem;
}

.click-zoom input:checked + .zoom-label #chartImg {
  max-width: 100%;
  max-height: 95vh;
  object-fit: contain;
  cursor: zoom-out;
}
```

#### Key Points:

1. **High DPI**: Always use `dpi=200` when saving figures for crisp zoom
2. **Base64 encoding**: Use `fig.savefig(buf, format='png')` + base64 for embedding
3. **CSS checkbox hack**: Click-to-zoom fullscreen modal without JavaScript modal logic
4. **MutationObserver**: Required for detecting when PyScript generates content
5. **No JavaScript modal**: The entire fullscreen functionality is CSS-only

See [roth-calculator.astro](src/pages/tools/roth-calculator.astro) for complete working example.

### Additional Resources

- [PyScript Documentation](https://pyscript.net/)
- [ZoomableImage Component](src/components/ZoomableImage.astro) - Reusable zoom component
- [roth-calculator.astro](src/pages/tools/roth-calculator.astro) - Complete PyScript + zoom example
