import numpy as np
import matplotlib.pyplot as plt
from pyscript import display, document, HTML
from chart_helpers import fig_to_data_uri, setup_style

# Configure matplotlib for responsive output
setup_style((10, 6))

# IRS Contribution Limits for 2025
IRA_BASE_LIMIT = 7000
IRA_CATCHUP = 1000
TOTAL_401K_LIMIT = 69000
TOTAL_401K_CATCHUP = 7750


class Account:
    """Account model for tax-advantaged vs taxable investing comparison"""

    def __init__(self, name, account_type):
        self.name = name
        self.account_type = account_type  # "roth", "taxable", "cash"
        self.balance_history = []
        self.basis_history = []  # Cost basis for taxable accounts
        self.taxes_paid_history = []
        self.annual_contribution = 0
        self.final_balance = 0
        self.final_basis = 0
        self.total_taxes_paid = 0
        self.taxes_due_at_liquidation = 0
        self.spendable_amount = 0


def apply_growth(account, rate, expense_ratio):
    """Apply investment return minus expense ratio"""
    effective_rate = rate - expense_ratio
    return account.balance * (1 + effective_rate)


def apply_tax_drag(account, balance, dividend_yield, tax_rate):
    """Apply annual tax drag from dividends/interest"""
    tax = balance * dividend_yield * tax_rate
    return balance - tax, tax


def calculate_conversion_tax(contribution, return_rate, delay_days, marginal_rate):
    """Calculate tax on gains between contribution and conversion"""
    if delay_days == 0:
        return 0

    # Growth during delay period
    growth_factor = (1 + return_rate) ** (delay_days / 365.0)
    gains = contribution * (growth_factor - 1)
    return gains * marginal_rate


def calculate_pro_rata_tax(conversion_amount, pre_tax_balance, total_ira_balance, marginal_rate):
    """Calculate taxable portion of conversion due to pro-rata rule"""
    if pre_tax_balance == 0 or total_ira_balance == 0:
        return 0

    taxable_ratio = pre_tax_balance / total_ira_balance
    taxable_amount = conversion_amount * taxable_ratio
    return taxable_amount * marginal_rate


def calculate_capital_gains_tax(balance, basis, cap_gains_rate):
    """Calculate capital gains tax on liquidation"""
    gains = max(0, balance - basis)
    return gains * cap_gains_rate


def simulate_backdoor_roth(
    current_age,
    retirement_age,
    annual_contribution,
    return_rate,
    expense_ratio,
    marginal_rate,
    state_rate,
    conversion_delay_days,
    existing_pre_tax_ira,
    include_mega=False,
    mega_contribution=0,
):
    """Simulate Backdoor Roth (and optionally Mega Backdoor Roth)"""
    account = Account("Backdoor Roth" if not include_mega else "Backdoor + Mega Roth", "roth")

    years = list(range(current_age, retirement_age + 1))
    n = len(years)
    total_contribution = annual_contribution + (mega_contribution if include_mega else 0)

    # Pro-rata rule check (warning only - we still model the conversion)
    total_ira_balance = existing_pre_tax_ira

    for i, age in enumerate(years):
        # Track IRA balance for pro-rata calculation
        if i > 0:
            total_ira_balance = account.final_balance + existing_pre_tax_ira

        # Annual contribution
        if i == 0:
            account.balance = total_contribution
            account.basis = total_contribution
        else:
            account.balance = account.final_balance + total_contribution
            account.basis += total_contribution

        # Apply conversion tax (pro-rata rule + delay gains)
        annual_tax = 0

        # Pro-rata rule tax on conversion
        if existing_pre_tax_ira > 0 and i > 0:
            pro_rata_tax = calculate_pro_rata_tax(
                total_contribution, existing_pre_tax_ira, total_ira_balance, marginal_rate
            )
            annual_tax += pro_rata_tax

        # Delay gains tax
        if conversion_delay_days > 0:
            delay_tax = calculate_conversion_tax(total_contribution, return_rate, conversion_delay_days, marginal_rate)
            annual_tax += delay_tax

        # Tax payments come from outside the Roth (don't reduce balance)
        account.taxes_paid_history.append(annual_tax)
        account.total_taxes_paid += annual_tax

        # Apply growth (tax-free in Roth)
        account.final_balance = apply_growth(account, return_rate, expense_ratio)
        account.final_basis = account.basis

        account.balance_history.append(account.final_balance)
        account.basis_history.append(account.final_basis)

    # Roth withdrawals are tax-free if qualified
    account.spendable_amount = account.final_balance

    return account, years


def simulate_taxable_brokerage(
    current_age,
    retirement_age,
    annual_contribution,
    return_rate,
    expense_ratio,
    dividend_yield,
    marginal_rate,
    state_rate,
    cap_gains_rate,
):
    """Simulate taxable brokerage account with tax drag"""
    account = Account("Taxable Brokerage", "taxable")

    years = list(range(current_age, retirement_age + 1))
    n = len(years)

    # Qualified dividends are taxed at capital gains rate
    # Non-qualified dividends are taxed at marginal rate
    # Assume 100% qualified for simplicity (conservative for taxable)
    div_tax_rate = cap_gains_rate

    for i, age in enumerate(years):
        # Annual contribution
        if i == 0:
            account.balance = annual_contribution
            account.basis = annual_contribution
        else:
            account.balance = account.final_balance + annual_contribution
            account.basis += annual_contribution

        # Apply growth
        account.balance = apply_growth(account, return_rate, expense_ratio)

        # Apply dividend tax drag
        annual_tax_drag = 0
        if dividend_yield > 0:
            account.balance, annual_tax_drag = apply_tax_drag(
                account, account.balance, dividend_yield, div_tax_rate
            )

        account.taxes_paid_history.append(annual_tax_drag)
        account.total_taxes_paid += annual_tax_drag

        account.final_balance = account.balance
        account.final_basis = account.basis

        account.balance_history.append(account.final_balance)
        account.basis_history.append(account.final_basis)

    # Capital gains tax on liquidation
    account.taxes_due_at_liquidation = calculate_capital_gains_tax(
        account.final_balance, account.final_basis, cap_gains_rate
    )

    # Spendable = balance - capital gains tax
    account.spendable_amount = account.final_balance - account.taxes_due_at_liquidation

    return account, years


def simulate_cash(current_age, retirement_age, annual_contribution):
    """Simulate not investing (cash under mattress)"""
    account = Account("Cash (No Investing)", "cash")

    years = list(range(current_age, retirement_age + 1))
    n = len(years)

    for i, age in enumerate(years):
        if i == 0:
            account.final_balance = annual_contribution
        else:
            account.final_balance += annual_contribution

        account.balance_history.append(account.final_balance)
        account.basis_history.append(account.final_balance)
        account.taxes_paid_history.append(0)

    account.final_basis = account.final_balance
    account.total_taxes_paid = 0
    account.taxes_due_at_liquidation = 0
    account.spendable_amount = account.final_balance

    return account, years


def generate_charts(scenarios, years):
    """Generate balance comparison and taxes paid charts"""
    # Chart 1: Account balances
    fig1, ax1 = plt.subplots(dpi=200)

    colors = {"roth": "#10b981", "taxable": "#f59e0b", "cash": "#6b7280"}
    linestyles = {"roth": "-", "taxable": "-", "cash": "--"}

    for scenario in scenarios:
        color = colors.get(scenario.account_type, "#000000")
        linestyle = linestyles.get(scenario.account_type, "-")
        ax1.plot(years, scenario.balance_history, label=scenario.name, linewidth=2, color=color, linestyle=linestyle)

    ax1.set_title("Account Balances Over Time", fontsize=14)
    ax1.set_xlabel("Age", fontsize=12)
    ax1.set_ylabel("Balance ($)", fontsize=12)
    ax1.grid(True, alpha=0.3)
    ax1.legend(fontsize=10)

    # Chart 2: Cumulative taxes paid
    fig2, ax2 = plt.subplots(dpi=200)

    for scenario in scenarios:
        if scenario.account_type == "cash":
            continue  # No taxes on cash

        cumulative_taxes = np.cumsum(scenario.taxes_paid_history)

        # Add liquidation tax at the end (if any)
        if scenario.taxes_due_at_liquidation > 0:
            cumulative_taxes = cumulative_taxes.copy()
            cumulative_taxes[-1] += scenario.taxes_due_at_liquidation

        color = colors.get(scenario.account_type, "#000000")
        ax2.plot(years, cumulative_taxes, label=scenario.name, linewidth=2, color=color)

    ax2.set_title("Cumulative Taxes Paid Over Time", fontsize=14)
    ax2.set_xlabel("Age", fontsize=12)
    ax2.set_ylabel("Taxes Paid ($)", fontsize=12)
    ax2.grid(True, alpha=0.3)
    ax2.legend(fontsize=10)

    # Render figures to base64 PNG data URIs
    img_data1 = fig_to_data_uri(fig1)

    img_data2 = fig_to_data_uri(fig2)

    plt.close('all')

    return img_data1, img_data2


def generate_summary_table(scenarios, retirement_age):
    """Generate HTML comparison table"""
    rows = []

    # Find max spendable for highlighting
    max_spendable = max(s.spendable_amount for s in scenarios)

    for scenario in scenarios:
        total_contributions = scenario.final_basis
        total_gains = scenario.final_balance - scenario.final_basis
        is_winner = scenario.spendable_amount == max_spendable

        row_style = 'background-color: rgba(16, 185, 129, 0.2);' if is_winner else ''

        row = f"""
        <tr style="{row_style}">
            <td><strong>{scenario.name}</strong></td>
            <td>${total_contributions:,.0f}</td>
            <td>${scenario.final_balance:,.0f}</td>
            <td>${scenario.final_basis:,.0f}</td>
            <td>${total_gains:,.0f}</td>
            <td>${scenario.total_taxes_paid:,.0f}</td>
            <td>${scenario.taxes_due_at_liquidation:,.0f}</td>
            <td style="font-weight: bold; color: #10b981;">${scenario.spendable_amount:,.0f}</td>
        </tr>
        """
        rows.append(row)

    table_html = f"""
    <table style="width: 100%; border-collapse: collapse; font-size: 1rem;">
        <thead>
            <tr style="border-bottom: 3px solid var(--border);">
                <th style="text-align: left; padding: 0.5rem;">Scenario</th>
                <th style="text-align: right; padding: 0.5rem;">Contributions</th>
                <th style="text-align: right; padding: 0.5rem;">Ending Balance</th>
                <th style="text-align: right; padding: 0.5rem;">Cost Basis</th>
                <th style="text-align: right; padding: 0.5rem;">Gains</th>
                <th style="text-align: right; padding: 0.5rem;">Taxes Paid</th>
                <th style="text-align: right; padding: 0.5rem;">Taxes Due</th>
                <th style="text-align: right; padding: 0.5rem;">Spendable</th>
            </tr>
        </thead>
        <tbody>
            {''.join(rows)}
        </tbody>
    </table>
    """

    return table_html


def generate_insights(scenarios, current_age, retirement_age):
    """Generate key insights from comparison"""
    insights = []

    # Sort by spendable
    scenarios_sorted = sorted(scenarios, key=lambda s: s.spendable_amount, reverse=True)

    if len(scenarios_sorted) >= 2:
        winner = scenarios_sorted[0]
        runner_up = scenarios_sorted[1]
        advantage = winner.spendable_amount - runner_up.spendable_amount
        advantage_pct = (advantage / runner_up.spendable_amount) * 100

        insights.append(f"✅ <strong>{winner.name}</strong> delivers <strong>${advantage:,.0f}</strong> more spendable wealth vs {runner_up.name} ({advantage_pct:.1f}% advantage)")

    # Tax drag analysis
    taxable = next((s for s in scenarios if s.account_type == "taxable"), None)
    if taxable:
        total_tax_cost = taxable.total_taxes_paid + taxable.taxes_due_at_liquidation
        gains = taxable.final_balance - taxable.final_basis
        if gains > 0:
            tax_rate_on_gains = (total_tax_cost / gains) * 100
            insights.append(f"⚠️ Taxable account loses <strong>${total_tax_cost:,.0f}</strong> to taxes ({tax_rate_on_gains:.1f}% of gains)")

    # Opportunity cost
    cash = next((s for s in scenarios if s.account_type == "cash"), None)
    roth = next((s for s in scenarios if s.account_type == "roth"), None)
    if cash and roth:
        opportunity_cost = roth.spendable_amount - cash.spendable_amount
        insights.append(f"💡 Not investing costs <strong>${opportunity_cost:,.0f}</strong> in lost growth over {retirement_age - current_age} years")

    # Breakeven analysis
    if taxable and roth:
        # What return would taxable need to match Roth?
        # Simplified: taxable needs to overcome tax drag + cap gains
        # (1 + r_taxable)^n * (1 - effective_tax_rate) = (1 + r_roth)^n
        # This is complex, so we'll show a simple message
        insights.append(f"📊 Tax drag reduces taxable returns by approximately <strong>{((taxable.final_balance - taxable.total_taxes_paid - taxable.taxes_due_at_liquidation) / taxable.final_balance * 100):.1f}%</strong> relative to gross return")

    # Pro-rata warning
    existing_ira = float(document.getElementById("existingPreTaxIRA").value)
    if existing_ira > 0:
        insights.append(f"⚠️ <strong>Pro-rata rule warning:</strong> Your ${existing_ira:,.0f} pre-tax IRA makes part of your Backdoor Roth conversion taxable")

    return insights


def run_projection(event=None):
    # Get input values
    current_age = int(document.getElementById("currentAge").value)
    retirement_age = int(document.getElementById("retirementAge").value)
    return_rate = float(document.getElementById("returnRate").value) / 100.0
    expense_ratio = float(document.getElementById("expenseRatio").value) / 100.0

    backdoor_contribution = float(document.getElementById("backdoorAnnual").value)
    mega_contribution = float(document.getElementById("megaAnnual").value)
    include_mega = document.getElementById("includeMega").checked

    # Tax parameters
    federal_rate = float(document.getElementById("federalRate").value) / 100.0
    state_rate = float(document.getElementById("stateRate").value) / 100.0
    marginal_rate = federal_rate + state_rate  # Combined marginal rate
    cap_gains_rate = float(document.getElementById("capGainsRate").value) / 100.0
    dividend_yield = float(document.getElementById("dividendYield").value) / 100.0

    # Backdoor details
    existing_pre_tax_ira = float(document.getElementById("existingPreTaxIRA").value)
    conversion_delay = int(document.getElementById("conversionDelay").value)

    # Scenario selection
    include_backdoor = document.getElementById("includeBackdoor").checked
    include_taxable = document.getElementById("includeTaxable").checked
    include_cash = document.getElementById("includeCash").checked

    # Validation
    if retirement_age <= current_age:
        display(HTML("<p style='color: red;'>Retirement age must be greater than current age.</p>"), target="#summary")
        return

    if not include_backdoor and not include_taxable and not include_cash:
        display(HTML("<p style='color: red;'>Please select at least one scenario to compare.</p>"), target="#summary")
        return

    # Clear previous outputs
    chart_element = document.querySelector("#chart")
    chart_element.innerHTML = ""

    chart2_element = document.querySelector("#chart2")
    chart2_element.innerHTML = ""

    scenarios = []
    years = []

    # Run simulations
    total_contribution = backdoor_contribution + (mega_contribution if include_mega else 0)

    if include_backdoor:
        backdoor_account, years = simulate_backdoor_roth(
            current_age=current_age,
            retirement_age=retirement_age,
            annual_contribution=backdoor_contribution,
            return_rate=return_rate,
            expense_ratio=expense_ratio,
            marginal_rate=marginal_rate,
            state_rate=state_rate,
            conversion_delay_days=conversion_delay,
            existing_pre_tax_ira=existing_pre_tax_ira,
            include_mega=include_mega,
            mega_contribution=mega_contribution,
        )
        scenarios.append(backdoor_account)

    if include_taxable:
        taxable_account, years = simulate_taxable_brokerage(
            current_age=current_age,
            retirement_age=retirement_age,
            annual_contribution=total_contribution,
            return_rate=return_rate,
            expense_ratio=expense_ratio,
            dividend_yield=dividend_yield,
            marginal_rate=marginal_rate,
            state_rate=state_rate,
            cap_gains_rate=cap_gains_rate,
        )
        scenarios.append(taxable_account)

    if include_cash:
        cash_account, years = simulate_cash(
            current_age=current_age,
            retirement_age=retirement_age,
            annual_contribution=total_contribution,
        )
        scenarios.append(cash_account)

    # Generate charts
    img_data1, img_data2 = generate_charts(scenarios, years)

    chart_html = f"""
    <div id="chart-wrapper" style="width: 100%;">
        <img id="chartImg"
             src="data:image/png;base64,{img_data1}"
             alt="Account Balances Chart"
             style="max-width: 100%; height: auto; display: block;">
    </div>
    """
    display(HTML(chart_html), target="#chart")

    chart2_html = f"""
    <div id="chart2-wrapper" style="width: 100%; margin-top: 2rem;">
        <img id="chartImg2"
             src="data:image/png;base64,{img_data2}"
             alt="Taxes Paid Chart"
             style="max-width: 100%; height: auto; display: block;">
    </div>
    """
    display(HTML(chart2_html), target="#chart2")

    # Generate table
    table_html = generate_summary_table(scenarios, retirement_age)

    # Generate insights
    insights = generate_insights(scenarios, current_age, retirement_age)
    insights_html = "<ul style='list-style: none; padding-left: 0;'>" + "".join(f"<li style='margin-bottom: 0.5rem;'>{insight}</li>" for insight in insights) + "</ul>"

    # Combined summary
    summary_html = f"""
    <h3 style="margin-top: 0;">Comparison at Age {retirement_age}</h3>
    {table_html}
    <h3 style="margin-top: 2rem;">Key Insights</h3>
    {insights_html}
    """

    display(HTML(summary_html), target="#summary")


# Don't auto-run - wait for user to click button
