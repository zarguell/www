"""
Sequence of Returns Risk Explorer
Shows how return timing impacts final wealth.
"""

import numpy as np
import matplotlib.pyplot as plt
from pyscript import display, document, HTML
from io import BytesIO
import base64

plt.rcParams['figure.figsize'] = [10, 6]
plt.rcParams['figure.autolayout'] = True

def run_explorer(event=None):
    """Compare return sequences with identical average returns."""

    try:
        initial_portfolio = float(document.getElementById("initialPortfolio").value)
        annual_contribution = float(document.getElementById("annualContribution").value)
        time_horizon = int(document.getElementById("timeHorizon").value)
        target_return = float(document.getElementById("targetReturn").value)
        volatility = float(document.getElementById("volatility").value)

    except ValueError as e:
        display(HTML(f'<p style="color: var(--accent);">Invalid input: {str(e)}</p>'), target="#summary")
        return

    years = np.arange(0, time_horizon + 1)

    # Scenario 1: Good early (high returns first, low later)
    good_early_returns = np.full(time_horizon, target_return)
    good_early_returns[:int(time_horizon*0.4)] = target_return + volatility * 0.8
    good_early_returns[int(time_horizon*0.4):] = target_return - volatility * 0.4

    # Scenario 2: Bad early (low returns first, high later)
    bad_early_returns = np.full(time_horizon, target_return)
    bad_early_returns[:int(time_horizon*0.4)] = target_return - volatility * 0.8
    bad_early_returns[int(time_horizon*0.4):] = target_return + volatility * 0.4

    # Scenario 3: Steady returns
    steady_returns = np.full(time_horizon, target_return)

    # Scenario 4: Random walk
    random_returns = np.random.normal(target_return, volatility, time_horizon)

    # Calculate portfolios
    scenarios = [
        ('Good Early', good_early_returns, 'green'),
        ('Bad Early', bad_early_returns, 'red'),
        ('Steady', steady_returns, 'blue'),
        ('Random', random_returns, 'gray')
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
    buf = BytesIO()
    fig.savefig(buf, format='png', dpi=200, bbox_inches='tight')
    buf.seek(0)
    img_data = base64.b64encode(buf.read()).decode()

    # Display
    img_html = f'<img id="chartImg" src="data:image/png;base64,{img_data}" alt="Sequence Risk" style="max-width: 100%; height: auto; display: block;">'
    display(HTML(img_html), target="#chart")

    # Summary
    good_early_final = portfolios['Good Early'][-1]
    bad_early_final = portfolios['Bad Early'][-1]
    steady_final = portfolios['Steady'][-1]
    random_final = portfolios['Random'][-1]
    difference = good_early_final - bad_early_final

    summary_html = f'''
    <div style="padding: 1rem; border: 2px solid var(--border); background: var(--panel-bg); margin-top: 1.5rem;">
        <div style="font-weight: bold; margin-bottom: 1rem; color: var(--accent);">Final Portfolio Values:</div>
        <table style="width: 100%; text-align: left; border-collapse: collapse;">
            <tr><td style="padding: 0.5rem; color: green; font-weight: bold;">Good Early:</td><td style="padding: 0.5rem;">${good_early_final:,.0f}</td></tr>
            <tr><td style="padding: 0.5rem; color: red; font-weight: bold;">Bad Early:</td><td style="padding: 0.5rem;">${bad_early_final:,.0f}</td></tr>
            <tr><td style="padding: 0.5rem; color: blue; font-weight: bold;">Steady:</td><td style="padding: 0.5rem;">${steady_final:,.0f}</td></tr>
            <tr><td style="padding: 0.5rem; color: gray; font-weight: bold;">Random:</td><td style="padding: 0.5rem;">${random_final:,.0f}</td></tr>
        </table>
        <div style="margin-top: 1rem; padding-top: 1rem; border-top: 2px solid var(--accent);">
            <strong>Key Insight:</strong> Good early vs Bad early difference = <strong>${difference:,.0f}</strong>
            (<strong>{difference/bad_early_final*100:.1f}%</strong> more wealth). Early retirement returns matter more!
        </div>
    </div>
    '''
    display(HTML(summary_html), target="#summary")
