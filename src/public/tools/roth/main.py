import numpy as np
import matplotlib.pyplot as plt
from pyscript import display, document, HTML

def calculate(current_age, retirement_age, backdoor_annual, mega_annual, r):
    years = list(range(current_age, retirement_age + 1))
    n = len(years)

    back = np.zeros(n)
    mega = np.zeros(n)
    total = np.zeros(n)

    for i in range(n):
        if i == 0:
            back[i] = backdoor_annual
            mega[i] = mega_annual
        else:
            back[i] = back[i - 1] * (1 + r) + backdoor_annual
            mega[i] = mega[i - 1] * (1 + r) + mega_annual
        total[i] = back[i] + mega[i]

    return years, back, mega, total

def run_projection(event=None):
    current_age = int(document.getElementById("currentAge").value)
    retirement_age = int(document.getElementById("retirementAge").value)
    r = float(document.getElementById("returnRate").value) / 100.0
    backdoor_annual = float(document.getElementById("backdoorAnnual").value)
    mega_annual = float(document.getElementById("megaAnnual").value)

    if retirement_age <= current_age:
        display(HTML("<p style='color: red;'>Retirement age must be greater than current age.</p>"), target="#summary")
        return

    years, back, mega, total = calculate(current_age, retirement_age, backdoor_annual, mega_annual, r)

    # Clear previous chart and summary
    chart_element = document.querySelector("#chart")
    chart_element.innerHTML = ""

    # Create new chart with responsive size
    fig, ax = plt.subplots(figsize=(12, 6))
    ax.plot(years, back, label="Backdoor Roth", linewidth=2)
    ax.plot(years, mega, label="Mega Backdoor Roth", linewidth=2)
    ax.plot(years, total, label="Total", linewidth=2, linestyle="--")
    ax.set_title(f"Roth Growth (Age {current_age} to {retirement_age})", fontsize=14)
    ax.set_xlabel("Age", fontsize=12)
    ax.set_ylabel("Balance ($)", fontsize=12)
    ax.grid(True, alpha=0.3)
    ax.legend(fontsize=10)
    fig.tight_layout()

    display(fig, target="#chart")

    n = len(years)
    total_contrib = (backdoor_annual + mega_annual) * n
    gains = float(total[-1] - total_contrib)

    summary_html = f"""
    <strong>Final balances at age {retirement_age}:</strong><br>
    Backdoor Roth: ${back[-1]:,.0f}<br>
    Mega Backdoor Roth: ${mega[-1]:,.0f}<br>
    <strong>Total Roth: ${total[-1]:,.0f}</strong><br>
    Total contributions: ${total_contrib:,.0f}<br>
    <strong>Estimated tax-free growth: ${gains:,.0f}</strong>
    """

    display(HTML(summary_html), target="#summary")


# Don't auto-run - wait for user to click button
