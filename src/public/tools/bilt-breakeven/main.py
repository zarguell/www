"""
Bilt 2.0 Break-Even Calculator
Analyzes the rumored Bilt Card 2.0 point structure and calculates break-even points.

Based on rumored Bilt 2.0 changes:
- 3% transaction fee on rent/mortgage payments (currently 0%)
- 4% Bilt Cash on non-housing spending (can be used to waive the fee)
- 2x points on non-housing spending, 1x points on rent
- Rent points capped at 100K points/year
- Source: https://thepointsguy.com/news/bilt-cards-2-0-rumors/
"""

import numpy as np
import matplotlib.pyplot as plt
import plotly.graph_objects as go
import json
from pyscript import display, document, HTML
from io import BytesIO
import base64
from js import Plotly, JSON

# Configure matplotlib for responsive output
plt.rcParams['figure.figsize'] = [10, 6]
plt.rcParams['figure.autolayout'] = True

# Constants
RENT_POINTS_CAP = 100000  # Maximum points per year on rent (Bilt constant)
RENT_POINTS_RATE = 1.0    # 1x points on rent


def calculate_breakeven(event=None):
    """
    Calculate break-even analysis for Bilt Card 2.0
    """

    # Clear previous results
    summary_element = document.getElementById("summary")
    if summary_element:
        summary_element.innerHTML = ""

    chart_element = document.getElementById("chart")
    if chart_element:
        chart_element.innerHTML = ""

    plotly_element = document.querySelector("#plotlyChart")
    if plotly_element:
        plotly_element.innerHTML = ""

    # Read inputs
    try:
        rent = float(document.getElementById("monthly-rent").value)
        fee_percent = float(document.getElementById("transaction-fee").value) / 100
        bilt_cash_rate = float(document.getElementById("bilt-cash-rate").value) / 100
        everyday_points_rate = float(document.getElementById("everyday-points-rate").value)
        alternative_rate = float(document.getElementById("alternative-rate").value) / 100
        point_value_cents = float(document.getElementById("point-value").value)
        point_value = point_value_cents / 100

    except ValueError as e:
        display(HTML(f'<p style="color: var(--accent);">Invalid input: {str(e)}</p>'), target="#summary")
        return

    # Monthly rent fee (transaction fee on rent payment)
    monthly_rent_fee = rent * fee_percent

    # Calculate points separately
    # Rent points: 1x on rent (capped annually at 100K)
    annual_rent_points = min(rent * 12 * RENT_POINTS_RATE, RENT_POINTS_CAP)
    monthly_rent_points = annual_rent_points / 12
    rent_points_value_monthly = monthly_rent_points * point_value

    # Everyday points: 2x on non-housing spending (no cap)
    # This will be calculated for each spending level in the chart

    # Format currency values
    def format_currency(value):
        return f"${value:,.0f}" if value >= 0 else f"-${abs(value):,.0f}"

    # Create spending range for chart (0 to show break-even)
    # Start with a reasonable range
    max_spending = max(5000, monthly_rent_fee / bilt_cash_rate * 3)
    spending_range = np.linspace(0, max_spending, 100)

    # Calculate values at each spending level
    bilt_net_values = []
    opp_cost_values = []  # Opportunity cost on everyday spend only

    for spend in spending_range:
        # ===== BILT REWARDS =====
        # Bilt Cash on non-housing
        bilt_cash = spend * bilt_cash_rate

        # Points from everyday spending (2x, no cap)
        everyday_points = spend * everyday_points_rate
        everyday_points_value = everyday_points * point_value

        # Points from rent (1x, capped at 100K annually)
        rent_points_value = monthly_rent_points * point_value

        # Total Bilt monthly value (before fee)
        bilt_total_monthly = bilt_cash + everyday_points_value + rent_points_value

        # Net after rent fee
        bilt_net_monthly = bilt_total_monthly - monthly_rent_fee
        bilt_net_values.append(bilt_net_monthly * 12)

        # ===== EVERYDAY ADVANTAGE (EVERYDAY SPEND ONLY) =====
        # Alternative rewards on everyday spend (no rent, since ACH)
        alt_everyday_value_monthly = spend * alternative_rate

        # Bilt rewards on everyday spend ONLY (exclude rent fee and rent points)
        bilt_everyday_value_monthly = (spend * bilt_cash_rate) + (spend * everyday_points_rate * point_value)

        # Everyday advantage = Bilt everyday - alternative everyday
        # Positive = Bilt is better on everyday spend
        # Negative = Alternative is better on everyday spend
        everyday_adv_monthly = bilt_everyday_value_monthly - alt_everyday_value_monthly
        opp_cost_values.append(everyday_adv_monthly * 12)

    # Find break-even points
    # 1) Where Bilt net = 0 (offset the fee)
    bilt_net_array = np.array(bilt_net_values)
    bilt_zero_indices = np.where(np.diff(np.signbit(bilt_net_array)))[0]

    if len(bilt_zero_indices) > 0:
        bilt_zero_idx = bilt_zero_indices[0]
        monthly_breakeven_fee = spending_range[bilt_zero_idx]
        annual_breakeven_fee = monthly_breakeven_fee * 12
    else:
        # If no sign change, estimate properly including points
        effective_rate = bilt_cash_rate + everyday_points_rate * point_value
        monthly_breakeven_fee = max(0, (monthly_rent_fee - rent_points_value_monthly) / effective_rate)
        annual_breakeven_fee = monthly_breakeven_fee * 12

    # 2) Where everyday rewards tie (opportunity cost = 0)
    opp_cost_array = np.array(opp_cost_values)
    opp_zero_indices = np.where(np.diff(np.signbit(opp_cost_array)))[0]

    if len(opp_zero_indices) > 0:
        opp_zero_idx = opp_zero_indices[0]
        monthly_breakeven_opp = spending_range[opp_zero_idx]
        annual_breakeven_opp = monthly_breakeven_opp * 12
    else:
        # If everyday rewards never tie, set to null
        monthly_breakeven_opp = None
        annual_breakeven_opp = None

    # Get current values at a reasonable spending level for display
    # Use 2x rent as a baseline if user hasn't specified
    baseline_spend = max(rent * 2, 1500)

    # Calculate at baseline
    bilt_cash_at_baseline = baseline_spend * bilt_cash_rate
    everyday_points_at_baseline = baseline_spend * everyday_points_rate
    everyday_points_value_baseline = everyday_points_at_baseline * point_value
    rent_points_value_baseline = monthly_rent_points * point_value
    bilt_total_baseline = bilt_cash_at_baseline + everyday_points_value_baseline + rent_points_value_baseline
    bilt_net_baseline = bilt_total_baseline - monthly_rent_fee

    # Alternative earns on non-housing only (rent via ACH = no rewards)
    alternative_at_baseline = baseline_spend * alternative_rate

    # Display results
    # Use the fee break-even as the primary metric
    monthly_breakeven = monthly_breakeven_fee
    annual_breakeven = annual_breakeven_fee

    results_html = f'''
    <div class="results-grid">
        <div class="result-card">
            <div class="result-label">Rent Transaction Fee</div>
            <div class="result-value negative">{format_currency(monthly_rent_fee)}/mo</div>
            <small>{format_currency(monthly_rent_fee * 12)}/yr on rent payments</small>
        </div>
        <div class="result-card">
            <div class="result-label">Non-Housing Spend to Break Even</div>
            <div class="result-value">{format_currency(monthly_breakeven)}/mo</div>
            <small>{format_currency(annual_breakeven)}/yr at {bilt_cash_rate*100:.0f}% Bilt Cash</small>
        </div>
        <div class="result-card">
            <div class="result-label">Rent Points Value (Capped)</div>
            <div class="result-value positive">{format_currency(rent_points_value_baseline * 12)}/yr</div>
            <small>{annual_rent_points:,.0f} points/yr at {point_value_cents}¢/pt</small>
        </div>
        <div class="result-card">
            <div class="result-label">Alternative Card Value</div>
            <div class="result-value positive">{format_currency(alternative_at_baseline * 12)}/yr</div>
            <small>{alternative_rate*100:.0f}% on ${baseline_spend:,.0f}/mo (non-housing)</small>
        </div>
    </div>

    <div class="insights-box">
        <p><strong>How Bilt 2.0 rumored structure works:</strong></p>
        <ul>
            <li><strong>Transaction fee:</strong> {fee_percent*100:.1f}% on rent = {format_currency(monthly_rent_fee)}/mo (Bilt only)</li>
            <li><strong>Bilt Cash:</strong> {bilt_cash_rate*100:.0f}% on non-housing spending (can waive the fee)</li>
            <li><strong>Everyday points:</strong> {everyday_points_rate}x on non-housing = {format_currency(everyday_points_value_baseline)}/mo per ${baseline_spend:,.0f} spent</li>
            <li><strong>Rent points:</strong> 1x on rent (capped at 100K/yr) = {format_currency(rent_points_value_baseline)}/mo</li>
            <li><strong>Break-even:</strong> Spend {format_currency(monthly_breakeven)}/mo on non-housing to offset the fee</li>
            <li><strong>Alternative:</strong> {alternative_rate*100:.0f}% on non-housing only (rent via ACH = no fee, no rewards)</li>
            <li><strong>Everyday vs alternative:</strong> Bilt {'beats' if monthly_breakeven_opp and baseline_spend >= monthly_breakeven_opp else 'loses to'} alternative at ${baseline_spend:,.0f}/mo spend</li>
            <li><strong>Note:</strong> Premium perks (travel credits, lounge access, etc.) not calculated</li>
        </ul>
    </div>
    '''
    display(HTML(results_html), target="#summary")

    # ===== MATPLOTLIB STATIC CHART =====
    fig, ax = plt.subplots(dpi=200)

    # Plot both: Bilt net value and everyday advantage on spend
    ax.plot(spending_range, bilt_net_values, linewidth=2, color='#3498db', label=f'Bilt 2.0 Net Value ({bilt_cash_rate*100:.0f}% + {everyday_points_rate}x points - fee)')
    ax.plot(spending_range, opp_cost_values, linewidth=2, color='#e74c3c', linestyle='--', label=f'Everyday Advantage vs {alternative_rate*100:.0f}% Alternative (Bilt − Alt)')

    # Add break-even line at y=0
    ax.axhline(y=0, color='gray', linestyle=':', alpha=0.5, linewidth=1, label='Break-even')

    # Mark fee break-even point (where Bilt net = 0)
    if monthly_breakeven_fee <= spending_range[-1]:
        breakeven_y = 0  # Force y=0 for visual accuracy

        ax.axvline(x=monthly_breakeven_fee, color='#e67e22', linestyle='--', alpha=0.7, linewidth=1.5)
        ax.scatter([monthly_breakeven_fee], [breakeven_y], color='#e67e22', s=80, zorder=5,
                  label=f'Fee break-even ({format_currency(monthly_breakeven_fee)}/mo)')

    # Mark where everyday rewards tie (advantage = 0)
    if monthly_breakeven_opp and monthly_breakeven_opp <= spending_range[-1]:
        opp_y = 0  # Force y=0 for visual accuracy

        ax.axvline(x=monthly_breakeven_opp, color='#27ae60', linestyle=':', alpha=0.7, linewidth=1.5)
        ax.scatter([monthly_breakeven_opp], [opp_y], color='#27ae60', s=80, zorder=5,
                  label=f'Everyday tie ({format_currency(monthly_breakeven_opp)}/mo)')

    # Labels and styling
    ax.set_xlabel('Monthly Non-Housing Spending ($)', fontsize=12, fontweight='bold')
    ax.set_ylabel('Net Annual Value ($)', fontsize=12, fontweight='bold')
    ax.set_title(f'Bilt 2.0 Analysis vs {alternative_rate*100:.0f}% Alternative Card', fontsize=14, fontweight='bold')
    ax.grid(True, alpha=0.3)
    ax.legend(loc='best', fontsize=7)

    # Format axes as currency
    ax.yaxis.set_major_formatter(plt.FuncFormatter(lambda x, p: f'${x/1000:.0f}k' if abs(x) >= 1000 else f'${x:,.0f}'))
    ax.xaxis.set_major_formatter(plt.FuncFormatter(lambda x, p: f'${x/1000:.0f}k' if abs(x) >= 1000 else f'${x:,.0f}'))

    plt.tight_layout()

    # Export to base64 PNG
    buf = BytesIO()
    fig.savefig(buf, format='png', dpi=200, bbox_inches='tight')
    buf.seek(0)
    img_data = base64.b64encode(buf.read()).decode()

    # Display static chart
    img_html = f'''
    <img id="chartImg"
         src="data:image/png;base64,{img_data}"
         alt="Break-even analysis chart"
         style="max-width: 100%; height: auto; display: block;">
    '''
    display(HTML(img_html), target="#chart")

    # ===== PLOTLY INTERACTIVE CHART =====
    fig_plotly = go.Figure()

    # Add Bilt net value line
    fig_plotly.add_trace(go.Scatter(
        x=spending_range.tolist(),
        y=bilt_net_values,
        mode='lines',
        name=f'Bilt 2.0 Net Value ({bilt_cash_rate*100:.0f}% + {everyday_points_rate}x points - {fee_percent*100:.0f}% fee)',
        line=dict(color='#3498db', width=2)
    ))

    # Add everyday advantage vs alternative line
    fig_plotly.add_trace(go.Scatter(
        x=spending_range.tolist(),
        y=opp_cost_values,
        mode='lines',
        name=f'Everyday Advantage vs {alternative_rate*100:.0f}% Alternative (Bilt − Alt)',
        line=dict(color='#e74c3c', width=2, dash='dash')
    ))

    # Add break-even line at y=0
    fig_plotly.add_hline(
        y=0,
        line_dash='dot',
        line_color='gray',
        annotation_text='Break-even (zero value)',
        annotation_position='right'
    )

    # Mark fee break-even point (where Bilt net = 0)
    if monthly_breakeven_fee <= spending_range[-1]:
        breakeven_y = 0  # Force y=0 for visual accuracy

        fig_plotly.add_vline(
            x=monthly_breakeven_fee,
            line_dash='dash',
            line_color='#e67e22',
            annotation_text=f'Fee break-even<br>({format_currency(monthly_breakeven_fee)}/mo)',
            annotation_position='top'
        )

        fig_plotly.add_trace(go.Scatter(
            x=[monthly_breakeven_fee],
            y=[breakeven_y],
            mode='markers',
            name=f'Fee break-even ({format_currency(monthly_breakeven_fee)}/mo)',
            marker=dict(color='#e67e22', size=10),
            hovertemplate=f'Fee break-even<br>Non-housing: {format_currency(monthly_breakeven_fee)}/mo<br>Net value: ${format_currency(breakeven_y)}/yr<extra></extra>'
        ))

    # Mark where everyday rewards tie (advantage = 0)
    if monthly_breakeven_opp and monthly_breakeven_opp <= spending_range[-1]:
        opp_y = 0  # Force y=0 for visual accuracy

        fig_plotly.add_vline(
            x=monthly_breakeven_opp,
            line_dash='dot',
            line_color='#27ae60',
            annotation_text=f'Everyday tie<br>({format_currency(monthly_breakeven_opp)}/mo)',
            annotation_position='bottom'
        )

        fig_plotly.add_trace(go.Scatter(
            x=[monthly_breakeven_opp],
            y=[opp_y],
            mode='markers',
            name=f'Everyday tie vs alternative ({format_currency(monthly_breakeven_opp)}/mo)',
            marker=dict(color='#27ae60', size=10),
            hovertemplate=f'Everyday tie vs alternative<br>Non-housing: {format_currency(monthly_breakeven_opp)}/mo<br>Advantage: ${format_currency(opp_y)}/yr<extra></extra>'
        ))

    fig_plotly.update_layout(
        title=f'Bilt 2.0 vs {alternative_rate*100:.0f}% Alternative Card - Annual Net Value',
        xaxis_title='Monthly Non-Housing Spending ($)',
        yaxis_title='Net Annual Value ($)',
        hovermode='x unified',
        height=600,
        autosize=True,
        legend=dict(x=0.02, y=0.98, bgcolor='rgba(255,255,255,0.8)')
    )

    fig_plotly.update_xaxes(tickformat='$,.0f')
    fig_plotly.update_yaxes(tickformat='$,.0f')

    # Render Plotly chart
    plotly_element = document.querySelector("#plotlyChart")

    spec = fig_plotly.to_plotly_json()
    spec_json = json.dumps(spec)
    spec_js = JSON.parse(spec_json)

    Plotly.newPlot(plotly_element, spec_js.data, spec_js.layout, {
        'displayModeBar': True,
        'displaylogo': False,
        'responsive': True,
        'toImageButtonOptions': {
            'format': 'png',
            'filename': 'bilt-breakeven-analysis',
            'height': 600,
            'width': 1000,
            'scale': 1
        }
    })
