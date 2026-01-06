"""
Expense Ratio Impact Visualizer
Demonstrates the long-term cost of high expense ratios.
"""

import numpy as np
import matplotlib.pyplot as plt
from pyscript import display, document, HTML
from io import BytesIO
import base64

plt.rcParams['figure.figsize'] = [10, 8]
plt.rcParams['figure.autolayout'] = True

def calculate_impact(event=None):
    """
    Calculate and visualize expense ratio impact over time.
    """

    try:
        starting_balance = float(document.getElementById("startingBalance").value)
        annual_contribution = float(document.getElementById("annualContribution").value)
        time_horizon = int(document.getElementById("timeHorizon").value)
        gross_return = float(document.getElementById("grossReturn").value)
        fund_a_er = float(document.getElementById("fundAer").value)
        fund_b_er = float(document.getElementById("fundBer").value)

        if fund_a_er < 0.0003 or fund_a_er > 0.02:
            display(HTML('<p style="color: var(--accent);">Fund A expense ratio must be between 0.03% and 2.0%.</p>'), target="#summary")
            return

        if fund_b_er < 0.0003 or fund_b_er > 0.02:
            display(HTML('<p style="color: var(--accent);">Fund B expense ratio must be between 0.03% and 2.0%.</p>'), target="#summary")
            return

    except ValueError as e:
        display(HTML(f'<p style="color: var(--accent);">Invalid input: {str(e)}</p>'), target="#summary")
        return

    years = np.arange(0, time_horizon + 1)

    # Calculate year-by-year for both funds
    balance_a = np.zeros(time_horizon + 1)
    balance_b = np.zeros(time_horizon + 1)
    fees_a = np.zeros(time_horizon + 1)
    fees_b = np.zeros(time_horizon + 1)

    balance_a[0] = starting_balance
    balance_b[0] = starting_balance
    fees_a[0] = 0
    fees_b[0] = 0

    net_return_a = gross_return - fund_a_er
    net_return_b = gross_return - fund_b_er

    for year in range(time_horizon):
        # Fund A
        fee_a = balance_a[year] * fund_a_er
        balance_a[year + 1] = balance_a[year] * (1 + net_return_a) + annual_contribution
        fees_a[year + 1] = fees_a[year] + fee_a

        # Fund B
        fee_b = balance_b[year] * fund_b_er
        balance_b[year + 1] = balance_b[year] * (1 + net_return_b) + annual_contribution
        fees_b[year + 1] = fees_b[year] + fee_b

    final_balance_a = balance_a[-1]
    final_balance_b = balance_b[-1]
    total_fees_a = fees_a[-1]
    total_fees_b = fees_b[-1]

    difference = final_balance_b - final_balance_a
    percent_lost = (difference / final_balance_b) * 100 if final_balance_b > 0 else 0
    extra_fees = total_fees_b - total_fees_a

    # Clear chart
    chart_element = document.querySelector("#chart")
    chart_element.innerHTML = ""

    # Create figure
    fig, (ax1, ax2) = plt.subplots(2, 1, dpi=200, figsize=(10, 10))

    # Plot 1: Portfolio growth comparison
    ax1.plot(years, balance_a / 1000, label=f'Fund A ({fund_a_er*100:.2f}%)', linewidth=2, color='green')
    ax1.plot(years, balance_b / 1000, label=f'Fund B ({fund_b_er*100:.2f}%)', linewidth=2, color='red', linestyle='--')

    ax1.set_xlabel('Year', fontsize=10, fontweight='bold')
    ax1.set_ylabel('Portfolio Value ($k)', fontsize=10, fontweight='bold')
    ax1.set_title('Portfolio Growth: Low vs High Expense Ratio', fontsize=12, fontweight='bold')
    ax1.legend(loc='upper left', fontsize=10)
    ax1.grid(True, alpha=0.3)

    # Plot 2: Total fees paid
    bars = ax2.bar(['Fund A\n(Low Cost)', 'Fund B\n(High Cost)'],
                   [total_fees_a, total_fees_b],
                   color=['green', 'red'],
                   alpha=0.7,
                   edgecolor='black')

    for bar, fee in zip(bars, [total_fees_a, total_fees_b]):
        height = bar.get_height()
        ax2.text(bar.get_x() + bar.get_width()/2., height,
                f'${fee:,.0f}',
                ha='center', va='bottom', fontweight='bold', fontsize=11)

    ax2.set_ylabel('Cumulative Fees Paid ($)', fontsize=10, fontweight='bold')
    ax2.set_title(f'Total Fees Over {time_horizon} Years', fontsize=12, fontweight='bold')
    ax2.grid(True, alpha=0.3, axis='y')

    # Add annotation
    annotation = f'Fund B costs ${extra_fees:,.0f} more in fees\nYou lose {percent_lost:.1f}% of potential wealth'
    ax2.annotate(annotation, xy=(0.5, 0.95), xycoords='axes fraction',
                ha='center', va='top', fontsize=10,
                bbox=dict(boxstyle='round', facecolor='wheat', alpha=0.5))

    plt.tight_layout()

    # Export
    buf = BytesIO()
    fig.savefig(buf, format='png', dpi=200, bbox_inches='tight')
    buf.seek(0)
    img_data = base64.b64encode(buf.read()).decode()

    # Display
    img_html = f'''
    <img id="chartImg"
         src="data:image/png;base64,{img_data}"
         alt="Expense Ratio Impact"
         style="max-width: 100%; height: auto; display: block;">
    '''
    display(HTML(img_html), target="#chart")

    # Summary
    summary_html = f'''
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-top: 1.5rem;">
        <div style="padding: 1rem; border: 2px solid var(--border); background: var(--panel-bg);">
            <div style="font-size: 0.9rem; color: var(--muted); margin-bottom: 0.5rem;">Fund A Final Value</div>
            <div style="font-size: 1.5rem; font-weight: bold; color: var(--accent);">${final_balance_a:,.0f}</div>
            <div style="font-size: 0.8rem; color: var(--muted); margin-top: 0.5rem;">{fund_a_er*100:.2f}% expense ratio</div>
        </div>
        <div style="padding: 1rem; border: 2px solid var(--border); background: var(--panel-bg);">
            <div style="font-size: 0.9rem; color: var(--muted); margin-bottom: 0.5rem;">Fund B Final Value</div>
            <div style="font-size: 1.5rem; font-weight: bold; color: var(--accent);">${final_balance_b:,.0f}</div>
            <div style="font-size: 0.8rem; color: var(--muted); margin-top: 0.5rem;">{fund_b_er*100:.2f}% expense ratio</div>
        </div>
        <div style="padding: 1rem; border: 2px solid var(--accent); background: var(--panel-bg);">
            <div style="font-size: 0.9rem; color: var(--muted); margin-bottom: 0.5rem;">Wealth Lost to Fees</div>
            <div style="font-size: 1.5rem; font-weight: bold; color: var(--accent);">${difference:,.0f}</div>
            <div style="font-size: 0.8rem; color: var(--muted); margin-top: 0.5rem;">{percent_lost:.1f}% of potential wealth</div>
        </div>
    </div>

    <div style="margin-top: 1.5rem; padding: 1rem; border: 2px solid var(--accent); background: var(--panel-bg);">
        <div style="font-weight: bold; margin-bottom: 0.5rem; color: var(--accent);">Key Insight:</div>
        <p style="margin: 0; color: var(--text);">
            Over {time_horizon} years, you pay <strong>${extra_fees:,.0f} more in fees</strong> with Fund B.
            This reduces your final portfolio by <strong>{percent_lost:.1f}%</strong>.
            Low-cost index funds (like Fund A) outperform high-cost funds over time.
        </p>
    </div>
    '''
    display(HTML(summary_html), target="#summary")
