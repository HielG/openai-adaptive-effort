import test from 'node:test';
import assert from 'node:assert/strict';
import { classify, resolvePolicy, capabilities, route, parseUsage, usageDelta, summarize } from '../src/policy.mjs';

const supported=['low','medium','high','xhigh','max'];
for(const [prompt,kind] of [
  ['Thanks! 🙏','social'],['yes','continue'],['ok do it','continue'],['','continue'],['latest version?','trivial'],
  ['fix the bug','work'],['add a button','work'],['why does it crash?','work'],['brainstorm ideas for our launch','ideation'],
  ['plan the migration','planning'],['review the payment module','review'],['audit the auth flow','review'],
  ['think carefully about this','complex'],['refactor and optimize concurrent migrations','complex'],
  ['```js\nconst value = 1;\n```','work'],['debug this\n```js\nthrow error\n```','complex'],
  ['Thanks, now review this change','review'],['perfect! save the report','work'],['你好','trivial']
])test(`classifies ${JSON.stringify(prompt)}`,()=>assert.equal(classify(prompt).kind,kind));
test('long unknown instructions stay at baseline rather than taking a cheap path',()=>assert.equal(classify('z'.repeat(1000)).kind,'work'));
test('configuration validates fields and values',()=>{
  assert.equal(resolvePolicy({reviewEffort:'high'}).reviewEffort,'high');
  for(const raw of [{unknown:1},{longChars:NaN},{complexCues:-1},{socialEffort:'super'},JSON.parse('{"__proto__":3}')])assert.throws(()=>resolvePolicy(raw));
});
test('capabilities fail closed on unknown future enums and empty catalogs',()=>{
  assert.deepEqual(capabilities({model:'example',supportedReasoningEfforts:[{reasoningEffort:'high'},{reasoningEffort:'low'}]}),['low','high']);
  for(const efforts of [[],[{reasoningEffort:'infinite'}]])assert.throws(()=>capabilities({model:'example',supportedReasoningEfforts:efforts}));
});
test('deep routing never lowers the baseline or automatically enters ultra',()=>{
  assert.equal(route('review this',{supported,baseline:'max'}).effort,'max');
  assert.equal(route('review this',{supported:[...supported,'ultra'],baseline:'high'}).effort,'max');
  assert.equal(route('review this',{supported:[...supported,'ultra'],baseline:'ultra'}).effort,'ultra');
});
test('capability-limited max maps to the highest supported safe value',()=>assert.equal(route('review this',{supported:['low','high'],baseline:'high'}).effort,'high'));
test('social/trivial requests never raise a low baseline',()=>assert.equal(route('thanks',{supported,baseline:'low'}).effort,'low'));
test('no unsupported low is sent to a model with a medium minimum',()=>assert.equal(route('thanks',{supported:['medium','high'],baseline:'high'}).effort,'medium'));
test('continuations preserve previous successful effort; ordinary work restores baseline',()=>{
  assert.equal(route('go ahead',{supported,baseline:'medium',previous:'max'}).effort,'max');
  assert.equal(route('fix this',{supported,baseline:'medium',previous:'max'}).effort,'medium');
  assert.equal(route('go ahead',{supported,baseline:'medium',previous:'retired'}).effort,'medium');
});
test('manual override wins once and unsupported choices are rejected',()=>{
  assert.equal(route('review this',{supported,baseline:'high',manual:'low'}).effort,'low');
  assert.throws(()=>route('hi',{supported,baseline:'high',manual:'ultra'}));
  assert.throws(()=>route('hi',{supported:['high'],baseline:'medium'}));
});
test('usage does not invent missing, negative, fractional, or inconsistent counts',()=>{
  assert.equal(parseUsage(undefined),null);
  assert.deepEqual(parseUsage({input_tokens:100,cached_input_tokens:60,output_tokens:12}),{input_tokens:100,cached_input_tokens:60,output_tokens:12});
  assert.deepEqual(parseUsage({input_tokens:-1,cached_input_tokens:0,output_tokens:1.2}),{input_tokens:null,cached_input_tokens:0,output_tokens:null});
  assert.equal(parseUsage({input_tokens:10,cached_input_tokens:20}).cached_input_tokens,null);
});
test('report keeps cached tokens separate, reports incomplete samples and no invented savings',()=>{
  const report=summarize([{effort:'low',outcome:'completed',usage:{input_tokens:100,cached_input_tokens:50,output_tokens:10}},{effort:'max',outcome:'uncertain',usage:null}]);
  assert.deepEqual(report.usage.input_tokens,{observed:100,knownTurns:1,unknownTurns:1});
  assert.equal(report.usage.cached_input_tokens.observed,50);assert.equal(report.tokenSavings,null);assert.equal(report.monetarySavings,null);
  assert.equal(summarize([]).usage.output_tokens.observed,null);
});
test('cumulative usage subtracts verified boundaries and preserves unknown/reset fields',()=>{
  const a={input_tokens:100,cached_input_tokens:25,output_tokens:10},b={input_tokens:300,cached_input_tokens:75,output_tokens:30};
  assert.deepEqual(usageDelta(a,undefined),a);
  assert.deepEqual(usageDelta(b,a),{input_tokens:200,cached_input_tokens:50,output_tokens:20});
  assert.deepEqual(usageDelta(a,b),{input_tokens:null,cached_input_tokens:null,output_tokens:null});
  assert.deepEqual(usageDelta(b,null),{input_tokens:null,cached_input_tokens:null,output_tokens:null});
  assert.equal(usageDelta(null,a),null);
});
