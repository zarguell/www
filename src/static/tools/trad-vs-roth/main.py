import micropip
await micropip.install("/assets/python/plotly-7.1.0-py3-none-any.whl")

"""
Traditional vs Roth Analyzer
Compares after-tax outcomes across different future tax rates.
"""

import numpy as np
import matplotlib.pyplot as plt
import plotly.graph_objects as go
from pyscript import display, document, HTML
from chart_helpers import chart_img, render_plotly, setup_style

setup_style((10, 6))

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
            display(HTML('<p class="notice notice--error">Retirement age must be greater than current age.</p>'), target="#summary")
            return

    except ValueError as e:
        display(HTML(f'<p class="notice notice--error">Invalid input: {str(e)}</p>'), target="#summary")
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

    ax.plot(retirement_rates * 100, trad_values / 1000, label='Traditional IRA', linewidth=2, color='#c9c9c9')
    ax.plot(retirement_rates * 100, roth_values / 1000, label='Roth IRA', linewidth=2, color='#7ee2a8', linestyle='--')

    # Mark expected retirement rate
    ax.axvline(x=expected_retirement_rate * 100, color='#e2c07e', linewidth=2, linestyle=':', label=f'Expected Rate ({expected_retirement_rate*100:.0f}%)')

    # Shade win regions
    ax.fill_between(retirement_rates * 100, trad_values / 1000, roth_values / 1000,
                    where=(trad_values >= roth_values), alpha=0.2, color='#c9c9c9', label='Traditional Wins')
    ax.fill_between(retirement_rates * 100, trad_values / 1000, roth_values / 1000,
                    where=(trad_values < roth_values), alpha=0.2, color='#7ee2a8', label='Roth Wins')

    ax.set_xlabel('Retirement Tax Rate (%)', fontsize=10, fontweight='bold')
    ax.set_ylabel('After-Tax Value ($k)', fontsize=10, fontweight='bold')
    ax.set_title('Traditional vs Roth: Tax Rate Sensitivity Analysis', fontsize=12, fontweight='bold')
    ax.legend(loc='upper right', fontsize=9)
    ax.grid(True, alpha=0.3)

    plt.tight_layout()

    # Export
    # Display
    display(HTML(chart_img(fig, 'Trad vs Roth')), target="#chart")

    # Create interactive Plotly chart
    fig_plotly = go.Figure()

    # Add line traces
    fig_plotly.add_trace(go.Scatter(
        x=(retirement_rates * 100).tolist(),
        y=(trad_values / 1000).tolist(),
        mode='lines',
        name='Traditional IRA',
        line=dict(color='#c9c9c9', width=2),
        hovertemplate='%{x:.1f}%<br>Traditional: $%{y:,.0f}k<extra></extra>'
    ))

    fig_plotly.add_trace(go.Scatter(
        x=(retirement_rates * 100).tolist(),
        y=(roth_values / 1000).tolist(),
        mode='lines',
        name='Roth IRA',
        line=dict(color='#7ee2a8', width=2, dash='dash'),
        hovertemplate='%{x:.1f}%<br>Roth: $%{y:,.0f}k<extra></extra>'
    ))

    # Add expected rate line
    fig_plotly.add_vline(
        x=expected_retirement_rate * 100,
        line_dash='dot',
        line_color='#e2c07e',
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
        line_color='#c9c9c9',
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

    render_plotly(fig_plotly, plotly_element, 'trad-vs-roth-analysis')

    # Summary
    winner = "Traditional" if trad_at_expected > roth_at_expected else "Roth"
    difference = abs(trad_at_expected - roth_at_expected)

    summary_html = f'''
    <div class="result-grid">
        <div class="result-card">
            <div class="result-label">Traditional at Expected Rate</div>
            <div class="result-value">${trad_at_expected:,.0f}</div>
        </div>
        <div class="result-card">
            <div class="result-label">Roth at Expected Rate</div>
            <div class="result-value">${roth_at_expected:,.0f}</div>
        </div>
        <div class="result-card result-card--accent">
            <div class="result-label">Winner at Expected Rate</div>
            <div class="result-value">{winner}</div>
            <div class="result-note">by ${difference:,.0f}</div>
        </div>
    </div>

    <div class="insight-box">
        <div class="insight-title">Break-Even Analysis:</div>
        <ul class="list-plain">
            <li>Break-even retirement tax rate: <strong>{breakeven_rate*100:.1f}%</strong></li>
            <li>If retirement rate < {breakeven_rate*100:.1f}%: <strong>Traditional</strong> wins</li>
            <li>If retirement rate > {breakeven_rate*100:.1f}%: <strong>Roth</strong> wins</li>
            <li>Your expected rate ({expected_retirement_rate*100:.0f}%): {winner} is better by <strong>${difference:,.0f}</strong></li>
        </ul>
    </div>
    '''
    display(HTML(summary_html), target="#summary")
