"""
Cash Flow Sankey Diagram Builder
Creates Sankey diagrams from simple text input.
"""

import numpy as np
import matplotlib.pyplot as plt
from matplotlib.sankey import Sankey
from pyscript import display, document, HTML
from io import BytesIO
import base64
import re

plt.rcParams['figure.figsize'] = [12, 8]
plt.rcParams['figure.autolayout'] = True

def parse_sankey_text(text):
    """Parse SankeyMatic-style text format into flows."""
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

def get_color(label):
    """Assign colors based on node type."""
    label_lower = label.lower()

    if any(word in label_lower for word in ['income', 'salary', 'revenue', 'gross']):
        return '#808080'  # Gray for income
    elif any(word in label_lower for word in ['tax', 'irs', 'fica', 'federal', 'state']):
        return '#ff6b6b'  # Red for taxes
    elif any(word in label_lower for word in ['savings', 'investment', '401k', 'ira', 'roth', 'hsa', 'brokerage']):
        return '#51cf66'  # Green for savings
    elif any(word in label_lower for word in ['expense', 'housing', 'food', 'transport', 'utilities', 'spending']):
        return '#339af0'  # Blue for expenses
    else:
        return '#845ef7'  # Purple for other

def build_sankey(event=None):
    """Build Sankey diagram from text input."""

    try:
        sankey_text = document.getElementById("sankeyText").value
        title = document.getElementById("diagramTitle").value or "Cash Flow Diagram"

        if not sankey_text.strip():
            display(HTML('<p style="color: var(--accent);">Please enter flow data.</p>'), target="#summary")
            return

    except Exception as e:
        display(HTML(f'<p style="color: var(--accent);">Error reading input: {str(e)}</p>'), target="#summary")
        return

    # Parse and aggregate flows
    flows = parse_sankey_text(sankey_text)

    if not flows:
        display(HTML('<p style="color: var(--accent);">No valid flows found. Check format: Source [value] Target</p>'), target="#summary")
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

    # Create Sankey diagram
    fig = plt.figure(figsize=(14, 10), dpi=200)
    ax = fig.add_subplot(111)

    # Prepare flows for matplotlib.sankey
    # Format: [source, target, value]
    sankey_flows = []
    for flow in aggregated:
        source_idx = node_index[flow['source']]
        target_idx = node_index[flow['target']]
        sankey_flows.append([source_idx, target_idx, flow['value']])

    # Create labels
    labels = nodes

    # Get colors for each flow
    colors = []
    for flow in aggregated:
        colors.append(get_color(flow['source']))

    # Add alpha for transparency
    from matplotlib.colors import to_rgba
    flow_colors = [to_rgba(c, alpha=0.6) for c in colors]

    # Create Sankey diagram
    sankey = Sankey(
        flows=sankey_flows,
        labels=labels,
        flow_labels=None,  # Don't show values on flows
        orientations=[0] * len(nodes),  # All horizontal
        edgecolor='black',
        facecolors=flow_colors,
        headangle=180,
        margin=0.2,
        scale=1.0 / max([sum([f[2] for f in sankey_flows if f[0] == i]) for i in range(len(nodes))]) if sankey_flows else 1.0
    )

    sankey.finish()

    ax.set_title(f'{title}\n(Cash Flow Sankey Diagram)', fontsize=14, fontweight='bold')
    ax.axis('off')  # Turn off axis

    # Export
    buf = BytesIO()
    fig.savefig(buf, format='png', dpi=200, bbox_inches='tight')
    buf.seek(0)
    img_data = base64.b64encode(buf.read()).decode()

    # Display
    img_html = f'<img id="chartImg" src="data:image/png;base64,{img_data}" alt="Cash Flow Diagram" style="max-width: 100%; height: auto; display: block;">'
    display(HTML(img_html), target="#chart")

    # Summary
    total_income = sum([inflows.get(node, 0) for node in nodes if outflows.get(node, 0) == 0 or inflows.get(node, 0) > outflows.get(node, 0)])
    total_savings = sum([outflows.get(node, 0) for node in nodes if 'savings' in node.lower() or 'investment' in node.lower() or '401k' in node.lower() or 'ira' in node.lower() or 'roth' in node.lower()])
    savings_rate = (total_savings / total_income * 100) if total_income > 0 else 0

    imbalance_warning = ''
    if imbalances:
        imbalance_warning = f'''
        <div style="margin-top: 1rem; padding: 1rem; border: 2px solid orange; background: var(--panel-bg);">
            <div style="font-weight: bold; margin-bottom: 0.5rem; color: orange;">Flow Imbalances Detected:</div>
            <ul style="margin: 0; padding-left: 1.5rem; color: var(--text);">
        '''
        for imb in imbalances[:5]:  # Show first 5
            diff_text = f"+${imb['diff']:,.0f}" if imb['diff'] > 0 else f"-${abs(imb['diff']):,.0f}"
            imbalance_warning += f'<li>{imb["node"]}: In ${imb["inflow"]:,.0f}, Out ${imb["outflow"]:,.0f} ({diff_text})</li>'
        imbalance_warning += '</ul></div>'

    summary_html = f'''
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-top: 1.5rem;">
        <div style="padding: 1rem; border: 2px solid var(--border); background: var(--panel-bg);">
            <div style="font-size: 0.9rem; color: var(--muted); margin-bottom: 0.5rem;">Total Nodes</div>
            <div style="font-size: 1.5rem; font-weight: bold; color: var(--accent);">{len(nodes)}</div>
        </div>
        <div style="padding: 1rem; border: 2px solid var(--border); background: var(--panel-bg);">
            <div style="font-size: 0.9rem; color: var(--muted); margin-bottom: 0.5rem;">Total Flows</div>
            <div style="font-size: 1.5rem; font-weight: bold; color: var(--accent);">{len(aggregated)}</div>
        </div>
        <div style="padding: 1rem; border: 2px solid var(--accent); background: var(--panel-bg);">
            <div style="font-size: 0.9rem; color: var(--muted); margin-bottom: 0.5rem;">Est. Savings Rate</div>
            <div style="font-size: 1.5rem; font-weight: bold; color: var(--accent);">{savings_rate:.1f}%</div>
        </div>
    </div>

    <div style="margin-top: 1rem; padding: 1rem; border: 2px solid var(--accent); background: var(--panel-bg);">
        <div style="font-weight: bold; margin-bottom: 0.5rem; color: var(--accent);">Flow Summary:</div>
        <p style="margin: 0; color: var(--text);">
            Diagram shows <strong>{len(nodes)} nodes</strong> with <strong>{len(aggregated)} flows</strong>.
            Total income: <strong>${total_income:,.0f}</strong>.
            Total savings: <strong>${total_savings:,.0f}</strong> ({savings_rate:.1f}% savings rate).
        </p>
    </div>
    {imbalance_warning}
    '''
    display(HTML(summary_html), target="#summary")
