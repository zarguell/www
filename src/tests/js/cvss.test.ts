import { describe, expect, it } from 'vitest';
import { parseVector } from '../../assets/js/lib/cvss';

describe('CVSS vector parser', () => {
  it('parses a CVSS v4.0 base vector', () => {
    const result = parseVector('CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:H/VI:H/VA:H/SC:N/SI:N/SA:N');
    expect(result.version).toBe('4.0');
    expect(result.versionLabel).toBe('CVSS v4.0');
    expect(result.metrics).toHaveLength(11);
    expect(result.groups.map((group) => group.group)).toEqual(['Base']);
    expect(result.missingBase).toEqual([]);
    expect(result.errors).toEqual([]);
    expect(result.canonical).toBe(
      'CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:H/VI:H/VA:H/SC:N/SI:N/SA:N'
    );
    const av = result.metrics.find((metric) => metric.code === 'AV');
    expect(av?.valueLabel).toBe('Network');
  });

  it('groups v4 threat, environmental, and supplemental metrics', () => {
    const result = parseVector(
      'CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:H/VI:H/VA:H/SC:N/SI:N/SA:N/E:A/CR:H/S:P/AU:Y/R:A/V:C/RE:H/U:Red'
    );
    expect(result.groups.map((group) => group.group)).toEqual([
      'Base',
      'Threat',
      'Environmental',
      'Supplemental'
    ]);
    expect(result.metrics.find((metric) => metric.code === 'E')?.valueLabel).toBe('Attacked');
    expect(result.metrics.find((metric) => metric.code === 'S')?.valueLabel).toBe('Present');
  });

  it('parses a CVSS v3.1 vector with temporal metrics', () => {
    const result = parseVector(
      'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H/E:F/RL:O/RC:C'
    );
    expect(result.version).toBe('3.1');
    expect(result.metrics).toHaveLength(11);
    expect(result.groups.map((group) => group.group)).toEqual(['Base', 'Temporal']);
    expect(result.warnings).toEqual([]);
  });

  it('infers v3.x when the prefix is absent', () => {
    const result = parseVector('AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H');
    expect(result.version).toBe('3.x');
    expect(result.versionLabel).toBe('CVSS v3.x (inferred)');
    expect(result.canonical).toBe('AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H');
  });

  it('parses a CVSS v2 vector without a prefix', () => {
    const result = parseVector('AV:N/AC:L/Au:N/C:P/I:P/A:P/E:F/RL:OF/RC:C');
    expect(result.version).toBe('2.0');
    expect(result.metrics).toHaveLength(9);
    expect(result.groups.map((group) => group.group)).toEqual(['Base', 'Temporal']);
    expect(result.canonical).toBe('AV:N/AC:L/Au:N/C:P/I:P/A:P/E:F/RL:OF/RC:C');
  });

  it('warns about missing base metrics', () => {
    const result = parseVector('CVSS:3.1/AV:N/AC:L');
    expect(result.missingBase).toEqual(['PR', 'UI', 'S', 'C', 'I', 'A']);
    expect(result.warnings.join(' ')).toContain('Missing required base metrics');
  });

  it('warns about unknown and wrong-version metrics', () => {
    const result = parseVector('CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H/AT:N/ZZ:X');
    expect(result.warnings.join(' ')).toContain('AT is not a valid metric');
    expect(result.warnings.join(' ')).toContain('Unknown metric');
  });

  it('reports invalid values and duplicate metrics', () => {
    const result = parseVector('CVSS:3.1/AV:n/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H/AV:N');
    expect(result.errors.join(' ')).toContain('Invalid value');
    expect(result.warnings.join(' ')).toContain('Duplicate metric');
  });

  it('rejects unsupported versions and empty input', () => {
    expect(parseVector('CVSS:5.0/AV:N').errors[0]).toContain('Unsupported CVSS version');
    expect(parseVector('').errors[0]).toContain('Enter a CVSS vector');
  });

  it('normalizes metric order in the canonical vector', () => {
    const result = parseVector('CVSS:3.1/A:H/I:H/C:H/S:U/UI:N/PR:N/AC:L/AV:N');
    expect(result.canonical).toBe('CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H');
  });
});
