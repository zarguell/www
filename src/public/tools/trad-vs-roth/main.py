"""
Traditional vs Roth Analyzer
Compares after-tax outcomes across different future tax rates.
"""

import numpy as np
import matplotlib.pyplot as plt
import plotly.graph_objects as go
import json
from pyscript import display, document, HTML
from io import BytesIO
import base64
from js import Plotly, JSON

plt.rcParams['figure.figsize'] = [10, 6]
plt.rcParams['figure.autolayout'] = True

def run_analysis(event=None):
    """Compare Traditional and Roth outcomes."""

    try:
        current_age = int(document.getElementById("currentAge").value)
        retirement_age = int(document.getElementById("retirementAge").value)
        annual_contribution = float(document.getElementById("annualContribution").value)
        current_marginal_rate = float(document.getElementById("currentRate").value)
        expected_retirement_rate = float(document.getElementById("retirementRate").value)
        expected_return = float(document.getElementById("expectedReturn").value)

        if current_age >= retirement_age:
            display(HTML('<p style="color: var(--accent);">Retirement age must be greater than current age.</p>'), target="#summary")
            return

    except ValueError as e:
        display(HTML(f'<p style="color: var(--accent);">Invalid input: {str(e)}</p>'), target="#summary")
        return

    years = retirement_age - current_age

    # Calculate outcomes across retirement tax rates
    retirement_rates = np.linspace(0.10, 0.50, 41)
    trad_values = []
    roth_values = []

    for rate in retirement_rates:
        # Traditional: contribute pre-tax, pay tax on withdrawal
        trad_final = annual_contribution * ((1 + expected_return) ** years - 1) / expected_return * (1 - rate)
        trad_values.append(trad_final)

        # Roth: contribute post-tax, tax-free withdrawal
        roth_final = annual_contribution * (1 - current_marginal_rate) * ((1 + expected_return) ** years - 1) / expected_return
        roth_values.append(roth_final)

    trad_values = np.array(trad_values)
    roth_values = np.array(roth_values)

    # Calculate break-even
    breakeven_idx = np.argmin(np.abs(trad_values - roth_values))
    breakeven_rate = retirement_rates[breakeven_idx]

    # Calculate values at expected retirement rate
    trad_at_expected = annual_contribution * ((1 + expected_return) ** years - 1) / expected_return * (1 - expected_retirement_rate)
    roth_at_expected = annual_contribution * (1 - current_marginal_rate) * ((1 + expected_return) ** years - 1) / expected_return

    # Clear chart
    chart_element = document.querySelector("#chart")
    chart_element.innerHTML = ""

    # Create figure
    fig, ax = plt.subplots(1, 1, dpi=200, figsize=(10, 6))

    ax.plot(retirement_rates * 100, trad_values / 1000, label='Traditional IRA', linewidth=2, color='blue')
    ax.plot(retirement_rates * 100, roth_values / 1000, label='Roth IRA', linewidth=2, color='green', linestyle='--')

    # Mark expected retirement rate
    ax.axvline(x=expected_retirement_rate * 100, color='orange', linewidth=2, linestyle=':', label=f'Expected Rate ({expected_retirement_rate*100:.0f}%)')

    # Shade win regions
    ax.fill_between(retirement_rates * 100, trad_values / 1000, roth_values / 1000,
                    where=(trad_values >= roth_values), alpha=0.2, color='blue', label='Traditional Wins')
    ax.fill_between(retirement_rates * 100, trad_values / 1000, roth_values / 1000,
                    where=(trad_values < roth_values), alpha=0.2, color='green', label='Roth Wins')

    ax.set_xlabel('Retirement Tax Rate (%)', fontsize=10, fontweight='bold')
    ax.set_ylabel('After-Tax Value ($k)', fontsize=10, fontweight='bold')
    ax.set_title('Traditional vs Roth: Tax Rate Sensitivity Analysis', fontsize=12, fontweight='bold')
    ax.legend(loc='upper right', fontsize=9)
    ax.grid(True, alpha=0.3)

    plt.tight_layout()

    # Export
    buf = BytesIO()
    fig.savefig(buf, format='png', dpi=200, bbox_inches='tight')
    buf.seek(0)
    img_data = base64.b64encode(buf.read()).decode()

    # Display
    img_html = f'<img id="chartImg" src="data:image/png;base64,{img_data}" alt="Trad vs Roth" style="max-width: 100%; height: auto; display: block;">'
    display(HTML(img_html), target="#chart")

    # Create interactive Plotly chart
    fig_plotly = go.Figure()

    # Add line traces
    fig_plotly.add_trace(go.Scatter(
        x=(retirement_rates * 100).tolist(),
        y=(trad_values / 1000).tolist(),
        mode='lines',
        name='Traditional IRA',
        line=dict(color='blue', width=2),
        hovertemplate='%{x:.1f}%<br>Traditional: $%{y:,.0f}k<extra></extra>'
    ))

    fig_plotly.add_trace(go.Scatter(
        x=(retirement_rates * 100).tolist(),
        y=(roth_values / 1000).tolist(),
        mode='lines',
        name='Roth IRA',
        line=dict(color='green', width=2, dash='dash'),
        hovertemplate='%{x:.1f}%<br>Roth: $%{y:,.0f}k<extra></extra>'
    ))

    # Add expected rate line
    fig_plotly.add_vline(
        x=expected_retirement_rate * 100,
        line_dash='dot',
        line_color='orange',
        line_width=2,
        annotation_text=f'Expected Rate ({expected_retirement_rate*100:.0f}%)'
    )

    # Add shaded regions for win areas
    fig_plotly.add_trace(go.Scatter(
        x=(retirement_rates * 100).tolist(),
        y=(trad_values / 1000).tolist(),
        fill=None,
        mode='none',
        showlegend=False,
        hoverinfo='skip'
    ))

    # Create fill between effect
    fig_plotly.add_trace(go.Scatter(
        x=(retirement_rates * 100).tolist(),
        y=np.maximum(trad_values, roth_values) / 1000,
        mode='lines',
        line_color='blue',
        fill='tonexty',
        fillcolor='rgba(0, 0, 255, 0.2)',
        name='Traditional Wins',
        hoverinfo='skip'
    ))

    fig_plotly.add_trace(go.Scatter(
        x=(retirement_rates * 100).tolist(),
        y=np.minimum(trad_values, roth_values) / 1000,
        mode='lines',
        line_color='rgba(0,100,0,0)',
        fill='tonexty',
        fillcolor='rgba(0, 128, 0, 0.2)',
        name='Roth Wins',
        hoverinfo='skip'
    ))

    fig_plotly.update_layout(
        title='Traditional vs Roth: Tax Rate Sensitivity Analysis',
        xaxis_title='Retirement Tax Rate (%)',
        yaxis_title='After-Tax Value ($k)',
        hovermode='x unified',
        height=500,
        autosize=True,
        legend=dict(x=0.02, y=0.98)
    )

    # Render Plotly chart
    plotly_element = document.querySelector("#plotlyChart")
    plotly_element.innerHTML = ""

    spec = fig_plotly.to_plotly_json()
    spec_json = json.dumps(spec)
    spec_js = JSON.parse(spec_json)

    config = {
        'displayModeBar': True,
        'displaylogo': False,
        'responsive': True,
        'modeBarButtonsToRemove': ['pan2d', 'lasso2d', 'select2d'],
        'toImageButtonOptions': {
            'format': 'png',
            'filename': 'trad-vs-roth-analysis',
            'height': 1200,
            'width': 1600,
            'scale': 2
        }
    }
    config_json = json.dumps(config)
    config_js = JSON.parse(config_json)

    Plotly.react(plotly_element, spec_js.data, spec_js.layout, config_js)

    # Summary
    winner = "Traditional" if trad_at_expected > roth_at_expected else "Roth"
    difference = abs(trad_at_expected - roth_at_expected)

    summary_html = f'''
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-top: 1.5rem;">
        <div style="padding: 1rem; border: 2px solid var(--border); background: var(--panel-bg);">
            <div style="font-size: 0.9rem; color: var(--muted); margin-bottom: 0.5rem;">Traditional at Expected Rate</div>
            <div style="font-size: 1.5rem; font-weight: bold; color: var(--accent);">${trad_at_expected:,.0f}</div>
        </div>
        <div style="padding: 1rem; border: 2px solid var(--border); background: var(--panel-bg);">
            <div style="font-size: 0.9rem; color: var(--muted); margin-bottom: 0.5rem;">Roth at Expected Rate</div>
            <div style="font-size: 1.5rem; font-weight: bold; color: var(--accent);">${roth_at_expected:,.0f}</div>
        </div>
        <div style="padding: 1rem; border: 2px solid var(--accent); background: var(--panel-bg);">
            <div style="font-size: 0.9rem; color: var(--muted); margin-bottom: 0.5rem;">Winner at Expected Rate</div>
            <div style="font-size: 1.5rem; font-weight: bold; color: var(--accent);">{winner}</div>
            <div style="font-size: 0.8rem; color: var(--muted); margin-top: 0.5rem;">by ${difference:,.0f}</div>
        </div>
    </div>

    <div style="margin-top: 1.5rem; padding: 1rem; border: 2px solid var(--accent); background: var(--panel-bg);">
        <div style="font-weight: bold; margin-bottom: 0.5rem; color: var(--accent);">Break-Even Analysis:</div>
        <ul style="margin: 0; padding-left: 1.5rem; color: var(--text);">
            <li>Break-even retirement tax rate: <strong>{breakeven_rate*100:.1f}%</strong></li>
            <li>If retirement rate < {breakeven_rate*100:.1f}%: <strong>Traditional</strong> wins</li>
            <li>If retirement rate > {breakeven_rate*100:.1f}%: <strong>Roth</strong> wins</li>
            <li>Your expected rate ({expected_retirement_rate*100:.0f}%): {winner} is better by <strong>${difference:,.0f}</strong></li>
        </ul>
    </div>
    '''
    display(HTML(summary_html), target="#summary")
