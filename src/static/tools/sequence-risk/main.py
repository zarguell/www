"""
Sequence of Returns Risk Explorer
Shows how return timing impacts final wealth.
"""

import numpy as np
import matplotlib.pyplot as plt
from pyscript import display, document, HTML
from chart_helpers import chart_img, setup_style

setup_style((10, 6))

def run_explorer(event=None):
    """Compare return sequences with identical average returns."""

    try:
        initial_portfolio = float(document.getElementById("initialPortfolio").value)
        annual_contribution = float(document.getElementById("annualContribution").value)
        time_horizon = int(document.getElementById("timeHorizon").value)
        target_return = float(document.getElementById("targetReturn").value)
        volatility = float(document.getElementById("volatility").value)

    except ValueError as e:
        display(HTML(f'<p class="notice notice--error">Invalid input: {str(e)}</p>'), target="#summary")
        return

    years = np.arange(0, time_horizon + 1)

    # Offsets are weighted so each scenario's AVERAGE return is exactly
    # target_return: with n years and k = int(n*0.4) early years, the early
    # years get +((n-k)/n)*sigma and the later years -(k/n)*sigma. For n a
    # multiple of 5 that is +0.6*sigma on 40% of years and -0.4*sigma on 60%.
    early_years = int(time_horizon * 0.4)
    early_offset = volatility * (time_horizon - early_years) / time_horizon
    late_offset = -volatility * early_years / time_horizon

    # Scenario 1: Good early (high returns first, low later)
    good_early_returns = np.full(time_horizon, target_return)
    good_early_returns[:early_years] = target_return + early_offset
    good_early_returns[early_years:] = target_return + late_offset

    # Scenario 2: Bad early (low returns first, high later) — mirrored
    bad_early_returns = np.full(time_horizon, target_return)
    bad_early_returns[:early_years] = target_return - early_offset
    bad_early_returns[early_years:] = target_return - late_offset

    # Scenario 3: Steady returns
    steady_returns = np.full(time_horizon, target_return)

    # Scenario 4: Random walk
    random_returns = np.random.normal(target_return, volatility, time_horizon)

    # Calculate portfolios
    scenarios = [
        ('Good Early', good_early_returns, '#7ee2a8'),
        ('Bad Early', bad_early_returns, '#e28a8a'),
        ('Steady', steady_returns, '#c9c9c9'),
        ('Random', random_returns, '#9a9a9a')
    ]

    portfolios = {}
    for name, returns, color in scenarios:
        portfolio = np.zeros(time_horizon + 1)
        portfolio[0] = initial_portfolio
        for year in range(time_horizon):
            portfolio[year + 1] = portfolio[year] * (1 + returns[year]) + annual_contribution
        portfolios[name] = portfolio

    # Clear chart
    chart_element = document.querySelector("#chart")
    chart_element.innerHTML = ""

    # Create figure
    fig, ax = plt.subplots(1, 1, dpi=200, figsize=(10, 6))

    for name, returns, color in scenarios:
        ax.plot(years, portfolios[name] / 1000, label=name, linewidth=2, color=color)

    ax.set_xlabel('Year', fontsize=10, fontweight='bold')
    ax.set_ylabel('Portfolio Value ($k)', fontsize=10, fontweight='bold')
    ax.set_title('Sequence of Returns Risk: Same Average Return, Different Outcomes', fontsize=12, fontweight='bold')
    ax.legend(loc='upper left', fontsize=10)
    ax.grid(True, alpha=0.3)

    # Format y-axis
    ax.yaxis.set_major_formatter(plt.FuncFormatter(lambda x, p: f'${x}k'))

    plt.tight_layout()

    # Export
    # Display
    display(HTML(chart_img(fig, 'Sequence Risk')), target="#chart")

    # Summary
    good_early_final = portfolios['Good Early'][-1]
    bad_early_final = portfolios['Bad Early'][-1]
    steady_final = portfolios['Steady'][-1]
    random_final = portfolios['Random'][-1]
    difference = good_early_final - bad_early_final

    summary_html = f'''
    <div class="result-card result-card--spaced">
        <div class="insight-title">Final Portfolio Values:</div>
        <table class="data-table">
            <tr><td class="cell positive">Good Early:</td><td class="cell">${good_early_final:,.0f}</td></tr>
            <tr><td class="cell negative">Bad Early:</td><td class="cell">${bad_early_final:,.0f}</td></tr>
            <tr><td class="cell info">Steady:</td><td class="cell">${steady_final:,.0f}</td></tr>
            <tr><td class="cell neutral">Random:</td><td class="cell">${random_final:,.0f}</td></tr>
        </table>
        <div class="section-break section-break--accent">
            <strong>Key Insight:</strong> Good early vs Bad early difference = <strong>${difference:,.0f}</strong>
            (<strong>{difference/bad_early_final*100:.1f}%</strong> more wealth). Early retirement returns matter more!
        </div>
    </div>
    '''
    display(HTML(summary_html), target="#summary")
