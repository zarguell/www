import { setDisplay } from '../lib/dom';
// CDN globals loaded by the is:inline script tags above
		declare const HeicTo: { isHeic(f: Blob): Promise<boolean>; (opts: { blob: Blob; type: string; quality?: number }): Promise<Blob> };
		declare const JSZip: new () => { file(name: string, data: Blob): void; generateAsync(opts: { type: string }): Promise<Blob> };
		import { escapeHtml } from '../lib/escape-html';

		document.addEventListener('DOMContentLoaded', function() {
			const fileInput = document.getElementById('fileInput') as HTMLInputElement;
			const fileCount = document.getElementById('fileCount') as HTMLElement;
			const convertBtn = document.getElementById('convertBtn') as HTMLButtonElement;
			const progress = document.getElementById('progress') as HTMLElement;
			const errorMsg = document.getElementById('errorMsg') as HTMLElement;
			const formatSelect = document.getElementById('formatSelect') as HTMLSelectElement;
			const qualityGroup = document.getElementById('qualityGroup') as HTMLElement;

			// Hide/show quality setting based on format
			formatSelect.addEventListener('change', function() {
				if (this.value === 'image/png') {
					setDisplay(qualityGroup, 'none');
				} else {
					setDisplay(qualityGroup, 'flex');
				}
			});

			// Update file count display
			fileInput.addEventListener('change', function() {
				const files = this.files;
				if (files && files.length > 0) {
					fileCount.textContent = `${files.length} file${files.length > 1 ? 's' : ''} selected`;
				} else {
					fileCount.textContent = 'No files selected';
				}
			});

			// Convert button handler
			convertBtn.addEventListener('click', async function() {
				const files = fileInput.files;
				if (!files || files.length === 0) {
					errorMsg.textContent = 'Please select one or more HEIC files first.';
					return;
				}

				const outType = (document.getElementById('formatSelect') as HTMLSelectElement).value;
				const quality = parseFloat((document.getElementById('qualitySelect') as HTMLSelectElement).value);
				const downloadMode = (document.getElementById('downloadMode') as HTMLSelectElement).value;
				// Fail fast with a clear message if CDN libraries did not load
				if (typeof HeicTo === 'undefined') {
					errorMsg.textContent = 'Converter failed to load (heic-to library unavailable). Check your connection or script blocker and reload the page.';
					return;
				}
				if (downloadMode === 'zip' && typeof JSZip === 'undefined') {
					errorMsg.textContent = 'ZIP support failed to load (JSZip library unavailable). Check your connection or script blocker and reload the page.';
					return;
				}

				convertBtn.disabled = true;
				progress.innerHTML = '';
				errorMsg.textContent = '';

				// For ZIP mode, collect all converted files
				const zipFiles = [];

				for (const file of files) {
					const row = document.createElement('div');
					row.className = 'file-item';
					row.innerHTML = `<span class="file-name">${escapeHtml(file.name)}</span><span class="status">Queued…</span>`;
					progress.appendChild(row);
					const statusEl = row.querySelector<HTMLElement>('.status')!;

					try {
						setStatus(statusEl, 'Checking…');

						// Check if file is HEIC
						const isHeic = await HeicTo.isHeic(file);
						if (!isHeic) {
							setStatus(statusEl, 'Skipped (not HEIC)', '#b45309');
							continue;
						}

						setStatus(statusEl, 'Converting…');

						// Convert the file
						const converted = await HeicTo({
							blob: file,
							type: outType,
							quality
						});

						const ext = outType === 'image/png' ? 'png' : 'jpg';
						const outName = `${baseName(file.name)}.${ext}`;

						if (downloadMode === 'zip') {
							// Collect for ZIP download
							zipFiles.push({ blob: converted, name: outName });
							setStatus(statusEl, 'Added to ZIP', '#15803d');
						} else {
							// Individual download
							setStatus(statusEl, 'Downloading…');
							downloadBlob(converted, outName);
							setStatus(statusEl, 'Done', '#15803d');
						}

						await new Promise(r => setTimeout(r, 150));
					} catch (e) {
						console.error(e);
						setStatus(statusEl, 'Failed', '#b91c1c');
					}
				}

				// If ZIP mode, create and download the ZIP file
				if (downloadMode === 'zip' && zipFiles.length > 0) {
					errorMsg.textContent = 'Creating ZIP archive...';
					try {
						const zip = new JSZip();
						zipFiles.forEach(file => {
							zip.file(file.name, file.blob);
						});

						const zipBlob = await zip.generateAsync({ type: 'blob' });
						const zipName = `converted_images_${new Date().getTime()}.zip`;
						downloadBlob(zipBlob, zipName);
						errorMsg.textContent = `ZIP archive created with ${zipFiles.length} file${zipFiles.length > 1 ? 's' : ''}`;
					} catch (e) {
						console.error(e);
						errorMsg.textContent = 'Error creating ZIP archive';
					}
				}

				convertBtn.disabled = false;
			});

			// Helper function to set status
			function setStatus(el: HTMLElement, text: string, color = '#666') {
				el.textContent = text;
				el.style.color = color;
			}

			// Helper function to get base name
			function baseName(filename: string): string {
				return filename.replace(/\.[^/.]+$/, '');
			}

			// Helper function to download blob
			function downloadBlob(blob: Blob, filename: string): void {
				const url = URL.createObjectURL(blob);
				const a = document.createElement('a');
				a.href = url;
				a.download = filename;
				document.body.appendChild(a);
				a.click();
				a.remove();
				setTimeout(() => URL.revokeObjectURL(url), 2000);
			}
		});
