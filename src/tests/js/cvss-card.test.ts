import { describe, expect, it } from 'vitest';
import { parseVector } from '../../assets/js/lib/cvss';
import { buildCvssCard } from '../../assets/js/lib/cvss-card';

const v4 = parseVector('CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:H/VI:H/VA:H/SC:N/SI:N/SA:N');
const v31 = parseVector('CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H/E:F/RL:O/RC:C');

describe('CVSS card exporter', () => {
  it('builds a compact v4 SVG card and text summary', () => {
    const card = buildCvssCard(v4);
    expect(card).not.toBeNull();
    expect(card?.width).toBe(1200);
    expect(card?.height).toBeGreaterThan(500);
    expect(card?.svg).toContain('CVSS v4.0');
    expect(card?.svg).toContain('CVSS:4.0/AV:N/AC:L');
    expect(card?.svg).toContain('Attack Vector');
    expect(card?.svg).toContain('https://arguelles.me/tools/cvss-parser');
    expect(card?.summary).toContain('- AV N — Attack Vector · Network');
  });

  it('includes non-base metrics in a compact extras line', () => {
    const card = buildCvssCard(v31);
    expect(card?.svg).toContain('E:F · RL:O · RC:C');
    expect(card?.summary).toContain('Also: E:F · RL:O · RC:C');
  });

  it('allows cards with warnings but refuses invalid vectors', () => {
    const warned = parseVector('CVSS:3.1/AV:N/AC:L');
    expect(warned.warnings.length).toBeGreaterThan(0);
    expect(buildCvssCard(warned)?.svg).toContain('warning');

    const invalid = parseVector('CVSS:3.1/AV:n');
    expect(invalid.errors.length).toBeGreaterThan(0);
    expect(buildCvssCard(invalid)).toBeNull();
  });
});
