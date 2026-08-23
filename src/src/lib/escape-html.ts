/**
 * HTML escaping for untrusted strings interpolated into innerHTML.
 * Single shared implementation (was copy-pasted across four tool pages).
 */

const ESCAPE_MAP: Record<string, string> = {
	'&': '&amp;',
	'<': '&lt;',
	'>': '&gt;',
	'"': '&quot;',
	"'": '&#39;'
};

/** Escape HTML special characters. Non-strings are stringified first. */
export function escapeHtml(value: unknown): string {
	return String(value ?? '').replace(/[&<>"']/g, (c) => ESCAPE_MAP[c]);
}
