import fs from 'node:fs/promises';
import path from 'node:path';

const fixtureDir = new URL('./', import.meta.url);
const goldenPath = new URL('./shipping-parity-golden.json', fixtureDir);
const degradedPath = new URL('./shipping-parity-degraded-generic-cards.json', fixtureDir);

const requiredZones = [
  'filter-bar',
  'hero-zone',
  'kpi-belt',
  'trend-zone',
  'ranking-zone',
  'detail-zone',
];

const golden = JSON.parse(await fs.readFile(goldenPath, 'utf8'));
const degraded = JSON.parse(await fs.readFile(degradedPath, 'utf8'));

const failures = [
  ...verifyGolden(golden),
  ...verifyDegraded(degraded),
];

if (failures.length > 0) {
  console.error('Parity fixture verification failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log('Parity fixture verification passed.');
  console.log(`Golden fixture: ${path.basename(goldenPath.pathname)}`);
  console.log(`Degraded fixture: ${path.basename(degradedPath.pathname)}`);
}

function verifyGolden(fixture) {
  const issues = [];
  issues.push(...verifyCommonParityEnvelope(fixture, 'golden'));

  for (const zone of requiredZones) {
    if (!fixture.html.includes(zone)) {
      issues.push(`golden fixture is missing required zone "${zone}"`);
    }
  }

  if (!/\bderiveView\s*\(/.test(fixture.js)) {
    issues.push('golden fixture must expose deriveView()');
  }
  if (!/context\.reportData/.test(fixture.js)) {
    issues.push('golden fixture must consume context.reportData');
  }
  if (!/context\.filters/.test(fixture.js)) {
    issues.push('golden fixture must reference canonical filter state');
  }
  if (!/addEventListener/.test(fixture.js)) {
    issues.push('golden fixture must wire at least one real interaction');
  }
  if ((fixture.bindings || []).length < 2) {
    issues.push('golden fixture should include at least two bindings');
  }

  return issues;
}

function verifyDegraded(fixture) {
  const issues = [];
  issues.push(...verifyCommonParityEnvelope(fixture, 'degraded'));

  if (/context\.filters/.test(fixture.js)) {
    issues.push('degraded fixture should intentionally omit canonical filter wiring');
  }
  if ((fixture.html.match(/class="card"/g) || []).length < 4) {
    issues.push('degraded fixture should visibly collapse into generic cards');
  }
  if (requiredZones.some((zone) => fixture.html.includes(zone))) {
    issues.push('degraded fixture should not contain the full parity zone inventory');
  }

  return issues;
}

function verifyCommonParityEnvelope(fixture, fixtureName) {
  const issues = [];
  if (fixture?.runtimeHints?.styleFamily !== 'boardroom-editorial') {
    issues.push(`${fixtureName} fixture must explicitly activate styleFamily=boardroom-editorial`);
  }
  if (fixture?.runtimeHints?.layoutArchetype !== 'parity-operational-single-page') {
    issues.push(`${fixtureName} fixture must explicitly activate layoutArchetype=parity-operational-single-page`);
  }
  if (!Array.isArray(fixture?.usedQueryRefs) || fixture.usedQueryRefs.length === 0) {
    issues.push(`${fixtureName} fixture must include usedQueryRefs`);
  }
  if (typeof fixture?.html !== 'string' || typeof fixture?.css !== 'string' || typeof fixture?.js !== 'string') {
    issues.push(`${fixtureName} fixture must provide html/css/js strings`);
  }
  return issues;
}
