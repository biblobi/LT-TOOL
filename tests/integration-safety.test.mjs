import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
test('every inline script parses, including market configuration',()=>{
 for(const m of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) new vm.Script(m[1]);
});
test('Japan cannot fall through to US fulfillment fees',()=>{
 assert.match(html,/if \(country === 'JP'\) \{/);
 assert.match(html,/getJpFbaMetrics\(dimensionsCm, weightKg, priceJpy\)/);
 assert.doesNotMatch(html,/country === 'MX' \|\| country === 'EU' \|\| country === 'UK' \|\| country === 'JP'/);
 assert.match(html,/<option value="JP">/);
 assert.match(html,/JP: \{/);
});
function extract(name) {
 const start=html.indexOf(`    function ${name}(`);
 const end=html.indexOf('\n    function ',start+1);
 return html.slice(start,end);
}
test('low price fee uses explicit valid prices and respects the $10 boundary',()=>{
 const configSource=html.match(/const DEFAULT_FEE_CONFIG = ([\s\S]*?);\r?\n    const FEE_CONFIG_KEY/)?.[1];
 assert.ok(configSource,'missing default fee configuration');
 const feeConfig=vm.runInNewContext(`(${configSource})`);
 const fee=vm.runInNewContext(extract('estimateFbaFee')+';estimateFbaFee',{FEE_CONFIG:feeConfig});
 const standard='\u6807\u51c6\u4ef6';
 assert.equal(fee(standard,0.25,9.89),2.91);
 assert.equal(fee(standard,0.25,9.99),2.91);
 for(const p of [10,10.01,undefined,null,'',0,-1,NaN]) assert.equal(fee(standard,0.25,p),3.73);
 assert.equal(fee('\u5927\u53f7\u5927\u4ef6',2,9),8.96);
 feeConfig.fulfillment.categories.standard.under10.stdBrackets[0][1]=2.77;
 assert.equal(fee(standard,0.25,9.89),2.77);
});
test('monthly totals execute safely and convert CNY-base exchange rates correctly',()=>{
 const el={textContent:''};
 const context={document:{getElementById:()=>el},liveRates:{CNY:1,USD:1/7.2},fmtNumber:String,rmbMoney:(v,fx)=>(v*fx).toFixed(2)};
 const render=vm.runInNewContext(extract('setProfitTotalMetric')+';setProfitTotalMetric',context);
 render('total',10,7.2,0); assert.doesNotMatch(el.textContent,/USD/);
 render('total',10,7.2,100); assert.match(el.textContent,/USD 1000.00/);
});


