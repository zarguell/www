"""Shared chart helpers for PyScript tools.

Mounted into the Pyodide filesystem by each tool's config.json:

    "files": {"/tools/shared/chart_helpers.py": "/home/pyodide/chart_helpers.py"}

Pyodide's working directory (/home/pyodide) is on sys.path, so tools import it as:

    from chart_helpers import chart_img, fig_to_data_uri, render_plotly, setup_style
"""

import base64
import json
from io import BytesIO

DEFAULT_DPI = 200


def setup_style(figsize=(10, 6)):
    """Apply shared matplotlib rcParams (responsive, transparent, theme-neutral)."""
    import matplotlib.pyplot as plt
    plt.rcParams.update({
        'figure.figsize': list(figsize),
        'figure.autolayout': True,
        'figure.facecolor': 'none',
        'axes.facecolor': 'none',
        'savefig.transparent': True,
        'text.color': '#7a7a7a',
        'axes.labelcolor': '#7a7a7a',
        'axes.edgecolor': '#3a3a3a',
        'xtick.color': '#7a7a7a',
        'ytick.color': '#7a7a7a',
        'grid.color': '#3a3a3a',
        'grid.alpha': 0.35,
        'font.size': 10,
    })


def fig_to_data_uri(fig, dpi=DEFAULT_DPI):
    """Render a matplotlib figure to a base64 PNG payload (no data: prefix)."""
    buf = BytesIO()
    fig.savefig(buf, format='png', dpi=dpi, bbox_inches='tight', transparent=True)
    buf.seek(0)
    return base64.b64encode(buf.read()).decode()


def chart_img(fig, alt, img_id="chartImg", dpi=DEFAULT_DPI):
    """Render a figure to a responsive <img> HTML string."""
    return (
        f'<img id="{img_id}" class="chart-img"\n'
        f'         src="data:image/png;base64,{fig_to_data_uri(fig, dpi)}"\n'
        f'         alt="{alt}">'
    )


def render_plotly(
    fig,
    element,
    filename,
    width=1600,
    height=1200,
    scale=2,
    method="react",
    remove_buttons=True,
):
    """Render a Plotly figure into a DOM element with the shared toolbar config.

    Serializes figure and config through a JSON round-trip so Pyodide proxy
    objects become plain JS values (required on PyScript 2024.x), clears the
    container, then renders via Plotly.react (or Plotly.newPlot when
    method="new").
    """
    from js import Plotly, JSON

    element.innerHTML = ""
    spec = json.loads(json.dumps(fig.to_plotly_json()))

    config = {
        "displayModeBar": True,
        "displaylogo": False,
        "responsive": True,
        "toImageButtonOptions": {
            "format": "png",
            "filename": filename,
            "height": height,
            "width": width,
            "scale": scale,
        },
    }
    if remove_buttons:
        config["modeBarButtonsToRemove"] = ["pan2d", "lasso2d", "select2d"]

    theme = {
        "paper_bgcolor": "rgba(0,0,0,0)",
        "plot_bgcolor": "rgba(0,0,0,0)",
        "font": {"color": "#7a7a7a", "family": "IBM Plex Sans, Arial, sans-serif", "size": 12},
        "colorway": ["#c9c9c9", "#9a9a9a", "#7ee2a8", "#7a7a7a", "#e2c07e", "#e28a8a"],
        "xaxis": {"gridcolor": "rgba(140,140,140,0.22)", "zerolinecolor": "rgba(140,140,140,0.3)", "linecolor": "rgba(140,140,140,0.3)"},
        "yaxis": {"gridcolor": "rgba(140,140,140,0.22)", "zerolinecolor": "rgba(140,140,140,0.3)", "linecolor": "rgba(140,140,140,0.3)"},
        "legend": {"bgcolor": "rgba(0,0,0,0)", "font": {"color": "#7a7a7a"}},
        "margin": {"l": 64, "r": 24, "t": 54, "b": 54},
    }
    layout = spec.setdefault("layout", {})
    for key, value in theme.items():
        if key in ("xaxis", "yaxis", "legend") and isinstance(layout.get(key), dict):
            layout[key] = {**value, **layout[key]}
        else:
            layout.setdefault(key, value)

    data_js = JSON.parse(json.dumps(spec.get("data", [])))
    layout_js = JSON.parse(json.dumps(layout))
    cfg = JSON.parse(json.dumps(config))
    if method == "new":
        Plotly.newPlot(element, data_js, layout_js, cfg)
    else:
        Plotly.react(element, data_js, layout_js, cfg)
