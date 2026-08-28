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
  assert.match(html, /#module-converter\.active\s*\{\s*display:\s*flex;\s*\}/);
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
    extractFunctionSource('calculateAdMetrics'),
    extractFunctionSource('calculateProfitMetrics'),
    '({ calculateAdMetrics, calculateProfitMetrics })',
  ].join('\n');
  return vm.runInNewContext(code);
}

function loadStorageHelpers() {
  const code = [
    extractConstantSource('US_FBA_STORAGE_2026'),
    extractFunctionSource('storageMonthNumber'),
    extractFunctionSource('storageDaysInMonth'),
    extractFunctionSource('getUsStorageBaseRate'),
    extractFunctionSource('getUsStorageUtilizationSurcharge'),
    extractFunctionSource('calculateUsFbaStorageForecast'),
    '({ getUsStorageBaseRate, getUsStorageUtilizationSurcharge, calculateUsFbaStorageForecast })',
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
  assert.equal(fba.fee, 19.5);
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
  assert.match(html, /FBA 配送费按实重与体积重中的较大者计费；本工具用 139 in³\/lb（约 5021 cm³\/kg）/);
});

test('FBA basis stays side-by-side until a phone-width breakpoint', () => {
  assert.match(html, /grid-template-columns:\s*minmax\(260px,\s*0\.9fr\)\s+minmax\(300px,\s*1\.1fr\)/);
  assert.match(html, /@media\s*\(max-width:\s*560px\)\s*\{\s*\.cargo-layout\s*\{\s*grid-template-columns:\s*1fr/s);
});

test('FBA and cargo inputs are statically located in the freight calculator before advertising', () => {
  const cargoStart = html.indexOf('id="cargo-check"');
  const freightStart = html.indexOf('id="module-freight"');
  const adStart = html.indexOf('id="module-adcalc"');
  const profitStart = html.indexOf('id="module-profit"');
  const freightEnd = html.indexOf('<div id="module-adcalc"', freightStart);
  assert.equal((html.match(/id="cargo-check"/g) ?? []).length, 1);
  assert.ok(cargoStart > freightStart && cargoStart < freightEnd);
  assert.ok(freightStart < adStart && adStart < profitStart);
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

  const forecastStorage = calculateProfitMetrics({
    price: 30, fx: 7.2, purchaseRmb: 50, taxDiscount: 10, freightRateRmb: 8, chargeableWeightKg: 1.2,
    packageVolumeM3: 0.0283168466, referralRate: 15, fbaFee: 5, storageRate: 99, inventoryMonths: 99, storageCost: 1.25,
    adCost: 2, promoRate: 0, returnRate: 0, returnHandling: 0, placementFee: 0, targetMargin: 20, cvr: 0.1,
  });
  assert.equal(forecastStorage.storage, 1.25);
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

test('profit and ad calculators are embedded in the converter home with a single calculated cost flow', () => {
  for (const required of [
    'id="module-freight"', 'id="module-adcalc"', 'id="module-profit"', 'embedded-calculator', 'converter-workspace', 'id="adClicks"', 'id="adMonthlyUnits"', 'id="adPosMetricValue"',
    'id="profitStorageRate"', '售价与广告成本统一取自广告费换算模块', 'id="profitTargetMargin"',
    '广告订单占比', 'id="adAcoasValue"', '运费与仓储计算',
  ]) assert.match(html, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  for (const removed of ['profitLinkAds', 'profitLinkFba', 'profitLinkCargo', 'profitManualAdRate', 'profitManualWeight', 'profitManualFba', '收入与采购', '广告与利润结果']) {
    assert.doesNotMatch(html, new RegExp(removed));
  }
  assert.doesNotMatch(html, /switchTab\('adcalc'\)|switchTab\('profit'\)/);
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
  assert.match(html, /id="adPosMetricValue"/);
  assert.doesNotMatch(html, /id="adPos"[^A-Za-z]/);
  assert.doesNotMatch(html, /id="adTacosValue"|TACoS/);
});

test('ad price is the first advertising input and tax discount defaults to zero', () => {
  const adStart = html.indexOf('id="module-adcalc"');
  const adEnd = html.indexOf('id="module-profit"', adStart);
  const adMarkup = html.slice(adStart, adEnd);
  assert.ok(adMarkup.indexOf('id="adPrice"') < adMarkup.indexOf('id="adCpc"'));
  assert.match(html, /id="profitTaxDiscount"[^>]*value="0"/);
});

test('PPC explanations use the complete field label as the hover and keyboard target', () => {
  const adStart = html.indexOf('id="module-adcalc"');
  const adEnd = html.indexOf('id="module-profit"', adStart);
  const adMarkup = html.slice(adStart, adEnd);
  const tooltipLabels = adMarkup.match(/class="field-label term-tip" tabindex="0" data-tip="[^"]+"/g) ?? [];

  assert.equal(tooltipLabels.length, 6);
  assert.match(html, /\.calculator-fields \.field-label\.term-tip\s*\{\s*display:\s*flex;\s*position:\s*relative;/);
  assert.doesNotMatch(adMarkup, /class="field-label"><span class="term-tip"/);
});

test('advertising inputs and outputs share one calculation panel', () => {
  const adStart = html.indexOf('id="module-adcalc"');
  const adEnd = html.indexOf('id="module-profit"', adStart);
  const adMarkup = html.slice(adStart, adEnd);

  assert.equal((adMarkup.match(/<section class="calculator-panel">/g) ?? []).length, 1);
  assert.ok(adMarkup.indexOf('id="adCpc"') < adMarkup.indexOf('id="adCpaValue"'));
  assert.match(html, /\.ad-calculator-grid \.metric-grid\s*\{\s*margin-top:\s*8px;/);
  assert.doesNotMatch(adMarkup, /PPC 广告费换算/);
});

test('profit results separate direct operating outcomes from target and break-even controls', () => {
  const profitStart = html.indexOf('id="module-profit"');
  const profitEnd = html.indexOf('<!-- 格式转换 -->', profitStart);
  const profitMarkup = html.slice(profitStart, profitEnd);

  assert.match(profitMarkup, /class="profit-layout"/);
  assert.match(profitMarkup, /class="profit-column profit-results"[\s\S]*?经营结果[\s\S]*?id="profitPurchaseRmb"[\s\S]*?id="profitMarginValue"/);
  assert.match(profitMarkup, /class="profit-column profit-targets"[\s\S]*?目标与保本[\s\S]*?id="profitTargetMargin"[\s\S]*?id="profitBreakEvenAcosValue"[\s\S]*?id="profitMaxPurchaseValue"/);
  assert.doesNotMatch(profitMarkup, /<div class="section-title"[\s\S]*?利润结果/);
  assert.match(html, /\.profit-layout\s*\{\s*display:\s*grid;[\s\S]*?grid-template-columns:\s*minmax\(0,\s*2fr\)\s+minmax\(260px,\s*1fr\)/);
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

test('calculator module headings are siblings and freight owns the market selector', () => {
  assert.match(html, /<h2 class="calculator-module-title"><span>运费与仓储计算<\/span><span class="heading-controls">[\s\S]*?id="marketCountry"[\s\S]*?id="profitFx"[\s\S]*?id="profitRateUpdate"/);
  assert.match(html, /<h2 class="calculator-module-title"><span class="term-tip"[^>]*>广告费换算<\/span><\/h2>/);
  assert.match(html, /<h2 class="calculator-module-title"><span class="term-tip"[^>]*>利润测算<\/span><\/h2>/);
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

test('profit results show per-unit market-currency and CNY values, but monthly totals only show CNY', () => {
  for (const required of [
    'id="profitFreightCnyValue"', 'id="profitFbaCnyValue"', 'id="profitStorageCnyValue"', 'id="profitAdCnyValue"',
    'id="profitTotalCostCnyValue"', 'id="profitCnyValue"', 'id="profitMaxCpcCnyValue"', 'id="profitMaxPurchaseCnyValue"',
    'id="profitFreightTotalValue"', 'id="profitFbaTotalValue"', 'id="profitStorageTotalValue"', 'id="profitAdTotalValue"', 'id="profitTotalCostTotalValue"', 'id="profitTotalValue"',
    'class="metric-money"', 'class="metric-total"', 'function rmbMoney', 'function setProfitMoneyMetric', 'function setProfitTotalMetric',
  ]) assert.match(html, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

  assert.doesNotMatch(html, /id="profitChargeableWeightValue"/);
  assert.doesNotMatch(html, /id="profitPackageVolumeValue"/);
  assert.match(html, /\.metric-total\s*\{[^}]*font:\s*700\s+0\.84rem\/1\.35/s);
  assert.match(html, /totalEl\.textContent = `\$\{label\}（\$\{fmtNumber\(quantity\)\}件） \$\{rmbMoney\(total, fx\)\}`/);
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

test('footer keeps contacts together on a second line', () => {
  assert.match(html, /<footer>[\s\S]*?SYSTEM CORE DESIGNED BY CHE RUI[\s\S]*?class="footer-contacts"[\s\S]*?小红书：bibliobibule[\s\S]*?VX：bibliobibule[\s\S]*?<\/footer>/);
  assert.match(html, /footer\s*\{[\s\S]*?flex-direction:\s*column/s);
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
  assert.match(html, /fx\.value = \(1 \/ marketRate\)\.toFixed\(2\)/);
  assert.match(html, /updateProfitCalculator\(\);/);
  assert.match(html, /updateMarketCountry\(\)[\s\S]*?updateProfitExchangeRate\(\);/);
});

test('site navigation and converter jumps are consolidated into a desktop sidebar', () => {
  assert.match(html, /body\s*\{[\s\S]*?grid-template-columns:\s*72px\s+minmax\(0,\s*1fr\)/);
  assert.match(html, /\.nav-deck\s*\{[\s\S]*?position:\s*sticky/);
  const navStart = html.indexOf('<div class="nav-deck">');
  const converterStart = html.indexOf('<div id="module-converter"');
  const navMarkup = html.slice(navStart, converterStart);
  for (const label of ['运费仓储', '广告换算', '利润测算', '功能说明', 'themeToggle']) assert.match(navMarkup, new RegExp(label));
  assert.match(navMarkup, /量子换算[\s\S]*?<div class="converter-subnav">[\s\S]*?运费仓储/);
  assert.doesNotMatch(html.slice(converterStart, html.indexOf('<div class="converter-workspace">', converterStart)), /converter-jump/);
});

test('guide tab and non-US/CA market currency switching are available without invented fees', () => {
  for (const required of [
    "switchTab('guide')", 'id="module-guide"', '使用流程', '结果定位与提示',
    'value="MX"', 'value="EU"', 'value="UK"', "currency: 'MXN'", "currency: 'EUR'", "currency: 'GBP'", 'autoFees: false',
    '待手动配置', '该站点暂不估算', "(1 / marketRate).toFixed(2)", "manualRate.value = (liveRates[target] / liveRates[source]).toFixed(2)",
  ]) assert.match(html, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

  assert.match(html, /country === 'MX' \|\| country === 'EU' \|\| country === 'UK'/);
  assert.match(html, /const index = \['converter','pdf','image','removebg','currency','guide'\]\.indexOf\(name\)/);
});

test('guide explains complex calculations, special interactions, and data-source boundaries', () => {
  const guideStart = html.indexOf('id="module-guide"');
  const guideEnd = html.indexOf('<footer>', guideStart);
  const guideMarkup = html.slice(guideStart, guideEnd);
  for (const required of [
    '仓储费每月详细计算（美国）', 'FIFO', '月度仓储计费库存', '库存利用率周数', '22 周', '25 ft³',
    '仓储/件', '非美国仓储', '35.3147', '计费重', '体积系数', '尺寸分级',
    'CPA', 'ACoAS', '混合广告费/件', '退货成本', '保本 ACOS', '最大 CPC',
    '更新汇率', 'ExchangeRate-API', 'Frankfurter', '结果定位与提示', '缺少的字段会优先高亮',
    'PDF 聚合', '背景移除', '主题选择', 'InventoryHero', 'Seller Central',
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
  const summary = html.match(/<summary class="storage-forecast-toggle">([\s\S]*?)<\/summary>/)?.[1] ?? '';
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
