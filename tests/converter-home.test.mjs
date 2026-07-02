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
    extractFunctionSource('parseDimensionInput'),
    extractFunctionSource('convertDimensionValue'),
    '({ parseDimensionInput, convertDimensionValue })',
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
});
