// Family labels are presentation only; exact catalog IDs still select models.
export const FAMILIES = Object.freeze(['terra','sol','astra']);
export function modelFamily(model) {
  return typeof model === 'string' ? model.toLowerCase().match(/(?:^|-)(terra|sol|astra)(?:-|$)/)?.[1] ?? 'other' : 'other';
}
export function modelListing(models, family) {
  if (family !== undefined && !FAMILIES.includes(family)) throw new Error('Family must be terra, sol, or astra');
  return {
    note:'Capability catalog, not proof of account entitlement or paid inference. Family labels do not switch models.',
    families:Object.fromEntries(FAMILIES.map(name=>[name,models.filter(m=>modelFamily(m.model)===name).length])),
    models:models.filter(m=>family===undefined||modelFamily(m.model)===family).map(m=>({model:m.model,family:modelFamily(m.model),default:m.defaultReasoningEffort,supported:m.supportedReasoningEfforts}))
  };
}
export function indicatorEnabled(mode = 'auto', stream = process.stderr, env = process.env) {
  if (!['auto','on','off'].includes(mode)) throw new Error('Indicator must be auto, on, or off');
  return mode === 'on' || (mode === 'auto' && Boolean(stream.isTTY) && env.TERM !== 'dumb');
}
const safe = value => String(value).replace(/[^\x20-\x7e]/g,'?');
export function createIndicator({stream = process.stderr, enabled = false, env = process.env} = {}) {
  const tty = Boolean(stream.isTTY) && env.TERM !== 'dumb';
  let active = false;
  let failed = false;
  const write=chunk=>{if(!failed)try{stream.write(chunk);}catch{failed=true;active=false;}};
  const clear = () => {
    if (active) write('\r\x1b[2K');
    active = false;
  };
  return {
    clear,
    wrap:output=>({write(chunk){clear();return output.write(chunk);}}),
    update({model,effort,status}) {
      if (!enabled || failed) return;
      const family = modelFamily(model);
      const label = family === 'other' ? safe(model) : family[0].toUpperCase()+family.slice(1);
      const width = Math.max(1, Math.min(stream.columns || 100, 200) - 1);
      const text = `[${label} | ${safe(effort).toUpperCase()} | ${safe(status)}]`.slice(0,width);
      if (!tty) {write(text+'\n');return;}
      clear();
      const color = status === 'uncertain' ? '33' : status === 'completed' ? '32' : '36';
      write(Object.hasOwn(env,'NO_COLOR') ? text : `\x1b[${color}m${text}\x1b[0m`);
      active = !failed;
      if (status === 'completed' || status === 'uncertain') {write('\n');active = false;}
    }
  };
}
