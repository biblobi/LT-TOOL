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

test('profit calculator is the default home module and first navigation item', () => {
  assert.match(html, /<link rel="icon" href="data:,">/);
  assert.match(
    html,
    /<button class="nav-btn active" onclick="switchTab\('profit'\)"><span class="nav-label">利润测算<\/span><\/button>/,
  );
  // 导航按钮是正方形，文字用 .nav-label 锁成每行两个字
  assert.match(html, /\.nav-label \{[^}]*width: 2\.4em/);
  assert.match(html, /\.nav-btn,\s*\n\s*\.converter-jump \{[\s\S]*?aspect-ratio: 1 \/ 1;/);
  assert.match(html, /<div id="module-profit" class="container converter-home active">/);
  assert.match(html, /<div id="module-converter" class="container converter-home">/);
  assert.doesNotMatch(html, /<div id="module-pdf" class="container active">/);

  const profitNav = indexOfSnippet("switchTab('profit')");
  const converterNav = indexOfSnippet("switchTab('converter')");
  const pdfNav = indexOfSnippet("switchTab('pdf')");
  assert.ok(profitNav < converterNav, 'profit nav should appear before unit converter nav');
  assert.ok(converterNav < pdfNav, 'converter nav should appear before PDF nav');
});

test('unit conversion groups use concise Chinese titles in the expected order', () => {
  const lengthSection = indexOfSnippet('<div class="section-title">尺寸</div>');
  const massSection = indexOfSnippet('<div class="section-title">重量</div>');
  const volumeSection = indexOfSnippet('<div class="section-title">体积</div>');
  assert.ok(lengthSection < massSection, 'dimension section should be before mass');
  assert.ok(lengthSection < volumeSection, 'dimension section should be before volume');
});

test('unit names use Chinese labels and abbreviations on one line', () => {
  for (const required of ['<h1>单位换算</h1>', '米（m）', '千克（kg）', '立方厘米（cm3）', '立方英尺（ft3）', '摄氏（C）']) {
    assert.match(html, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(html, /\.conversion-table td:first-child\s*\{\s*white-space:\s*nowrap;/);
  for (const removed of ['Meter (m)', 'Kilogram (kg)', 'Cubic meter (m3)', 'Celsius (C)']) assert.doesNotMatch(html, new RegExp(removed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('ton-level mass units are removed from visible inputs and conversion data', () => {
  for (const forbidden of ['data-unit="t"', 'data-unit="ton_us"', 'data-unit="ton_uk"', '短吨', '长吨', '吨 Tonne']) {
    assert.doesNotMatch(html, new RegExp(forbidden.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('stone mass unit is removed from visible inputs and conversion data', () => {
  for (const forbidden of ['data-unit="st"', '英石', 'Stone (st)']) {
    assert.doesNotMatch(html, new RegExp(forbidden.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('converter layout uses a twelve-column desktop grid and compact responsive fallbacks', () => {
  assert.match(html, /\.container\.active\s*\{\s*display:\s*block;\s*\}/);
  assert.match(html, /#module-profit\.active\s*\{\s*display:\s*flex;\s*\}/);
  assert.match(html, /\.converter-grid\s*\{/);
  assert.match(html, /\.converter-grid[\s\S]*?grid-template-columns:\s*repeat\(12,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(html, /\.conversion-table tbody[\s\S]*?grid-template-columns:\s*repeat\(12,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(html, /@media\s*\(max-width:\s*1200px\)\s*\{[\s\S]*?\.converter-grid\s*\{\s*grid-template-columns:\s*repeat\(6,/);
  assert.match(html, /max-width:\s*min\(1400px,\s*100%\)/);
  assert.match(html, /@media\s*\(min-width:\s*1401px\)\s*\{[\s\S]*?\.container,\s*\.converter-home,\s*\.calculator-home\s*\{\s*max-width:\s*none;/);
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

function extractConstantSource(name) {
  const start = html.indexOf(`const ${name} =`);
  assert.notEqual(start, -1, `Missing constant: ${name}`);
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
  assert.fail(`Could not extract constant: ${name}`);
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
    extractConstantSource('DEFAULT_FEE_CONFIG'),
    extractFunctionSource('feeDeepClone'),
    'let FEE_CONFIG = feeDeepClone(DEFAULT_FEE_CONFIG);',
    extractFunctionSource('getPriceBand'),
    extractFunctionSource('readProductCategory'),
    extractFunctionSource('readProductPrice'),
    extractConstantSource('US_FBA_FULFILLMENT_2026'),
    extractFunctionSource('fmtNumber'),
    extractFunctionSource('getFbaTierAnalysis'),
    extractFunctionSource('getFbaSizeTier'),
    extractFunctionSource('estimateFbaFee'),
    extractFunctionSource('calculateFbaMetrics'),
    extractFunctionSource('formatFbaBlockers'),
    '({ getFbaTierAnalysis, getFbaSizeTier, estimateFbaFee, calculateFbaMetrics, formatFbaBlockers })',
  ].join('\n');
  return vm.runInNewContext(code);
}

function loadProfitHelpers() {
  const code = [
    extractConstantSource('JP_REFERRAL_RULES_2026'),
    extractFunctionSource('calculateJpReferralFee'),
    extractFunctionSource('calculateAdMetrics'),
    extractFunctionSource('calculateProfitMetrics'),
    '({ calculateJpReferralFee, calculateAdMetrics, calculateProfitMetrics })',
  ].join('\n');
  return vm.runInNewContext(code);
}

function loadStorageHelpers() {
  const code = [
    extractConstantSource('DEFAULT_FEE_CONFIG'),
    extractFunctionSource('feeDeepClone'),
    'let FEE_CONFIG = feeDeepClone(DEFAULT_FEE_CONFIG);',
    extractConstantSource('US_FBA_STORAGE_2026'),
    extractFunctionSource('storageMonthNumber'),
    extractFunctionSource('storageDaysInMonth'),
    extractFunctionSource('getUsStorageBaseRate'),
    extractFunctionSource('getUsStorageUtilizationSurcharge'),
    extractFunctionSource('calculateUsFbaStorageForecast'),
    extractFunctionSource('calculateStoragePeriodAllocation'),
    extractFunctionSource('calculateUsFbaReplenishmentPlan'),
    '({ getUsStorageBaseRate, getUsStorageUtilizationSurcharge, calculateUsFbaStorageForecast, calculateStoragePeriodAllocation, calculateUsFbaReplenishmentPlan })',
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

test('dimension inputs accept multi-part text values without a multiplication button', () => {
  const lengthInputs = html.match(/<input[^>]+class="len-input"[^>]+>/g) ?? [];
  assert.equal(lengthInputs.length, 9);

  for (const input of lengthInputs) {
    assert.match(input, /type="text"/);
    assert.match(input, /inputmode="text"/);
    assert.match(input, /placeholder="11x11x11"/);
  }
  assert.match(html, /class="dimension-row"/);
  assert.doesNotMatch(html, /class="dimension-multiply"/);
  assert.doesNotMatch(html, /function insertDimensionSeparator\(/);
  assert.match(html, /id="cargoDimensionInput"[^>]+placeholder="11x11x11cm"/);
  assert.match(html, /id="cargoDimensionInInput"[^>]+placeholder="4\.33x4\.33x4\.33in"/);
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
    '运费与仓储计算',
    'id="cargoDimensionInput"',
    'id="cargoWeightInput"',
    'id="cargoVolumeValue"',
    'id="cargoVolumeWeightValue"',
    'id="cargoTypeValue"',
    'id="cargoDivisorInput"',
    'value="6000"',
    '尺寸等级', '配送费',
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
  assert.deepEqual(normalize(parseBoxDimensions('4.33*4.33*4.33in')), [4.33, 4.33, 4.33]);
  assert.deepEqual(normalize(parseBoxDimensions('11 x 12 x 13')), [11, 12, 13]);
  assert.equal(parseBoxDimensions('11x11'), null);

  assert.deepEqual(normalize(calculateCargoMetrics('11*11*11', '0.10')), {
    dimensions: [11, 11, 11],
    volumeCm3: 1331,
    volumeM3: 0.001331,
    volumeWeightKg: 0.22,
    actualWeightKg: 0.1,
    chargeableWeightKg: 0.22,
    cargoType: '抛货',
  });

  assert.deepEqual(normalize(calculateCargoMetrics('11*11*11', '1')), {
    dimensions: [11, 11, 11],
    volumeCm3: 1331,
    volumeM3: 0.001331,
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

test('volume conversion includes cubic centimetres and cubic feet', () => {
  for (const required of [
    'data-unit="cm3"', '立方厘米（cm3）', 'data-unit="ft3"', '立方英尺（ft3）',
    'cm3: 0.001', 'ft3: 28.316846592', '体积（立方米）', 'function fmtVolumeM3',
  ]) assert.match(html, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('FBA calculator follows the referenced 2026 US tiers and fee brackets', () => {
  const { getFbaTierAnalysis, getFbaSizeTier, estimateFbaFee, calculateFbaMetrics, formatFbaBlockers } = loadFbaHelpers();

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
  assert.equal(formatFbaBlockers(bulkyAnalysis.standardBlockers), '最长边 19 in (48.26 cm) > 18 in (45.72 cm)');

  const weightAnalysis = getFbaTierAnalysis([18, 14, 8], 21);
  assert.equal(formatFbaBlockers(weightAnalysis.standardBlockers), '重量 21 lb (9.53 kg) > 20 lb (9.07 kg)');

  assert.equal(estimateFbaFee('标准件', 0.25), 3.68);
  assert.equal(estimateFbaFee('标准件', 3), 6.28);
  assert.equal(estimateFbaFee('标准件', 3.1), 6.96);
  assert.equal(estimateFbaFee('大号大件', 2), 9.99);
  assert.equal(estimateFbaFee('超大件', 51), 40.12);

  const fba = calculateFbaMetrics([45.72, 35.56, 20.32], 9.0718474);
  assert.equal(fba.tier, '标准件');
  assert.equal(Math.round(fba.weightLb), 20);
  assert.equal(fba.fee, 20.1825);
});

test('FBA uses its own dimensional shipping weight and applies the 2026 peak option separately from cargo freight', () => {
  const { calculateFbaMetrics } = loadFbaHelpers();
  const bulkyByVolume = calculateFbaMetrics([45.72, 35.56, 20.32], 0.45359237, { country: 'US', peakShipping: false });
  const peak = calculateFbaMetrics([45.72, 35.56, 20.32], 0.45359237, { country: 'US', peakShipping: true });

  assert.ok(Math.abs(bulkyByVolume.dimensionalWeightLb - (2016 / 139)) < 1e-10);
  assert.equal(bulkyByVolume.shippingWeightLb, bulkyByVolume.dimensionalWeightLb);
  assert.equal(peak.peakSurcharge, 0.32);
  assert.equal(peak.fee, bulkyByVolume.fee + 0.32);

  for (const required of [
    'id="fbaPeakShipping"', '旺季发货', '2026-10-15 至 2027-01-14',
    'id="fbaDimensionalWeightValue"', 'id="fbaShippingWeightValue"',
    'dimensionalWeightDivisorIn3PerLb: 139', 'peakAverageSurcharge: 0.32',
    '头程体积系数', 'FBA体积重（磅）', 'FBA计费重（磅）',
  ]) assert.match(html, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(html, /calculateFbaMetrics\(dimensionsCm, weightKg, options\)[\s\S]*?dimensionalWeightLb[\s\S]*?shippingWeightLb[\s\S]*?peakSurcharge/s);
  assert.match(html, /头程体积系数，默认系数为 6000。该系数只用于头程，不能直接套用到 FBA。/);
  assert.match(html, /美国\/加拿大使用 139 in³\/lb 估算体积重/);
});

test('FBA basis stays side-by-side until a phone-width breakpoint', () => {
  assert.match(html, /grid-template-columns:\s*minmax\(260px,\s*0\.9fr\)\s+minmax\(300px,\s*1\.1fr\)/);
  assert.match(html, /@media\s*\(max-width:\s*560px\)\s*\{\s*\.cargo-layout\s*\{\s*grid-template-columns:\s*1fr/s);
});

test('FBA and cargo inputs are statically located in the freight calculator above the profit module', () => {
  const cargoStart = html.indexOf('id="cargo-check"');
  const freightStart = html.indexOf('id="module-freight"');
  const profitStart = html.indexOf('id="profitDetail"');
  const adStart = html.indexOf('id="module-adcalc"');
  assert.equal((html.match(/id="cargo-check"/g) ?? []).length, 1);
  assert.ok(cargoStart > freightStart && cargoStart < profitStart, 'cargo inputs stay inside the freight module');
  assert.ok(freightStart < profitStart, 'freight module stays above the profit module');
  // 广告费换算已并入利润测算模块内部
  assert.ok(adStart > profitStart, 'advertising calculator is nested inside the profit module');
  assert.ok(html.indexOf('class="profit-layout"') > adStart, 'ad block sits above the profit result layout');
  assert.doesNotMatch(html, /function moveCargoCheckIntoProfit/);
});

test('advertising calculator derives CVR, POS, CPA, ACOS, ROAS and blended cost from clicks and monthly sales', () => {
  const { calculateAdMetrics } = loadProfitHelpers();
  const metrics = calculateAdMetrics({ cpc: 0.8, clicks: 1000, orders: 100, cvr: 0, monthlyUnits: 400, pos: 100, price: 20 });
  assert.equal(metrics.cvr, 0.1);
  assert.equal(metrics.pos, 0.25);
  assert.equal(metrics.cpa, 8);
  assert.equal(metrics.acos, 0.4);
  assert.equal(metrics.roas, 2.5);
  assert.equal(metrics.blendedCost, 2);
  assert.equal(metrics.acoas, 0.1);
});

test('optional advertising fields use unambiguous numeric entry placeholders', () => {
  assert.match(html, /id="adClicks"[^>]*placeholder="输入月点击量（选填）"/);
  assert.match(html, /id="adOrders"[^>]*placeholder="输入广告订单量（选填）"/);
  assert.match(html, /id="adMonthlyUnits"[^>]*placeholder="输入月销量（选填）"/);
  assert.doesNotMatch(html, /placeholder="可选"/);
});

test('advertising calculator accepts a manual CVR when clicks are unavailable', () => {
  const { calculateAdMetrics } = loadProfitHelpers();
  const metrics = calculateAdMetrics({ cpc: 0.8, clicks: 0, orders: 2, cvr: 25, monthlyUnits: 20, pos: 100, price: 20 });
  assert.equal(metrics.cvr, 0.25);
  assert.equal(metrics.cpa, 3.2);
});

test('advertising calculator leaves POS unavailable until monthly sales are provided', () => {
  const { calculateAdMetrics } = loadProfitHelpers();
  const metrics = calculateAdMetrics({ cpc: 0.8, clicks: 100, orders: 0, cvr: 10, monthlyUnits: 0, price: 20 });
  assert.equal(metrics.pos, null);
  assert.equal(metrics.blendedCost, null);
});

test('Japan referral fees use category tiers, minimum fee, and consumption tax correctly', () => {
  const { calculateJpReferralFee } = loadProfitHelpers();
  assert.deepEqual(JSON.parse(JSON.stringify(calculateJpReferralFee(3000, 'home-kitchen', true))), { base: 462, tax: 46.2, total: 508.2, effectiveRate: 0.1694 });
  assert.deepEqual(JSON.parse(JSON.stringify(calculateJpReferralFee(666, 'consumer-electronics', true))), { base: 33.3, tax: 3.33, total: 36.63, effectiveRate: 0.055 });
  assert.equal(calculateJpReferralFee(500, 'consumer-electronics', false).base, 30);
  assert.equal(calculateJpReferralFee(3000, 'beauty', true).base, 312);
  assert.equal(calculateJpReferralFee(4000, 'clothing', true).base, 456);
  assert.equal(calculateJpReferralFee(12000, 'jewelry', true).base, 1168);
});

test('profit treats unknown automatic FBA and storage costs as unavailable', () => {
  const { calculateProfitMetrics } = loadProfitHelpers();
  const unknownFba = calculateProfitMetrics({ price: 3000, fx: 0.048, purchaseRmb: 48, referralFee: 300, fbaCostUnavailable: true, storageCost: 10 });
  assert.equal(unknownFba.totalCost, null);
  assert.equal(unknownFba.profit, null);
  const unknownStorage = calculateProfitMetrics({ price: 3000, fx: 0.048, purchaseRmb: 48, referralFee: 300, fbaFee: 420, storageCostUnavailable: true });
  assert.equal(unknownStorage.totalCost, null);
  assert.equal(unknownStorage.profit, null);
});

test('return handling fee is weighted by return rate', () => {
  const { calculateProfitMetrics } = loadProfitHelpers();
  const result = calculateProfitMetrics({ price: 1000, fx: 1, returnRate: 8, returnHandling: 100, storageCost: 0 });
  assert.equal(result.returns, 88);
});

test('Japan price changes refresh the displayed FBA fee and use precise JPY exchange rates', () => {
  assert.match(html, /id="adPrice"[^>]*oninput="updateAdCalculator\(\); updateCargoCheck\(\)"/);
  assert.match(html, /function marketFxDecimals\(currency\)/);
  assert.match(html, /currency === 'JPY' \? 6 : 2/);
  assert.match(html, /fx\.value = \(1 \/ marketRate\)\.toFixed\(marketFxDecimals\(requestedCurrency\)\)/);
  assert.match(html, /profitFx\.value = \(liveRates\.CNY \/ liveRates\[market\.currency\]\)\.toFixed\(marketFxDecimals\(market\.currency\)\)/);
});

test('detailed calculator is the default seller workflow with simple required inputs and core outputs', () => {
  for (const required of [
    'id="quickModeButton"', 'id="professionalModeButton"', 'id="quickCalculator"',
    'id="quickMarket"', 'id="quickCategory"', 'id="quickPrice"', 'id="quickPurchaseRmb"',
    'id="quickLength"', 'id="quickWidth"', 'id="quickHeight"', 'id="quickWeight"',
    'id="quickFreightRate"', 'id="quickMonthlyUnits"', 'id="quickStorageDays"', 'id="quickAdRate"',
    'id="quickProfitValue"', 'id="quickMarginValue"', 'id="quickMonthlyProfitValue"', 'id="quickBreakEvenPriceValue"',
    'id="quickCostBreakdown"', 'id="quickRiskList"', 'function calculateQuickEstimate', 'function updateQuickCalculator',
  ]) assert.match(html, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(html, /id="professionalModeButton"[^>]*class="[^"]*active/);
  assert.match(html, /id="quickCalculator"[^>]*hidden/);
  assert.match(html, /id="professionalWorkspace" class="converter-workspace professional-workspace">/);
  assert.match(html, /<option value="US" selected>美国 \/ US<\/option>/);
});

test('quick Japan estimate calculates automated referral, FBA, storage, ads, profit and break-even', () => {
  const code = [
    extractConstantSource('JP_FBA_FULFILLMENT_2026'),
    extractConstantSource('JP_FBA_STORAGE_2026'),
    extractConstantSource('JP_REFERRAL_RULES_2026'),
    extractFunctionSource('calculateJpReferralFee'),
    extractFunctionSource('getJpFbaMetrics'),
    extractFunctionSource('calculateJpFbaStorageFee'),
    extractFunctionSource('calculateQuickEstimate'),
    '({ calculateQuickEstimate })',
  ].join('\n');
  const { calculateQuickEstimate } = vm.runInNewContext(code);
  const result = calculateQuickEstimate({
    market: 'JP', category: 'home-kitchen', price: 3000, purchaseRmb: 48, fx: 0.048,
    dimensionsCm: [20, 10, 10], weightKg: 0.2, freightRateRmb: 8,
    monthlyUnits: 100, storageDays: 30, adRate: 10, month: 9,
  });
  assert.equal(result.purchase, 1000);
  assert.equal(result.referral, 508.2);
  assert.equal(result.fba, 420);
  assert.equal(result.freight, 55.55555555555555);
  assert.ok(Math.abs(result.storage - 11.352) < 1e-10);
  assert.equal(result.ad, 300);
  assert.ok(Math.abs(result.profit - 704.8924444444442) < 1e-9);
  assert.ok(Math.abs(result.margin - 0.23496414814814806) < 1e-9);
  assert.ok(Math.abs(result.monthlyProfit - 70489.24444444443) < 1e-8);
  assert.equal(result.breakEvenPrice, 2036);
});

test('quick Japan break-even recalculates category commission and low-price FBA at each candidate price', () => {
  const code = [
    extractConstantSource('JP_FBA_FULFILLMENT_2026'),
    extractConstantSource('JP_FBA_STORAGE_2026'),
    extractConstantSource('JP_REFERRAL_RULES_2026'),
    extractFunctionSource('calculateJpReferralFee'),
    extractFunctionSource('getJpFbaMetrics'),
    extractFunctionSource('calculateJpFbaStorageFee'),
    extractFunctionSource('calculateQuickEstimate'),
    '({ calculateQuickEstimate })',
  ].join('\n');
  const { calculateQuickEstimate } = vm.runInNewContext(code);
  const result = calculateQuickEstimate({
    market: 'JP', category: 'consumer-electronics', price: 1000, purchaseRmb: 20, fx: 0.05,
    dimensionsCm: [25, 18, 2], weightKg: 0.25, freightRateRmb: 10,
    monthlyUnits: 200, storageDays: 15, adRate: 5, month: 10,
  });
  assert.equal(result.fba, 222);
  assert.equal(result.breakEvenPrice, 789);
});

test('quick US estimate reuses automated US FBA and simple storage assumptions', () => {
  const code = [
    extractConstantSource('DEFAULT_FEE_CONFIG'),
    extractFunctionSource('feeDeepClone'),
    'let FEE_CONFIG = feeDeepClone(DEFAULT_FEE_CONFIG);',
    extractFunctionSource('getPriceBand'),
    extractFunctionSource('readProductCategory'),
    extractFunctionSource('readProductPrice'),
    extractConstantSource('US_FBA_STORAGE_2026'),
    extractConstantSource('US_FBA_FULFILLMENT_2026'),
    extractConstantSource('JP_FBA_FULFILLMENT_2026'),
    extractConstantSource('JP_FBA_STORAGE_2026'),
    extractConstantSource('JP_REFERRAL_RULES_2026'),
    extractFunctionSource('calculateJpReferralFee'),
    extractFunctionSource('getJpFbaMetrics'),
    extractFunctionSource('calculateJpFbaStorageFee'),
    extractFunctionSource('getFbaTierAnalysis'),
    extractFunctionSource('getFbaSizeTier'),
    extractFunctionSource('estimateFbaFee'),
    extractFunctionSource('calculateFbaMetrics'),
    extractFunctionSource('calculateQuickEstimate'),
    '({ calculateQuickEstimate })',
  ].join('\n');
  const { calculateQuickEstimate } = vm.runInNewContext(code);
  const result = calculateQuickEstimate({
    market: 'US', price: 29.99, purchaseRmb: 50, fx: 7.2,
    dimensionsCm: [20, 10, 10], weightKg: 0.2, freightRateRmb: 8,
    monthlyUnits: 100, storageDays: 30, adRate: 10, month: 9,
  });
  assert.equal(result.unavailable, false);
  assert.ok(Number.isFinite(result.fba) && result.fba > 0);
  assert.ok(Number.isFinite(result.storage) && result.storage >= 0);
  assert.ok(Number.isFinite(result.profit));
});

test('Japan labels use the correct sales-total and manual inbound-cost wording', () => {
  assert.match(html, /id="adPriceLabel"/);
  assert.match(html, /买家支付总销售额（含税）/);
  assert.match(html, /其他每件FBA\/入仓费用/);
  assert.match(html, /id="profitReturnRate"[^>]*value="0"/);
});

test('market-specific money fields and US peak selection are isolated across switches', () => {
  for (const required of [
    'const MARKET_INPUT_STATE', 'let activeMarketCode', 'function saveMarketInputState', 'function restoreMarketInputState',
    "'adPrice'", "'adCpc'", "'profitPlacementFee'", "'profitReturnHandling'", 'peakShipping',
  ]) assert.match(html, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('Japan standard 40cm tier keeps the low-price fee through 1,000 JPY', () => {
  const code = [
    extractConstantSource('JP_FBA_FULFILLMENT_2026'),
    extractFunctionSource('getJpFbaMetrics'),
    '({ getJpFbaMetrics })',
  ].join('\n');
  const { getJpFbaMetrics } = vm.runInNewContext(code);
  assert.equal(getJpFbaMetrics([20, 10, 10], 0.2, 1000).fee, 371);
  assert.equal(getJpFbaMetrics([20, 10, 10], 0.2, 1000.01).fee, 420);
});

test('Japan profit uses category referral total and keeps US manual referral behavior', () => {
  const { calculateProfitMetrics } = loadProfitHelpers();
  const jp = calculateProfitMetrics({
    price: 3000, fx: 0.048, purchaseRmb: 48, taxDiscount: 0, freightRateRmb: 0, chargeableWeightKg: 0,
    referralRate: 15.4, referralFee: 508.2, fbaFee: 420, storageCost: 10, adCost: 0, promoRate: 0,
    returnRate: 0, returnHandling: 0, placementFee: 0, targetMargin: 20, cvr: 0.1,
  });
  assert.equal(jp.purchase, 1000);
  assert.equal(jp.referral, 508.2);
  assert.equal(jp.totalCost, 1938.2);
  assert.equal(jp.profit, 1061.8);

  const us = calculateProfitMetrics({ price: 100, fx: 5, purchaseRmb: 0, referralRate: 15, fbaFee: 0, storageCost: 0 });
  assert.equal(us.referral, 15);
});

test('profit calculator supports chargeable weight, cubic-foot storage, advertising cost, and FBA placement inputs', () => {
  const { calculateProfitMetrics } = loadProfitHelpers();
  const result = calculateProfitMetrics({
    price: 30, fx: 7.2, purchaseRmb: 50, taxDiscount: 10, freightRateRmb: 8, chargeableWeightKg: 1.2,
    packageVolumeM3: 0.0283168466, referralRate: 15, fbaFee: 5, storageRate: 0.78, inventoryMonths: 2,
    adCost: 2, promoRate: 0, returnRate: 0, returnHandling: 0, placementFee: 0, targetMargin: 20, cvr: 0.1,
  });
  assert.equal(result.purchase, 6.25);
  assert.equal(result.freight, 1.3333333333333333);
  assert.equal(result.storage, 1.56);
  assert.equal(result.ad, 2);
  assert.ok(Math.abs(result.totalCost - 20.643333333333334) < 1e-10);
  assert.ok(Math.abs(result.profit - 9.356666666666666) < 1e-10);
  assert.ok(Math.abs(result.maxCpc - 1.1356666666666666) < 1e-10);

  const withPlacement = calculateProfitMetrics({
    price: 30, fx: 7.2, purchaseRmb: 50, taxDiscount: 10, freightRateRmb: 8, chargeableWeightKg: 1.2,
    packageVolumeM3: 0.0283168466, referralRate: 15, fbaFee: 5, storageRate: 0.78, inventoryMonths: 2,
    adCost: 2, promoRate: 0, returnRate: 0, returnHandling: 0, placementFee: 1.25, targetMargin: 20, cvr: 0.1,
  });
  assert.equal(withPlacement.placement, 1.25);
  assert.equal(withPlacement.totalCost - result.totalCost, 1.25);
  assert.equal(result.profit - withPlacement.profit, 1.25);

  const weightedReturnHandling = calculateProfitMetrics({
    price: 30, fx: 7.2, purchaseRmb: 0, taxDiscount: 0, freightRateRmb: 0, chargeableWeightKg: 0,
    packageVolumeM3: 0, referralRate: 0, fbaFee: 0, storageCost: 0,
    adCost: 0, promoRate: 0, returnRate: 10, returnHandling: 5, placementFee: 0, targetMargin: 0, cvr: 0,
  });
  assert.equal(weightedReturnHandling.returns, 3.5);

  const forecastStorage = calculateProfitMetrics({
    price: 30, fx: 7.2, purchaseRmb: 50, taxDiscount: 10, freightRateRmb: 8, chargeableWeightKg: 1.2,
    packageVolumeM3: 0.0283168466, referralRate: 15, fbaFee: 5, storageRate: 99, inventoryMonths: 99, storageCost: 1.25,
    adCost: 2, promoRate: 0, returnRate: 0, returnHandling: 0, placementFee: 0, targetMargin: 20, cvr: 0.1,
  });
  assert.equal(forecastStorage.storage, 1.25);

  const manualStorage = calculateProfitMetrics({
    price: 30, fx: 7.2, purchaseRmb: 50, taxDiscount: 10, freightRateRmb: 8, chargeableWeightKg: 1.2,
    packageVolumeM3: 0.0283168466, referralRate: 15, fbaFee: 5, storageRate: 0.95, inventoryMonths: 1, storageCost: undefined,
    adCost: 2, promoRate: 0, returnRate: 0, returnHandling: 0, placementFee: 0, targetMargin: 20, cvr: 0.1,
  });
  assert.equal(manualStorage.storage, 0.95);
});

test('US FBA storage forecast uses daily-average inventory, seasonal rates, rolling utilization, and FIFO shortage protection', () => {
  const { getUsStorageBaseRate, getUsStorageUtilizationSurcharge, calculateUsFbaStorageForecast } = loadStorageHelpers();
  const plan = Array.from({ length: 12 }, (_, index) => ({ sales: index < 3 ? 100 : 0, restock: 0 }));
  const forecast = calculateUsFbaStorageForecast({
    startMonth: 8, openingUnits: 300, prior13WeekSales: 1300, unitVolumeFt3: 1, sizeClass: 'standard', plan,
  });

  assert.deepEqual(JSON.parse(JSON.stringify(forecast.rows.slice(0, 3).map(row => row.averageUnits))), [250, 150, 50]);
  assert.deepEqual(JSON.parse(JSON.stringify(forecast.rows.slice(0, 3).map(row => row.storageCost))), [195, 117, 120]);
  assert.equal(getUsStorageBaseRate(9, 'standard', false), 0.78);
  assert.equal(getUsStorageBaseRate(10, 'standard', false), 2.4);
  assert.equal(getUsStorageBaseRate(10, 'oversize', false), 1.4);
  assert.equal(getUsStorageUtilizationSurcharge(23, 'standard'), 0.44);
  assert.equal(getUsStorageUtilizationSurcharge(53, 'oversize'), 1.26);

  const surchargeForecast = calculateUsFbaStorageForecast({
    startMonth: 8, openingUnits: 2300, prior13WeekSales: 1300, unitVolumeFt3: 1, sizeClass: 'standard',
    plan: Array.from({ length: 12 }, () => ({ sales: 0, restock: 0 })),
  });
  assert.ok(Math.abs(surchargeForecast.rows[0].utilizationWeeks - 23) < 1e-10);
  assert.equal(surchargeForecast.rows[0].surchargeRate, 0.44);
  assert.equal(surchargeForecast.rows[0].storageCost, 2806);

  const shortageForecast = calculateUsFbaStorageForecast({
    startMonth: 8, openingUnits: 100, prior13WeekSales: 1300, unitVolumeFt3: 1, sizeClass: 'standard',
    plan: [{ sales: 150, restock: 20 }],
  });
  assert.equal(shortageForecast.rows[0].soldUnits, 120);
  assert.equal(shortageForecast.rows[0].shortageUnits, 30);
  assert.equal(shortageForecast.rows[0].endingUnits, 0);
});

test('Japan storage forecast supports the same 12-month sales and replenishment workflow', () => {
  const code = [
    extractConstantSource('JP_FBA_STORAGE_2026'),
    extractFunctionSource('storageMonthNumber'),
    extractFunctionSource('storageDaysInMonth'),
    extractFunctionSource('calculateJpFbaStorageFee'),
    extractFunctionSource('calculateJpFbaStorageForecast'),
    '({ calculateJpFbaStorageForecast })',
  ].join('\n');
  const { calculateJpFbaStorageForecast } = vm.runInNewContext(code);
  const forecast = calculateJpFbaStorageForecast({
    startMonth: 9,
    openingUnits: 3000,
    unitVolumeCm3: 1000,
    tier: '标准尺寸',
    isFashion: false,
    plan: Array.from({ length: 12 }, () => ({ sales: 1000, restock: 0 })),
  });

  assert.deepEqual(JSON.parse(JSON.stringify(forecast.rows.slice(0, 3).map(row => row.averageUnits))), [2500, 1500, 500]);
  assert.equal(forecast.rows[0].storageCost, 14190);
  assert.equal(forecast.rows[1].storageCost, 15130.5);
  assert.equal(forecast.rows[2].storageCost, 5043.5);
  assert.equal(forecast.rows[3].shortageUnits, 1000);
  assert.equal(forecast.totalSoldUnits, 3000);
  assert.equal(forecast.remainingUnits, 0);

  for (const required of [
    '日本站 FBA 月度仓储', '2026 日本站官方费率', 'function currentStorageForecast',
    "selectedCountry === 'US' || selectedCountry === 'JP'", "market === 'JP'",
  ]) assert.match(html, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('US storage uses a forecast-period weighted allocation, including zero-sales months', () => {
  const { calculateUsFbaStorageForecast, calculateStoragePeriodAllocation } = loadStorageHelpers();
  const { calculateProfitMetrics } = loadProfitHelpers();
  const forecast = calculateUsFbaStorageForecast({
    startMonth: 8, openingUnits: 200, prior13WeekSales: 1300, unitVolumeFt3: 1, sizeClass: 'standard',
    plan: [{ sales: 100, restock: 0 }, { sales: 0, restock: 0 }],
  });

  assert.equal(forecast.totalSoldUnits, 100);
  assert.ok(forecast.rows[1].storageCost > 0, 'zero-sales month still incurs storage cost');
  assert.equal(calculateStoragePeriodAllocation(forecast), forecast.totalStorageCost / forecast.totalSoldUnits);
  assert.equal(calculateStoragePeriodAllocation({ totalStorageCost: 50, totalSoldUnits: 0 }), null);

  const unavailableStorage = calculateProfitMetrics({
    price: 30, fx: 7.2, purchaseRmb: 50, taxDiscount: 0, freightRateRmb: 8, chargeableWeightKg: 1,
    packageVolumeM3: 0.02, referralRate: 15, fbaFee: 5, storageCost: null, storageCostUnavailable: true,
    adCost: 2, promoRate: 0, returnRate: 0, returnHandling: 0, placementFee: 0, targetMargin: 20, cvr: 0.1,
  });
  assert.equal(unavailableStorage.storage, null);
  assert.equal(unavailableStorage.totalCost, null);
  assert.equal(unavailableStorage.profit, null);
  assert.equal(unavailableStorage.margin, null);
});

test('new products defer utilization surcharges until 91 forecast days have completed', () => {
  const { calculateUsFbaStorageForecast } = loadStorageHelpers();
  const forecast = calculateUsFbaStorageForecast({
    startMonth: 1, openingUnits: 1000, prior13WeekSales: 0, unitVolumeFt3: 1, sizeClass: 'standard',
    plan: Array.from({ length: 12 }, () => ({ sales: 100, restock: 100 })),
  });

  assert.equal(forecast.hasHistory, false);
  assert.equal(forecast.rows[0].newProductObservation, true);
  assert.equal(forecast.rows[0].utilizationAvailable, false);
  assert.equal(forecast.rows[0].surchargeRate, 0);
  assert.equal(forecast.rows[3].utilizationAvailable, false);
  assert.equal(forecast.rows[4].utilizationAvailable, true);
  assert.ok(forecast.rows[4].surchargeRate > 0);
  assert.notEqual(forecast.rows[4].utilizationWeeks, Infinity);
});

test('replenishment recommendations avoid shortage and retain next-month safety stock', () => {
  const { calculateUsFbaReplenishmentPlan } = loadStorageHelpers();
  const recommendation = calculateUsFbaReplenishmentPlan({
    openingUnits: 30,
    plan: [{ sales: 40 }, { sales: 100 }, { sales: 80 }],
    leadTimeMonths: 1,
    safetyStockRatio: 0.5,
  });

  assert.equal(recommendation.rows[0].recommendedArrivalUnits, 60);
  assert.equal(recommendation.rows[0].endingUnits, 50);
  assert.equal(recommendation.rows[0].orderMonthIndex, -1);
  assert.equal(recommendation.rows[0].needsImmediateArrangement, true);
  assert.equal(recommendation.rows[1].openingUnits, 50);
  assert.equal(recommendation.rows[1].endingUnits, 40);
  assert.equal(recommendation.rows[1].orderMonthIndex, 0);
  assert.ok(recommendation.rows.every(row => row.shortageUnits === 0));
});

test('storage UI uses period allocation and exposes non-destructive replenishment controls', () => {
  for (const required of [
    '有销量月份平均仓储/件', 'id="storageForecastSoldValue"', 'id="storageLeadTimeMonths"',
    'id="storageSafetyStockRatio"', '计划期总仓储',
    '新品观察期内只按基础仓储费率估算', '补货建议不会改写计划补货', '完整 13 周观察期', '包含仓储的利润结果会显示为不可用',
  ]) assert.match(html, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

  assert.doesNotMatch(html, /id="storageProfitMonth"|function storageForecastProfitRow|function updateStorageGuide|利润取用月份|所选预测月/);
});

test('replenishment advice is merged into the monthly plan table with per-row adoption', () => {
  assert.doesNotMatch(html, /id="storageReplenishmentRows"/);
  assert.doesNotMatch(html, /class="storage-replenishment"/);
  for (const required of [
    'class="storage-table-scroll"', 'storage-adopt-button',
    'function adoptStorageAdvice', 'function recommendRowsFromForecast',
  ]) assert.match(html, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  for (const templateId of ['storageAdvice', 'storageOrder', 'storageSafety']) {
    assert.match(html, new RegExp(`id="${templateId}\\$\\{index\\}"`));
  }
  assert.match(html, /setCell\(`storageAdvice\$\{row\.index\}`, adviceHtml\)/);

  const head = html.slice(html.indexOf('<thead><tr><th>月份</th>'), html.indexOf('</thead>', html.indexOf('<thead><tr><th>月份</th>')));
  assert.match(head, /月份/);
  const positionOf = label => head.indexOf(label);
  for (const label of ['计划销量', '补货', '建议到仓', '建议下单', '日均库存', '利用率', '仓储费', '月末安全库存', '状态']) {
    assert.ok(positionOf(label) > 0, `${label} should be a plan table column`);
  }
  assert.ok(positionOf('建议到仓') < positionOf('日均库存'), 'advice columns should sit before the inventory columns');
  assert.ok(positionOf('月末安全库存') < positionOf('状态'), 'safety stock should sit before the status column');
});

test('profit and ad calculators are embedded in the profit home with a single calculated cost flow', () => {
  for (const required of [
    'id="module-profit"', 'id="profitDetail"', 'id="module-freight"', 'id="module-adcalc"', 'embedded-calculator', 'converter-workspace', 'id="adClicks"', 'id="adMonthlyUnits"', 'id="adPosInput"',
    'id="profitStorageRate"', '售价与广告成本统一取自广告费换算模块', 'id="profitTargetMargin"',
    '广告订单占比', 'id="adAcoasValue"', '运费与仓储计算',
  ]) assert.match(html, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  for (const removed of ['profitLinkAds', 'profitLinkFba', 'profitLinkCargo', 'profitManualAdRate', 'profitManualWeight', 'profitManualFba', '收入与采购', '广告与利润结果']) {
    assert.doesNotMatch(html, new RegExp(removed));
  }
  assert.doesNotMatch(html, /switchTab\('adcalc'\)|switchTab\('module-profit'\)/);
});

test('currency converter covers requested market currencies and renders a stable historical trend curve', () => {
  for (const required of [
    'CAD 加拿大', 'VND 越南', 'THB 泰国', 'BRL 巴西', 'MXN 墨西哥', 'IDR 印尼', 'MYR 马来西亚', 'PHP 菲律宾',
    'AED 阿联酋', 'SAR 沙特', 'ZAR 南非', 'id="currencyTrendChart"', 'function updateCurrencyTrend', 'function drawCurrencyTrend',
    'api.frankfurter.dev/v1/', 'FRANKFURTER_HISTORICAL_CURRENCIES', "!FRANKFURTER_HISTORICAL_CURRENCIES.has(source)", 'currencyTrendRange', '1个月', '1年', '5年', '1 ${source} = ${latest.value.toFixed(2)} ${target}', 'id="cargo-check"', 'scrollConverterSection', 'aspect-ratio: 4 / 1', 'canvas.clientHeight || width / 4',
  ]) assert.match(html, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(html, /window\.updateCurrencyDisplay\s*=\s*\(\)\s*=>\s*\{[\s\S]*?currencyManualSource[\s\S]*?currencyManualRate/);
  assert.match(html, /<option value="USD">USD 美国<\/option>/);
});

test('advertising and profit inputs use stacked labels and POS is calculated below the inputs', () => {
  assert.match(html, /\.calculator-fields label \{ display: flex; flex-direction: column;/);
  assert.doesNotMatch(html, /<p class="formula-note"><span class="term-tip"[^>]*>POS<\/span>/);
  assert.match(html, /data-tip="PPC 输入用于估算点击广告成本/);
  assert.match(html, /<h2 class="calculator-module-title"><span>运费与仓储计算<\/span>[\s\S]*?id="marketCountry"[\s\S]*?id="profitFx"/);
  assert.match(html, /id="adPosInput"/);
  assert.doesNotMatch(html, /id="adPos"[^A-Za-z]/);
  assert.doesNotMatch(html, /id="adTacosValue"|TACoS/);
});

test('POS is editable and back-solves ad orders without touching monthly units', () => {
  assert.match(html, /<input id="adPosInput" type="number" min="0" max="100" step="0\.01"[^>]*oninput="markPosEditing\(true\); updateAdCalculator\(\)"/);
  assert.match(html, /function syncPosInput/);
  assert.match(html, /function markPosEditing/);
  assert.match(html, /const editing = posManualEditing \|\| document\.activeElement === posEl;/);
  assert.match(html, /ordersEl\.value = String\(Math\.round\(clamped \/ 100 \* monthlyUnits\)\);/);
  assert.match(html, /if \(monthlyUnits <= 0\) \{\s*\n\s*posEl\.value = '';\s*\n\s*posEl\.disabled = true;/);
  assert.match(html, /const clamped = Math\.min\(100, Math\.max\(0, entered\)\);/);
});

test('ad price is the first advertising input and tax discount defaults to zero', () => {
  const adStart = html.indexOf('id="module-adcalc"');
  const adEnd = html.indexOf('<!-- /module-adcalc -->', adStart);
  const adMarkup = html.slice(adStart, adEnd);
  assert.ok(adMarkup.indexOf('id="adPrice"') < adMarkup.indexOf('id="adCpc"'));
  assert.match(html, /id="profitTaxDiscount"[^>]*value="0"/);
});

test('PPC explanations use the complete field label as the hover and keyboard target', () => {
  const adStart = html.indexOf('id="module-adcalc"');
  const adEnd = html.indexOf('<!-- /module-adcalc -->', adStart);
  const adMarkup = html.slice(adStart, adEnd);
  const tooltipLabels = adMarkup.match(/class="field-label term-tip" tabindex="0" data-tip="[^"]+"/g) ?? [];

  assert.equal(tooltipLabels.length, 6);
  assert.match(html, /\.calculator-fields \.field-label\.term-tip\s*\{\s*display:\s*flex;\s*position:\s*relative;/);
  assert.doesNotMatch(adMarkup, /class="field-label"><span class="term-tip"/);
});

test('advertising inputs and outputs share one calculation panel', () => {
  const adStart = html.indexOf('id="module-adcalc"');
  const adEnd = html.indexOf('<!-- /module-adcalc -->', adStart);
  const adMarkup = html.slice(adStart, adEnd);

  assert.equal((adMarkup.match(/<section class="calculator-panel">/g) ?? []).length, 1);
  assert.ok(adMarkup.indexOf('id="adCpc"') < adMarkup.indexOf('id="adCpaValue"'));
  assert.match(html, /\.ad-calculator-grid \.metric-grid\s*\{\s*margin-top:\s*8px;/);
  assert.doesNotMatch(adMarkup, /PPC 广告费换算/);
});

test('profit results separate direct operating outcomes from target and break-even controls', () => {
  const profitStart = html.indexOf('id="profitDetail"');
  const profitEnd = html.indexOf('<!-- 格式转换 -->', profitStart);
  const profitMarkup = html.slice(profitStart, profitEnd);

  assert.match(profitMarkup, /class="profit-layout"/);
  assert.match(profitMarkup, /class="profit-column profit-results"[\s\S]*?经营结果[\s\S]*?id="profitPurchaseRmb"[\s\S]*?id="profitMarginValue"/);
  assert.match(profitMarkup, /class="profit-column profit-targets"[\s\S]*?目标与保本[\s\S]*?id="profitTargetMargin"[\s\S]*?id="profitBreakEvenAcosValue"[\s\S]*?id="profitMaxPurchaseValue"/);
  assert.doesNotMatch(profitMarkup, /<div class="section-title"[\s\S]*?利润结果/);
  assert.match(html, /\.profit-layout\s*\{\s*display:\s*grid;[\s\S]*?grid-template-columns:\s*minmax\(0,\s*2fr\)\s+minmax\(240px,\s*1fr\)/);
});

test('comparison is rendered inline in the results rows and picked from the project toolbar', () => {
  const profitStart = html.indexOf('id="profitDetail"');
  const profitEnd = html.indexOf('<!-- 格式转换 -->', profitStart);
  const profitMarkup = html.slice(profitStart, profitEnd);

  // 不再有独立的对比模块
  assert.doesNotMatch(profitMarkup, /class="profit-column profit-compare"/);
  assert.doesNotMatch(html, /id="profitCompareList"|id="profitCompareBody"|function toggleComparePanel/);

  // 多选对比放在「选择已保存产品」同一行的工具栏
  const toolbar = profitMarkup.slice(profitMarkup.indexOf('class="project-toolbar"'), profitMarkup.indexOf('</h2>', profitMarkup.indexOf('class="project-toolbar"')));
  assert.match(toolbar, /id="projectSelect"[\s\S]*?id="compareDropdown"/);
  assert.match(toolbar, /id="compareProjectChecks"/);
  assert.match(toolbar, /id="compareCountBadge"/);
  assert.match(toolbar, /id="compareToCny"/);

  for (const required of [
    'COMPARE_KEY', 'COMPARE_MAX_SERIES = 3', 'function compareSeries',
    'function updateCompareDropdown', 'function renderProfitBars', 'function toggleCompareProject',
    'function clearCompare', 'function exportCompareCsv', 'function buildProfitSnapshot',
    'function rememberProfitResult', 'function recomputeProjectSnapshot', 'function projectSnapshot',
    'COMPARE_RECOMPUTE_CACHE', 'data.result = buildProfitSnapshot', 'initCompare();',
    'profit-bar-stack', 'profit-bar-stack-row', 'cmp-series-1',
  ]) assert.match(html, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

  // 经营结果每行由 renderProfitBars 统一渲染，两条计算路径都要调用
  assert.equal((html.match(/renderProfitBars\(/g) || []).length >= 3, true, 'renderProfitBars should be defined and called from both profit paths');
  assert.match(html, /renderProfitBars\(profitPrice\);/);
  assert.match(html, /renderProfitBars\(weightedPrice\);/);
});

test('fee rate settings are reachable from the storage heading', () => {
  assert.match(html, /id="feeConfigToggleButton"[^>]*onclick="toggleFeeConfigPanel\(event\)"/);
  assert.match(html, /id="feeConfigFallbackButton"[^>]*onclick="toggleFeeConfigPanel\(event\)"/);
  assert.match(html, /function toggleFeeConfigPanel/);
  assert.match(html, /function updateFeeConfigToggle/);
  assert.match(html, /fee-config-summary/);
  // 费率设置面板自身不再保留默认可见的折叠标题
  assert.match(html, /<summary class="storage-forecast-toggle fee-config-summary" hidden>/);
  // 加拿大站仍有入口
  assert.match(html, /const useFallback = panelSupported && !storageVisible;/);
});

test('optional advertising inputs are visually de-emphasised and can be auto-derived', () => {
  for (const id of ['adClicks', 'adOrders', 'adMonthlyUnits']) {
    assert.match(html, new RegExp(`id="${id}" class="is-optional"`));
  }
  assert.match(html, /class="field-optional-tag">选填</);
  assert.match(html, /input\.is-optional/);
  assert.match(html, /function autoFillOrdersFromClicks/);
  assert.match(html, /function markOrdersEdited/);
  assert.match(html, /oninput="markOrdersEdited\(\); updateAdCalculator\(\)"/);
  assert.match(html, /if \(!editingPos\) autoFillOrdersFromClicks\(clicks, inputNumber\('adCvr'\)\);/);
});

test('draft autosave is off by default and products are stored locally only', () => {
  for (const required of [
    'DRAFT_KEY', 'LT_DRAFT_V1', 'DRAFT_SCOPE', 'DRAFT_DELAY_MS',
    'function draftInScope', 'function draftStoragePlan', 'function collectDraft',
    'function saveDraft', 'function scheduleDraftSave', 'function flushDraftSave',
    'function clearDraft', 'function applyDraft', 'function initDraft', 'function installDraftAutosave',
    'id="draftStatus"', 'id="draftClearButton"', 'initDraft();', 'installDraftAutosave();',
  ]) assert.match(html, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

  // 实时草稿默认关闭，改回 true 即可恢复（函数都保留着）
  assert.match(html, /const DRAFT_AUTOSAVE = false;/);
  assert.match(extractFunctionSource('installDraftAutosave'), /if \(!DRAFT_AUTOSAVE\) return;/);

  // 关闭分支：不写初始快照、不自动恢复
  const initSrc = extractFunctionSource('initDraft');
  const guardAt = initSrc.indexOf('if (!DRAFT_AUTOSAVE)');
  assert.ok(guardAt > -1, 'initDraft should branch on the autosave switch');
  const offBranch = initSrc.slice(guardAt, initSrc.indexOf('return;', guardAt));
  assert.ok(initSrc.indexOf('updateDraftClearButton()') < guardAt, 'clear button refresh must run before the guard');
  assert.ok(!offBranch.includes('saveDraft()'), 'disabled path must not write a snapshot');
  assert.ok(!offBranch.includes('applyDraft('), 'disabled path must not restore a draft');

  // 清除按钮只看浏览器里有没有旧草稿，不再依赖「用户是否编辑过」
  assert.match(html, /button\.hidden = !draftExists\(\);/);

  // 保存链路只写 localStorage，没有任何上传
  assert.match(extractFunctionSource('saveProjectsToStorage'), /localStorage\.setItem\(PROJECTS_KEY/);
  for (const fn of ['saveProject', 'saveProjectsToStorage', 'exportProjects']) {
    const src = extractFunctionSource(fn);
    assert.ok(!/fetch\(|XMLHttpRequest|sendBeacon/.test(src), `${fn} must not talk to a server`);
  }

  // 草稿数据结构仍然覆盖 12 个月计划表，而不只是 PROJECT_FIELD_TYPES 里的字段
  assert.match(html, /const DRAFT_SCOPE = \['#module-freight', '#module-adcalc', '#profitDetail'\];/);
  assert.match(html, /plan\[`sales\$\{index\}`\] = document\.getElementById\(`storageSales\$\{index\}`\)\?\.value \?\? '';/);
});

test('project fields are applied after switching market so market-scoped money fields survive', () => {
  const applySrc = extractFunctionSource('applyProjectFields');
  const marketSwitchAt = applySrc.indexOf("'marketCountry' in data");
  const fieldLoopAt = applySrc.indexOf('for (const id of Object.keys(PROJECT_FIELD_TYPES))');
  assert.ok(marketSwitchAt > -1, 'applyProjectFields should switch the market first');
  assert.ok(marketSwitchAt < fieldLoopAt, 'market switch must run before writing the other fields');
  assert.match(applySrc, /for \(const id of MARKET_MONEY_FIELDS\)/);
});

test('projects can be exported and imported as JSON including variant config', () => {
  for (const required of [
    'id="projectImportInput"', 'onclick="exportProjects()"', 'onchange="importProjects(this)"',
    'function exportProjects', 'function importProjects', 'function sanitizeImportedProject',
    "_variantsEnabled", "_variantsSameSpec", '_variants',
  ]) assert.match(html, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(html, /project\.fields\._variantsEnabled = Boolean\(raw\.fields\._variantsEnabled\);/);
});

test('calculator workspace is compact, tooltip explanations are rendered, and market defaults to US with CA switching', () => {
  for (const required of [
    'grid-template-columns: repeat(3, minmax(0, 1fr))', 'grid-template-columns: repeat(6, minmax(0, 1fr))',
    '.term-tip::after', 'cursor: pointer', 'data-tip="广告转化率：广告订单量 ÷ 广告点击量；请按实际投放数据填写。"', 'id="marketCountry"', 'value="CA"', 'selected>美国 / US',
    'function updateMarketCountry', 'CA: { name: \'加拿大站\'', 'currencyManualToggle', 'currencyManualRate',
  ]) assert.match(html, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.doesNotMatch(html, /title="(?:每次点击成本|汇率|输入包装长宽高|可直接修改英寸尺寸)：/);
  assert.doesNotMatch(html, /id="adCvrValue"|id="adManualPos"|id="adManualCvr"|id="adPaidOrderShare"|function toggleAdManual/);
});

test('FBA inputs expose editable centimetre-inch and kilogram-pound pairs', () => {
  for (const required of [
    'id="cargoDimensionInInput"', 'id="cargoWeightLbInput"',
    'oninput="syncCargoDimensionPair(\'cm\')"', 'oninput="syncCargoDimensionPair(\'in\')"',
    'oninput="syncCargoWeightPair(\'kg\')"', 'oninput="syncCargoWeightPair(\'lb\')"',
    'function syncCargoDimensionPair(sourceUnit)', 'function syncCargoWeightPair(sourceUnit)',
  ]) assert.match(html, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.doesNotMatch(html, /setLabel\('profitFbaLabel'/);
});

test('module headings: freight owns the market selector and advertising is a section inside profit', () => {
  assert.match(html, /<h2 class="calculator-module-title"><span>运费与仓储计算<\/span><span class="heading-controls">[\s\S]*?id="marketCountry"[\s\S]*?id="profitFx"[\s\S]*?id="profitRateUpdate"/);
  // 广告费换算已并入利润测算，降级为模块内小节标题（不再是与运费/利润并列的 h2）
  assert.match(html, /<div class="profit-section-title"><span class="term-tip"[^>]*>广告费换算<\/span><\/div>/);
  assert.match(html, /<h2 class="calculator-module-title"><span class="term-tip"[^>]*>利润测算<\/span>[\s\S]*?<\/h2>/);
  assert.match(html, /\.calculator-module-title\s*\{[\s\S]*?font:\s*700\s+1rem/s);
  assert.equal((html.match(/id="marketCountry"/g) ?? []).length, 1);
  assert.equal((html.match(/id="profitFx"/g) ?? []).length, 1);
  assert.doesNotMatch(html, /单 SKU 利润测算/);
  assert.match(html, /<div class="section-title fba-basis-heading">尺寸分级依据（实际 \/ 上限）<\/div>/);
  assert.match(html, /\.fba-rule-list\s*\{[\s\S]*?grid-template-columns:\s*repeat\(4,/);
  assert.match(html, /\.fba-rule-value\s*\{\s*display:\s*flex;\s*flex-direction:\s*column;/);
  assert.match(html, /\.fba-rule-value \.metric-value\s*\{\s*color:\s*#aaa/);
  assert.doesNotMatch(html, /重货\/抛货判断|头程、仓储与 FBA|Amazon FBA · 2026 美国站估算/);
  assert.match(html, /\.freight-grid \.cargo-check\s*\{[^}]*border:\s*0/s);
});

test('profit module consolidates ad inputs and cost rates, with variants on the right column', () => {
  const profitStart = html.indexOf('id="profitDetail"');
  const profitEnd = html.indexOf('<!-- 格式转换 -->', profitStart);
  const profitMarkup = html.slice(profitStart, profitEnd);
  const layoutAt = profitMarkup.indexOf('class="profit-layout"');
  const targetsAt = profitMarkup.indexOf('class="profit-column profit-targets"');
  const variantAt = profitMarkup.indexOf('id="variantPanel"');

  assert.ok(layoutAt > -1 && targetsAt > -1 && variantAt > -1);
  assert.ok(profitMarkup.includes('id="module-adcalc"'), 'ad calculator merged into the profit module');
  assert.ok(profitMarkup.indexOf('id="module-adcalc"') < layoutAt, 'ad block sits above the result layout');
  assert.ok(profitMarkup.indexOf('id="profitFreightRate"') < layoutAt, 'freight rate input moved into the profit module');
  assert.ok(profitMarkup.indexOf('id="profitReturnRate"') < layoutAt, 'return rate input moved into the profit module');
  assert.ok(variantAt > targetsAt, 'variant panel belongs to the right column, after the target section');
  assert.ok(!html.slice(0, profitStart).includes('id="variantPanel"'), 'variant panel left the freight module');

  // 结果行保持基础边框，紧凑但不裸奔
  assert.match(html, /\.profit-result-bars \.metric \{[^}]*border: 1px solid var\(--border-color\);/s);
});

test('result rows lead with profit, margin and total cost, and low margins are flagged red', () => {
  const profitMarkup = html.slice(html.indexOf('id="profitDetail"'), html.indexOf('<!-- 格式转换 -->'));
  const at = id => profitMarkup.indexOf(`id="${id}"`);

  assert.ok(at('profitValue') < at('profitMarginValue'), 'profit per unit is the first row');
  assert.ok(at('profitMarginValue') < at('profitTotalCostValue'), 'margin comes before total cost');
  assert.ok(at('profitTotalCostValue') < at('profitPurchaseValue'), 'total cost leads the cost breakdown');

  assert.match(html, /const PROFIT_MARGIN_WARNING = 0\.1;/);
  assert.match(html, /classList\.toggle\('is-low', Number\.isFinite\(margin\) && margin < PROFIT_MARGIN_WARNING\)/);
  assert.match(html, /\.metric strong\.is-low \{ color: var\(--danger\); \}/);
  assert.equal((html.match(/setProfitMarginMetric\('profitMarginValue'/g) ?? []).length, 2);
});

test('profit sections share one spacing rhythm, keep basic row borders and drop the extra frames', () => {
  assert.match(html, /\.profit-grid \{ grid-template-columns: 1fr; border: 0; padding: 0; \}/);
  assert.match(html, /\.profit-grid \.calculator-panel \{ border: 0; background: transparent; padding: 0; \}/);
  assert.match(html, /\.profit-embedded-block \{ margin: 0 0 12px; \}/);
  assert.match(html, /\.profit-grid > \.calculator-panel > \.calculator-fields \{ margin: 0 0 12px; \}/);
  assert.match(html, /\.profit-results \.profit-breakdown\.profit-result-bars \{[^}]*gap: 4px;/);
  assert.match(html, /\.profit-result-bars \.profit-bar-ratio \{[^}]*1\.25rem[^}]*text-align: left;/);
  // 结果行保留基础边框
  assert.match(html, /\.profit-result-bars \.metric \{[^}]*border: 1px solid var\(--border-color\);/s);
  assert.match(html, /\.profit-result-bars \.metric \{[^}]*background: var\(--surface-raised\);/s);
});

test('freight and storage detail rows match the profit row form', () => {
  assert.match(html, /\.cargo-summary \{[^}]*gap: 4px 8px;/s);
  assert.match(html, /\.cargo-summary div \{[^}]*border: 1px solid var\(--border-color\);/s);
  assert.match(html, /\.fba-rule-list \{[^}]*gap: 4px;/s);
  assert.match(html, /\.fba-rule-row \{[^}]*border: 1px solid var\(--border-color\);/s);
  assert.match(html, /\.fba-basis \{[^}]*border: 1px solid var\(--border-color\);/s);
});

test('profit results show market currency plus CNY, and the bar rows never repeat the price', () => {
  for (const required of [
    'id="profitPurchaseValue"', 'id="profitPurchaseCnyValue"', 'id="profitPurchaseTotalValue"',
    'id="profitFreightCnyValue"', 'id="profitFbaCnyValue"', 'id="profitStorageCnyValue"', 'id="profitAdCnyValue"',
    'id="profitTotalCostCnyValue"', 'id="profitCnyValue"', 'id="profitMaxCpcCnyValue"', 'id="profitMaxPurchaseCnyValue"',
    'id="profitFreightTotalValue"', 'id="profitFbaTotalValue"', 'id="profitStorageTotalValue"', 'id="profitAdTotalValue"', 'id="profitTotalCostTotalValue"', 'id="profitTotalValue"',
    'class="metric-money"', 'class="metric-total"', 'function rmbMoney', 'function setProfitMoneyMetric', 'function setProfitTotalMetric',
    'class="profit-breakdown profit-result-bars"', 'function initProfitResultBars', 'function setProfitBarRatio', 'function setProfitBarMetric',
    'const PROFIT_BAR_METRICS', "'profitPurchaseRatio'", "'profitProfitRatio'", "'profitMarginRatio'",
  ]) assert.match(html, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

  // 右侧金额保留 站点币种 + 人民币 双显示
  const moneySrc = extractFunctionSource('setProfitMoneyMetric');
  assert.match(moneySrc, /valueEl\.textContent = money\(value\)/);
  assert.match(moneySrc, /rmbEl\.textContent = rmbMoney\(value, fx\)/);

  // 重复的是数据条上的美元文案：条上只留涨跌幅，完整数值放悬停提示
  const barsSrc = extractFunctionSource('renderProfitBars');
  assert.match(barsSrc, /<b>\$\{delta\}<\/b>/);
  assert.doesNotMatch(barsSrc, /<b>\$\{projectEscapeHtml\(text\)\}/);
  assert.match(barsSrc, /title="\$\{projectEscapeHtml\(label\)\}：\$\{projectEscapeHtml\(text\)\}"/);
  const dupCount = (barsSrc.match(/formatCompareValue\(value, item, kind\)/g) ?? []).length;
  assert.equal(dupCount, 1, 'the formatted price is only used for the hover tooltip');

  assert.doesNotMatch(html, /id="profitChargeableWeightValue"/);
  assert.doesNotMatch(html, /id="profitPackageVolumeValue"/);
  assert.match(html, /profit-bar-stack/);
  assert.match(html, /profit-bar-ratio/);
  assert.match(html, /function renderProfitBars/);
  assert.match(html, /\(ratio \* 100\)\.toFixed\(1\)/);
  assert.match(html, /\.metric-total\s*\{[^}]*font:\s*700\s+0\.84rem\/1\.35/s);
  assert.match(html, /totalEl\.textContent = `\$\{label\}（\$\{fmtNumber\(quantity\)\}件） \$\{rmbMoney\(total, fx\)\}`/);
  assert.match(html, /const usdTotal = total \* fx \/ cnyPerUsd/);
  const totalMetric = extractFunctionSource('setProfitTotalMetric');
  assert.doesNotMatch(totalMetric, /money\(total\)/);
});

test('automatic result values guide users to their dependent inputs and explain FBA placement fees', () => {
  for (const required of [
    'function guideCalculationInputs', 'data-inputs="cargoDimensionInput,cargoWeightInput,profitFreightRate,profitFx,adMonthlyUnits"',
    'data-inputs="adCpc,adCvr,adOrders,adMonthlyUnits,adPrice"', 'missingFields', 'guidedFields', 'input-guided', 'FBA 入库配置费',
    'Inventory Placement Service Fee', '该项会单独计入总成本',
  ]) assert.match(html, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

  assert.match(html, /scrollIntoView\(\{ behavior: 'smooth', block: 'center' \}\)/);
  assert.match(html, /targetField\.focus\(\{ preventScroll: true \}\)/);
});

test('legacy author and contact footer is removed', () => {
  assert.doesNotMatch(html, /SYSTEM CORE DESIGNED BY CHE RUI|小红书：bibliobibule|VX：bibliobibule|footer-contacts/);
});

test('theme switch defaults to light, persists the choice, and redraws chart colors', () => {
  for (const required of [
    "localStorage.getItem('lt_tool_theme') || 'light'", 'data-theme="dark"', '--canvas: #f7f1e6',
    '--accent: #0f766e', '--text-primary: #1f2421', 'id="themeToggle"', '切换深色',
    "const THEME_STORAGE_KEY = 'lt_tool_theme'", 'function applyTheme', 'function toggleTheme',
    'currencyTrendSnapshot', "themeColor('--chart-grid')", "themeColor('--accent')",
  ]) assert.match(html, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

  assert.match(html, /button\.setAttribute\('aria-pressed', String\(dark\)\)/);
  assert.match(html, /localStorage\.setItem\(THEME_STORAGE_KEY, currentTheme\(\)\)/);
});

test('profit exchange-rate update fetches the selected market rate and recalculates profit', () => {
  assert.match(html, /async function updateProfitExchangeRate\(\)/);
  assert.match(html, /fetch\('https:\/\/open\.er-api\.com\/v6\/latest\/CNY'\)/);
  assert.match(html, /fx\.value = \(1 \/ marketRate\)\.toFixed\(marketFxDecimals\(requestedCurrency\)\)/);
  assert.match(html, /updateProfitCalculator\(\);/);
  assert.match(html, /updateMarketCountry\(\)[\s\S]*?updateProfitExchangeRate\(\);/);
});

test('site navigation keeps profit and unit conversion as separate sidebar pages', () => {
  assert.match(html, /body\s*\{[\s\S]*?grid-template-columns:\s*72px\s+minmax\(0,\s*1fr\)/);
  assert.match(html, /\.nav-deck\s*\{[\s\S]*?position:\s*sticky/);
  const navStart = html.indexOf('<div class="nav-deck">');
  const pdfStart = html.indexOf('<div id="module-pdf"');
  const navMarkup = html.slice(navStart, pdfStart);
  for (const label of ['利润测算', '单位换算', '功能说明', 'themeToggle']) assert.match(navMarkup, new RegExp(label));
  assert.doesNotMatch(navMarkup, /converter-subnav|converter-jump/);
  assert.match(html, /<div id="module-converter" class="container converter-home">[\s\S]*?<h1>单位换算<\/h1>/);
  assert.match(html, /<div id="module-profit" class="container converter-home active">[\s\S]*?<h1>利润测算<\/h1>/);
});

test('guide tab and marketplace switching expose automatic UK/EU fees without invented fallbacks', () => {
  for (const required of [
    "switchTab('guide')", 'id="module-guide"', '使用流程', '结果定位与提示',
    'value="MX"', 'value="EU"', 'value="UK"', "currency: 'MXN'", "currency: 'EUR'", "currency: 'GBP'", 'autoFees: true',
    'const EU_FBA_FULFILLMENT_2026', 'calculateEuFbaStorageFee', 'calculateEuReferralFee',
    '待手动配置', '该站点暂不估算', "marketFxDecimals(requestedCurrency)", "manualRate.value = (liveRates[target] / liveRates[source]).toFixed(2)",
  ]) assert.match(html, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

  assert.match(html, /country === 'MX' \|\| baseFee === null/);
  assert.match(html, /const index = \['profit','converter','pdf','image','removebg','currency','guide'\]\.indexOf\(name\)/);
});

test('guide explains complex calculations, special interactions, and data-source boundaries', () => {
  const guideStart = html.indexOf('id="module-guide"');
  const guideEnd = html.indexOf('<footer>', guideStart);
  const guideMarkup = html.slice(guideStart, guideEnd);
  for (const required of [
    '仓储费每月详细计算（美国）', 'FIFO', '月度仓储计费库存', '库存利用率周数', '22 周', '25 ft³',
    '仓储/件', '英国、欧洲与其他站点仓储', '€/m³', '计费重', '体积系数', '尺寸分级',
    'CPA', 'ACoAS', '混合广告费/件', '退货成本', '保本 ACOS', '最大 CPC',
    '更新汇率', 'ExchangeRate-API', 'Frankfurter', '结果定位与提示', '缺少的字段会优先高亮',
    'PDF 聚合', '背景移除', '主题选择', 'InventoryHero', 'Seller Central', '260630-FBA-Rate-Card-EN1.pdf',
  ]) assert.match(guideMarkup, new RegExp(required.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')));
  assert.match(guideMarkup, /href="https:\/\/www\.inventoryhero\.ai\/blog\/fba-storage-fees-2026#how-to-keep-storage-costs-down"/);
  assert.match(guideMarkup, /target="_blank" rel="noopener noreferrer"/);
  assert.match(html, /\.guide-section code\s*\{[^}]*font:/);
});

test('US storage detail calculator is collapsed by default and opens for guided results', () => {
  assert.match(html, /<details id="storageForecastPanel" class="storage-forecast-panel" aria-labelledby="storageForecastTitle">/);
  assert.match(html, /<summary class="storage-forecast-toggle">[\s\S]*仓储费每月详细计算（美国）/);
  assert.match(html, /id="storageExpandButton"[^>]*aria-expanded="false"[^>]*aria-controls="storageForecastPanel"/);
  assert.match(html, /onclick="toggleStorageForecast\(event\)"/);
  assert.doesNotMatch(html, /<details id="storageForecastPanel"[^>]*\bopen\b/);
  assert.match(html, /storagePanel\.open = true/);
  assert.match(html, /storagePanel\?\.tagName === 'DETAILS'/);
});

test('storage detail button stays immediately beside its title', () => {
  const summary = html.match(/<details id="storageForecastPanel"[\s\S]*?<summary class="storage-forecast-toggle">([\s\S]*?)<\/summary>/)?.[1] ?? '';
  const title = summary.indexOf('id="storageForecastTitle"');
  const button = summary.indexOf('id="storageExpandButton"');
  const source = summary.indexOf('storage-forecast-source');

  assert.ok(title >= 0 && button > title && source > button);
  assert.match(summary, /class="storage-forecast-heading"/);
  assert.match(html, /\.storage-forecast-heading\s*\{\s*display:\s*inline-flex;[\s\S]*?align-items:\s*center/s);
});

test('storage forecast exposes an explicit expand control and stronger readable data typography', () => {
  assert.match(html, /function updateStorageExpandButton\(\)/);
  assert.match(html, /function toggleStorageForecast\(event\)/);
  assert.match(html, /panel\.open = !panel\.open/);
  assert.match(html, /button\.textContent = expanded \? '收起明细' : '展开明细'/);
  assert.match(html, /storage-forecast-table\s*\{[^}]*font-size:\s*0\.84rem[^}]*font-weight:\s*600/s);
  assert.match(html, /storage-forecast-table \.storage-cost\s*\{[^}]*font-size:\s*0\.86rem[^}]*font-weight:\s*700/s);
  assert.match(html, /storage-forecast-table \.storage-status\s*\{[^}]*font-size:\s*0\.86rem[^}]*font-weight:\s*700/s);
  assert.match(html, /body\s*\{[\s\S]*?font-size:\s*1\.05rem;[\s\S]*?font-weight:\s*500;/);
});

test('US storage forecast supports batch monthly plans and clears only monthly plan values', () => {
  for (const required of [
    'id="storageBatchSales"', 'id="storageBatchRestock"', 'id="storageBatchMonths"', 'id="storageBatchFillButton"', 'id="storageClearButton"',
    'function batchFillStorageForecast', 'function clearStorageForecast', 'function storageBatchInputValue', 'function storageBatchMonthCount',
    '批量填充', '填充月数', '一键清空计划', '留空不改', '起始月、库存和历史销量未修改',
  ]) assert.match(html, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

  const batchFill = extractFunctionSource('batchFillStorageForecast');
  assert.match(batchFill, /sales !== null/);
  assert.match(batchFill, /restock !== null/);
  assert.match(batchFill, /const months = storageBatchMonthCount\(\)/);
  assert.match(batchFill, /index < months/);
  assert.match(batchFill, /填充月数必须是 1 到 12 之间的整数/);
  assert.match(batchFill, /storageSales\$\{index\}/);
  assert.match(batchFill, /storageRestock\$\{index\}/);
  assert.match(batchFill, /updateStorageForecast\(\)/);

  const clearForecast = extractFunctionSource('clearStorageForecast');
  assert.match(clearForecast, /storageSales\$\{index\}/);
  assert.match(clearForecast, /storageRestock\$\{index\}/);
  assert.match(clearForecast, /storageBatchSales/);
  assert.match(clearForecast, /storageBatchRestock/);
  assert.match(clearForecast, /storageBatchMonths/);
  assert.doesNotMatch(clearForecast, /storageOpeningUnits|storagePast13WeekSales|storageStartMonth|storageProfitMonth/);
});

test('AI chat and dotted tooltip underlines are removed', () => {
  for (const removed of ['module-chat', 'AI 对话', 'OPENROUTER_BASE_URL', 'sendMessage', 'toggleChatKey', 'text-decoration: underline dotted']) {
    assert.doesNotMatch(html, new RegExp(removed));
  }
  assert.doesNotMatch(html, /\.fba-rule-row\s*\{[^}]*dashed/);
});

test('site keeps the original LT-TOOL visual style instead of the Jager dashboard skin', () => {
  assert.match(html, /<title>LT-TOOL \| 利润测算<\/title>/);
  assert.match(html, /<h1>利润测算<\/h1>/);
  assert.match(html, /<h1>单位换算<\/h1>/);
  for (const required of [
    '--canvas: #f7f1e6', '--surface: #fffcf5', '--accent: #0f766e',
    "font-family: 'Roboto', sans-serif", "font-family: 'Share Tech Mono', monospace",
  ]) assert.match(html, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.doesNotMatch(html, /Jager Monitor inspired dashboard skin|--page: #f6f7fa|--blue: #2962ff|font-family: Inter, ui-sans-serif, system-ui/);
});

test('Japan marketplace uses official 2026 JPY fulfillment and storage rules', () => {
  for (const required of [
    '<option value="JP">日本 / JP</option>',
    "JP: { name: '日本站', currency: 'JPY'",
    'const JP_FBA_FULFILLMENT_2026',
    'const JP_FBA_STORAGE_2026',
    'Amazon 日本站 2026',
    'sell.amazon.co.jp/pricing',
  ]) assert.match(html, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

  const code = [
    extractConstantSource('JP_FBA_FULFILLMENT_2026'),
    extractConstantSource('JP_FBA_STORAGE_2026'),
    extractFunctionSource('getJpFbaMetrics'),
    extractFunctionSource('calculateJpFbaStorageFee'),
    '({ getJpFbaMetrics, calculateJpFbaStorageFee })',
  ].join('\n');
  const { getJpFbaMetrics, calculateJpFbaStorageFee } = vm.runInNewContext(code);

  assert.deepEqual(JSON.parse(JSON.stringify(getJpFbaMetrics([25, 18, 2], 0.25, 1200))), { tier: '小型', fee: 288 });
  assert.deepEqual(JSON.parse(JSON.stringify(getJpFbaMetrics([25, 18, 2], 0.25, 900))), { tier: '小型', fee: 222 });
  assert.equal(getJpFbaMetrics([35, 30, 3.3], 1, 1500).fee, 318);
  assert.equal(getJpFbaMetrics([40, 30, 20], 9, 1500).fee, 532);
  assert.equal(getJpFbaMetrics([70, 60, 50], 30, 1500).fee, 1532);
  assert.equal(getJpFbaMetrics([90, 80, 70], 50, 1500).fee, 4496);
  assert.equal(getJpFbaMetrics([100, 90, 80], 50, 1500), null);

  assert.equal(calculateJpFbaStorageFee(1000, '标准尺寸', 9, 30, false), 5.676);
  assert.equal(calculateJpFbaStorageFee(1000, '标准尺寸', 10, 31, false), 10.087);
  assert.equal(calculateJpFbaStorageFee(1000, '大型', 9, 30, false), 3.278);
  assert.equal(calculateJpFbaStorageFee(1000, '标准尺寸', 10, 31, true), 5.5);
});
