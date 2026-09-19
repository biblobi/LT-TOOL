import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

function extractFunctionSource(name) {
  const start = html.indexOf(`function ${name}`);
  assert.notEqual(start, -1, `Missing function ${name}`);
  const openBrace = html.indexOf('{', start);
  let depth = 0;
  for (let i = openBrace; i < html.length; i += 1) {
    if (html[i] === '{') depth += 1;
    if (html[i] === '}') depth -= 1;
    if (depth === 0) return html.slice(start, i + 1);
  }
  assert.fail(`Could not extract function ${name}`);
}

function extractConstantSource(name) {
  const start = html.indexOf(`const ${name} =`);
  assert.notEqual(start, -1, `Missing constant ${name}`);
  let braces = 0;
  let brackets = 0;
  let parentheses = 0;
  let started = false;
  for (let i = start; i < html.length; i += 1) {
    const char = html[i];
    if (char === '=') started = true;
    if (!started) continue;
    if (char === '{') braces += 1;
    if (char === '}') braces -= 1;
    if (char === '[') brackets += 1;
    if (char === ']') brackets -= 1;
    if (char === '(') parentheses += 1;
    if (char === ')') parentheses -= 1;
    if (char === ';' && braces === 0 && brackets === 0 && parentheses === 0) return html.slice(start, i + 1);
  }
  assert.fail(`Could not extract constant ${name}`);
}

function loadBarHelpers() {
  const code = [
    extractConstantSource('PROFIT_BAR_METRICS'),
    extractFunctionSource('profitShareOfPrice'),
    '({ PROFIT_BAR_METRICS, profitShareOfPrice })',
  ].join('\n');
  return vm.runInNewContext(code);
}

// 与 renderProfitBars 中一致的条宽换算，避免测试与实现各写一套
function barWidth(share) {
  const width = share === null ? 0 : Math.min(100, Math.abs(share) * 100);
  return width > 0 && width < 1 ? 1 : width;
}

test('only price components carry a data bar; margin is flagged as none', () => {
  const { PROFIT_BAR_METRICS } = loadBarHelpers();
  const modes = Object.fromEntries(PROFIT_BAR_METRICS.map(([, , key, mode]) => [key, mode]));
  for (const key of ['purchase', 'freight', 'fba', 'storage', 'ad', 'referral', 'placement', 'promo', 'returns', 'totalCost', 'profit']) {
    assert.equal(modes[key], 'share', `${key} should be a price component`);
  }
  assert.equal(modes.margin, 'none', 'margin is not a cost component and must not get a bar');
});

test('bar scale is the selling price, so a single series is not pinned at 100%', () => {
  const { profitShareOfPrice } = loadBarHelpers();
  const price = 29.99;
  const costs = { purchase: 7.14, freight: 3.2, fba: 5.42, storage: 0.61, ad: 4.5 };
  const widths = Object.fromEntries(Object.entries(costs).map(([k, v]) => [k, barWidth(profitShareOfPrice(v, price))]));

  for (const [key, width] of Object.entries(widths)) {
    assert.ok(width > 0 && width < 100, `${key} should be a partial share, got ${width}`);
  }
  assert.ok(widths.purchase > widths.storage, 'a larger cost must draw a longer bar');
  // 旧实现取本行最大值做刻度，单条数据时每条都是 100%
  assert.ok(Object.values(widths).every(w => w !== 100), 'no cost bar may sit at 100% with one series');
});

test('component bars add up to total cost, and total cost plus profit fills the price', () => {
  const { profitShareOfPrice } = loadBarHelpers();
  const price = 29.99;
  const costs = [7.14, 3.2, 5.42, 0.61, 4.5, 4.5, 0.3, 0.9, 1.35];
  const totalCost = costs.reduce((sum, value) => sum + value, 0);
  const profit = price - totalCost;
  const sumOfParts = costs.reduce((sum, value) => sum + value / price * 100, 0);

  assert.ok(Math.abs(sumOfParts - barWidth(profitShareOfPrice(totalCost, price))) < 1e-9);
  assert.ok(Math.abs(barWidth(profitShareOfPrice(totalCost, price)) + barWidth(profitShareOfPrice(profit, price)) - 100) < 1e-9);
});

test('losses draw a red bar sized by the loss and over-price totals are clamped', () => {
  const { profitShareOfPrice } = loadBarHelpers();
  const price = 29.99;

  const lossShare = profitShareOfPrice(-6, price);
  assert.ok(lossShare < 0, 'a negative profit must be marked negative');
  assert.ok(Math.abs(barWidth(lossShare) - 20.0067) < 1e-3);

  assert.equal(barWidth(profitShareOfPrice(price * 1.15, price)), 100, 'over-price total cost must clamp to 100%');
});

test('missing price or missing value yields no bar', () => {
  const { profitShareOfPrice } = loadBarHelpers();
  assert.equal(profitShareOfPrice(7.14, 0), null);
  assert.equal(profitShareOfPrice(7.14, null), null);
  assert.equal(profitShareOfPrice(null, 29.99), null);
  assert.equal(barWidth(profitShareOfPrice(7.14, 0)), 0);
});

test('renderProfitBars never scales by the row maximum', () => {
  const source = extractFunctionSource('renderProfitBars');
  assert.ok(!/Math\.max\(\.\.\.positives\)/.test(source), 'row-maximum scaling makes every bar 100%');
  assert.ok(source.includes('profitShareOfPrice(value, itemPrice)'), 'bars must be measured against the price');
  assert.ok(source.includes('mode === \'none\''), 'ratio metrics must be skipped explicitly');
  assert.ok(/Math\.min\(100,/.test(source), 'bar width must be clamped to the track');
});
