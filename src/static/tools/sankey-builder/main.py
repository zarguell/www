import micropip
await micropip.install("/assets/python/plotly-7.1.0-py3-none-any.whl")

"""
Cash Flow Sankey Diagram Builder
Creates interactive Sankey diagrams from simple text input using Plotly.
"""

import plotly.graph_objects as go
from pyscript import display, document, HTML
from chart_helpers import render_plotly

def parse_sankey_text(text):
    """Parse SankeyMatic-style text format into flows."""
    import re

    flows = []
    for line in text.strip().split('\n'):
        line = line.strip()
        if not line or line.startswith('//'):
            continue

        # Extract value between brackets
        match = re.match(r'(.*?)\s*\[(\d+(?:\.\d+)?)\]\s*(.*)', line)
        if match:
            source = match.group(1).strip()
            value = float(match.group(2))
            target = match.group(3).strip()
            if source and target and value > 0:
                flows.append({'source': source, 'target': target, 'value': value})

    return flows

def aggregate_flows(flows):
    """Combine duplicate flows between same nodes."""
    aggregated = {}
    for flow in flows:
        key = (flow['source'], flow['target'])
        aggregated[key] = aggregated.get(key, 0) + flow['value']
    return [{'source': k[0], 'target': k[1], 'value': v} for k, v in aggregated.items()]

# Keywords identifying savings-type nodes (shared by get_color and summary stats)
SAVINGS_KEYWORDS = ['savings', 'investment', '401k', 'ira', 'roth', 'hsa', 'brokerage']

def get_color(label):
    """Assign colors based on node type."""
    label_lower = label.lower()

    if any(word in label_lower for word in ['income', 'salary', 'revenue', 'gross']):
        return '#8a8a8a'  # Gray for income
    elif any(word in label_lower for word in ['tax', 'irs', 'fica', 'federal', 'state']):
        return '#e28a8a'  # Red for taxes
    elif any(word in label_lower for word in SAVINGS_KEYWORDS):
        return '#7ee2a8'  # Green for savings
    elif any(word in label_lower for word in ['expense', 'housing', 'food', 'transport', 'utilities', 'spending']):
        return '#c9c9c9'  # Blue for expenses
    else:
        return '#6f6f6f'  # Purple for other

def build_sankey(event=None):
    """Build interactive Sankey diagram from text input using Plotly."""

    try:
        sankey_text = document.getElementById("sankeyText").value
        title = document.getElementById("diagramTitle").value or "Cash Flow Diagram"

        if not sankey_text.strip():
            display(HTML('<p class="notice notice--error">Please enter flow data.</p>'), target="#summary")
            return

    except Exception as e:
        display(HTML(f'<p class="notice notice--error">Error reading input: {str(e)}</p>'), target="#summary")
        return

    # Parse and aggregate flows
    flows = parse_sankey_text(sankey_text)

    if not flows:
        display(HTML('<p class="notice notice--error">No valid flows found. Check format: Source [value] Target</p>'), target="#summary")
        return

    aggregated = aggregate_flows(flows)

    # Get all unique nodes
    all_nodes = set()
    for flow in aggregated:
        all_nodes.add(flow['source'])
        all_nodes.add(flow['target'])

    nodes = sorted(list(all_nodes))
    node_index = {node: i for i, node in enumerate(nodes)}

    # Check flow balance
    inflows = {}
    outflows = {}

    for flow in aggregated:
        source = flow['source']
        target = flow['target']
        value = flow['value']

        outflows[source] = outflows.get(source, 0) + value
        inflows[target] = inflows.get(target, 0) + value

    # Find imbalances
    imbalances = []
    for node in nodes:
        in_val = inflows.get(node, 0)
        out_val = outflows.get(node, 0)
        if abs(in_val - out_val) > 0.01 * max(in_val, out_val, 1):
            imbalances.append({'node': node, 'inflow': in_val, 'outflow': out_val, 'diff': in_val - out_val})

    # Clear chart
    chart_element = document.querySelector("#chart")
    chart_element.innerHTML = ""

    # Build Plotly Sankey diagram
    # Convert aggregated flows to Plotly format (ensure native Python types)
    sources = [int(node_index[f['source']]) for f in aggregated]
    targets = [int(node_index[f['target']]) for f in aggregated]
    values = [float(f['value']) for f in aggregated]

    # Get node colors
    node_colors = [get_color(node) for node in nodes]

    # Create Plotly Sankey figure
    fig = go.Figure(data=[go.Sankey(
        node=dict(
            pad=15,
            thickness=18,
            line=dict(color='rgba(0,0,0,0.3)', width=0.5),
            label=nodes,
            color=node_colors,
        ),
        link=dict(
            source=sources,
            target=targets,
            value=values,
        ),
        arrangement='snap',
    )])

    fig.update_layout(
        title_text=f'{title}<br><sub>Cash Flow Sankey Diagram</sub>',
        font_size=12,
        autosize=True,
    )

    render_plotly(fig, chart_element, 'sankey-diagram')

    # Summary statistics
    # Income = outflows of source nodes (nodes with no inflow);
    # savings = inflows received by savings-type nodes
    total_income = sum(outflows.get(node, 0) for node in nodes if inflows.get(node, 0) == 0)
    total_savings = sum(inflows.get(node, 0) for node in nodes
                        if any(word in node.lower() for word in SAVINGS_KEYWORDS))
    savings_rate = (total_savings / total_income * 100) if total_income > 0 else 0

    imbalance_warning = ''
    if imbalances:
        imbalance_warning = '''
        <div class="result-card result-card--warning">
            <div class="insight-title insight-title--warning">Flow Imbalances Detected:</div>
            <ul class="list-plain">
        '''
        for imb in imbalances[:5]:  # Show first 5
            diff_text = f"+${imb['diff']:,.0f}" if imb['diff'] > 0 else f"-${abs(imb['diff']):,.0f}"
            imbalance_warning += f'<li>{imb["node"]}: In ${imb["inflow"]:,.0f}, Out ${imb["outflow"]:,.0f} ({diff_text})</li>'
        imbalance_warning += '</ul></div>'

    summary_html = f'''
    <div class="result-grid">
        <div class="result-card">
            <div class="result-label">Total Nodes</div>
            <div class="result-value">{len(nodes)}</div>
        </div>
        <div class="result-card">
            <div class="result-label">Total Flows</div>
            <div class="result-value">{len(aggregated)}</div>
        </div>
        <div class="result-card result-card--accent">
            <div class="result-label">Est. Savings Rate</div>
            <div class="result-value">{savings_rate:.1f}%</div>
        </div>
    </div>

    <div class="insight-box mt-1">
        <div class="insight-title">Flow Summary:</div>
        <p class="insight-text">
            Diagram shows <strong>{len(nodes)} nodes</strong> with <strong>{len(aggregated)} flows</strong>.
            Total income: <strong>${total_income:,.0f}</strong>.
            Total savings: <strong>${total_savings:,.0f}</strong> ({savings_rate:.1f}% savings rate).
        </p>
    </div>
    {imbalance_warning}
    '''
    display(HTML(summary_html), target="#summary")
