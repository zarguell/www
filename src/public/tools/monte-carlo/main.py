"""
Monte Carlo Retirement Projection Lab
Demonstrates sequence-of-returns risk and portfolio survival probabilities.
"""

import numpy as np
import matplotlib.pyplot as plt
from pyscript import display, document, HTML
from io import BytesIO
import base64

# Configure matplotlib for responsive output
plt.rcParams['figure.figsize'] = [10, 8]
plt.rcParams['figure.autolayout'] = True

def run_simulation(event=None):
    """
    Run Monte Carlo simulation of retirement portfolio growth and withdrawals.
    Demonstrates sequence-of-returns risk during accumulation and retirement.
    """

    # Read inputs
    try:
        current_age = int(document.getElementById("currentAge").value)
        retirement_age = int(document.getElementById("retirementAge").value)
        current_portfolio = float(document.getElementById("currentPortfolio").value)
        annual_contribution = float(document.getElementById("annualContribution").value)
        stock_allocation = float(document.getElementById("stockAllocation").value)
        bond_allocation = float(document.getElementById("bondAllocation").value)
        expected_stock_return = float(document.getElementById("stockReturn").value)
        expected_bond_return = float(document.getElementById("bondReturn").value)
        stock_volatility = float(document.getElementById("stockVolatility").value)
        bond_volatility = float(document.getElementById("bondVolatility").value)
        correlation = float(document.getElementById("correlation").value)
        withdrawal_rate = float(document.getElementById("withdrawalRate").value)
        num_simulations = int(document.getElementById("numSimulations").value)

        # Validate inputs
        if current_age >= retirement_age:
            display(HTML('<p style="color: var(--accent);">Retirement age must be greater than current age.</p>'), target="#summary")
            return

        if abs(stock_allocation + bond_allocation - 1.0) > 0.01:
            display(HTML('<p style="color: var(--accent);">Stock + Bond allocation must equal 100%.</p>'), target="#summary")
            return

        if num_simulations < 10 or num_simulations > 10000:
            display(HTML('<p style="color: var(--accent);">Number of simulations must be between 10 and 10,000.</p>'), target="#summary")
            return

    except ValueError as e:
        display(HTML(f'<p style="color: var(--accent);">Invalid input: {str(e)}</p>'), target="#summary")
        return

    # Calculate portfolio parameters
    expected_portfolio_return = (stock_allocation * expected_stock_return +
                                 bond_allocation * expected_bond_return)

    # Portfolio volatility with correlation
    portfolio_variance = (stock_allocation ** 2 * stock_volatility ** 2 +
                          bond_allocation ** 2 * bond_volatility ** 2 +
                          2 * stock_allocation * bond_allocation *
                          stock_volatility * bond_volatility * correlation)
    portfolio_volatility = np.sqrt(portfolio_variance)

    # Time periods
    accumulation_years = retirement_age - current_age
    retirement_years = 95 - retirement_age
    total_years = accumulation_years + retirement_years
    ages = np.arange(current_age, 95 + 1)

    # Generate correlated returns for all simulations
    # Using Cholesky decomposition for correlated returns
    cov_matrix = np.array([
        [stock_volatility ** 2, stock_volatility * bond_volatility * correlation],
        [stock_volatility * bond_volatility * correlation, bond_volatility ** 2]
    ])

    # Try Cholesky decomposition, fall back to diagonal if correlation is too high
    try:
        L = np.linalg.cholesky(cov_matrix)
    except np.linalg.LinAlgError:
        # If correlation matrix is not positive semi-definite, use diagonal
        L = np.diag([stock_volatility, bond_volatility])

    # Generate random normal samples
    # Shape: (num_simulations, total_years, 2) for stock and bond returns
    random_shocks = np.random.standard_normal((num_simulations, total_years, 2))

    # Apply Cholesky to get correlated returns
    correlated_shocks = np.zeros_like(random_shocks)
    for i in range(num_simulations):
        for j in range(total_years):
            correlated_shocks[i, j] = L @ random_shocks[i, j]

    stock_returns = expected_stock_return + correlated_shocks[:, :, 0]
    bond_returns = expected_bond_return + correlated_shocks[:, :, 1]

    # Calculate portfolio returns
    portfolio_returns = (stock_allocation * stock_returns +
                         bond_allocation * bond_returns)

    # Run simulations
    portfolio_values = np.zeros((num_simulations, total_years + 1))
    portfolio_values[:, 0] = current_portfolio

    for year in range(total_years):
        age = current_age + year

        if age < retirement_age:
            # Accumulation phase: add contribution
            portfolio_values[:, year + 1] = (
                portfolio_values[:, year] * (1 + portfolio_returns[:, year]) +
                annual_contribution
            )
        else:
            # Retirement phase: withdraw
            withdrawal_amount = portfolio_values[:, year] * withdrawal_rate
            portfolio_values[:, year + 1] = (
                portfolio_values[:, year] * (1 + portfolio_returns[:, year]) -
                withdrawal_amount
            )

        # Ensure no negative balances
        portfolio_values[:, year + 1] = np.maximum(portfolio_values[:, year + 1], 0)

    # Calculate statistics
    final_values = portfolio_values[:, -1]
    median_final = np.median(final_values)
    percentile_10 = np.percentile(final_values, 10)
    percentile_90 = np.percentile(final_values, 90)

    # Success rate: portfolio > 0 at age 95
    success_count = np.sum(final_values > 0)
    success_rate = success_count / num_simulations

    # Worst case (5th percentile)
    worst_case = np.percentile(final_values, 5)

    # Clear previous chart
    chart_element = document.querySelector("#chart")
    chart_element.innerHTML = ""

    # Create figure with two subplots
    fig, (ax1, ax2) = plt.subplots(2, 1, dpi=200, figsize=(10, 10))

    # Plot 1: Sample simulation paths (show first 50 to avoid clutter)
    sample_indices = np.random.choice(num_simulations, min(50, num_simulations), replace=False)
    for i in sample_indices:
        ax1.plot(ages, portfolio_values[i, :], alpha=0.3, linewidth=0.8)

    # Add median, 10th, and 90th percentile lines
    median_path = np.median(portfolio_values, axis=0)
    percentile_10_path = np.percentile(portfolio_values, 10, axis=0)
    percentile_90_path = np.percentile(portfolio_values, 90, axis=0)

    ax1.plot(ages, median_path, color='blue', linewidth=2, label='Median', linestyle='--')
    ax1.plot(ages, percentile_10_path, color='red', linewidth=1.5, label='10th Percentile', linestyle=':')
    ax1.plot(ages, percentile_90_path, color='green', linewidth=1.5, label='90th Percentile', linestyle=':')

    # Mark retirement age
    ax1.axvline(x=retirement_age, color='orange', linewidth=2, linestyle='-', label='Retirement')
    ax1.axvline(x=95, color='gray', linewidth=1, linestyle='--', alpha=0.5)

    ax1.set_xlabel('Age', fontsize=10, fontweight='bold')
    ax1.set_ylabel('Portfolio Value ($)', fontsize=10, fontweight='bold')
    ax1.set_title(f'Monte Carlo Retirement Simulation ({num_simulations} paths shown: 50 sample)',
                  fontsize=12, fontweight='bold')
    ax1.legend(loc='upper left', fontsize=8)
    ax1.grid(True, alpha=0.3)

    # Format y-axis as currency
    ax1.yaxis.set_major_formatter(plt.FuncFormatter(lambda x, p: f'${x/1000000:.1f}M'))

    # Plot 2: Histogram of final portfolio values
    ax2.hist(final_values, bins=50, alpha=0.7, color='steelblue', edgecolor='black')
    ax2.axvline(median_final, color='blue', linewidth=2, linestyle='--', label=f'Median: ${median_final:,.0f}')
    ax2.axvline(percentile_10, color='red', linewidth=1.5, linestyle=':', label=f'10th %ile: ${percentile_10:,.0f}')
    ax2.axvline(percentile_90, color='green', linewidth=1.5, linestyle=':', label=f'90th %ile: ${percentile_90:,.0f}')
    ax2.axvline(0, color='gray', linewidth=2, linestyle='-', alpha=0.5)

    ax2.set_xlabel('Final Portfolio Value at Age 95 ($)', fontsize=10, fontweight='bold')
    ax2.set_ylabel('Frequency', fontsize=10, fontweight='bold')
    ax2.set_title('Distribution of Final Portfolio Values', fontsize=12, fontweight='bold')
    ax2.legend(loc='upper right', fontsize=8)
    ax2.grid(True, alpha=0.3, axis='y')

    # Format x-axis as currency
    ax2.xaxis.set_major_formatter(plt.FuncFormatter(lambda x, p: f'${x/1000000:.1f}M'))

    plt.tight_layout()

    # Export to base64 PNG
    buf = BytesIO()
    fig.savefig(buf, format='png', dpi=200, bbox_inches='tight')
    buf.seek(0)
    img_data = base64.b64encode(buf.read()).decode()

    # Display chart
    img_html = f'''
    <img id="chartImg"
         src="data:image/png;base64,{img_data}"
         alt="Monte Carlo Simulation Results"
         style="max-width: 100%; height: auto; display: block;">
    '''
    display(HTML(img_html), target="#chart")

    # Display summary statistics
    summary_html = f'''
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-top: 1.5rem;">
        <div style="padding: 1rem; border: 2px solid var(--border); background: var(--panel-bg);">
            <div style="font-size: 0.9rem; color: var(--muted); margin-bottom: 0.5rem;">Median Final Value</div>
            <div style="font-size: 1.5rem; font-weight: bold; color: var(--accent);">${median_final:,.0f}</div>
        </div>
        <div style="padding: 1rem; border: 2px solid var(--border); background: var(--panel-bg);">
            <div style="font-size: 0.9rem; color: var(--muted); margin-bottom: 0.5rem;">Success Rate (to age 95)</div>
            <div style="font-size: 1.5rem; font-weight: bold; color: var(--accent);">{success_rate*100:.1f}%</div>
        </div>
        <div style="padding: 1rem; border: 2px solid var(--border); background: var(--panel-bg);">
            <div style="font-size: 0.9rem; color: var(--muted); margin-bottom: 0.5rem;">5th Percentile (Worst Case)</div>
            <div style="font-size: 1.5rem; font-weight: bold; color: var(--accent);">${worst_case:,.0f}</div>
        </div>
        <div style="padding: 1rem; border: 2px solid var(--border); background: var(--panel-bg);">
            <div style="font-size: 0.9rem; color: var(--muted); margin-bottom: 0.5rem;">10th-90th Percentile Range</div>
            <div style="font-size: 1.5rem; font-weight: bold; color: var(--accent);">${percentile_10:,.0f} - ${percentile_90:,.0f}</div>
        </div>
    </div>

    <div style="margin-top: 1.5rem; padding: 1rem; border: 2px solid var(--accent); background: var(--panel-bg);">
        <div style="font-weight: bold; margin-bottom: 0.5rem; color: var(--accent);">Key Insights:</div>
        <ul style="margin: 0; padding-left: 1.5rem; color: var(--text);">
            <li>Your portfolio has a <strong>{success_rate*100:.1f}% chance</strong> of lasting to age 95</li>
            <li>The median outcome is <strong>${median_final:,.0f}</strong> at age 95</li>
            <li>10% of outcomes result in less than <strong>${percentile_10:,.0f}</strong> (sequence-of-returns risk)</li>
            <li>10% of outcomes exceed <strong>${percentile_90:,.0f}</strong> (favorable sequences)</li>
            <li>Portfolio volatility: <strong>{portfolio_volatility*100:.1f}%</strong> (based on allocation and correlation)</li>
        </ul>
    </div>
    '''
    display(HTML(summary_html), target="#summary")
