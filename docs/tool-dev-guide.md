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

### Script Structure: lib vs scripts (the two-layer pattern)

Anything beyond a few dozen lines of page JS must NOT live inline in the `.astro` file.
Split it:

- **Pure logic** (math, validation, transforms, data shaping) → `src/src/lib/<tool>.ts`.
  No `document`/`window`/`localStorage` access. Unit-tested in `src/src/lib/__tests__/`.
  Existing examples: `lib/splitcheck.ts`, `lib/cocktail.ts`, `lib/sanitext-engine.ts`,
  `lib/finance.ts`.
- **DOM wiring** (listeners, rendering, localStorage, URL state) →
  `src/src/scripts/<tool>-app.ts`. Exports `init<Tool>App()`. Typed, `tsc --noEmit` clean
  (CI enforces). Examples: `scripts/sanitext-app.ts`, `scripts/perquackey-app.ts`.
- **The page** keeps a thin script:

```astro
<script>
	import { initMyToolApp } from '../../scripts/my-tool-app';

	document.addEventListener('DOMContentLoaded', () => initMyToolApp());
</script>
```

Why: inline `.astro` scripts are invisible to `tsc` (type-check theater); extracted
modules get strict-mode checking — which has repeatedly surfaced real bugs (null crashes,
state-shape corruption, dead keyboard paths). Cross-file imports in a page `<script>` are
bundled by Vite into shared chunks automatically.

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
  "packages": ["numpy", "matplotlib"],
  "files": {
    "/tools/shared/chart_helpers.py": "/home/pyodide/chart_helpers.py"
  }
}
```

The `files` map fetches each URL (relative to the site root) and writes it into the Pyodide filesystem before `main.py` runs — this is how the shared [`chart_helpers`](#adding-click-to-zoom-to-pyscript-charts) module becomes importable.

### Common Gotchas

1. **`py-click` syntax**: Use `py-click="function_name"` (no parentheses), not `py-click="function_name()"`
2. **Chart accumulation**: Always `innerHTML = ""` the chart container before displaying a new chart
3. **Auto-running**: If you want user input first, remove the function call at the bottom of the Python file
4. **Timing issues**: `py-click` is preferred over `addEventListener` (avoids DOM-not-ready errors). It also avoids a nastier failure: passing a Python function to `addEventListener` from module code hands Pyodide a *borrowed proxy*, which is destroyed as soon as the wiring function returns — later clicks fail with "This borrowed proxy was automatically destroyed". `py-click` attributes let PyScript manage the callable's lifetime. If you must use `addEventListener`, wrap the handler with `pyodide.ffi.create_proxy`.
5. **Responsive charts**: Call `setup_style(figsize)` from `chart_helpers` at module level (applies the shared rcParams); `chart_img()` already emits a responsive `<img>` with `max-width: 100%; height: auto`

### When to Use PyScript vs JavaScript

**Use PyScript for**: numpy/matplotlib tools, scientific computing, complex math
**Use JavaScript for**: Simple forms, instant loading, UI interactions

Note: PyScript adds 2-5 seconds to page load for Python runtime initialization.

### Adding Click-to-Zoom to PyScript Charts

Static matplotlib charts get click-to-zoom (CSS checkbox hack) automatically via two shared modules — no per-page export or observer code needed.

#### 1. Render the chart with `chart_helpers`

`public/tools/shared/chart_helpers.py` is the single source of truth for matplotlib style + PNG export. Mount it via your tool's `config.json` (`files` key) so PyScript writes it into the Pyodide filesystem before `main.py` runs:

**`public/tools/<tool>/config.json`**:
```json
{
  "packages": ["numpy", "matplotlib"],
  "files": {
    "/tools/shared/chart_helpers.py": "/home/pyodide/chart_helpers.py"
  }
}
```

Then in `main.py`:

```python
from pyscript import display, HTML
from chart_helpers import chart_img, setup_style

setup_style((10, 6))  # replaces the old plt.rcParams figsize/autolayout lines

def calculate(event=None):
    fig, ax = plt.subplots()
    # ... your plotting code ...

    # Renders at dpi=200 as a responsive <img id="chartImg"> with alt text
    display(HTML(chart_img(fig, 'Chart description')), target="#chart")
```

Helpers:

| Function | Purpose |
|---|---|
| `setup_style(figsize=(10, 6))` | Apply shared rcParams (responsive figures, autolayout) |
| `fig_to_data_uri(fig, dpi=200)` | Render figure to base64 PNG payload (multi-chart pages — see `public/tools/roth/main.py`) |
| `chart_img(fig, alt, img_id='chartImg')` | Full responsive `<img>` tag HTML string |

#### 2. Wire the shared zoom observer

One script tag per page — the logic lives in `src/src/scripts/zoomable-chart.ts` and the CSS (`.click-zoom`, `.zoom-hint`) in `src/src/styles/global.css`:

```astro
<div id="chart"></div>

<script>
	import { watchForChart } from '../../scripts/zoomable-chart';
	watchForChart('chart', [{ img: 'chartImg', checkbox: 'zoom-checkbox-chart' }]);
</script>
```

`watchForChart` uses a MutationObserver to wrap the PyScript-rendered image in the CSS-only fullscreen zoom modal as soon as it appears. Keep `img_id="chartImg"` (the default) so the observer finds it; for a second chart use `chartImg2` with its own container (see `roth-calculator.astro`).

#### Key Points:

1. **High DPI**: `chart_img`/`fig_to_data_uri` save at `dpi=200` for crisp zoom
2. **Alt text**: always pass a meaningful `alt` — required for accessibility
3. **CSS checkbox hack**: fullscreen zoom with zero JS modal logic
4. **Keep ids stable**: the observer matches images by id (`chartImg`, `chartImg2`)
5. **No inline exports**: never re-declare the BytesIO/base64 pipeline in `main.py` — a vitest guard (`src/src/data/__tests__/python-tools.test.ts`) fails the build if the duplication returns

See [roth-calculator.astro](../src/src/pages/tools/roth-calculator.astro) for a complete working example (two charts: `chartImg` + `chartImg2`).

### Working with Plotly in PyScript

When using Plotly for interactive charts in PyScript, you must avoid injecting `<script>` tags via `innerHTML` (browsers don't execute scripts inserted this way). Instead, use the Plotly.js API directly from Python.

#### Step 1: Opt In to Plotly.js via `PythonToolLayout`

`PythonToolLayout` loads the PyScript core (and, only when requested, Plotly.js) from the CDN. Pass the `plotly` prop on your tool page:

```astro
---
import PythonToolLayout from '../../layouts/PythonToolLayout.astro';
---

<PythonToolLayout title="My Tool - ARGUELLES.ME" plotly>
	<!-- ... -->
</PythonToolLayout>
```

Loaded versions (see `src/src/layouts/PythonToolLayout.astro`): PyScript `2024.5.2`, Plotly `2.27.0`.

#### Step 2: Render with `render_plotly()` from `chart_helpers`

Never hand-roll the JSON round-trip + `Plotly.react` call in `main.py` — five tools once duplicated that pipeline and it drifted apart. The shared helper handles serialization, container clearing, and the toolbar config:

```python
import plotly.graph_objects as go
from chart_helpers import render_plotly

def build_chart(event=None):
    # ... your data preparation ...

    fig = go.Figure(data=[go.Sankey(
        node=dict(label=nodes, color=node_colors),
        link=dict(source=sources, target=targets, value=values),
    )])
    fig.update_layout(title_text="My Chart", height=600)

    chart_element = document.querySelector("#chart")
    render_plotly(fig, chart_element, 'my-tool-chart')
```

`render_plotly(fig, element, filename, width=1600, height=1200, scale=2, method="react", remove_buttons=True)`:

| Parameter | Default | Notes |
|---|---|---|
| `fig` | — | any `plotly.graph_objects.Figure` |
| `element` | — | DOM node to render into (cleared first) |
| `filename` | — | base name for the toolbar's PNG download button |
| `width`/`height`/`scale` | 1600/1200/2 | PNG export sizing |
| `method` | `"react"` | `"new"` for a fresh plot (used by tools that re-create the figure) |
| `remove_buttons` | `True` | drops pan/lasso/select from the mode bar |

The helper serializes the spec and config through a JSON round-trip so Pyodide proxy objects become plain JS values (required on PyScript 2024.x), then calls `Plotly.react`/`Plotly.newPlot`.

**Guard**: the vitest suite (`src/src/data/__tests__/python-tools.test.ts`) fails if `to_plotly_json()` reappears in any `main.py` — always go through `chart_helpers`.

#### Why This Approach?

1. **Avoids innerHTML script issue**: browsers ignore `<script>` tags inserted via `innerHTML`
2. **No HTML injection**: `to_plotly_json()` returns pure JSON, not HTML with script tags
3. **Direct JS API**: `Plotly.react()` updates the chart in-place (great for repeated clicks)
4. **Shared toolbar config**: every tool gets the same download button + button set, no per-page drift

#### Wrong Way (Don't Do This):

```python
# ❌ Won't work - script tags won't execute
chart_element.innerHTML = fig.to_html(full_html=False, include_plotlyjs="cdn")

# ❌ Banned - duplicating the serialization pipeline (vitest guard trips)
spec = JSON.parse(json.dumps(fig.to_plotly_json()))
Plotly.react(chart_element, spec.data, spec.layout)
```

#### Right Way:

```python
# ✅ Shared helper: serialization + toolbar config in one call
from chart_helpers import render_plotly
render_plotly(fig, chart_element, 'my-tool-chart')
```

See [sankey-builder.astro](../src/src/pages/tools/sankey-builder.astro) and [main.py](../src/public/tools/sankey-builder/main.py) for a complete working example.

### Additional Resources

- [PyScript Documentation](https://pyscript.net/)
- [roth-calculator.astro](../src/src/pages/tools/roth-calculator.astro) - Complete PyScript + zoom example
