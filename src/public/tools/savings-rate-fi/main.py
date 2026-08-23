"""
Savings Rate to Financial Independence Calculator
Shows the relationship between savings rate and time to FI.
"""

import numpy as np
import matplotlib.pyplot as plt
from pyscript import display, document, HTML
from chart_helpers import chart_img, setup_style
from datetime import datetime


setup_style((10, 6))

def calculate_fi(event=None):
    """Calculate years to FI across different savings rates."""

    try:
        annual_income = float(document.getElementById("annualIncome").value)
        current_savings = float(document.getElementById("currentSavings").value)
        savings_rate = float(document.getElementById("savingsRate").value)
        withdrawal_rate = float(document.getElementById("withdrawalRate").value)
        real_return = float(document.getElementById("realReturn").value)

        if savings_rate < 0.05 or savings_rate > 0.80:
            display(HTML('<p style="color: var(--accent);">Savings rate must be between 5% and 80%.</p>'), target="#summary")
            return

    except ValueError as e:
        display(HTML(f'<p style="color: var(--accent);">Invalid input: {str(e)}</p>'), target="#summary")
        return

    # Calculate for user's savings rate
    annual_spending = annual_income * (1 - savings_rate)
    fi_target = annual_spending / withdrawal_rate

    # Years to FI: solve the annuity equation for n
    # FV = PV(1+r)^n + PMT[((1+r)^n - 1)/r]  =>  n = log((FV*r + PMT)/(PV*r + PMT)) / log(1+r)
    # where PV = current savings, PMT = annual contribution, FV = FI target
    def years_to_fi(current_savings, annual_contribution, fi_target, real_return):
        if current_savings >= fi_target:
            return 0

        if abs(real_return) < 1e-12:
            # Zero real return: FI comes from straight-line contribution accumulation
            return (fi_target - current_savings) / annual_contribution if annual_contribution > 0 else np.inf

        n = np.log((fi_target * real_return + annual_contribution) /
                   (current_savings * real_return + annual_contribution)) / np.log(1 + real_return)
        return max(0, n)

    user_years = years_to_fi(current_savings, annual_income * savings_rate, fi_target, real_return)

    # Calculate curve across savings rates
    savings_rates = np.linspace(0.10, 0.70, 61)
    years_to_fi_curve = []

    for sr in savings_rates:
        spending = annual_income * (1 - sr)
        target = spending / withdrawal_rate
        contribution = annual_income * sr
        yrs = years_to_fi(current_savings, contribution, target, real_return)
        years_to_fi_curve.append(yrs)

    years_to_fi_curve = np.array(years_to_fi_curve)

    # Clear chart
    chart_element = document.querySelector("#chart")
    chart_element.innerHTML = ""

    # Create figure
    fig, ax = plt.subplots(1, 1, dpi=200, figsize=(10, 6))

    # Plot curve
    ax.plot(savings_rates * 100, years_to_fi_curve, linewidth=2, color='steelblue', label='Years to FI')

    # Mark user's position
    ax.axvline(x=savings_rate * 100, color='red', linewidth=2, linestyle='--', label=f'Your Rate ({savings_rate*100:.0f}%)')
    ax.axhline(y=user_years, color='green', linewidth=2, linestyle=':', label=f'Your FI ({user_years:.1f} years)')

    # Mark intersection point
    ax.plot(savings_rate * 100, user_years, 'ro', markersize=10, label='Your Position')

    # Annotate
    ax.annotate(f'FI in {user_years:.1f} years',
                xy=(savings_rate * 100, user_years),
                xytext=(10, 10), textcoords='offset points',
                fontsize=10, fontweight='bold',
                bbox=dict(boxstyle='round', facecolor='wheat', alpha=0.5),
                arrowprops=dict(arrowstyle='->', connectionstyle='arc3,rad=0'))

    ax.set_xlabel('Savings Rate (%)', fontsize=10, fontweight='bold')
    ax.set_ylabel('Years to Financial Independence', fontsize=10, fontweight='bold')
    ax.set_title('Savings Rate vs Time to FI (The Power of Saving More)', fontsize=12, fontweight='bold')
    ax.legend(loc='upper right', fontsize=9)
    ax.grid(True, alpha=0.3)

    # Set axis limits
    ax.set_xlim(10, 70)
    ax.set_ylim(0, max(50, user_years * 1.2))

    plt.tight_layout()

    # Export
    # Display
    display(HTML(chart_img(fig, 'Savings Rate to FI')), target="#chart")

    # Summary
    fi_age = datetime.now().year + user_years

    summary_html = f'''
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-top: 1.5rem;">
        <div style="padding: 1rem; border: 2px solid var(--border); background: var(--panel);">
            <div style="font-size: 0.9rem; color: var(--muted); margin-bottom: 0.5rem;">Your Savings Rate</div>
            <div style="font-size: 1.5rem; font-weight: bold; color: var(--accent);">{savings_rate*100:.0f}%</div>
            <div style="font-size: 0.8rem; color: var(--muted); margin-top: 0.5rem;">${annual_income * savings_rate:,.0f}/year saved</div>
        </div>
        <div style="padding: 1rem; border: 2px solid var(--border); background: var(--panel);">
            <div style="font-size: 0.9rem; color: var(--muted); margin-bottom: 0.5rem;">FI Target</div>
            <div style="font-size: 1.5rem; font-weight: bold; color: var(--accent);">${fi_target:,.0f}</div>
            <div style="font-size: 0.8rem; color: var(--muted); margin-top: 0.5rem;">{annual_spending:,.0f}/year spending</div>
        </div>
        <div style="padding: 1rem; border: 2px solid var(--accent); background: var(--panel);">
            <div style="font-size: 0.9rem; color: var(--muted); margin-bottom: 0.5rem;">Years to FI</div>
            <div style="font-size: 1.5rem; font-weight: bold; color: var(--accent);">{user_years:.1f} years</div>
            <div style="font-size: 0.8rem; color: var(--muted); margin-top: 0.5rem;">Around {int(fi_age)}</div>
        </div>
    </div>

    <div style="margin-top: 1.5rem; padding: 1rem; border: 2px solid var(--accent); background: var(--panel);">
        <div style="font-weight: bold; margin-bottom: 0.5rem; color: var(--accent);">The Power of Saving More:</div>
        <ul style="margin: 0; padding-left: 1.5rem; color: var(--text);">
            <li>At 20% savings: FI in ~{years_to_fi_curve[np.argmin(np.abs(savings_rates - 0.20))]:.0f} years</li>
            <li>At 40% savings: FI in ~{years_to_fi_curve[np.argmin(np.abs(savings_rates - 0.40))]:.0f} years</li>
            <li>At 60% savings: FI in ~{years_to_fi_curve[np.argmin(np.abs(savings_rates - 0.60))]:.0f} years</li>
            <li>Every 10% increase in savings rate dramatically accelerates FI!</li>
        </ul>
    </div>
    '''
    display(HTML(summary_html), target="#summary")
