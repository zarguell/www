import { setDisplay } from '../lib/dom';
import { calcTspMatchPerPay, calc401kMatchPerPay } from '../lib/finance';

	document.addEventListener("DOMContentLoaded", function() {
		// ============================
		// CONFIGURABLE CONSTANTS
		// ============================

		const ELECTIVE_LIMIT = 24500;  // Employee elective deferral limit
		const TOTAL_LIMIT    = 72000;  // Total additions (employee + employer)
		const LAST_UPDATED_TEXT = "Last updated: Jan 5, 2026";

		// ============================
		// HELPERS
		// ============================

		function formatCurrency(amount: number): string {
			return "$" + amount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
		}

		function formatPercent(value: number): string {
			return value.toFixed(2) + "%";
		}

		// Tiered/simple match math imported from lib/finance (tested there)

		// ============================
		// MAIN CALCULATION
		// ============================

		function calculate() {
			const salary        = parseFloat((document.getElementById("salary") as HTMLInputElement).value) || 0;
			const payPeriods    = parseInt((document.getElementById("payPeriods") as HTMLInputElement).value, 10) || 26;
			const strategy      = (document.getElementById("strategy") as HTMLInputElement).value;

			const autoTspPct    = parseFloat((document.getElementById("autoTspPct") as HTMLInputElement).value) || 0;
			const autoK401Pct   = parseFloat((document.getElementById("autoK401Pct") as HTMLInputElement).value) || 0;
			const tspMatchTier1 = parseFloat((document.getElementById("tspMatchTier1") as HTMLInputElement).value) || 0;
			const tspMatchTier2 = parseFloat((document.getElementById("tspMatchTier2") as HTMLInputElement).value) || 0;
			const k401MatchTier = parseFloat((document.getElementById("k401MatchTier") as HTMLInputElement).value) || 0;

			if (salary <= 0 || payPeriods <= 0) {
				alert("Please enter positive salary and pay periods.");
				return;
			}

			const biWeekly = salary / payPeriods;

			// Decide employee TSP% and 401k% based on strategy
			let employeeTspPct, employeeK401Pct, strategyText, warnings = "";

			if (strategy === "minTspMax401k") {
				// Minimum TSP for full match: tier1 + tier2
				const fullTspMatchPct = tspMatchTier1 + tspMatchTier2;
				employeeTspPct = fullTspMatchPct;

				const tspElectiveAnnual = salary * (employeeTspPct / 100);
				let remainingElective = ELECTIVE_LIMIT - tspElectiveAnnual;
				if (remainingElective < 0) {
					remainingElective = 0;
					warnings += `<div class="warning">Warning: TSP % alone exceeds elective limit.</div>`;
				}
				employeeK401Pct = (remainingElective / salary) * 100;

				strategyText = `
					<p><strong>Strategy:</strong> Minimum TSP (full match at ${fullTspMatchPct.toFixed(2)}%), remaining elective to 401k Schwab.</p>
				`;
			} else if (strategy === "min401kMaxTsp") {
				// Minimum 401k for full match: k401MatchTier
				employeeK401Pct = k401MatchTier;

				const k401ElectiveAnnual = salary * (employeeK401Pct / 100);
				let remainingElective = ELECTIVE_LIMIT - k401ElectiveAnnual;
				if (remainingElective < 0) {
					remainingElective = 0;
					warnings += `<div class="warning">Warning: 401k % alone exceeds elective limit.</div>`;
				}
				employeeTspPct = (remainingElective / salary) * 100;

				strategyText = `
					<p><strong>Strategy:</strong> Minimum 401k (full match at ${k401MatchTier.toFixed(2)}%), remaining elective to TSP.</p>
				`;
			} else {
				// Custom: read from inputs
				const customTsp = parseFloat((document.getElementById("employeeTspPct") as HTMLInputElement).value) || 0;
				const custom401 = parseFloat((document.getElementById("employeeK401Pct") as HTMLInputElement).value) || 0;
				employeeTspPct = customTsp;
				employeeK401Pct = custom401;

				strategyText = `
					<p><strong>Strategy:</strong> Custom TSP and 401k percentages.</p>
				`;

				// Basic match warnings
				if (employeeTspPct < tspMatchTier1 + tspMatchTier2) {
					warnings += `<div class="warning">TSP % is below level needed for full match (${(tspMatchTier1 + tspMatchTier2).toFixed(1)}%).</div>`;
				}
				if (employeeK401Pct < k401MatchTier) {
					warnings += `<div class="warning">401k % is below level needed for full match (${k401MatchTier.toFixed(1)}%).</div>`;
				}
			}

			// Employee elective per paycheck and annual
			const employeeTspPerPay   = biWeekly * (employeeTspPct / 100);
			const employeeK401PerPay  = biWeekly * (employeeK401Pct / 100);
			const employeeTspAnnual   = employeeTspPerPay * payPeriods;
			const employeeK401Annual  = employeeK401PerPay * payPeriods;
			const totalElectiveAnnual = employeeTspAnnual + employeeK401Annual;

			if (totalElectiveAnnual > ELECTIVE_LIMIT + 1e-2) {
				warnings += `<div class="warning">
					Elective deferrals (${formatCurrency(totalElectiveAnnual)}) exceed the limit of ${formatCurrency(ELECTIVE_LIMIT)}.
					Consider reducing TSP or 401k %.
				</div>`;
			}

			// Automatic employer contributions
			const autoTspPerPay  = biWeekly * (autoTspPct / 100);
			const autoK401PerPay = biWeekly * (autoK401Pct / 100);

			// Matching employer contributions
			const tspMatchPerPay  = calcTspMatchPerPay(biWeekly, employeeTspPct, tspMatchTier1, tspMatchTier2);
			const k401MatchPerPay = calc401kMatchPerPay(biWeekly, employeeK401Pct, k401MatchTier);

			const totalEmployerPerPay = autoTspPerPay + autoK401PerPay + tspMatchPerPay + k401MatchPerPay;
			const totalEmployerAnnual = totalEmployerPerPay * payPeriods;

			// After-tax space
			let afterTaxAnnual = TOTAL_LIMIT - totalElectiveAnnual - totalEmployerAnnual;
			if (afterTaxAnnual < 0) {
				afterTaxAnnual = 0;
				warnings += `<div class="warning">
					Total contributions (elective + employer) exceed ${formatCurrency(TOTAL_LIMIT)}. No after-tax room.
				</div>`;
			}
			const afterTaxPerPay = afterTaxAnnual / payPeriods;

			// Update DOM
			(document.getElementById("biWeekly") as HTMLElement).textContent = formatCurrency(biWeekly);

			// Elective details
			const electiveHtml = `
				${strategyText}
				<p>
					<strong>TSP employee %:</strong> ${formatPercent(employeeTspPct)}<br>
					<strong>401k employee %:</strong> ${formatPercent(employeeK401Pct)}
				</p>
				<p>
					<strong>TSP elective:</strong> ${formatCurrency(employeeTspPerPay)} per paycheck (${formatCurrency(employeeTspAnnual)} annual)<br>
					<strong>401k elective:</strong> ${formatCurrency(employeeK401PerPay)} per paycheck (${formatCurrency(employeeK401Annual)} annual)<br>
					<strong>Total elective:</strong> ${formatCurrency(totalElectiveAnnual)} / ${formatCurrency(ELECTIVE_LIMIT)}
				</p>
				${warnings}
			`;
			(document.getElementById("electiveDetails") as HTMLElement).innerHTML = electiveHtml;

			// Employer breakdown
			const employerHtml = `
				<div class="match-tier">
					<strong>Automatic TSP:</strong> ${formatCurrency(autoTspPerPay)} per paycheck (${formatCurrency(autoTspPerPay * payPeriods)} annual)
				</div>
				<div class="match-tier">
					<strong>Automatic 401k:</strong> ${formatCurrency(autoK401PerPay)} per paycheck (${formatCurrency(autoK401PerPay * payPeriods)} annual)
				</div>
				<div class="match-tier">
					<strong>TSP match (tiered):</strong> ${formatCurrency(tspMatchPerPay)} per paycheck (${formatCurrency(tspMatchPerPay * payPeriods)} annual)
				</div>
				<div class="match-tier">
					<strong>401k match:</strong> ${formatCurrency(k401MatchPerPay)} per paycheck (${formatCurrency(k401MatchPerPay * payPeriods)} annual)
				</div>
				<div class="highlight">
					<strong>Total employer per paycheck:</strong> ${formatCurrency(totalEmployerPerPay)}<br>
					<strong>Total employer annual:</strong> ${formatCurrency(totalEmployerAnnual)}
				</div>
			`;
			(document.getElementById("employerBreakdown") as HTMLElement).innerHTML = employerHtml;

			// After-tax details
			const afterTaxHtml = `
				<p>
					<strong>Max after-tax per paycheck:</strong> ${formatCurrency(afterTaxPerPay)}<br>
					<strong>Max after-tax annual:</strong> ${formatCurrency(afterTaxAnnual)}
				</p>
				<p class="small">
					After-tax space = ${formatCurrency(TOTAL_LIMIT)} − ${formatCurrency(totalElectiveAnnual)} (elective) − ${formatCurrency(totalEmployerAnnual)} (employer).
				</p>
			`;
			(document.getElementById("afterTaxDetails") as HTMLElement).innerHTML = afterTaxHtml;

			// Annual summary
			const totalAnnual = totalElectiveAnnual + totalEmployerAnnual + afterTaxAnnual;
			const summaryHtml = `
				<div class="highlight">
					<strong>Employee elective:</strong> ${formatCurrency(totalElectiveAnnual)}<br>
					<strong>Employer (auto + match):</strong> ${formatCurrency(totalEmployerAnnual)}<br>
					<strong>After-tax (mega backdoor):</strong> ${formatCurrency(afterTaxAnnual)}<br>
					<strong>Total contributions:</strong> ${formatCurrency(totalAnnual)}
				</div>
			`;
			(document.getElementById("annualSummary") as HTMLElement).innerHTML = summaryHtml;

			setDisplay((document.getElementById("results") as HTMLElement), "block");
		}

		document.querySelector('[data-action="calculate"]')?.addEventListener('click', calculate);

		// Show/hide custom inputs
		(document.getElementById("strategy") as HTMLSelectElement).addEventListener("change", function (this: HTMLSelectElement) {
			const isCustom = this.value === "custom";
			setDisplay((document.getElementById("customInputs") as HTMLElement), isCustom ? "block" : "none");
		});

		// Set last updated text and run initial calc
		(document.getElementById("lastUpdated") as HTMLElement).textContent = LAST_UPDATED_TEXT;
		calculate();
	});
