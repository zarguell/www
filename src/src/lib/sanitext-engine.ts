/**
 * Sanitext engine — pure redaction logic, no DOM.
 *
 * Consumed by `scripts/sanitext-app.ts` (DOM wiring). Keep this module
 * DOM-free so it stays unit-testable.
 */

export type RuleType = 'regex' | 'string';

export interface SanitizeRule {
	id: string;
	name: string;
	pattern: string;
	replacement: string;
	type: RuleType;
	enabled: boolean;
	category: string;
}

export const DEFAULT_RULES: SanitizeRule[] = [
	{
		id: 'email',
		name: 'Email Addresses',
		pattern: '\\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Z|a-z]{2,}\\b',
		replacement: '<REDACTED_EMAIL>',
		type: 'regex',
		enabled: true,
		category: 'Personal Information'
	},
	{
		id: 'phone',
		name: 'Phone Numbers',
		pattern: '\\b(?:\\+?1[-. ]?)?\\(?([0-9]{3})\\)?[-. ]?([0-9]{3})[-. ]?([0-9]{4})\\b',
		replacement: '<REDACTED_PHONE>',
		type: 'regex',
		enabled: true,
		category: 'Personal Information'
	},
	{
		id: 'ssn',
		name: 'Social Security Numbers',
		pattern: '\\b\\d{3}-\\d{2}-\\d{4}\\b',
		replacement: '<REDACTED_SSN>',
		type: 'regex',
		enabled: true,
		category: 'Personal Information'
	},
	{
		id: 'creditcard',
		name: 'Credit Card Numbers',
		pattern: '\\b(?:\\d{4}[-\\s]?){3}\\d{4}\\b',
		replacement: '<REDACTED_CC>',
		type: 'regex',
		enabled: true,
		category: 'Financial Information'
	},
	{
		id: 'ipv4',
		name: 'IPv4 Addresses',
		pattern: '\\b(?:[0-9]{1,3}\\.){3}[0-9]{1,3}\\b',
		replacement: '<REDACTED_IP>',
		type: 'regex',
		enabled: true,
		category: 'Network Information'
	},
	{
		id: 'url',
		name: 'URLs',
		pattern: 'https?://[^\\s]+',
		replacement: '<REDACTED_URL>',
		type: 'regex',
		enabled: true,
		category: 'Network Information'
	},
	{
		id: 'company-example',
		name: 'Company Name Example',
		pattern: 'ACME Corporation',
		replacement: '<REDACTED_COMPANY>',
		type: 'string',
		enabled: false,
		category: 'Custom Company Rules'
	}
];

/** Escape special regex characters so a string rule matches literally. */
export function escapeRegExp(string: string): string {
	return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** True if `pattern` compiles as a regular expression. */
export function isValidRegexPattern(pattern: string): boolean {
	try {
		new RegExp(pattern);
		return true;
	} catch {
		return false;
	}
}

export interface SanitizeResult {
	/** The redacted text. */
	text: string;
	/** Names of rules that failed to apply (bad pattern etc.) — never throws. */
	failedRules: string[];
}

/**
 * Apply the enabled rules, in order, to `input`.
 * A rule whose pattern fails to compile is skipped (recorded in failedRules)
 * so one bad rule can't break the whole pipeline.
 */
export function sanitizeText(input: string, rules: SanitizeRule[]): SanitizeResult {
	let text = input;
	const failedRules: string[] = [];

	for (const rule of rules) {
		if (!rule.enabled) continue;
		try {
			if (rule.type === 'regex') {
				text = text.replace(new RegExp(rule.pattern, 'g'), rule.replacement);
			} else if (rule.type === 'string') {
				text = text.replace(new RegExp(escapeRegExp(rule.pattern), 'g'), rule.replacement);
			}
		} catch {
			failedRules.push(rule.name);
		}
	}

	return { text, failedRules };
}

/** Loose shape accepted from imported config files (before normalization). */
interface ImportedRule {
	id?: unknown;
	name?: unknown;
	pattern?: unknown;
	replacement?: unknown;
	type?: unknown;
	enabled?: unknown;
	category?: unknown;
}

/**
 * Validate the parsed payload of an imported config file:
 * a non-empty array of rules with the required fields and a known type.
 */
export function isValidImportedConfig(config: unknown): config is ImportedRule[] {
	if (!Array.isArray(config) || config.length === 0) return false;
	return config.every(
		(rule) =>
			!!rule &&
			typeof (rule as ImportedRule).name === 'string' &&
			(rule as ImportedRule).name !== '' &&
			typeof (rule as ImportedRule).pattern === 'string' &&
			(rule as ImportedRule).pattern !== '' &&
			(rule as ImportedRule).replacement !== undefined &&
			typeof (rule as ImportedRule).type === 'string' &&
			((rule as ImportedRule).type as string) in { regex: 1, string: 1 }
	);
}

/**
 * Normalize validated imported rules into full SanitizeRule objects,
 * filling id/enabled/category defaults the same way the original
 * import handler did.
 */
export function normalizeImportedRules(config: ImportedRule[]): SanitizeRule[] {
	return config.map((rule) => ({
		id: typeof rule.id === 'string' && rule.id !== '' ? rule.id : generateRuleId(),
		name: rule.name as string,
		pattern: rule.pattern as string,
		replacement: rule.replacement as string,
		type: rule.type as RuleType,
		enabled: typeof rule.enabled === 'boolean' ? rule.enabled : true,
		category: typeof rule.category === 'string' && rule.category !== '' ? rule.category : 'Custom Company Rules'
	}));
}

/** Generate a rule id (timestamp + random suffix, same scheme as the page). */
export function generateRuleId(): string {
	return Date.now().toString() + Math.random();
}
