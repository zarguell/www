/**
 * Sanitext DOM wiring — all document/localStorage access lives here.
 * Pure logic is in `lib/sanitext-engine.ts`.
 */
import { escapeHtml } from '../lib/escape-html';
import {
	DEFAULT_RULES,
	generateRuleId,
	isValidImportedConfig,
	isValidRegexPattern,
	normalizeImportedRules,
	sanitizeText,
	type SanitizeRule
} from '../lib/sanitext-engine';

const STORAGE_KEY = 'sanitext-rules';

interface DialogEntry {
	modal: HTMLElement;
	opener: EventTarget | null;
}

const FOCUSABLE_SELECTOR =
	'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focusableIn(modal: HTMLElement): HTMLElement[] {
	return Array.from(modal.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
}

export class SanitextApp {
	rules: SanitizeRule[] = [];
	currentEditingRule: number | null = null;
	dialogStack: DialogEntry[] = [];

	/** Fresh copies of the defaults — never share objects with DEFAULT_RULES. */
	private freshDefaults(): SanitizeRule[] {
		return DEFAULT_RULES.map((r) => ({ ...r }));
	}

	init(): void {
		this.loadRules();
		this.bindEvents();
		this.updateCharCounts();

		// Initial sanitization if there's content
		setTimeout(() => this.sanitizeText(), 100);
	}

	// Load rules from localStorage or use defaults
	loadRules(): void {
		const savedRules = localStorage.getItem(STORAGE_KEY);
		if (savedRules) {
			try {
				this.rules = JSON.parse(savedRules) as SanitizeRule[];
			} catch (e) {
				console.error('Error loading saved rules:', e);
				this.rules = this.freshDefaults();
			}
		} else {
			this.rules = this.freshDefaults();
		}
	}

	// Save rules to localStorage
	saveRules(): void {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(this.rules));
	}

	// Bind all event listeners
	bindEvents(): void {
		// Text input events
		const inputText = document.getElementById('inputText');
		if (inputText) {
			inputText.addEventListener('input', () => {
				this.sanitizeText();
				this.updateCharCounts();
			});

			inputText.addEventListener('paste', () => {
				setTimeout(() => {
					this.sanitizeText();
					this.updateCharCounts();
				}, 10);
			});

			inputText.addEventListener('keyup', () => {
				this.sanitizeText();
				this.updateCharCounts();
			});
		}

		// Copy button
		document.getElementById('copyBtn')?.addEventListener('click', (e) => {
			e.preventDefault();
			void this.copyToClipboard();
		});

		// Configuration buttons
		document.getElementById('configBtn')?.addEventListener('click', (e) => {
			e.preventDefault();
			this.openConfigModal();
		});

		document.getElementById('importBtn')?.addEventListener('click', (e) => {
			e.preventDefault();
			this.importConfig();
		});

		document.getElementById('exportBtn')?.addEventListener('click', (e) => {
			e.preventDefault();
			this.exportConfig();
		});

		document.getElementById('resetBtn')?.addEventListener('click', (e) => {
			e.preventDefault();
			this.resetToDefaults();
		});

		// Configuration modal
		document.getElementById('closeModal')?.addEventListener('click', (e) => {
			e.preventDefault();
			this.closeConfigModal();
		});

		// Rule management buttons
		document.getElementById('addRuleBtn')?.addEventListener('click', (e) => {
			e.preventDefault();
			this.openRuleModal();
		});

		// Rules list (event delegation — items are re-rendered, so bind once here)
		const rulesList = document.getElementById('rulesList');
		if (rulesList) {
			rulesList.addEventListener('change', (e) => {
				const target = e.target as HTMLInputElement;
				if (target.type === 'checkbox' && target.dataset.ruleIndex) {
					this.toggleRule(parseInt(target.dataset.ruleIndex, 10));
				}
			});

			rulesList.addEventListener('click', (e) => {
				const btn = (e.target as HTMLElement).closest<HTMLElement>('.rule-action-btn');
				if (btn && btn.dataset.ruleIndex) {
					const index = parseInt(btn.dataset.ruleIndex, 10);
					const action = btn.dataset.action;

					if (action === 'edit') {
						this.editRule(index);
					} else if (action === 'delete') {
						this.deleteRule(index);
					}
				}
			});
		}

		// Rule modal events
		document.getElementById('closeRuleModal')?.addEventListener('click', (e) => {
			e.preventDefault();
			this.closeRuleModal();
		});

		document.getElementById('cancelRuleBtn')?.addEventListener('click', (e) => {
			e.preventDefault();
			this.closeRuleModal();
		});

		document.getElementById('ruleForm')?.addEventListener('submit', (e) => {
			e.preventDefault();
			this.saveRule();
		});

		// Toast close
		document.getElementById('toastClose')?.addEventListener('click', (e) => {
			e.preventDefault();
			this.hideToast();
		});

		// Import file input
		document.getElementById('importFile')?.addEventListener('change', (e) => {
			this.handleImportFile(e);
		});

		// Modal keyboard handling (Esc to close, Tab focus trap)
		document.addEventListener('keydown', (e) => this.handleDialogKeys(e));

		// Close modals on outside click
		const configModal = document.getElementById('configModal');
		configModal?.addEventListener('click', (e) => {
			if (e.target === e.currentTarget) this.closeConfigModal();
		});

		const ruleModal = document.getElementById('ruleModal');
		ruleModal?.addEventListener('click', (e) => {
			if (e.target === e.currentTarget) this.closeRuleModal();
		});
	}

	// Text sanitization (engine is pure; this syncs it to the DOM)
	sanitizeText(): void {
		const inputTextEl = document.getElementById('inputText') as HTMLTextAreaElement | null;
		const outputTextEl = document.getElementById('outputText') as HTMLTextAreaElement | null;
		const copyBtn = document.getElementById('copyBtn') as HTMLButtonElement | null;

		if (!inputTextEl || !outputTextEl) return;

		const input = inputTextEl.value;
		if (!input.trim()) {
			outputTextEl.value = '';
			if (copyBtn) copyBtn.disabled = true;
			return;
		}

		const { text, failedRules } = sanitizeText(input, this.rules);
		for (const name of failedRules) {
			console.error(`Error applying rule "${name}"`);
		}

		outputTextEl.value = text;
		if (copyBtn) copyBtn.disabled = false;
	}

	// Copy sanitized text to clipboard
	async copyToClipboard(): Promise<void> {
		const outputTextEl = document.getElementById('outputText') as HTMLTextAreaElement | null;
		if (!outputTextEl || !outputTextEl.value.trim()) return;

		try {
			if (navigator.clipboard && navigator.clipboard.writeText) {
				await navigator.clipboard.writeText(outputTextEl.value);
				this.showToast('Text copied to clipboard!', 'success');
			} else {
				// Fallback for older browsers
				outputTextEl.select();
				outputTextEl.setSelectionRange(0, 99999);
				const successful = document.execCommand('copy');
				if (successful) {
					this.showToast('Text copied to clipboard!', 'success');
				} else {
					this.showToast('Failed to copy text', 'error');
				}
			}
		} catch (err) {
			console.error('Copy failed:', err);
			this.showToast('Failed to copy text', 'error');
		}
	}

	// Update character counts
	updateCharCounts(): void {
		const inputTextEl = document.getElementById('inputText') as HTMLTextAreaElement | null;
		const outputTextEl = document.getElementById('outputText') as HTMLTextAreaElement | null;
		const inputCharCount = document.getElementById('inputCharCount');
		const outputCharCount = document.getElementById('outputCharCount');

		if (inputTextEl && inputCharCount) {
			inputCharCount.textContent = `${inputTextEl.value.length.toLocaleString()} characters`;
		}

		if (outputTextEl && outputCharCount) {
			outputCharCount.textContent = `${outputTextEl.value.length.toLocaleString()} characters`;
		}
	}

	// Accessible dialog management: Esc-to-close, focus trap, focus restore.
	// ARIA attributes (role="dialog", aria-modal, aria-labelledby) are static in the markup.
	openDialog(modal: HTMLElement | null, focusTarget?: HTMLElement | null): void {
		if (!modal || this.dialogStack.some((d) => d.modal === modal)) return;
		modal.classList.remove('hidden');
		this.dialogStack.push({ modal, opener: document.activeElement });
		const target = focusTarget || focusableIn(modal)[0];
		if (target) target.focus();
	}

	closeDialog(modal: HTMLElement | null): void {
		if (!modal) return;
		const index = this.dialogStack.findIndex((d) => d.modal === modal);
		if (index === -1) return;
		const { opener } = this.dialogStack.splice(index, 1)[0];
		if (opener && typeof (opener as HTMLElement).focus === 'function') {
			(opener as HTMLElement).focus();
		}
	}

	handleDialogKeys(e: KeyboardEvent): void {
		const top = this.dialogStack[this.dialogStack.length - 1];
		if (!top) return;

		if (e.key === 'Escape') {
			e.preventDefault();
			if (top.modal.id === 'ruleModal') this.closeRuleModal();
			else this.closeConfigModal();
			return;
		}

		if (e.key !== 'Tab') return;

		const focusable = focusableIn(top.modal);
		if (!focusable.length) return;
		const first = focusable[0];
		const last = focusable[focusable.length - 1];
		const active = document.activeElement;
		const inside = top.modal.contains(active);

		if (e.shiftKey && (active === first || !inside)) {
			e.preventDefault();
			last.focus();
		} else if (!e.shiftKey && (active === last || !inside)) {
			e.preventDefault();
			first.focus();
		}
	}

	// Configuration Modal Management
	openConfigModal(): void {
		const modal = document.getElementById('configModal');
		if (!modal) return;
		this.openDialog(modal);
		this.renderRulesList();
	}

	closeConfigModal(): void {
		const modal = document.getElementById('configModal');
		if (!modal) return;
		modal.classList.add('hidden');
		this.closeDialog(modal);
	}

	// Render rules list in configuration modal
	renderRulesList(): void {
		const rulesList = document.getElementById('rulesList');
		if (!rulesList) return;

		rulesList.innerHTML = '';

		this.rules.forEach((rule, index) => {
			const ruleDiv = document.createElement('div');
			ruleDiv.className = 'rule-item';
			ruleDiv.innerHTML = `
				<div class="rule-name">${escapeHtml(rule.name)}</div>
				<div class="rule-pattern" title="${escapeHtml(rule.pattern)}">${escapeHtml(rule.pattern)}</div>
				<div class="rule-replacement" title="${escapeHtml(rule.replacement)}">${escapeHtml(rule.replacement)}</div>
				<div class="rule-type">${escapeHtml(rule.type)}</div>
				<div class="rule-category">${escapeHtml(rule.category)}</div>
				<div>
					<label class="toggle">
						<input type="checkbox" ${rule.enabled ? 'checked' : ''} data-rule-index="${index}">
						<span class="toggle-slider"></span>
					</label>
				</div>
				<div class="rule-actions">
					<button class="rule-action-btn" data-action="edit" data-rule-index="${index}" title="Edit Rule">
						<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
							<path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
						</svg>
					</button>
					<button class="rule-action-btn delete" data-action="delete" data-rule-index="${index}" title="Delete Rule">
						<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
							<path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
						</svg>
					</button>
				</div>
			`;
			rulesList.appendChild(ruleDiv);
		});
	}

	// Rule Management

	toggleRule(index: number): void {
		if (this.rules[index]) {
			this.rules[index].enabled = !this.rules[index].enabled;
			this.saveRules();
			this.sanitizeText();
		}
	}

	editRule(index: number): void {
		const rule = this.rules[index];
		if (!rule) return;

		this.currentEditingRule = index;

		const ruleModalTitle = document.getElementById('ruleModalTitle');
		const ruleName = document.getElementById('ruleName') as HTMLInputElement | null;
		const ruleType = document.getElementById('ruleType') as HTMLSelectElement | null;
		const rulePattern = document.getElementById('rulePattern') as HTMLInputElement | null;
		const ruleReplacement = document.getElementById('ruleReplacement') as HTMLInputElement | null;
		const ruleCategory = document.getElementById('ruleCategory') as HTMLSelectElement | null;
		const ruleEnabled = document.getElementById('ruleEnabled') as HTMLInputElement | null;

		if (ruleModalTitle) ruleModalTitle.textContent = 'Edit Rule';
		if (ruleName) ruleName.value = rule.name;
		if (ruleType) ruleType.value = rule.type;
		if (rulePattern) rulePattern.value = rule.pattern;
		if (ruleReplacement) ruleReplacement.value = rule.replacement;
		if (ruleCategory) ruleCategory.value = rule.category;
		if (ruleEnabled) ruleEnabled.checked = rule.enabled;

		this.openRuleModal();
	}

	deleteRule(index: number): void {
		if (confirm('Are you sure you want to delete this rule?')) {
			this.rules.splice(index, 1);
			this.saveRules();
			this.renderRulesList();
			this.sanitizeText();
			this.showToast('Rule deleted successfully', 'success');
		}
	}

	// Rule Modal Management
	openRuleModal(): void {
		const modal = document.getElementById('ruleModal');
		if (!modal) return;
		this.openDialog(modal, document.getElementById('ruleName'));
	}

	closeRuleModal(): void {
		const modal = document.getElementById('ruleModal');
		if (modal) {
			modal.classList.add('hidden');
		}
		this.closeDialog(modal);

		const form = document.getElementById('ruleForm') as HTMLFormElement | null;
		if (form) form.reset();

		this.currentEditingRule = null;

		const ruleModalTitle = document.getElementById('ruleModalTitle');
		if (ruleModalTitle) ruleModalTitle.textContent = 'Add New Rule';
	}

	saveRule(): void {
		const ruleName = document.getElementById('ruleName') as HTMLInputElement | null;
		const ruleType = document.getElementById('ruleType') as HTMLSelectElement | null;
		const rulePattern = document.getElementById('rulePattern') as HTMLInputElement | null;
		const ruleReplacement = document.getElementById('ruleReplacement') as HTMLInputElement | null;
		const ruleCategory = document.getElementById('ruleCategory') as HTMLSelectElement | null;
		const ruleEnabled = document.getElementById('ruleEnabled') as HTMLInputElement | null;

		if (!ruleName || !rulePattern || !ruleReplacement) {
			this.showToast('Please fill in all required fields', 'error');
			return;
		}

		const name = ruleName.value.trim();
		const type = (ruleType?.value ?? 'string') as SanitizeRule['type'];
		const pattern = rulePattern.value.trim();
		const replacement = ruleReplacement.value;
		const category = ruleCategory?.value ?? 'Custom Company Rules';
		const enabled = ruleEnabled?.checked ?? true;

		if (!name || !pattern) {
			this.showToast('Please fill in all required fields', 'error');
			return;
		}

		// Validate regex pattern if type is regex
		if (type === 'regex' && !isValidRegexPattern(pattern)) {
			this.showToast('Invalid regular expression pattern', 'error');
			return;
		}

		const rule: SanitizeRule = {
			id:
				this.currentEditingRule !== null && this.rules[this.currentEditingRule]
					? this.rules[this.currentEditingRule].id
					: generateRuleId(),
			name,
			pattern,
			replacement,
			type,
			enabled,
			category
		};

		if (this.currentEditingRule !== null) {
			// Editing existing rule
			this.rules[this.currentEditingRule] = rule;
			this.showToast('Rule updated successfully', 'success');
		} else {
			// Adding new rule
			this.rules.push(rule);
			this.showToast('Rule added successfully', 'success');
		}

		this.saveRules();
		this.renderRulesList();
		this.sanitizeText();
		this.closeRuleModal();
	}

	// Import/Export Configuration
	importConfig(): void {
		const importFile = document.getElementById('importFile') as HTMLInputElement | null;
		if (importFile) {
			importFile.click();
		}
	}

	handleImportFile(event: Event): void {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;

		const reader = new FileReader();
		reader.onload = () => {
			try {
				const config: unknown = JSON.parse(String(reader.result));
				if (isValidImportedConfig(config)) {
					this.rules = normalizeImportedRules(config);
					this.saveRules();
					this.renderRulesList();
					this.sanitizeText();
					this.showToast('Configuration imported successfully', 'success');
				} else {
					this.showToast('Invalid configuration file format', 'error');
				}
			} catch {
				this.showToast('Error reading configuration file', 'error');
			}
		};
		reader.readAsText(file);

		// Reset file input
		input.value = '';
	}

	exportConfig(): void {
		const config = JSON.stringify(this.rules, null, 2);
		const blob = new Blob([config], { type: 'application/json' });
		const url = URL.createObjectURL(blob);

		const a = document.createElement('a');
		a.href = url;
		a.download = `sanitext-config-${new Date().toISOString().split('T')[0]}.json`;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);

		this.showToast('Configuration exported successfully', 'success');
	}

	resetToDefaults(): void {
		if (confirm('Are you sure you want to reset all rules to defaults? This will remove all custom rules.')) {
			this.rules = this.freshDefaults();
			this.saveRules();
			this.renderRulesList();
			this.sanitizeText();
			this.showToast('Rules reset to defaults', 'success');
		}
	}

	// Toast notifications
	showToast(message: string, type: 'success' | 'error' = 'success'): void {
		const toast = document.getElementById('toast');
		const toastMessage = document.getElementById('toastMessage');

		if (!toast || !toastMessage) return;

		toastMessage.textContent = message;
		toast.className = `toast ${type}`;

		// Auto-hide after 4 seconds
		setTimeout(() => this.hideToast(), 4000);
	}

	hideToast(): void {
		const toast = document.getElementById('toast');
		if (toast) {
			toast.classList.add('hidden');
		}
	}
}

declare global {
	interface Window {
		app?: SanitextApp;
	}
}

export function initSanitextApp(): void {
	window.app = new SanitextApp();
	window.app.init();
}
