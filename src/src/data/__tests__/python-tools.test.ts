import { describe, it, expect } from 'vitest';
import { readdirSync, existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

// <repo>/src/src/data/__tests__ -> <repo>/src/public/tools
const toolsDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../../public/tools');

function pythonToolDirs(): string[] {
	return readdirSync(toolsDir, { withFileTypes: true })
		.filter((d) => d.isDirectory() && d.name !== 'shared')
		.map((d) => d.name);
}

/** Map a config.json `files` URL like /tools/shared/chart_helpers.py to public/. */
function publicUrlExists(url: string): boolean {
	if (!url.startsWith('/tools/')) return false;
	return existsSync(join(toolsDir, url.slice('/tools/'.length)));
}

describe('python tools: shared chart_helpers wiring', () => {
	const tools = pythonToolDirs();
	expect(tools.length).toBeGreaterThanOrEqual(8);

	it('every config.json parses and its files URLs resolve to public/ assets', () => {
		for (const t of tools) {
			const cfgPath = join(toolsDir, t, 'config.json');
			expect(existsSync(cfgPath), `${t}: config.json missing`).toBe(true);
			const cfg = JSON.parse(readFileSync(cfgPath, 'utf8'));
			for (const [url] of Object.entries(cfg.files ?? {})) {
				expect(publicUrlExists(url), `${t}: files URL ${url} not found in public/`).toBe(true);
			}
		}
	});

	it('every main.py importing chart_helpers mounts it via config files', () => {
		for (const t of tools) {
			const main = readFileSync(join(toolsDir, t, 'main.py'), 'utf8');
			if (!/from chart_helpers import/.test(main)) continue;
			const cfg = JSON.parse(readFileSync(join(toolsDir, t, 'config.json'), 'utf8'));
			const mountsHelper = Object.keys(cfg.files ?? {}).some((u) => u.endsWith('chart_helpers.py'));
			expect(mountsHelper, `${t}: imports chart_helpers but config.json does not mount it`).toBe(true);
		}
	});

	it('no main.py re-declares the inline PNG export pipeline (use chart_helpers)', () => {
		for (const t of tools) {
			const main = readFileSync(join(toolsDir, t, 'main.py'), 'utf8');
			expect(main, `${t}: raw savefig-to-BytesIO export found`).not.toMatch(
				/savefig\(\s*buf\w*,\s*format=['"]png['"]/
			);
			expect(main, `${t}: raw b64encode found`).not.toContain('b64encode');
			expect(main, `${t}: inline rcParams found`).not.toContain("rcParams['figure.figsize']");
		}
	});

	it('no main.py re-declares the Plotly render pipeline (use render_plotly)', () => {
		for (const t of tools) {
			const main = readFileSync(join(toolsDir, t, 'main.py'), 'utf8');
			expect(main, `${t}: inline toImageButtonOptions found`).not.toContain('toImageButtonOptions');
			expect(main, `${t}: raw Plotly.newPlot/react call found`).not.toMatch(
				/Plotly\.(?:newPlot|react)\s*\(/
			);
		}
	});

	it('tools using matplotlib declare it in packages', () => {
		for (const t of tools) {
			const main = readFileSync(join(toolsDir, t, 'main.py'), 'utf8');
			if (!main.includes('matplotlib')) continue;
			const cfg = JSON.parse(readFileSync(join(toolsDir, t, 'config.json'), 'utf8'));
			expect(
				(cfg.packages ?? []).some((p: string) => p === 'matplotlib'),
				`${t}: imports matplotlib but config.json lacks the package`
			).toBe(true);
		}
	});
});
