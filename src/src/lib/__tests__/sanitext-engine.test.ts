import { describe, it, expect } from 'vitest';
import {
	DEFAULT_RULES,
	escapeRegExp,
	isValidImportedConfig,
	isValidRegexPattern,
	normalizeImportedRules,
	sanitizeText
} from '../sanitext-engine';

const enabled = (ids: string[]) =>
	DEFAULT_RULES.filter((r) => ids.includes(r.id) && r.enabled);

describe('sanitizeText', () => {
	it('redacts emails with the default email rule', () => {
		const { text, failedRules } = sanitizeText(
			'Contact john.doe+filter@example.co.uk for details',
			enabled(['email'])
		);
		expect(text).toBe('Contact <REDACTED_EMAIL> for details');
		expect(failedRules).toEqual([]);
	});

	it('redacts US phone number formats (dashes, dots)', () => {
		for (const phone of ['555-123-4567', '555.123.4567', '555 123 4567']) {
			const { text } = sanitizeText(`call ${phone} now`, enabled(['phone']));
			expect(text).toBe('call <REDACTED_PHONE> now');
		}
	});

	// KNOWN QUIRKS (faithful to the shipped pattern): leading decoration chars
	// can leak because `\b` precedes the optional `(?:\+?1[-. ]?)?` and `\(?`/
	// `\)?` are independently optional. The digits — the actual PII — are always
	// fully redacted. Documented rather than silently changed during extraction.
	it('redacts all phone digits; may leak a leading ( or + decoration', () => {
		// "(555) 123 4567" matches from "555)" onward (unbalanced optional parens)
		expect(sanitizeText('call (555) 123 4567 now', enabled(['phone'])).text).toBe(
			'call (<REDACTED_PHONE> now'
		);
		// \b cannot match before "+", so "+1-555-123-4567" matches from "1"
		expect(sanitizeText('call +1-555-123-4567 now', enabled(['phone'])).text).toBe(
			'call +<REDACTED_PHONE> now'
		);
	});

	it('redacts SSNs and credit cards', () => {
		expect(sanitizeText('SSN: 123-45-6789', enabled(['ssn'])).text).toBe(
			'SSN: <REDACTED_SSN>'
		);
		expect(sanitizeText('CC: 4111 1111 1111 1111', enabled(['creditcard'])).text).toBe(
			'CC: <REDACTED_CC>'
		);
	});

	it('redacts IPv4 and URLs', () => {
		expect(sanitizeText('host 192.168.1.100 down', enabled(['ipv4'])).text).toBe(
			'host <REDACTED_IP> down'
		);
		expect(
			sanitizeText('see https://example.com/x?q=1 and http://a.b/c', enabled(['url'])).text
		).toBe('see <REDACTED_URL> and <REDACTED_URL>');
	});

	it('applies all enabled default rules in one pass', () => {
		const input =
			'From bob@corp.com at 555-867-5309, ssn 111-22-3333, card 4111111111111111, ip 10.0.0.1, url https://x.io/y';
		const { text } = sanitizeText(input, DEFAULT_RULES.filter((r) => r.enabled));
		expect(text).toBe(
			'From <REDACTED_EMAIL> at <REDACTED_PHONE>, ssn <REDACTED_SSN>, card <REDACTED_CC>, ip <REDACTED_IP>, url <REDACTED_URL>'
		);
	});

	it('skips disabled rules', () => {
		const { text } = sanitizeText('ACME Corporation HQ', DEFAULT_RULES);
		expect(text).toBe('ACME Corporation HQ'); // company-example rule is disabled by default
	});

	it('redacts every occurrence, not just the first', () => {
		const { text } = sanitizeText('a@b.com and c@d.com', enabled(['email']));
		expect(text).toBe('<REDACTED_EMAIL> and <REDACTED_EMAIL>');
	});

	it('string-type rules match literally, not as regex', () => {
		const rules = [
			{
				id: 'x',
				name: 'Literal',
				pattern: 'a.c (test)',
				replacement: '[X]',
				type: 'string' as const,
				enabled: true,
				category: 'Custom'
			}
		];
		expect(sanitizeText('a.c (test)', rules).text).toBe('[X]');
		// a regex interpretation would also match "abcX(test)"-style strings
		expect(sanitizeText('abc (test)', rules).text).toBe('abc (test)');
	});

	it('rules apply in order, so earlier redactions feed later ones', () => {
		const rules = [
			{
				id: '1',
				name: 'First',
				pattern: 'secret',
				replacement: 'X',
				type: 'string' as const,
				enabled: true,
				category: 'C'
			},
			{
				id: '2',
				name: 'Second',
				pattern: 'X',
				replacement: 'Y',
				type: 'string' as const,
				enabled: true,
				category: 'C'
			}
		];
		expect(sanitizeText('secret', rules).text).toBe('Y');
	});

	it('a rule with an invalid regex is skipped and reported, not thrown', () => {
		const rules = [
			{
				id: 'bad',
				name: 'Bad',
				pattern: '[unclosed',
				replacement: 'X',
				type: 'regex' as const,
				enabled: true,
				category: 'C'
			},
			{
				id: 'good',
				name: 'Good',
				pattern: 'ok',
				replacement: 'OK!',
				type: 'string' as const,
				enabled: true,
				category: 'C'
			}
		];
		const { text, failedRules } = sanitizeText('this [unclosed is ok', rules);
		expect(text).toBe('this [unclosed is OK!');
		expect(failedRules).toEqual(['Bad']);
	});

	it('returns input unchanged when no rules are enabled', () => {
		const { text, failedRules } = sanitizeText('a@b.com', []);
		expect(text).toBe('a@b.com');
		expect(failedRules).toEqual([]);
	});

	it('replacement patterns may include capture-group references', () => {
		const rules = [
			{
				id: 'mask',
				name: 'Mask phone',
				pattern: '\\b(\\d{3})-\\d{3}-(\\d{4})\\b',
				replacement: '$1-XXX-$2',
				type: 'regex' as const,
				enabled: true,
				category: 'C'
			}
		];
		expect(sanitizeText('555-123-4567', rules).text).toBe('555-XXX-4567');
	});
});

describe('escapeRegExp', () => {
	it('escapes all regex metacharacters', () => {
		expect(escapeRegExp('a.c*+?^${}()|[]\\')).toBe('a\\.c\\*\\+\\?\\^\\$\\{\\}\\(\\)\\|\\[\\]\\\\');
	});
	it('leaves plain text alone', () => {
		expect(escapeRegExp('hello world 123')).toBe('hello world 123');
	});
});

describe('isValidRegexPattern', () => {
	it('accepts valid patterns', () => {
		expect(isValidRegexPattern('\\b\\d{3}\\b')).toBe(true);
		expect(isValidRegexPattern('')).toBe(true); // empty compiles
	});
	it('rejects invalid patterns', () => {
		expect(isValidRegexPattern('[unclosed')).toBe(false);
		expect(isValidRegexPattern('(a')).toBe(false);
	});
});

describe('isValidImportedConfig', () => {
	const validRule = {
		id: 'r1',
		name: 'N',
		pattern: 'p',
		replacement: 'x',
		type: 'regex',
		enabled: true,
		category: 'C'
	};

	it('accepts a non-empty array of well-formed rules', () => {
		expect(isValidImportedConfig([validRule])).toBe(true);
	});

	it('rejects non-arrays and empty arrays', () => {
		expect(isValidImportedConfig('nope')).toBe(false);
		expect(isValidImportedConfig(null)).toBe(false);
		expect(isValidImportedConfig({})).toBe(false);
		expect(isValidImportedConfig([])).toBe(false);
	});

	it('rejects rules with missing required fields', () => {
		expect(isValidImportedConfig([{ ...validRule, name: '' }])).toBe(false);
		expect(isValidImportedConfig([{ ...validRule, pattern: '' }])).toBe(false);
		expect(isValidImportedConfig([{ ...validRule, name: undefined }])).toBe(false);
	});

	it('allows an empty replacement but not a missing one', () => {
		expect(isValidImportedConfig([{ ...validRule, replacement: '' }])).toBe(true);
		expect(isValidImportedConfig([{ ...validRule, replacement: undefined }])).toBe(false);
	});

	it('rejects unknown rule types', () => {
		expect(isValidImportedConfig([{ ...validRule, type: 'glob' }])).toBe(false);
		expect(isValidImportedConfig([{ ...validRule, type: 'string' }])).toBe(true);
	});

	it('rejects non-string rule payloads (stricter than the legacy page check)', () => {
		// legacy accepted any truthy name; the engine requires strings
		expect(isValidImportedConfig([{ ...validRule, name: 123 }])).toBe(false);
	});
});

describe('normalizeImportedRules', () => {
	it('fills defaults for id, enabled, and category', () => {
		const [rule] = normalizeImportedRules([
			{ name: 'N', pattern: 'p', replacement: 'r', type: 'string' }
		]);
		expect(rule.id).toBeTruthy();
		expect(rule.enabled).toBe(true);
		expect(rule.category).toBe('Custom Company Rules');
	});

	it('preserves provided id, enabled, and category', () => {
		const [rule] = normalizeImportedRules([
			{ id: 'keep', name: 'N', pattern: 'p', replacement: 'r', type: 'regex', enabled: false, category: 'Net' }
		]);
		expect(rule.id).toBe('keep');
		expect(rule.enabled).toBe(false);
		expect(rule.category).toBe('Net');
	});
});
