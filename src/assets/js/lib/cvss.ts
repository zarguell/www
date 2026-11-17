/** CVSS v2, v3.x, and v4.0 vector parsing and metric explanations. */

export type CvssVersion = '2.0' | '3.0' | '3.1' | '3.x' | '4.0';
export type MetricGroup = 'Base' | 'Temporal' | 'Threat' | 'Environmental' | 'Supplemental';

export interface MetricValue {
  label: string;
  description: string;
}

export interface MetricDefinition {
  code: string;
  name: string;
  group: MetricGroup;
  description: string;
  values: Record<string, MetricValue>;
  required: boolean;
  order: number;
}

export interface ParsedMetric {
  code: string;
  value: string;
  definition: MetricDefinition;
  valueLabel?: string;
  valueDescription?: string;
  invalidValue?: boolean;
}

export interface MetricGroupView {
  group: MetricGroup;
  metrics: ParsedMetric[];
}

export interface CvssParseResult {
  version: CvssVersion | null;
  versionLabel: string;
  metrics: ParsedMetric[];
  groups: MetricGroupView[];
  errors: string[];
  warnings: string[];
  missingBase: string[];
  canonical: string;
}

const value = (label: string, description: string): MetricValue => ({ label, description });

const def = (
  code: string,
  name: string,
  group: MetricGroup,
  description: string,
  values: Record<string, MetricValue>,
  order: number,
  required = false
): MetricDefinition => ({ code, name, group, description, values, required, order });

const v4: MetricDefinition[] = [
  def('AV', 'Attack Vector', 'Base', 'How the attacker reaches the vulnerable system.', {
    N: value('Network', 'Exploitable remotely over the internet or another network.'),
    A: value('Adjacent', 'Limited to the same shared network, protocol, or logical neighborhood.'),
    L: value('Local', 'Requires local access, a user context, or a local exploit primitive.'),
    P: value('Physical', 'Requires physical interaction with the device.')
  }, 0, true),
  def('AC', 'Attack Complexity', 'Base', 'Conditions beyond the attacker’s control that are required to exploit the issue.', {
    L: value('Low', 'No special conditions; the attack is repeatable and reliable.'),
    H: value('High', 'Requires a race, non-default configuration, or other specific conditions.')
  }, 1, true),
  def('AT', 'Attack Requirements', 'Base', 'Whether the attack needs the target to be in a particular state.', {
    N: value('None', 'No additional attack requirements.'),
    P: value('Present', 'The target must be in a specific state for the attack to work.')
  }, 2, true),
  def('PR', 'Privileges Required', 'Base', 'Privileges the attacker must already have.', {
    N: value('None', 'No privileges required.'),
    L: value('Low', 'Requires ordinary user-level access.'),
    H: value('High', 'Requires administrative or otherwise privileged access.')
  }, 3, true),
  def('UI', 'User Interaction', 'Base', 'Whether a human must participate in the attack.', {
    N: value('None', 'No user interaction is required.'),
    P: value('Passive', 'A user performs an incidental action, such as visiting a page.'),
    A: value('Active', 'A user performs a deliberate, security-relevant action.')
  }, 4, true),
  def('VC', 'Vulnerable System Confidentiality', 'Base', 'Confidentiality impact on the vulnerable system.', {
    H: value('High', 'Significant data disclosure from the vulnerable system.'),
    L: value('Low', 'Limited data disclosure from the vulnerable system.'),
    N: value('None', 'No confidentiality impact on the vulnerable system.')
  }, 5, true),
  def('VI', 'Vulnerable System Integrity', 'Base', 'Integrity impact on the vulnerable system.', {
    H: value('High', 'Significant modification or control of the vulnerable system.'),
    L: value('Low', 'Limited modification of the vulnerable system.'),
    N: value('None', 'No integrity impact on the vulnerable system.')
  }, 6, true),
  def('VA', 'Vulnerable System Availability', 'Base', 'Availability impact on the vulnerable system.', {
    H: value('High', 'Significant loss of availability in the vulnerable system.'),
    L: value('Low', 'Limited loss of availability in the vulnerable system.'),
    N: value('None', 'No availability impact on the vulnerable system.')
  }, 7, true),
  def('SC', 'Subsequent System Confidentiality', 'Base', 'Confidentiality impact on systems beyond the vulnerable component.', {
    H: value('High', 'Significant data disclosure from a subsequent system.'),
    L: value('Low', 'Limited data disclosure from a subsequent system.'),
    N: value('None', 'No confidentiality impact beyond the vulnerable system.')
  }, 8, true),
  def('SI', 'Subsequent System Integrity', 'Base', 'Integrity impact on systems beyond the vulnerable component.', {
    H: value('High', 'Significant modification of a subsequent system.'),
    L: value('Low', 'Limited modification of a subsequent system.'),
    N: value('None', 'No integrity impact beyond the vulnerable system.')
  }, 9, true),
  def('SA', 'Subsequent System Availability', 'Base', 'Availability impact on systems beyond the vulnerable component.', {
    H: value('High', 'Significant loss of availability in a subsequent system.'),
    L: value('Low', 'Limited loss of availability in a subsequent system.'),
    N: value('None', 'No availability impact beyond the vulnerable system.')
  }, 10, true),
  def('E', 'Exploit Maturity', 'Threat', 'Maturity of public exploit code or active exploitation.', {
    X: value('Not Defined', 'Use the default scoring value.'),
    A: value('Attacked', 'Active exploitation has been observed.'),
    P: value('Proof-of-Concept', 'A working proof-of-concept exists.'),
    U: value('Unreported', 'No public exploit is known.')
  }, 20),
  def('CR', 'Confidentiality Requirement', 'Environmental', 'Relative importance of confidentiality to the organization.', {
    X: value('Not Defined', 'Use the default scoring value.'),
    H: value('High', 'Confidentiality is highly important.'),
    M: value('Medium', 'Confidentiality is moderately important.'),
    L: value('Low', 'Confidentiality has limited importance.')
  }, 30),
  def('IR', 'Integrity Requirement', 'Environmental', 'Relative importance of integrity to the organization.', {
    X: value('Not Defined', 'Use the default scoring value.'),
    H: value('High', 'Integrity is highly important.'),
    M: value('Medium', 'Integrity is moderately important.'),
    L: value('Low', 'Integrity has limited importance.')
  }, 31),
  def('AR', 'Availability Requirement', 'Environmental', 'Relative importance of availability to the organization.', {
    X: value('Not Defined', 'Use the default scoring value.'),
    H: value('High', 'Availability is highly important.'),
    M: value('Medium', 'Availability is moderately important.'),
    L: value('Low', 'Availability has limited importance.')
  }, 32),
  def('MAV', 'Modified Attack Vector', 'Environmental', 'Environmental override for Attack Vector.', {
    X: value('Not Defined', 'Use the base value.'),
    N: value('Network', 'Exploitable remotely over the internet or another network.'),
    A: value('Adjacent', 'Limited to the same shared network, protocol, or logical neighborhood.'),
    L: value('Local', 'Requires local access, a user context, or a local exploit primitive.'),
    P: value('Physical', 'Requires physical interaction with the device.')
  }, 33),
  def('MAC', 'Modified Attack Complexity', 'Environmental', 'Environmental override for Attack Complexity.', {
    X: value('Not Defined', 'Use the base value.'),
    L: value('Low', 'No special conditions; the attack is repeatable and reliable.'),
    H: value('High', 'Requires a race, non-default configuration, or other specific conditions.')
  }, 34),
  def('MAT', 'Modified Attack Requirements', 'Environmental', 'Environmental override for Attack Requirements.', {
    X: value('Not Defined', 'Use the base value.'),
    N: value('None', 'No additional attack requirements.'),
    P: value('Present', 'The target must be in a specific state for the attack to work.')
  }, 35),
  def('MPR', 'Modified Privileges Required', 'Environmental', 'Environmental override for Privileges Required.', {
    X: value('Not Defined', 'Use the base value.'),
    N: value('None', 'No privileges required.'),
    L: value('Low', 'Requires ordinary user-level access.'),
    H: value('High', 'Requires administrative or otherwise privileged access.')
  }, 36),
  def('MUI', 'Modified User Interaction', 'Environmental', 'Environmental override for User Interaction.', {
    X: value('Not Defined', 'Use the base value.'),
    N: value('None', 'No user interaction is required.'),
    P: value('Passive', 'A user performs an incidental action, such as visiting a page.'),
    A: value('Active', 'A user performs a deliberate, security-relevant action.')
  }, 37),
  def('MVC', 'Modified Vulnerable System Confidentiality', 'Environmental', 'Environmental override for vulnerable system confidentiality.', {
    X: value('Not Defined', 'Use the base value.'),
    H: value('High', 'Significant data disclosure.'),
    L: value('Low', 'Limited data disclosure.'),
    N: value('None', 'No confidentiality impact.')
  }, 38),
  def('MVI', 'Modified Vulnerable System Integrity', 'Environmental', 'Environmental override for vulnerable system integrity.', {
    X: value('Not Defined', 'Use the base value.'),
    H: value('High', 'Significant modification or control.'),
    L: value('Low', 'Limited modification.'),
    N: value('None', 'No integrity impact.')
  }, 39),
  def('MVA', 'Modified Vulnerable System Availability', 'Environmental', 'Environmental override for vulnerable system availability.', {
    X: value('Not Defined', 'Use the base value.'),
    H: value('High', 'Significant loss of availability.'),
    L: value('Low', 'Limited loss of availability.'),
    N: value('None', 'No availability impact.')
  }, 40),
  def('MSC', 'Modified Subsequent System Confidentiality', 'Environmental', 'Environmental override for subsequent system confidentiality.', {
    X: value('Not Defined', 'Use the base value.'),
    H: value('High', 'Significant data disclosure in a subsequent system.'),
    L: value('Low', 'Limited data disclosure in a subsequent system.'),
    N: value('None', 'No confidentiality impact beyond the vulnerable system.')
  }, 41),
  def('MSI', 'Modified Subsequent System Integrity', 'Environmental', 'Environmental override for subsequent system integrity.', {
    X: value('Not Defined', 'Use the base value.'),
    H: value('High', 'Significant modification of a subsequent system.'),
    L: value('Low', 'Limited modification of a subsequent system.'),
    N: value('None', 'No integrity impact beyond the vulnerable system.')
  }, 42),
  def('MSA', 'Modified Subsequent System Availability', 'Environmental', 'Environmental override for subsequent system availability.', {
    X: value('Not Defined', 'Use the base value.'),
    H: value('High', 'Significant loss of availability in a subsequent system.'),
    L: value('Low', 'Limited loss of availability in a subsequent system.'),
    N: value('None', 'No availability impact beyond the vulnerable system.')
  }, 43),
  def('S', 'Safety', 'Supplemental', 'Whether the exploit can cause safety harm.', {
    X: value('Not Defined', 'Use the default scoring value.'),
    N: value('Negligible', 'No meaningful safety impact.'),
    P: value('Present', 'The exploit can cause safety harm.')
  }, 50),
  def('AU', 'Automatable', 'Supplemental', 'Whether an attacker can reliably automate the exploit.', {
    X: value('Not Defined', 'Use the default scoring value.'),
    N: value('No', 'Automation is impractical or unreliable.'),
    Y: value('Yes', 'The exploit can be automated.')
  }, 51),
  def('R', 'Recovery', 'Supplemental', 'How easily the affected system can recover.', {
    X: value('Not Defined', 'Use the default scoring value.'),
    N: value('Not Automatic', 'Recovery is not automatic.'),
    U: value('User-Initiated', 'A user must initiate recovery.'),
    A: value('Automatic', 'The system recovers automatically.')
  }, 52),
  def('V', 'Value Density', 'Supplemental', 'How concentrated the value of the affected asset is.', {
    X: value('Not Defined', 'Use the default scoring value.'),
    D: value('Diffuse', 'The asset has diffuse or limited value.'),
    C: value('Concentrated', 'The asset has concentrated, high value.')
  }, 53),
  def('RE', 'Vulnerability Response Effort', 'Supplemental', 'Effort needed to respond to or remediate the vulnerability.', {
    X: value('Not Defined', 'Use the default scoring value.'),
    L: value('Low', 'Low response effort.'),
    M: value('Moderate', 'Moderate response effort.'),
    H: value('High', 'High response effort.')
  }, 54),
  def('U', 'Provider Urgency', 'Supplemental', 'The provider’s urgency assessment.', {
    X: value('Not Defined', 'Use the default scoring value.'),
    Clear: value('Clear', 'No special urgency.'),
    Green: value('Green', 'Low urgency.'),
    Amber: value('Amber', 'Elevated urgency.'),
    Red: value('Red', 'Critical urgency.')
  }, 55)
];

const v3: MetricDefinition[] = [
  def('AV', 'Attack Vector', 'Base', 'How the attacker reaches the vulnerable component.', {
    N: value('Network', 'Exploitable remotely over the internet or another network.'),
    A: value('Adjacent', 'Limited to the same shared network or protocol.'),
    L: value('Local', 'Requires local access or a user context.'),
    P: value('Physical', 'Requires physical interaction with the device.')
  }, 0, true),
  def('AC', 'Attack Complexity', 'Base', 'Conditions beyond the attacker’s control needed to exploit the issue.', {
    L: value('Low', 'No special conditions; the attack is repeatable.'),
    H: value('High', 'Requires a race, non-default configuration, or other specific conditions.')
  }, 1, true),
  def('PR', 'Privileges Required', 'Base', 'Privileges the attacker must already have.', {
    N: value('None', 'No privileges required.'),
    L: value('Low', 'Requires ordinary user-level access.'),
    H: value('High', 'Requires administrative access.')
  }, 2, true),
  def('UI', 'User Interaction', 'Base', 'Whether a human must participate in the attack.', {
    N: value('None', 'No user interaction is required.'),
    R: value('Required', 'A user must perform an action.')
  }, 3, true),
  def('S', 'Scope', 'Base', 'Whether the impact crosses a security boundary.', {
    U: value('Unchanged', 'Impact stays within the same security authority.'),
    C: value('Changed', 'Impact crosses a security boundary.')
  }, 4, true),
  def('C', 'Confidentiality', 'Base', 'Confidentiality impact on the affected component.', {
    H: value('High', 'Significant data disclosure.'),
    L: value('Low', 'Limited data disclosure.'),
    N: value('None', 'No confidentiality impact.')
  }, 5, true),
  def('I', 'Integrity', 'Base', 'Integrity impact on the affected component.', {
    H: value('High', 'Significant modification or control.'),
    L: value('Low', 'Limited modification.'),
    N: value('None', 'No integrity impact.')
  }, 6, true),
  def('A', 'Availability', 'Base', 'Availability impact on the affected component.', {
    H: value('High', 'Significant loss of availability.'),
    L: value('Low', 'Limited loss of availability.'),
    N: value('None', 'No availability impact.')
  }, 7, true),
  def('E', 'Exploit Code Maturity', 'Temporal', 'Maturity of public exploit code.', {
    X: value('Not Defined', 'Use the default scoring value.'),
    U: value('Unproven', 'No working exploit is known.'),
    P: value('Proof-of-Concept', 'A proof-of-concept exists.'),
    F: value('Functional', 'A functional exploit exists.'),
    H: value('High', 'A reliable, widely available exploit exists.')
  }, 20),
  def('RL', 'Remediation Level', 'Temporal', 'Availability of an official or temporary fix.', {
    X: value('Not Defined', 'Use the default scoring value.'),
    O: value('Official Fix', 'An official fix is available.'),
    T: value('Temporary Fix', 'A temporary fix is available.'),
    W: value('Workaround', 'A workaround is available.'),
    U: value('Unavailable', 'No fix or workaround is available.')
  }, 21),
  def('RC', 'Report Confidence', 'Temporal', 'Confidence that the vulnerability report is accurate.', {
    X: value('Not Defined', 'Use the default scoring value.'),
    U: value('Unconfirmed', 'The report is unconfirmed.'),
    R: value('Reasonable', 'The report is plausible but not fully confirmed.'),
    C: value('Confirmed', 'The report is confirmed.')
  }, 22),
  def('CR', 'Confidentiality Requirement', 'Environmental', 'Relative importance of confidentiality to the organization.', {
    X: value('Not Defined', 'Use the default scoring value.'),
    H: value('High', 'Confidentiality is highly important.'),
    M: value('Medium', 'Confidentiality is moderately important.'),
    L: value('Low', 'Confidentiality has limited importance.')
  }, 30),
  def('IR', 'Integrity Requirement', 'Environmental', 'Relative importance of integrity to the organization.', {
    X: value('Not Defined', 'Use the default scoring value.'),
    H: value('High', 'Integrity is highly important.'),
    M: value('Medium', 'Integrity is moderately important.'),
    L: value('Low', 'Integrity has limited importance.')
  }, 31),
  def('AR', 'Availability Requirement', 'Environmental', 'Relative importance of availability to the organization.', {
    X: value('Not Defined', 'Use the default scoring value.'),
    H: value('High', 'Availability is highly important.'),
    M: value('Medium', 'Availability is moderately important.'),
    L: value('Low', 'Availability has limited importance.')
  }, 32),
  def('MAV', 'Modified Attack Vector', 'Environmental', 'Environmental override for Attack Vector.', {
    X: value('Not Defined', 'Use the base value.'),
    N: value('Network', 'Exploitable remotely.'),
    A: value('Adjacent', 'Limited to the same shared network.'),
    L: value('Local', 'Requires local access.'),
    P: value('Physical', 'Requires physical interaction.')
  }, 33),
  def('MAC', 'Modified Attack Complexity', 'Environmental', 'Environmental override for Attack Complexity.', {
    X: value('Not Defined', 'Use the base value.'),
    L: value('Low', 'No special conditions.'),
    H: value('High', 'Requires specific conditions.')
  }, 34),
  def('MPR', 'Modified Privileges Required', 'Environmental', 'Environmental override for Privileges Required.', {
    X: value('Not Defined', 'Use the base value.'),
    N: value('None', 'No privileges required.'),
    L: value('Low', 'Requires user-level access.'),
    H: value('High', 'Requires administrative access.')
  }, 35),
  def('MUI', 'Modified User Interaction', 'Environmental', 'Environmental override for User Interaction.', {
    X: value('Not Defined', 'Use the base value.'),
    N: value('None', 'No user interaction required.'),
    R: value('Required', 'A user must perform an action.')
  }, 36),
  def('MS', 'Modified Scope', 'Environmental', 'Environmental override for Scope.', {
    X: value('Not Defined', 'Use the base value.'),
    U: value('Unchanged', 'Impact stays within the same security authority.'),
    C: value('Changed', 'Impact crosses a security boundary.')
  }, 37),
  def('MC', 'Modified Confidentiality', 'Environmental', 'Environmental override for confidentiality impact.', {
    X: value('Not Defined', 'Use the base value.'),
    H: value('High', 'Significant data disclosure.'),
    L: value('Low', 'Limited data disclosure.'),
    N: value('None', 'No confidentiality impact.')
  }, 38),
  def('MI', 'Modified Integrity', 'Environmental', 'Environmental override for integrity impact.', {
    X: value('Not Defined', 'Use the base value.'),
    H: value('High', 'Significant modification or control.'),
    L: value('Low', 'Limited modification.'),
    N: value('None', 'No integrity impact.')
  }, 39),
  def('MA', 'Modified Availability', 'Environmental', 'Environmental override for availability impact.', {
    X: value('Not Defined', 'Use the base value.'),
    H: value('High', 'Significant loss of availability.'),
    L: value('Low', 'Limited loss of availability.'),
    N: value('None', 'No availability impact.')
  }, 40)
];

const v2: MetricDefinition[] = [
  def('AV', 'Access Vector', 'Base', 'How the attacker reaches the vulnerable component.', {
    L: value('Local', 'Requires local access to the system.'),
    A: value('Adjacent Network', 'Requires access to the same broadcast or collision domain.'),
    N: value('Network', 'Exploitable remotely over the network.')
  }, 0, true),
  def('AC', 'Access Complexity', 'Base', 'How difficult the attack is to carry out.', {
    H: value('High', 'Requires specialized access or conditions.'),
    M: value('Medium', 'Requires some additional information or conditions.'),
    L: value('Low', 'No specialized access or conditions required.')
  }, 1, true),
  def('Au', 'Authentication', 'Base', 'Authentication required before exploitation.', {
    M: value('Multiple', 'Multiple authenticated instances are required.'),
    S: value('Single', 'A single authenticated instance is required.'),
    N: value('None', 'No authentication is required.')
  }, 2, true),
  def('C', 'Confidentiality Impact', 'Base', 'Confidentiality impact on the affected component.', {
    N: value('None', 'No confidentiality impact.'),
    P: value('Partial', 'Some data disclosure is possible.'),
    C: value('Complete', 'Total data disclosure is possible.')
  }, 3, true),
  def('I', 'Integrity Impact', 'Base', 'Integrity impact on the affected component.', {
    N: value('None', 'No integrity impact.'),
    P: value('Partial', 'Some data modification is possible.'),
    C: value('Complete', 'Total data modification is possible.')
  }, 4, true),
  def('A', 'Availability Impact', 'Base', 'Availability impact on the affected component.', {
    N: value('None', 'No availability impact.'),
    P: value('Partial', 'Partial loss of availability.'),
    C: value('Complete', 'Complete loss of availability.')
  }, 5, true),
  def('E', 'Exploitability', 'Temporal', 'Maturity of public exploit code.', {
    U: value('Unproven', 'No working exploit is known.'),
    P: value('Proof-of-Concept', 'A proof-of-concept exists.'),
    F: value('Functional', 'A functional exploit exists.'),
    H: value('High', 'A reliable, widely available exploit exists.'),
    ND: value('Not Defined', 'Use the default scoring value.')
  }, 20),
  def('RL', 'Remediation Level', 'Temporal', 'Availability of an official or temporary fix.', {
    OF: value('Official Fix', 'An official fix is available.'),
    TF: value('Temporary Fix', 'A temporary fix is available.'),
    W: value('Workaround', 'A workaround is available.'),
    U: value('Unavailable', 'No fix or workaround is available.'),
    ND: value('Not Defined', 'Use the default scoring value.')
  }, 21),
  def('RC', 'Report Confidence', 'Temporal', 'Confidence that the vulnerability report is accurate.', {
    UC: value('Unconfirmed', 'The report is unconfirmed.'),
    UR: value('Uncorroborated', 'The report is uncorroborated.'),
    C: value('Confirmed', 'The report is confirmed.'),
    ND: value('Not Defined', 'Use the default scoring value.')
  }, 22),
  def('CDP', 'Collateral Damage Potential', 'Environmental', 'Potential for collateral damage to other systems.', {
    N: value('None', 'No collateral damage potential.'),
    L: value('Low', 'Low collateral damage potential.'),
    LM: value('Low-Medium', 'Low-to-medium collateral damage potential.'),
    M: value('Medium', 'Medium collateral damage potential.'),
    H: value('High', 'High collateral damage potential.')
  }, 30),
  def('TD', 'Target Distribution', 'Environmental', 'Proportion of affected systems in the environment.', {
    N: value('None', 'No target systems are affected.'),
    L: value('Low', 'A small proportion of target systems is affected.'),
    M: value('Medium', 'A medium proportion of target systems is affected.'),
    H: value('High', 'A high proportion of target systems is affected.'),
    ND: value('Not Defined', 'Use the default scoring value.')
  }, 31),
  def('CR', 'Confidentiality Requirement', 'Environmental', 'Relative importance of confidentiality to the organization.', {
    L: value('Low', 'Confidentiality has limited importance.'),
    M: value('Medium', 'Confidentiality is moderately important.'),
    H: value('High', 'Confidentiality is highly important.'),
    ND: value('Not Defined', 'Use the default scoring value.')
  }, 32),
  def('IR', 'Integrity Requirement', 'Environmental', 'Relative importance of integrity to the organization.', {
    L: value('Low', 'Integrity has limited importance.'),
    M: value('Medium', 'Integrity is moderately important.'),
    H: value('High', 'Integrity is highly important.'),
    ND: value('Not Defined', 'Use the default scoring value.')
  }, 33),
  def('AR', 'Availability Requirement', 'Environmental', 'Relative importance of availability to the organization.', {
    L: value('Low', 'Availability has limited importance.'),
    M: value('Medium', 'Availability is moderately important.'),
    H: value('High', 'Availability is highly important.'),
    ND: value('Not Defined', 'Use the default scoring value.')
  }, 34)
];

const definitions: Record<CvssVersion, MetricDefinition[]> = {
  '4.0': v4,
  '3.1': v3,
  '3.0': v3,
  '3.x': v3,
  '2.0': v2
};

const versionLabels: Record<CvssVersion, string> = {
  '4.0': 'CVSS v4.0',
  '3.1': 'CVSS v3.1',
  '3.0': 'CVSS v3.0',
  '3.x': 'CVSS v3.x (inferred)',
  '2.0': 'CVSS v2.0'
};

const groupOrder = (version: CvssVersion): MetricGroup[] =>
  version === '4.0'
    ? ['Base', 'Threat', 'Environmental', 'Supplemental']
    : ['Base', 'Temporal', 'Environmental'];

const requiredBase = (version: CvssVersion): string[] =>
  definitions[version].filter((metric) => metric.required).map((metric) => metric.code);

const emptyResult = (message: string): CvssParseResult => ({
  version: null,
  versionLabel: 'Unknown version',
  metrics: [],
  groups: [],
  errors: [message],
  warnings: [],
  missingBase: [],
  canonical: ''
});

export function parseVector(raw: string): CvssParseResult {
  const normalized = raw.trim().replace(/\s+/g, '');
  if (!normalized) return emptyResult('Enter a CVSS vector.');

  let parts = normalized.split('/').filter(Boolean);
  let version: CvssVersion | null = null;
  let inferred = false;

  const prefix = parts[0]?.match(/^CVSS:(\d\.\d)$/i);
  if (prefix) {
    const candidate = prefix[1] as CvssVersion;
    if (candidate !== '4.0' && candidate !== '3.1' && candidate !== '3.0' && candidate !== '2.0') {
      return emptyResult(`Unsupported CVSS version: ${prefix[1]}. Supported versions are 4.0, 3.1, 3.0, and 2.0.`);
    }
    version = candidate;
    parts = parts.slice(1);
  } else {
    const codes = parts.map((part) => part.split(':')[0]);
    if (codes.includes('Au')) version = '2.0';
    else if (codes.includes('PR') || codes.includes('S')) version = '3.x';
    else if (codes.some((code) => ['AT', 'VC', 'VI', 'VA', 'SC', 'SI', 'SA', 'AU', 'R', 'V', 'RE', 'U'].includes(code)))
      version = '4.0';
    else return emptyResult('Could not determine the CVSS version. Include a CVSS:4.0/, CVSS:3.1/, or CVSS:3.0/ prefix.');
    inferred = true;
  }

  if (!version) return emptyResult('Could not determine the CVSS version.');
  const known = new Map(definitions[version].map((metric) => [metric.code, metric]));
  const allCodes = new Set(Object.values(definitions).flatMap((list) => list.map((metric) => metric.code)));
  const seen = new Set<string>();
  const metrics: ParsedMetric[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const part of parts) {
    const separator = part.indexOf(':');
    if (separator <= 0 || separator === part.length - 1) {
      errors.push(`Invalid metric “${part}”. Expected CODE:VALUE.`);
      continue;
    }
    const code = part.slice(0, separator);
    const metricValue = part.slice(separator + 1);
    const definition = known.get(code);
    if (!definition) {
      warnings.push(
        allCodes.has(code)
          ? `${code} is not a valid metric for ${versionLabels[version]}.`
          : `Unknown metric “${code}” ignored.`
      );
      continue;
    }
    if (seen.has(code)) {
      warnings.push(`Duplicate metric “${code}”; the first value was used.`);
      continue;
    }
    seen.add(code);
    const valueDefinition = definition.values[metricValue];
    if (!valueDefinition) {
      errors.push(
        `Invalid value “${metricValue}” for ${code}. Allowed: ${Object.keys(definition.values).join(', ')}.`
      );
    }
    metrics.push({
      code,
      value: metricValue,
      definition,
      valueLabel: valueDefinition?.label,
      valueDescription: valueDefinition?.description,
      invalidValue: !valueDefinition
    });
  }

  const missingBase = requiredBase(version).filter((code) => !seen.has(code));
  if (missingBase.length) warnings.push(`Missing required base metric${missingBase.length === 1 ? '' : 's'}: ${missingBase.join(', ')}.`);

  metrics.sort((a, b) => a.definition.order - b.definition.order);
  const groups = groupOrder(version)
    .map((group) => ({ group, metrics: metrics.filter((metric) => metric.definition.group === group) }))
    .filter((group) => group.metrics.length > 0);

  const prefixValue =
    !inferred && version !== '2.0' && version !== '3.x' ? `CVSS:${version}/` : '';
  const canonical = metrics.length ? `${prefixValue}${metrics.map((metric) => `${metric.code}:${metric.value}`).join('/')}` : '';

  return {
    version,
    versionLabel: versionLabels[version],
    metrics,
    groups,
    errors,
    warnings,
    missingBase,
    canonical
  };
}
