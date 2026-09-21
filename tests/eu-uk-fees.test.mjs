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

function loadEuHelpers() {
  const code = [
    extractConstantSource('EU_FBA_FULFILLMENT_2026'),
    extractConstantSource('EU_FBA_STORAGE_2026'),
    extractConstantSource('EU_REFERRAL_RULES_2026'),
    extractFunctionSource('euMarketKey'),
    extractFunctionSource('euTierMatches'),
    extractFunctionSource('euFeeFromPlan'),
    extractFunctionSource('getEuFbaMetrics'),
    extractFunctionSource('calculateEuFbaStorageFee'),
    extractFunctionSource('calculateEuReferralFee'),
    '({ getEuFbaMetrics, calculateEuFbaStorageFee, calculateEuReferralFee })',
  ].join('\n');
  return vm.runInNewContext(code);
}

test('UK and EU use the official 2026-07-01 rate card and 1.5% fuel surcharge', () => {
  const { getEuFbaMetrics } = loadEuHelpers();
  const ukLow = getEuFbaMetrics([20, 15, 2], 0.08, 15, 'UK', 'standard', false);
  const ukStandard = getEuFbaMetrics([20, 15, 2], 0.08, 20.01, 'UK', 'standard', false);
  const ukLowPriceTooHeavy = getEuFbaMetrics([30, 20, 10], 0.5, 15, 'UK', 'standard', false);
  const euLow = getEuFbaMetrics([20, 15, 2], 0.08, 15, 'EU', 'standard', false);
  const euParcel = getEuFbaMetrics([30, 20, 10], 0.5, 30, 'EU', 'standard', false);

  assert.equal(ukLow.priceBand, 'lowprice');
  assert.equal(ukLow.baseFee, 1.67);
  assert.equal(ukLow.fuelPct, 1.5);
  assert.ok(Math.abs(ukLow.fee - (1.67 + 1.67 * 0.015)) < 1e-10);
  assert.equal(ukStandard.priceBand, 'standard');
  assert.equal(ukStandard.baseFee, 2.07);
  assert.equal(ukLowPriceTooHeavy.priceBand, 'standard');
  assert.equal(ukLowPriceTooHeavy.baseFee, 3.05);
  assert.equal(euLow.baseFee, 1.80);
  assert.equal(euParcel.baseFee, 3.15);
  assert.equal(euParcel.dimensionalWeightKg, 1.2);
  assert.equal(euParcel.shippingWeightKg, 1.2);
});

test('UK and EU peak, apparel, hazmat and storage rates are applied separately', () => {
  const { getEuFbaMetrics, calculateEuFbaStorageFee } = loadEuHelpers();
  const nonPeak = getEuFbaMetrics([30, 20, 10], 0.5, 30, 'UK', 'standard', false);
  const peak = getEuFbaMetrics([30, 20, 10], 0.5, 30, 'UK', 'standard', true);
  const apparel = getEuFbaMetrics([30, 20, 10], 0.5, 30, 'EU', 'apparel', false);
  const hazmat = getEuFbaMetrics([20, 15, 2], 0.08, 30, 'UK', 'hazmat', false);

  assert.equal(peak.peakShipping, true);
  assert.ok(peak.peakSurcharge > 0);
  assert.ok(peak.fee > nonPeak.fee);
  assert.equal(apparel.category, 'apparel');
  assert.equal(apparel.shippingWeightKg, 0.5);
  assert.equal(hazmat.hazmatSurcharge, 0.10);
  assert.ok(Math.abs(calculateEuFbaStorageFee(1000000, '标准包裹', 'standard', 'UK', 1) - 0.76 * 1000000 / 28316.846592) < 1e-10);
  assert.equal(calculateEuFbaStorageFee(1000000, '标准包裹', 'standard', 'EU', 10), 52.20);
  assert.equal(calculateEuFbaStorageFee(1000000, '小号大件', 'hazmat', 'EU', 1), 27.50);
});

test('UK and EU referral fees follow category price tiers and minimums', () => {
  const { calculateEuReferralFee } = loadEuHelpers();
  assert.equal(calculateEuReferralFee(10, 'clothing', 'EU', '小号包裹').base, 0.5);
  assert.equal(calculateEuReferralFee(50, 'clothing', 'EU', '小号包裹').base, 7.1);
  assert.equal(calculateEuReferralFee(300, 'jewelry', 'UK', '小号包裹').base, 48.75);
  assert.equal(calculateEuReferralFee(1, 'other', 'UK', '小号包裹').base, 0.25);
  assert.equal(calculateEuReferralFee(100, 'other', 'EU', '重型大件').base, 20);
});

test('marketplace UI exposes UK/EU automatic fees and official sources', () => {
  for (const required of [
    '<option value="EU">欧洲 / EU</option>',
    '<option value="UK">英国 / UK</option>',
    "EU: { name: '欧洲站（德国/CEP 欧元区）'",
    "UK: { name: '英国站'",
    'const EU_FBA_FULFILLMENT_2026',
    'const EU_FBA_STORAGE_2026',
    'const EU_REFERRAL_RULES_2026',
    'function getEuFbaMetrics',
    'function calculateEuFbaStorageFee',
    'function calculateEuReferralFee',
    '260630-FBA-Rate-Card-EN1.pdf',
    'autoFees: true',
  ]) {
    assert.match(html, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('profit breakdown exposes purchase per unit and total purchase cost', () => {
  for (const required of [
    'id="profitPurchaseValue"',
    'id="profitPurchaseTotalValue"',
    "setProfitTotalMetric('profitPurchaseTotalValue', result.purchase, fx, monthlyUnits)",
    "setProfitTotalMetric('profitPurchaseTotalValue', weightedPurchase, fx, monthlyUnits)",
  ]) {
    assert.match(html, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(html, /fbaCostUnavailable: !autoFeesSupported \|\| !fba \|\| fba\.fee === null/);
});
