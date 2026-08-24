import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

function indexOfSnippet(snippet) {
  const index = html.indexOf(snippet);
  assert.notEqual(index, -1, `Missing snippet: ${snippet}`);
  return index;
}

test('converter is the default home module and first navigation item', () => {
  assert.match(html, /<link rel="icon" href="data:,">/);
  assert.match(
    html,
    /<button class="nav-btn active" onclick="switchTab\('converter'\)">量子换算<\/button>/,
  );
  assert.match(html, /<div id="module-converter" class="container converter-home active">/);
  assert.doesNotMatch(html, /<div id="module-pdf" class="container active">/);

  const converterNav = indexOfSnippet("switchTab('converter')");
  const pdfNav = indexOfSnippet("switchTab('pdf')");
  assert.ok(converterNav < pdfNav, 'converter nav should appear before PDF nav');
});

test('dimension conversion section appears before the other conversion groups', () => {
  const lengthSection = indexOfSnippet('<div class="section-title">尺寸 Dimension</div>');
  const massSection = indexOfSnippet('<div class="section-title">重量 Mass</div>');
  const volumeSection = indexOfSnippet('<div class="section-title">体积 Volume</div>');
  assert.ok(lengthSection < massSection, 'dimension section should be before mass');
  assert.ok(lengthSection < volumeSection, 'dimension section should be before volume');
});

test('ton-level mass units are removed from visible inputs and conversion data', () => {
  for (const forbidden of ['data-unit="t"', 'data-unit="ton_us"', 'data-unit="ton_uk"', '短吨', '长吨', '吨 Tonne']) {
    assert.doesNotMatch(html, new RegExp(forbidden.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('stone mass unit is removed from visible inputs and conversion data', () => {
  for (const forbidden of ['data-unit="st"', '英石', 'Stone (st)', 'st:']) {
    assert.doesNotMatch(html, new RegExp(forbidden.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('converter layout uses a wide responsive grid instead of a narrow single column', () => {
  assert.match(html, /\.container\.active\s*\{\s*display:\s*block;\s*\}/);
  assert.match(html, /#module-converter\.active\s*\{\s*display:\s*flex;\s*\}/);
  assert.match(html, /\.converter-grid\s*\{/);
  assert.match(html, /grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(260px,\s*1fr\)\)/);
  assert.match(html, /max-width:\s*min\(1400px,\s*100%\)/);
  assert.doesNotMatch(html, /footer\s*\{[^}]*position:\s*fixed/s);
});

function extractFunctionSource(name) {
  const start = html.indexOf(`function ${name}`);
  assert.notEqual(start, -1, `Missing function ${name}`);

  const openBrace = html.indexOf('{', start);
  let depth = 0;
  for (let i = openBrace; i < html.length; i += 1) {
    const char = html[i];
    if (char === '{') depth += 1;
    if (char === '}') depth -= 1;
    if (depth === 0) return html.slice(start, i + 1);
  }

  assert.fail(`Could not extract function ${name}`);
}

function loadDimensionHelpers() {
  const code = [
    extractFunctionSource('fmtNumber'),
    extractFunctionSource('parseFractionNumber'),
    extractFunctionSource('parseDimensionInput'),
    extractFunctionSource('convertDimensionValue'),
    '({ parseDimensionInput, convertDimensionValue })',
  ].join('\n');
  return vm.runInNewContext(code);
}

function loadCargoHelpers() {
  const code = [
    extractFunctionSource('fmtNumber'),
    extractFunctionSource('parseFractionNumber'),
    extractFunctionSource('parseDimensionInput'),
    extractFunctionSource('parseBoxDimensions'),
    extractFunctionSource('calculateCargoMetrics'),
    '({ parseBoxDimensions, calculateCargoMetrics })',
  ].join('\n');
  return vm.runInNewContext(code);
}

function loadFbaHelpers() {
  const code = [
    extractFunctionSource('getFbaTierAnalysis'),
    extractFunctionSource('getFbaSizeTier'),
    extractFunctionSource('estimateFbaFee'),
    extractFunctionSource('calculateFbaMetrics'),
    '({ getFbaTierAnalysis, getFbaSizeTier, estimateFbaFee, calculateFbaMetrics })',
  ].join('\n');
  return vm.runInNewContext(code);
}

function loadNumberFormatter() {
  const code = [
    extractFunctionSource('fmtNumber'),
    '({ fmtNumber })',
  ].join('\n');
  return vm.runInNewContext(code);
}

test('dimension inputs accept multi-part text values', () => {
  const lengthInputs = html.match(/<input[^>]+class="len-input"[^>]+>/g) ?? [];
  assert.equal(lengthInputs.length, 9);

  for (const input of lengthInputs) {
    assert.match(input, /type="text"/);
    assert.match(input, /inputmode="decimal"/);
    assert.match(input, /placeholder="11x11x11"/);
  }
});

test('dimension conversion handles x and star separated values', () => {
  const { parseDimensionInput, convertDimensionValue } = loadDimensionHelpers();
  const normalize = value => JSON.parse(JSON.stringify(value));

  assert.deepEqual(normalize(parseDimensionInput('11x11x11')), {
    values: [11, 11, 11],
    separator: 'x',
  });
  assert.deepEqual(normalize(parseDimensionInput('11 * 12 * 13')), {
    values: [11, 12, 13],
    separator: '*',
  });
  assert.equal(convertDimensionValue('11x11x11', 0.0254, 0.01), '27.94x27.94x27.94');
  assert.equal(convertDimensionValue('11*12*13', 0.0254, 0.01), '27.94*30.48*33.02');
  assert.equal(convertDimensionValue('11', 0.0254, 0.01), '27.94');
  assert.equal(convertDimensionValue('1/3', 0.0254, 0.01), '0.85');
  assert.equal(convertDimensionValue('1 1/2x2/3x3', 0.0254, 0.01), '3.81x1.69x7.62');
});

test('converter numbers keep at most two decimal places', () => {
  const { fmtNumber } = loadNumberFormatter();

  assert.equal(fmtNumber(1 / 3), '0.33');
  assert.equal(fmtNumber(2), '2');
  assert.equal(fmtNumber(2.1), '2.10');
});

test('cargo checker UI accepts dimensions and actual weight', () => {
  for (const required of [
    '重货/抛货判断',
    'id="cargoDimensionInput"',
    'id="cargoWeightInput"',
    'id="cargoVolumeValue"',
    'id="cargoVolumeWeightValue"',
    'id="cargoTypeValue"',
    'id="cargoDivisorInput"',
    'value="6000"',
    'Amazon FBA · 2026 美国站估算',
    'id="fbaTierValue"',
    'id="fbaFeeValue"',
    'id="fbaRuleSummary"',
    'id="fbaTriggerValue"',
  ]) {
    assert.match(html, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('cargo checker calculates volume weight and cargo type from cm dimensions', () => {
  const { parseBoxDimensions, calculateCargoMetrics } = loadCargoHelpers();
  const normalize = value => JSON.parse(JSON.stringify(value));

  assert.deepEqual(normalize(parseBoxDimensions('11*11*11')), [11, 11, 11]);
  assert.deepEqual(normalize(parseBoxDimensions('11*11*11cm')), [11, 11, 11]);
  assert.deepEqual(normalize(parseBoxDimensions('11cm*12cm*13cm')), [11, 12, 13]);
  assert.deepEqual(normalize(parseBoxDimensions('11 x 12 x 13')), [11, 12, 13]);
  assert.equal(parseBoxDimensions('11x11'), null);

  assert.deepEqual(normalize(calculateCargoMetrics('11*11*11', '0.10')), {
    dimensions: [11, 11, 11],
    volumeCm3: 1331,
    volumeWeightKg: 0.22,
    actualWeightKg: 0.1,
    chargeableWeightKg: 0.22,
    cargoType: '抛货',
  });

  assert.deepEqual(normalize(calculateCargoMetrics('11*11*11', '1')), {
    dimensions: [11, 11, 11],
    volumeCm3: 1331,
    volumeWeightKg: 0.22,
    actualWeightKg: 1,
    chargeableWeightKg: 1,
    cargoType: '重货',
  });

  assert.equal(calculateCargoMetrics('11*11*11', '0.10', '5000').volumeWeightKg, 0.27);
});

test('low-frequency distance units are grouped in a collapsible section', () => {
  assert.match(html, /<details class="optional-units">/);
  assert.match(html, /展开低频单位：千米 \/ 码 \/ 英里 \/ 海里/);
});

test('FBA calculator follows the referenced 2026 US tiers and fee brackets', () => {
  const { getFbaTierAnalysis, getFbaSizeTier, estimateFbaFee, calculateFbaMetrics } = loadFbaHelpers();

  assert.equal(getFbaSizeTier([18, 14, 8], 20), '标准件');
  assert.equal(getFbaSizeTier([19, 14, 8], 20), '大号大件');
  assert.equal(getFbaSizeTier([59, 33, 33], 50), '超大件'); // length + girth exceeds 130 in
  assert.equal(getFbaSizeTier([50, 20, 15], 50), '大号大件');
  assert.equal(getFbaSizeTier([50, 20, 15], 51), '超大件');

  const bulkyAnalysis = getFbaTierAnalysis([19, 14, 8], 20);
  assert.equal(bulkyAnalysis.tier, '大号大件');
  assert.deepEqual(JSON.parse(JSON.stringify(bulkyAnalysis.standardBlockers.map(item => item.label))), ['最长边']);
  assert.deepEqual(JSON.parse(JSON.stringify(bulkyAnalysis.bulkyBlockers)), []);

  const extraLargeAnalysis = getFbaTierAnalysis([59, 33, 33], 50);
  assert.equal(extraLargeAnalysis.tier, '超大件');
  assert.deepEqual(JSON.parse(JSON.stringify(extraLargeAnalysis.bulkyBlockers.map(item => item.label))), ['长+围']);

  assert.equal(estimateFbaFee('标准件', 0.25), 3.68);
  assert.equal(estimateFbaFee('标准件', 3), 6.28);
  assert.equal(estimateFbaFee('标准件', 3.1), 6.96);
  assert.equal(estimateFbaFee('大号大件', 2), 9.99);
  assert.equal(estimateFbaFee('超大件', 51), 40.12);

  const fba = calculateFbaMetrics([45.72, 35.56, 20.32], 9.0718474);
  assert.equal(fba.tier, '标准件');
  assert.equal(Math.round(fba.weightLb), 20);
  assert.equal(fba.fee, 19.5);
});
