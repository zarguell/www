# Tool development guide

Every local tool has four pieces:

1. A registry entry in `content/tools.json`.
2. A Jinja template in `templates/tools/<slug>.html`.
3. An entrypoint in `assets/js/tools/<slug>.ts` (or the shared `py-tools.ts`).
4. Optional styles in `assets/css/tools/<slug>.css`.

## JavaScript tool

`templates/tools/example.html`:

```jinja
{% extends "tool.html" %}
{% block tool_content %}
<header class="page-head">
  <div>
    <h1>Example Tool</h1>
    <p class="page-head__sub">What it does.</p>
  </div>
</header>

<section class="panel">
  <div class="panel__body">
    <div class="form-group">
      <label for="amount">Amount</label>
      <input id="amount" type="number" value="10">
    </div>
    <button id="run" class="btn btn--primary" type="button">Run</button>
    <div id="output" class="result-card is-hidden"></div>
  </div>
</section>
{% endblock %}

{% block tool_scripts %}
<script type="module" src="{{ asset('js/tools/example.js') }}"></script>
{% endblock %}
```

`assets/js/tools/example.ts`:

```ts
const amount = document.getElementById('amount') as HTMLInputElement;
const output = document.getElementById('output') as HTMLElement;

document.getElementById('run')?.addEventListener('click', () => {
  output.textContent = `Result: ${Number(amount.value) * 2}`;
  output.classList.remove('is-hidden');
});
```

- Do not use inline handlers. Bind events in the module.
- Use `class="is-hidden"` for elements that start hidden and are toggled by script.
- Use the shared classes: `.panel`, `.panel__head`, `.panel__title`, `.form-group`,
  `.field`, `.btn`, `.result-card`, `.notice`, `.data-table`, `.chart-frame`.
- Third-party classic libraries are loaded from `dist/assets/vendor/` via the template's
  `tool_head_extra` block. Add the npm dependency and the copy mapping in
  `engine/assets.py`.

## PyScript tool

Use `templates/tools/<slug>.html` with:

```jinja
{% block tool_head_extra %}
{% from "partials/macros.html" import pyscript %}
{{ pyscript(plotly=true) }}
{% endblock %}
{% block tool_scripts %}
<script type="module" src="{{ asset('js/tools/py-tools.js') }}"></script>
{% endblock %}
```

And put the Python files in `static/tools/<name>/` (`main.py`, `config.json`). Use
`py-click="function_name"` without parentheses. Clear chart containers before rendering.
The shared `py-tools.ts` prevents form submission and wires click-to-zoom for chart images.

## Verification

```bash
cd src
npm run build
npm run dev
```

Check the tool in a browser. Run `python -m pytest -q`, `npm test`, and `npm run typecheck`.
