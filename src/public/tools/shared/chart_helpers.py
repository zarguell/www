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
IMG_STYLE = "max-width: 100%; height: auto; display: block;"


def setup_style(figsize=(10, 6)):
    """Apply shared matplotlib rcParams (responsive figures, tight autolayout)."""
    import matplotlib.pyplot as plt
    plt.rcParams['figure.figsize'] = list(figsize)
    plt.rcParams['figure.autolayout'] = True


def fig_to_data_uri(fig, dpi=DEFAULT_DPI):
    """Render a matplotlib figure to a base64 PNG payload (no data: prefix)."""
    buf = BytesIO()
    fig.savefig(buf, format='png', dpi=dpi, bbox_inches='tight')
    buf.seek(0)
    return base64.b64encode(buf.read()).decode()


def chart_img(fig, alt, img_id="chartImg", dpi=DEFAULT_DPI):
    """Render a figure to a responsive <img> HTML string."""
    return (
        f'<img id="{img_id}"\n'
        f'         src="data:image/png;base64,{fig_to_data_uri(fig, dpi)}"\n'
        f'         alt="{alt}"\n'
        f'         style="{IMG_STYLE}">'
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
    spec = JSON.parse(json.dumps(fig.to_plotly_json()))

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

    cfg = JSON.parse(json.dumps(config))
    if method == "new":
        Plotly.newPlot(element, spec.data, spec.layout, cfg)
    else:
        Plotly.react(element, spec.data, spec.layout, cfg)
