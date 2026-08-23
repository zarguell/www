"""
Safe Withdrawal Rate Comparison Tool
Compares three withdrawal strategies: Constant, Percentage, and Guardrails.
"""

import numpy as np
import matplotlib.pyplot as plt
from pyscript import display, document, HTML
from chart_helpers import chart_img, setup_style

# Configure matplotlib for responsive output
setup_style((10, 10))

def run_simulation(event=None):
    """
    Run withdrawal strategy comparison simulation.
    """

    # Read inputs
    try:
        portfolio_value = float(document.getElementById("portfolioValue").value)
        withdrawal_rate = float(document.getElementById("withdrawalRate").value)
        time_horizon = int(document.getElementById("timeHorizon").value)
        stock_allocation = float(document.getElementById("stockAllocation").value)
        bond_allocation = float(document.getElementById("bondAllocation").value)
        expected_stock_return = float(document.getElementById("stockReturn").value)
        expected_bond_return = float(document.getElementById("bondReturn").value)
        stock_volatility = float(document.getElementById("stockVolatility").value)
        bond_volatility = float(document.getElementById("bondVolatility").value)
        num_simulations = int(document.getElementById("numSimulations").value)

        # Validate
        if abs(stock_allocation + bond_allocation - 1.0) > 0.01:
            display(HTML('<p style="color: var(--accent);">Stock + Bond allocation must equal 100%.</p>'), target="#summary")
            return

        if num_simulations < 100 or num_simulations > 5000:
            display(HTML('<p style="color: var(--accent);">Number of simulations must be between 100 and 5,000.</p>'), target="#summary")
            return

    except ValueError as e:
        display(HTML(f'<p style="color: var(--accent);">Invalid input: {str(e)}</p>'), target="#summary")
        return

    # Portfolio parameters
    expected_return = (stock_allocation * expected_stock_return +
                       bond_allocation * expected_bond_return)
    volatility = np.sqrt(stock_allocation**2 * stock_volatility**2 +
                          bond_allocation**2 * bond_volatility**2)

    # Generate returns for all simulations
    returns = np.random.normal(expected_return, volatility, (num_simulations, time_horizon))

    # Initial withdrawal amount
    initial_withdrawal = portfolio_value * withdrawal_rate

    # Strategy 1: Constant Dollar (inflation-adjusted)
    constant_balances = np.zeros((num_simulations, time_horizon + 1))
    constant_balances[:, 0] = portfolio_value
    constant_withdrawals = np.zeros((num_simulations, time_horizon))

    for sim in range(num_simulations):
        for year in range(time_horizon):
            withdrawal = initial_withdrawal  # Constant in real terms
            constant_withdrawals[sim, year] = withdrawal
            constant_balances[sim, year + 1] = max(0, constant_balances[sim, year] * (1 + returns[sim, year]) - withdrawal)

    # Strategy 2: Percentage of Portfolio
    percentage_balances = np.zeros((num_simulations, time_horizon + 1))
    percentage_balances[:, 0] = portfolio_value
    percentage_withdrawals = np.zeros((num_simulations, time_horizon))

    for sim in range(num_simulations):
        for year in range(time_horizon):
            withdrawal = percentage_balances[sim, year] * withdrawal_rate
            percentage_withdrawals[sim, year] = withdrawal
            percentage_balances[sim, year + 1] = max(0, percentage_balances[sim, year] * (1 + returns[sim, year]) - withdrawal)

    # Strategy 3: Guardrails (adjust if portfolio deviates >20% from expected)
    guardrails_balances = np.zeros((num_simulations, time_horizon + 1))
    guardrails_balances[:, 0] = portfolio_value
    guardrails_withdrawals = np.zeros((num_simulations, time_horizon))

    # Expected portfolio path (deterministic)
    expected_path = np.zeros(time_horizon + 1)
    expected_path[0] = portfolio_value
    for year in range(time_horizon):
        expected_path[year + 1] = expected_path[year] * (1 + expected_return) - initial_withdrawal

    for sim in range(num_simulations):
        current_rate = withdrawal_rate
        for year in range(time_horizon):
            withdrawal = guardrails_balances[sim, year] * current_rate

            # Check guardrails
            expected_value = expected_path[year]
            actual_value = guardrails_balances[sim, year]

            if actual_value > expected_value * 1.2:
                # Portfolio > 20% above expected: increase withdrawal
                current_rate = min(withdrawal_rate * 1.1, 0.06)  # Cap at 6%
            elif actual_value < expected_value * 0.8:
                # Portfolio < 80% of expected: decrease withdrawal
                current_rate = max(withdrawal_rate * 0.9, 0.02)  # Floor at 2%

            withdrawal = guardrails_balances[sim, year] * current_rate
            guardrails_withdrawals[sim, year] = withdrawal
            guardrails_balances[sim, year + 1] = max(0, guardrails_balances[sim, year] * (1 + returns[sim, year]) - withdrawal)

    # Calculate success rates
    constant_success = np.sum(constant_balances[:, -1] > 0) / num_simulations
    percentage_success = np.sum(percentage_balances[:, -1] > 0) / num_simulations
    guardrails_success = np.sum(guardrails_balances[:, -1] > 0) / num_simulations

    # Calculate median balances
    constant_median = np.median(constant_balances, axis=0)
    percentage_median = np.median(percentage_balances, axis=0)
    guardrails_median = np.median(guardrails_balances, axis=0)

    # Calculate withdrawal volatility (standard deviation across years)
    constant_vol = np.std(constant_withdrawals, axis=1).mean()
    percentage_vol = np.std(percentage_withdrawals, axis=1).mean()
    guardrails_vol = np.std(guardrails_withdrawals, axis=1).mean()

    # Clear previous chart
    chart_element = document.querySelector("#chart")
    chart_element.innerHTML = ""

    # Create figure with three subplots
    fig, (ax1, ax2, ax3) = plt.subplots(3, 1, dpi=200, figsize=(10, 12))

    years = np.arange(0, time_horizon + 1)

    # Plot 1: Median balances over time
    ax1.plot(years, constant_median / 1000, label='Constant Dollar', linewidth=2, color='blue')
    ax1.plot(years, percentage_median / 1000, label='Percentage of Portfolio', linewidth=2, color='green')
    ax1.plot(years, guardrails_median / 1000, label='Guardrails', linewidth=2, color='orange')
    ax1.axhline(y=0, color='red', linewidth=1, linestyle='--', alpha=0.5)
    ax1.set_xlabel('Year', fontsize=10, fontweight='bold')
    ax1.set_ylabel('Median Portfolio Value ($k)', fontsize=10, fontweight='bold')
    ax1.set_title('Median Portfolio Balance by Withdrawal Strategy', fontsize=12, fontweight='bold')
    ax1.legend(loc='upper right', fontsize=9)
    ax1.grid(True, alpha=0.3)

    # Plot 2: Success rate comparison
    strategies = ['Constant\nDollar', 'Percentage\nof Portfolio', 'Guardrails']
    success_rates = [constant_success, percentage_success, guardrails_success]
    colors = ['blue', 'green', 'orange']
    bars = ax2.bar(strategies, [sr * 100 for sr in success_rates], color=colors, alpha=0.7, edgecolor='black')

    # Add percentage labels on bars
    for bar, sr in zip(bars, success_rates):
        height = bar.get_height()
        ax2.text(bar.get_x() + bar.get_width()/2., height,
                f'{sr*100:.1f}%',
                ha='center', va='bottom', fontweight='bold', fontsize=10)

    ax2.set_ylabel('Success Rate (%)', fontsize=10, fontweight='bold')
    ax2.set_title(f'Portfolio Survival Rate ({time_horizon} years)', fontsize=12, fontweight='bold')
    ax2.set_ylim(0, 105)
    ax2.grid(True, alpha=0.3, axis='y')

    # Plot 3: Withdrawal volatility
    vols = [constant_vol, percentage_vol, guardrails_vol]
    bars2 = ax3.bar(strategies, vols, color=colors, alpha=0.7, edgecolor='black')

    for bar, vol in zip(bars2, vols):
        height = bar.get_height()
        ax3.text(bar.get_x() + bar.get_width()/2., height,
                f'${vol:,.0f}',
                ha='center', va='bottom', fontweight='bold', fontsize=10)

    ax3.set_ylabel('Std Dev of Withdrawals ($)', fontsize=10, fontweight='bold')
    ax3.set_title('Withdrawal Amount Volatility (Lower = More Stable)', fontsize=12, fontweight='bold')
    ax3.grid(True, alpha=0.3, axis='y')

    plt.tight_layout()

    # Display chart
    display(HTML(chart_img(fig, 'Safe Withdrawal Rate Comparison')), target="#chart")

    # Display summary
    summary_html = f'''
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-top: 1.5rem;">
        <div style="padding: 1rem; border: 2px solid var(--border); background: var(--panel);">
            <div style="font-size: 0.9rem; color: var(--muted); margin-bottom: 0.5rem;">Constant Dollar Success</div>
            <div style="font-size: 1.5rem; font-weight: bold; color: var(--accent);">{constant_success*100:.1f}%</div>
            <div style="font-size: 0.8rem; color: var(--muted); margin-top: 0.5rem;">${initial_withdrawal:,.0f}/year fixed</div>
        </div>
        <div style="padding: 1rem; border: 2px solid var(--border); background: var(--panel);">
            <div style="font-size: 0.9rem; color: var(--muted); margin-bottom: 0.5rem;">Percentage Success</div>
            <div style="font-size: 1.5rem; font-weight: bold; color: var(--accent);">{percentage_success*100:.1f}%</div>
            <div style="font-size: 0.8rem; color: var(--muted); margin-top: 0.5rem;">{withdrawal_rate*100:.1f}% of portfolio</div>
        </div>
        <div style="padding: 1rem; border: 2px solid var(--border); background: var(--panel);">
            <div style="font-size: 0.9rem; color: var(--muted); margin-bottom: 0.5rem;">Guardrails Success</div>
            <div style="font-size: 1.5rem; font-weight: bold; color: var(--accent);">{guardrails_success*100:.1f}%</div>
            <div style="font-size: 0.8rem; color: var(--muted); margin-top: 0.5rem;">Dynamic +/-20% bands</div>
        </div>
    </div>

    <div style="margin-top: 1.5rem; padding: 1rem; border: 2px solid var(--accent); background: var(--panel);">
        <div style="font-weight: bold; margin-bottom: 0.5rem; color: var(--accent);">Strategy Comparison:</div>
        <ul style="margin: 0; padding-left: 1.5rem; color: var(--text);">
            <li><strong>Constant Dollar:</strong> Stable income, highest failure risk if portfolio declines early</li>
            <li><strong>Percentage of Portfolio:</strong> Never depletes, but income fluctuates with market</li>
            <li><strong>Guardrails:</strong> Balance between stability and flexibility, adjusts to market conditions</li>
        </ul>
        <div style="margin-top: 1rem; padding-top: 1rem; border-top: 1px solid var(--border);">
            <strong>Withdrawal Volatility:</strong> Constant=${constant_vol:,.0f}, Percentage=${percentage_vol:,.0f}, Guardrails=${guardrails_vol:,.0f}
        </div>
    </div>
    '''
    display(HTML(summary_html), target="#summary")
