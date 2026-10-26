// Classifier adapted from HielG/claude-adaptive-effort, MIT (see LICENSE).
export const LADDER = Object.freeze(['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra']);
export const DEFAULTS = Object.freeze({ trivialMaxChars: 160, longChars: 900, complexCues: 3,
  socialEffort: 'low', trivialEffort: 'low', ideationEffort: 'max', planningEffort: 'max', reviewEffort: 'max', complexEffort: 'max' });
const social = new Set(['hi','hello','hey','yo','thanks','thank you','thx','ty','cool','nice','great','perfect','awesome','got it','good','good job','nice work']);
const continuation = new Set(['yes','y','yep','yeah','sure','ok','okay','k','no','nope','n','done','go','go ahead','do it','proceed','continue','carry on','keep going','lgtm','approved','ship it','yes please','ok do it','yes do it','sounds good']);
const complexity = /\b(?:refactor\w*|rewrite|migrat\w*|architect\w*|design\w*|debug\w*|diagnos\w*|root cause|stack trace|traceback|performance|benchmark\w*|profil\w*|concurren\w*|race condition|deadlock|security|vulnerab\w*|audit\w*|algorithm\w*|multi-step|end-to-end|integrat\w*|schema|analy\w*|investigat\w*|evaluat\w*|compar\w*|strateg\w*|prove|proving|deriv\w*|implement\w*|complex|codebase|thorough\w*|trade-?offs?|optimi[sz]\w*)\b/g;
const judgment = /\b(?:fix|add|write|create|build|update|change|save|publish|delete|remove|deploy|send|post|implement\w*|refactor\w*|migrat\w*|design\w*|debug\w*|explain|review|plan|analy[sz]\w*|compar\w*|evaluat\w*|optimi[sz]\w*|investigat\w*|audit\w*|diagnos\w*|test|install|configure|set up|verif\w*|check\w*|confirm\w*|why|how does|how do|what happens|error\w*|fail\w*|broken|crash\w*)\b/g;
const planning = /\b(?:plan|plans|planning|roadmap\w*|milestone\w*|scope|phases?|architect\w*|blueprint\w*|specs?|specification\w*|prd|design docs?|backlog|tech stack)\b/g;
const ideation = /\b(?:brainstorm\w*|ideat\w*|idealiz\w*|concept\w*|ideas?|vision|positioning|value proposition|differentiat\w*|narrative|personas?|business models?|go-to-market|pitch\w*|enrich\w*)\b/g;
const review = /\b(?:review\w*|audit\w*|verif\w*|critique\w*)\b/g;
const count = (text, expression) => (text.match(expression) || []).length;
export function resolvePolicy(raw = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Policy must be an object');
  const result = { ...DEFAULTS };
  for (const [key,value] of Object.entries(raw)) {
    if (!Object.hasOwn(DEFAULTS,key)) throw new Error(`Unknown policy field: ${key}`);
    if (typeof DEFAULTS[key] === 'number') {
      if (!Number.isSafeInteger(value) || value < 1 || value > 1000000) throw new Error(`Invalid threshold: ${key}`);
    } else if (!LADDER.includes(value)) throw new Error(`Invalid effort: ${key}`);
    result[key] = value;
  }
  return result;
}
export function classify(prompt, policy = DEFAULTS) {
  if (typeof prompt !== 'string') throw new Error('Prompt must be text');
  const trimmed = prompt.trim();
  if (!trimmed) return { kind:'continue', reason:'empty' };
  const words = trimmed.replace(/[^\p{L}\p{N} ]/gu,' ').replace(/\s+/g,' ').trim().toLowerCase();
  if (social.has(words)) return { kind:'social', reason:'social' };
  if (continuation.has(words)) return { kind:'continue', reason:'answer' };
  const lower = trimmed.toLowerCase();
  const cues = count(lower, complexity);
  const judges = count(lower, judgment);
  const code = trimmed.includes('```') || /(^|\n)\s{4,}\S/.test(trimmed);
  if (/(?:ultrathink|think (?:hard|harder|deeply|carefully)|max(?:imum)? (?:effort|thinking|reasoning)|deep dive|be (?:very )?thorough|exhaustive)/.test(lower)) return {kind:'complex',reason:'explicit-deep'};
  if (cues >= policy.complexCues || (code && cues >= 1) || (trimmed.length >= policy.longChars && cues >= 2)) return {kind:'complex',reason:'complexity'};
  if (count(lower,planning)) return {kind:'planning',reason:'planning'};
  if (count(lower,ideation)) return {kind:'ideation',reason:'ideation'};
  if (count(lower,review)) return {kind:'review',reason:'review'};
  if (code) return {kind:'work',reason:'code'};
  if (!cues && !judges && trimmed.length <= policy.trivialMaxChars) return {kind:'trivial',reason:'short-signal-free'};
  return {kind:'work',reason:'work'};
}
export function capabilities(model) {
  if (!model || typeof model.model !== 'string' || !Array.isArray(model.supportedReasoningEfforts)) throw new Error('Malformed model capabilities');
  const received = model.supportedReasoningEfforts.map(e => e?.reasoningEffort);
  if (!received.length || received.some(e => !LADDER.includes(e))) throw new Error('Unknown or empty supported effort set; update the plugin');
  return LADDER.filter(e => received.includes(e));
}
export function route(prompt, { supported, baseline, previous, manual, policy = DEFAULTS }) {
  if (!Array.isArray(supported) || !supported.length || supported.some(e=>!LADDER.includes(e))) throw new Error('Supported efforts are required');
  if (!supported.includes(baseline)) throw new Error(`Baseline effort ${baseline} is not supported`);
  if (manual !== undefined && !supported.includes(manual)) throw new Error(`Manual effort ${manual} is not supported`);
  const verdict = classify(prompt,policy);
  if (manual !== undefined) return {...verdict,effort:manual,reason:'manual-override',baseline,mode:'manual'};
  let effort = baseline;
  const rank = e=>LADDER.indexOf(e);
  if (verdict.kind === 'continue') effort = supported.includes(previous) ? previous : baseline;
  else if (['social','trivial'].includes(verdict.kind)) {
    const requested = policy[verdict.kind+'Effort'];
    // Prefer a supported level at/above the request; never raise a light turn.
    effort = supported.filter(e=>rank(e)>=rank(requested)&&rank(e)<=rank(baseline)).sort((a,b)=>rank(a)-rank(b))[0] ?? baseline;
  } else if (['planning','ideation','review','complex'].includes(verdict.kind)) {
    const requested = policy[verdict.kind+'Effort'];
    // Automatic routing never enters ultra (which may enable delegation) unless already selected as the baseline.
    const ceiling = Math.max(rank(baseline), Math.min(rank(requested),rank('max')));
    effort = supported.filter(e=>rank(e)>=rank(baseline)&&rank(e)<=ceiling).sort((a,b)=>rank(b)-rank(a))[0] ?? baseline;
  }
  return {...verdict,effort,baseline,mode:effort===baseline?'baseline':rank(effort)>rank(baseline)?'raise':'dip'};
}
export function parseUsage(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const keys = ['input_tokens','cached_input_tokens','output_tokens'];
  const result = Object.fromEntries(keys.map(k=>[k,Number.isSafeInteger(raw[k])&&raw[k]>=0?raw[k]:null]));
  if (result.input_tokens !== null && result.cached_input_tokens !== null && result.cached_input_tokens > result.input_tokens) result.cached_input_tokens = null;
  return result;
}
export function usageDelta(total, previous) {
  if (!total) return null;
  const result=Object.fromEntries(['input_tokens','cached_input_tokens','output_tokens'].map(key=>{
    const current=total[key],before=previous===undefined?0:previous?.[key];
    return [key,Number.isSafeInteger(current)&&Number.isSafeInteger(before)&&current>=before?current-before:null];
  }));
  return parseUsage(result);
}
export function summarize(turns) {
  const counts = {};
  const usage = {};
  for (const key of ['input_tokens','cached_input_tokens','output_tokens']) {
    const known = turns.map(t=>t.usage?.[key]).filter(v=>Number.isSafeInteger(v)&&v>=0);
    usage[key] = { observed:known.length?known.reduce((a,b)=>a+b,0):null, knownTurns:known.length, unknownTurns:turns.length-known.length };
  }
  for (const turn of turns) counts[turn.effort] = (counts[turn.effort]??0)+1;
  return { attempts:turns.length,completed:turns.filter(t=>t.outcome==='completed').length,counts,usage,
    monetarySavings:null,tokenSavings:null,note:'Observed increments of Codex cumulative counters in this exclusively runner-owned thread. Cached input is a subset of input. Missing/uncertain boundaries stay unknown. Counterfactual savings and account billing are unavailable.' };
}
