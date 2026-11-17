import { setDisplay } from '../lib/dom';
import {
		PEEL_WATER_MULT,
		peelBased,
		computeFromBase,
		baseFromTargetFinalWeight,
		type JuiceType
	} from '../lib/super-juice';

	document.addEventListener('DOMContentLoaded', function() {
		// Fixed constants + ratio math imported from lib/super-juice (tested there)

		const fmt = (n: number, digits = 1): string => Number.isFinite(n)
			? n.toFixed(digits).replace(/\.0+$/,'').replace(/(\.\d*[1-9])0+$/,'$1')
			: '';

		/**
 * Required-element lookup. Defaults to HTMLInputElement because every id used
 * by this tool is an input/select (both expose .value/.disabled).
 */
const $ = <T extends HTMLElement = HTMLInputElement>(id: string): T => {
	const el = document.getElementById(id);
	if (!el) throw new Error(`super-juice: missing #${id}`);
	return el as T;
};

		function currentType(): JuiceType { return $('juiceType').value as JuiceType; }
		function currentInputMode() { return $('inputMode').value; }

		function nameForType(type: JuiceType): string { return type[0].toUpperCase() + type.slice(1); }
		function pluralize(name: string): string { return name.endsWith('s') ? name : name + 's'; }

		function updateUi() {
			const type = currentType();
			const mode = currentInputMode();

			if (type === 'kumquat') {
				$('baseLabel').textContent = 'Kumquat fruit weight (g)';
				$('recipeHint').textContent = 'Kumquat uses fruit weight and a different water ratio.';
			} else {
				$('baseLabel').textContent = 'Peel weight (g)';
				$('recipeHint').textContent = `Classic citrus: water is fixed at ${PEEL_WATER_MULT}× peel weight.`;
			}

			setDisplay($('baseWrap'), (mode === 'base') ? '' : 'none');
			setDisplay($('targetWrap'), (mode === 'target') ? '' : 'none');
		}

		// computeFromBase / baseFromTargetFinalWeight come from lib/super-juice

		function getStateFromForm() {
			const type = currentType();
			const mode = currentInputMode();
			const base = Number($('baseGrams').value);
			const target = Number($('targetWeight').value);
			return { type, mode, base, target };
		}

		function applyStateToForm(state: { type?: JuiceType; mode?: string; base?: number; target?: number }) {
			if (state.type) $('juiceType').value = state.type;
			if (state.mode) $('inputMode').value = state.mode;
			if (Number.isFinite(state.base)) $('baseGrams').value = String(state.base);
			if (Number.isFinite(state.target)) $('targetWeight').value = String(state.target);
			updateUi();
		}

		function writeQueryParamsFromState(state: { type?: JuiceType; mode?: string; base?: number; target?: number }) {
			const params = new URLSearchParams(window.location.search);
			// ?? guards keep a literal "undefined" out of the URL if state is partial
			params.set('type', state.type ?? '');
			params.set('mode', state.mode ?? '');

			// Store only the active numeric input
			if (state.mode === 'base') {
				params.set('base', String(state.base));
				params.delete('target');
			} else {
				params.set('target', String(state.target));
				params.delete('base');
			}

			const newUrl = `${window.location.pathname}?${params.toString()}`;
			history.replaceState(null, '', newUrl);
		}

		function readQueryParams() {
			const params = new URLSearchParams(window.location.search);
			const type = params.get('type');
			const mode = params.get('mode');
			const base = params.get('base');
			const target = params.get('target');

			const state: { type?: JuiceType; mode?: string; base?: number; target?: number } = {};
			if (type) state.type = type as JuiceType;
			if (mode) state.mode = mode;
			if (base !== null) state.base = Number(base);
			if (target !== null) state.target = Number(target);
			return state;
		}

		function renderResults(r: import('../lib/super-juice').SuperJuiceResult) {
			// Build ingredients table
			let tableHTML = '<table><thead><tr><th>Ingredient</th><th style="text-align: right;">Quantity</th></tr></thead><tbody>';

			if (r.type === 'kumquat') {
				if (r.fruit_g > 0) {
					tableHTML += `<tr><td>Kumquat fruit</td><td class="quantity">${fmt(r.fruit_g, 1)}<span class="unit"> g</span></td></tr>`;
				}
				tableHTML += `<tr><td>Citric acid</td><td class="quantity">${fmt(r.citric_g, 2)}<span class="unit"> g</span></td></tr>`;
				if (r.ascorbic_g > 0) {
					tableHTML += `<tr><td>Ascorbic acid (vitamin C)</td><td class="quantity">${fmt(r.ascorbic_g, 2)}<span class="unit"> g</span></td></tr>`;
				}
			} else {
				if (r.peel_g > 0) {
					tableHTML += `<tr><td>${nameForType(r.type)} peel (zest)</td><td class="quantity">${fmt(r.peel_g, 1)}<span class="unit"> g</span></td></tr>`;
				}
				tableHTML += `<tr><td>Citric acid</td><td class="quantity">${fmt(r.citric_g, 2)}<span class="unit"> g</span></td></tr>`;
				if (r.malic_g > 0.0001) {
					tableHTML += `<tr><td>Malic acid</td><td class="quantity">${fmt(r.malic_g, 2)}<span class="unit"> g</span></td></tr>`;
				}
				if (r.msg_g > 0.0001) {
					tableHTML += `<tr><td>MSG</td><td class="quantity">${fmt(r.msg_g, 2)}<span class="unit"> g</span></td></tr>`;
				}
			}

			tableHTML += `<tr><td>Water</td><td class="quantity">${fmt(r.water_ml, 0)}<span class="unit"> ml</span></td></tr>`;
			tableHTML += '</tbody></table>';

			$('results').innerHTML = tableHTML;

			// Build step-by-step instructions with bold quantities
			const steps = $('steps');
			steps.innerHTML = "";
			const add = (html: string) => { const li=document.createElement('li'); li.innerHTML=html; steps.appendChild(li); };

			const displayName = nameForType(r.type).toLowerCase();
			const fruitPlural = pluralize(displayName);
			const bold = (qty: string | number, unit: string) => `<strong>${qty}${unit}</strong>`;

			if (r.type === 'kumquat') {
				add(`Weigh ${bold(fmt(r.fruit_g, 1), 'g')} of kumquat fruit.`);
				add(`Put the kumquats into a container.`);
				add(`Add ${bold(fmt(r.citric_g, 2), 'g')} of citric acid.`);
				add(`Add ${bold(fmt(r.ascorbic_g, 2), 'g')} of ascorbic acid (vitamin C).`);
				add(`Shake to combine. Let it sit for 2 hours.`);
				add(`Blend with ${bold(fmt(r.water_ml, 0), 'ml/g')} of water until fully pulverized.`);
				add(`Strain through a cloth filter or fine-mesh strainer into bottles.`);
				add(`You now have super juice!`);
				return;
			}

			add(`Peel ${bold(fmt(r.peel_g, 1), 'g')} of ${displayName} zest.`);
			add(`Set your peeled ${fruitPlural} aside for later.`);
			add(`Put the zest into a container.`);
			add(`Add ${bold(fmt(r.citric_g, 2), 'g')} of citric acid.`);
			if (r.malic_g > 0.0001) add(`Add ${bold(fmt(r.malic_g, 2), 'g')} of malic acid.`);
			if (r.msg_g > 0.0001) add(`Add ${bold(fmt(r.msg_g, 2), 'g')} of MSG.`);
			add(`Shake to coat the peels. Let it sit for 2 hours.`);
			add(`Transfer everything (including peels) to a blender and add ${bold(fmt(r.water_ml, 0), 'ml/g')} of water.`);
			add(`Juice the peeled ${fruitPlural} and add the juice into the blender as well (slightly increases yield).`);
			add(`Blend briefly, then strain through a cloth filter or fine-mesh strainer into bottles.`);
			add(`You now have super juice!`);
		}

		// The one true action: calculate -> render -> sync URL
		function calculateAndSyncUrl() {
			updateUi();

			const state = getStateFromForm();
			let r;

			if (state.mode === 'base') {
				r = computeFromBase(state.type, state.base);
			} else {
				const base_g = baseFromTargetFinalWeight(state.type, state.target);
				r = computeFromBase(state.type, base_g);
			}

			renderResults(r);

			// Normalize stored values so URL always represents visible mode + input
			if (state.mode === 'base') state.base = Number(fmt(state.base, 2));
			else state.target = Math.round(state.target);

			writeQueryParamsFromState(state);
		}

		function swapMode() {
			// Swap without calculating from partial inputs; swap based on last calculated
			calculateAndSyncUrl();

			const type = currentType();
			const mode = currentInputMode();

			if (mode === 'base') {
				const base_g = Number($('baseGrams').value);
				const r = computeFromBase(type, base_g);
				$('inputMode').value = 'target';
				$('targetWeight').value = String(Math.round(r.water_ml));
			} else {
				const target = Number($('targetWeight').value);
				const base_g = baseFromTargetFinalWeight(type, target);
				$('inputMode').value = 'base';
				$('baseGrams').value = String(fmt(base_g, 1));
			}

			updateUi();
			calculateAndSyncUrl();
		}

		// Only update UI visibility on input changes; do NOT auto-calc or touch URL
		['juiceType','inputMode','baseGrams','targetWeight'].forEach(id => {
			$(id).addEventListener('input', updateUi);
			$(id).addEventListener('change', updateUi);
		});

		$('calcBtn').addEventListener('click', calculateAndSyncUrl);
		$('swapBtn').addEventListener('click', swapMode);

		// Init from query params, then calculate once
		applyStateToForm(readQueryParams());
		calculateAndSyncUrl();
	});
