import { RUNE_VALUES, calculateRunes } from '../lib/rune-calculator';

	// Add event listener when DOM is ready
	document.addEventListener('DOMContentLoaded', () => {
		const form = document.getElementById('rune-form');
		const resultDiv = document.getElementById('result');

		if (form && resultDiv) {
			form.addEventListener('submit', (e) => {
				e.preventDefault();

				const runesNeededInput = document.getElementById('runes-needed') as HTMLInputElement;
				const runesHaveInput = document.getElementById('runes-have') as HTMLInputElement;

				const runesNeeded = parseInt(runesNeededInput.value) || 0;
				const runesHave = parseInt(runesHaveInput.value) || 0;

				// Initialize the array to store the # of each type of golden runes
				const availableRunes: number[] = [];

				// Get the # of each type of golden runes
				for (let i = 0; i < RUNE_VALUES.length; i++) {
					const inputField = document.getElementById(`rune-${i + 1}`) as HTMLInputElement;
					availableRunes.push(parseInt(inputField?.value) || 0);
				}

				const numGoldenRunes = calculateRunes(runesNeeded, runesHave, availableRunes);

				resultDiv.innerHTML = '';

				if (numGoldenRunes.length === 0) {
					const message = document.createElement('p');
					message.className = 'error-message';
					message.textContent = 'Not enough Golden Runes available to reach your target.';
					resultDiv.appendChild(message);
				} else {
					const table = document.createElement('table');
					table.innerHTML = `
						<thead>
							<tr>
								<th>Golden Rune</th>
								<th>Quantity Needed</th>
							</tr>
						</thead>
						<tbody>
							${numGoldenRunes.map((quantity, index) => `
								<tr>
									<td style="text-align: center;">${index + 1}</td>
									<td style="text-align: center">${quantity}</td>
								</tr>
							`).join('')}
						</tbody>
					`;
					resultDiv.appendChild(table);
				}

				// Scroll to results
				resultDiv.scrollIntoView({ behavior: 'smooth' });
			});
		}
	});
