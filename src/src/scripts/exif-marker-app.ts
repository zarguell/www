/**
 * EXIF Marker DOM wiring — file upload, EXIF parse, GPS overlay drawing.
 * CDN globals (exifreader, heic-to) are loaded as classic scripts by the page.
 */
import { escapeHtml } from '../lib/escape-html';

// CDN globals loaded as classic scripts by the page.
declare const ExifReader: { load(data: ArrayBuffer | Uint8Array): Record<string, { description?: unknown; value?: unknown }> };
declare const HeicTo: ((opts: { blob: Blob; type: string; quality?: number }) => Promise<Blob>) | undefined;

/** Required-element lookup: fails fast if the markup contract is broken. */
function $id<T extends HTMLElement = HTMLElement>(id: string): T {
	const el = document.getElementById(id);
	if (!el) throw new Error(`exif-marker: missing #${id} in markup`);
	return el as T;
}

export function initExifMarkerApp(): void {
	let currentImage: HTMLImageElement | null = null;
	let processedCanvas: HTMLCanvasElement | null = null;
	let originalFile: File | null = null;

	// Handle image upload
	$id<HTMLInputElement>('imageInput').addEventListener('change', async function (e) {
		const file = (e.target as HTMLInputElement).files?.[0];
		if (!file) return;

		// Update file name display
		$id('fileName').textContent = file.name;

		originalFile = file;
		const errorMsg = $id('errorMsg');
		errorMsg.textContent = '';

		try {
			// Convert HEIC to JPEG if needed for display
			let processedFile = file;
			if (file.name.toLowerCase().endsWith('.heic') || file.type === 'image/heic') {
				if (typeof HeicTo === 'undefined') {
					errorMsg.textContent = 'HEIC support failed to load (heic-to library unavailable). Check your connection or script blocker and reload the page.';
					return;
				}
				errorMsg.textContent = 'Converting HEIC to JPEG for display...';
				const convertedBlob = await HeicTo({
					blob: file,
					type: 'image/jpeg',
					quality: 0.9
				});
				processedFile = new File([convertedBlob], file.name.replace('.heic', '.jpg'), { type: 'image/jpeg' });
				errorMsg.textContent = 'HEIC converted to JPEG (original file preserved for EXIF)';
			}

			// Load and display image
			const reader = new FileReader();
			reader.onload = function (event) {
				const img = new Image();
				currentImage = img;
				img.onload = function () {
					const canvas = $id<HTMLCanvasElement>('canvas');
					canvas.width = img.width;
					canvas.height = img.height;
					const ctx = canvas.getContext('2d');
					ctx?.drawImage(img, 0, 0);
				};
				img.src = String(event.target?.result ?? '');
			};
			reader.readAsDataURL(processedFile);

			// Keep original file for EXIF extraction (HEIC files have EXIF data)
			// Don't overwrite originalFile with processedFile

		} catch (error) {
			errorMsg.textContent = 'Error processing image: ' + (error instanceof Error ? error.message : String(error));
			console.error('Error:', error);
		}
	});

	// Process image button
	$id('processBtn').addEventListener('click', async function () {
		if (!currentImage || !originalFile) {
			alert('Please select an image first');
			return;
		}

		const config = {
			corner: $id<HTMLSelectElement>('cornerSelect').value,
			size: $id<HTMLSelectElement>('sizeSelect').value,
			includeTimestamp: $id<HTMLInputElement>('timestampCheck').checked,
			includeLocation: $id<HTMLInputElement>('locationCheck').checked,
			includeCamera: $id<HTMLInputElement>('cameraCheck').checked,
			textStyle: {
				color: 'white',
				fontSize: getFontSize($id<HTMLSelectElement>('sizeSelect').value),
				backgroundColor: 'rgba(0, 0, 0, 0.7)',
				padding: 10
			}
		};

		try {
		if (typeof ExifReader === 'undefined') {
			$id('errorMsg').textContent = 'EXIF reader failed to load (library unavailable). Check your connection or script blocker and reload the page.';
			return;
		}
		// Extract EXIF data
			const tags = await ExifReader.load(await originalFile.arrayBuffer());
			const errorMsg = $id('errorMsg');
			errorMsg.textContent = '';

			// Display raw EXIF data
			displayRawExifData(tags);

			// Build metadata text
			let metadataText = [];

			// Parse timestamp
			if (config.includeTimestamp && tags.DateTimeOriginal) {
				const dateValue = tags.DateTimeOriginal.value;
				const dateStr = typeof dateValue === 'string' ? dateValue : String(dateValue);
				const parsedDate = parseExifDate(dateStr);
				if (parsedDate && !isNaN(parsedDate.getTime())) {
					metadataText.push(`Date: ${parsedDate.toLocaleString()}`);
				} else {
					metadataText.push(`Date: ${dateStr} (raw)`);
				}
			}

			// Parse GPS coordinates
			if (config.includeLocation && tags.GPSLatitude && tags.GPSLongitude) {
				try {
					const lat = convertGPSToDecimal(tags.GPSLatitude, tags.GPSLatitudeRef);
					const lon = convertGPSToDecimal(tags.GPSLongitude, tags.GPSLongitudeRef);

					if (!isNaN(lat) && !isNaN(lon) && lat !== 0 && lon !== 0) {
						metadataText.push(`Location: ${lat.toFixed(6)}°, ${lon.toFixed(6)}°`);
					} else {
						metadataText.push('Location: GPS data invalid');
					}
				} catch (gpsError) {
					console.warn('GPS parsing error:', gpsError);
					metadataText.push('Location: GPS data unavailable');
				}
			}

			// Parse camera info
			if (config.includeCamera && tags.Make && tags.Model) {
				metadataText.push(`Camera: ${tags.Make.value} ${tags.Model.value}`);
			}

			// Draw image and overlay text
			const canvas = $id<HTMLCanvasElement>('canvas');
			const ctx = canvas.getContext('2d');

			// Redraw original image
			ctx?.drawImage(currentImage, 0, 0);

			// Draw metadata overlay
			if (ctx && metadataText.length > 0) {
				drawTextOverlay(ctx, metadataText, config, canvas.width, canvas.height);
			} else {
				errorMsg.textContent = 'No EXIF metadata found in image';
			}

			processedCanvas = canvas;

		} catch (error) {
			console.error('Error processing image:', error);
			$id('errorMsg').textContent = 'Error reading EXIF data: ' + (error instanceof Error ? error.message : String(error));
		}
	});

	// Download button
	$id('downloadBtn').addEventListener('click', function () {
		if (!processedCanvas) {
			alert('Please process an image first');
			return;
		}

		const link = document.createElement('a');
		link.download = 'image_with_metadata.jpg';
		link.href = processedCanvas.toDataURL('image/jpeg', 0.9);
		link.click();
	});

	// Helper function to get font size based on selection
	function getFontSize(size: string): number {
		switch(size) {
			case 'small': return 16;
			case 'medium': return 24;
			case 'large': return 36;
			default: return 24;
		}
	}

	// Helper function to display raw EXIF data
	interface TagInfo {
		name: string;
		description: string;
		value: string;
	}

	function displayRawExifData(tags: Record<string, { description?: unknown; value?: unknown }>) {
		const exifContainer = $id('exifData');

		// Group tags by category
		const categories: Record<string, TagInfo[]> = {
			Basic: [],
			Image: [],
			GPS: [],
			Camera: [],
			Other: []
		};

		// Categorize tags
		for (const [key, tag] of Object.entries(tags)) {
			const tagInfo: TagInfo = {
				name: key,
				description: String(tag.description || (tag.value ?? '')),
				value: formatTagValue(tag.value)
			};

			// Categorize based on tag name
			if (key.startsWith('GPS')) {
				categories.GPS.push(tagInfo);
			} else if (['Make', 'Model', 'LensModel', 'Software'].includes(key)) {
				categories.Camera.push(tagInfo);
			} else if (['ImageWidth', 'ImageHeight', 'Orientation', 'XResolution', 'YResolution'].includes(key)) {
				categories.Image.push(tagInfo);
			} else if (['DateTime', 'DateTimeOriginal', 'ModifyDate'].includes(key)) {
				categories.Basic.push(tagInfo);
			} else if (key === 'Thumbnail') {
				// Skip thumbnail
				continue;
			} else {
				categories.Other.push(tagInfo);
			}
		}

		// Build HTML
		let html = '';

		for (const [category, tags] of Object.entries(categories)) {
			if (tags.length === 0) continue;

			html += `<div class="exif-category">
				<h3 class="exif-category-title">${category}</h3>
				<div class="exif-tags">`;

			for (const tag of tags) {
				html += `
					<div class="exif-tag">
						<span class="exif-tag-name">${escapeHtml(tag.name)}</span>
						<span class="exif-tag-value">${escapeHtml(tag.value)}</span>
					</div>`;
			}

			html += `</div></div>`;
		}

		exifContainer.innerHTML = html || '<p class="exif-placeholder">No EXIF data found in image</p>';
	}

	// Helper function to format tag values for display
	function formatTagValue(value: unknown): string {
		if (value === null || value === undefined) {
			return 'N/A';
		}

		// Handle arrays
		if (Array.isArray(value)) {
			return value.map(v => formatTagValue(v)).join(', ');
		}

		// Handle objects with numerator/denominator (GPS coordinates)
		if (typeof value === 'object' && value !== null && 'numerator' in value) {
			const rational = value as { numerator: number; denominator?: number };
			return `${rational.numerator}/${rational.denominator ?? 1}`;
		}

		// Handle objects (like GPS arrays)
		if (typeof value === 'object') {
			try {
				return JSON.stringify(value);
			} catch (e) {
				return String(value);
			}
		}

		// Handle strings, numbers, etc.
		return String(value);
	}

	// Helper function to parse EXIF date format
	function parseExifDate(exifDateStr: string): Date | null {
		if (!exifDateStr) return null;

		// EXIF format: "YYYY:MM:DD HH:mm:ss"
		// Replace colons with hyphens in date part
		const parts = exifDateStr.split(' ');
		if (parts.length === 2) {
			const datePart = parts[0].replace(/:/g, '-');
			const timePart = parts[1];
			return new Date(`${datePart}T${timePart}`);
		}
		return new Date(exifDateStr);
	}

	// Helper function to convert GPS coordinates to decimal degrees
	function convertGPSToDecimal(gpsArray: { value?: unknown }, gpsRef: { value?: unknown } | string): number {
		if (!gpsArray || !gpsRef) {
			return NaN;
		}

		try {
			let degrees: number, minutes: number, seconds: number;
			const value = gpsArray.value;

			// Handle different EXIF library formats
			// Format 1: Array of array objects [[num, den], [num, den], [num, den]]
			if (Array.isArray(value) && value.length >= 3) {
				// Check if first element is an array (Format 1)
				if (Array.isArray(value[0]) && value[0].length >= 2) {
					degrees = value[0][0] / value[0][1];
					minutes = value[1][0] / value[1][1];
					seconds = value[2][0] / value[2][1];
				}
				// Format 2: Array of fraction objects [{numerator: X, denominator: Y}, ...]
				else if (value[0]?.numerator !== undefined) {
					degrees = value[0].numerator / value[0].denominator;
					minutes = value[1].numerator / value[1].denominator;
					seconds = value[2].numerator / value[2].denominator;
				}
				// Format 3: Array of plain numbers [number, number, number]
				else if (typeof value[0] === 'number') {
					degrees = value[0];
					minutes = value[1];
					seconds = value[2];
				}
				// Format 4: Array of mixed objects (common in some EXIF libraries)
				else if (typeof value[0] === 'object') {
					degrees = (value[0]?.numerator || 0) / (value[0]?.denominator || 1);
					minutes = (value[1]?.numerator || 0) / (value[1]?.denominator || 1);
					seconds = (value[2]?.numerator || 0) / (value[2]?.denominator || 1);
				}
				else {
					return NaN;
				}
			}
			// Format 5: Flat array of numbers [deg_num, deg_den, min_num, min_den, sec_num, sec_den]
			else if (Array.isArray(value) && value.length === 6) {
				degrees = value[0] / value[1];
				minutes = value[2] / value[3];
				seconds = value[4] / value[5];
			}
			else {
				return NaN;
			}

			// Validate values
			if (isNaN(degrees) || isNaN(minutes) || isNaN(seconds)) {
				return NaN;
			}

			let decimal = degrees + minutes/60 + seconds/3600;

			// Apply direction reference
			const refValue = typeof gpsRef === 'string' ? gpsRef : gpsRef.value || gpsRef;
			// Handle array format for ref (e.g., ['N'])
			if (Array.isArray(refValue)) {
				if (refValue[0] === 'S' || refValue[0] === 'W') {
					decimal = -decimal;
				}
			} else if (refValue === 'S' || refValue === 'W') {
				decimal = -decimal;
			}

			return decimal;
		} catch (error) {
			console.warn('GPS conversion error:', error);
			return NaN;
		}
	}

	// Helper function to draw text overlay
	interface OverlayConfig {
		corner: string;
		size: string;
		includeTimestamp: boolean;
		includeLocation: boolean;
		includeCamera: boolean;
		textStyle: { color: string; fontSize: number; backgroundColor: string; padding: number };
	}

	function drawTextOverlay(ctx: CanvasRenderingContext2D, textLines: string[], config: OverlayConfig, canvasWidth: number, canvasHeight: number) {
		const { corner, textStyle } = config;
		const { color, fontSize, backgroundColor, padding } = textStyle;

		// Set font
		ctx.font = `${fontSize}px Arial`;

		// Calculate text dimensions
		const lineHeight = fontSize + 5;
		const maxWidth = Math.max(...textLines.map(line => ctx.measureText(line).width));
		const textHeight = textLines.length * lineHeight;

		// Determine position based on corner
		let x = 0, y = 0;
		const margin = 20;

		switch(corner) {
			case 'top-left':
				x = margin;
				y = margin + fontSize;
				break;
			case 'top-right':
				x = canvasWidth - maxWidth - margin - padding * 2;
				y = margin + fontSize;
				break;
			case 'bottom-left':
				x = margin;
				y = canvasHeight - textHeight - margin + fontSize;
				break;
			case 'bottom-right':
				x = canvasWidth - maxWidth - margin - padding * 2;
				y = canvasHeight - textHeight - margin + fontSize;
				break;
		}

		// Draw background rectangle
		ctx.fillStyle = backgroundColor;
		ctx.fillRect(
			x - padding,
			y - fontSize - padding + 5,
			maxWidth + padding * 2,
			textHeight + padding * 2
		);

		// Draw text
		ctx.fillStyle = color;
		textLines.forEach((line, index) => {
			ctx.fillText(line, x, y + index * lineHeight);
		});
	}
}
