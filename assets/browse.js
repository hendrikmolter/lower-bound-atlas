(() => {
  'use strict';
  const form = document.querySelector('[data-atlas-filters]');
  const results = document.querySelector('[data-atlas-results]');
  if (!form || !results) return;
  const count = document.querySelector('[data-atlas-count]');
  const empty = document.querySelector('[data-atlas-empty]');
  const kind = count.dataset.atlasSingular;
  const grouped = kind === 'problem';
  const target = form.dataset.target;
  const controls = [...form.querySelectorAll('input[name], select[name]')];
  const fold = value => value.normalize('NFKC').toLowerCase().trim();
  const byName = new Intl.Collator('en', {numeric:true, sensitivity:'base'}).compare;
  const quantity = (n, word) => n + ' ' + (n === 1 ? word : word === 'hypothesis' ? 'hypotheses' : word + 's');
  const hypothesisLabels = new Map(controls.filter(c => c.name === 'assumption').map(c => [c.value,c.labels[0].textContent.trim()]));
  const groups = [...results.children].map(node => {
    const entries = grouped ? [...node.querySelectorAll('[data-atlas-case]')] : [node];
    const note = document.createElement('p');
    note.className = 'match-info';
    note.hidden = true;
    node.querySelector('h3')?.after(note);
    const records = entries.map(entry => {
      const d = entry.dataset;
      const read = key => JSON.parse(d[key] || '[]');
      return {entry, d, text: [d.id,d.name,...read('aliases'),...read('search')].filter(Boolean).map(fold),
        statements:read('statements'), comparisons:read('recoveries'), hypotheses:read('assumptions')};
    });
    return {node,note,records,name:grouped ? node.querySelector('h3').textContent : records[0].d.name};
  });

  function state() {
    const values = new FormData(form);
    const selected = values.getAll('assumption');
    const active = selected.length !== 1 || selected[0] !== target;
    const field = form.querySelector('[data-field="status"]');
    if (field) {
      field.disabled = !active;
      const details = field.querySelector('details');
      if (!active) details.open = false;
      details.inert = !active;
      form.querySelector('[data-recovery-help]').textContent = active
        ? 'Match a recorded lower bound under any selected hypothesis and any selected recovery status.'
        : 'Select an alternative hypothesis to compare its bounds with the historical ETH bound.';
    }
    for (const group of form.querySelectorAll('.multi-filter')) {
      const summary = group.querySelector('summary');
      const chosen = [...group.querySelectorAll(':checked')].map(el => el.labels[0].textContent.trim());
      summary.textContent = group.disabled ? 'Unavailable' : chosen.length === 1 ? chosen[0] : chosen.length ? chosen.length + ' selected' : summary.dataset.default;
    }
    // Read after enabling the status field so its preserved selections take effect immediately.
    return {selected,statuses:active ? new FormData(form).getAll('status') : [],sort:values.get('sort'),
      terms:fold(values.get('q') || '').split(/\s+/u).filter(Boolean),values};
  }

  function match(record, filters) {
    const {entry,d,statements,comparisons,hypotheses,text} = record;
    const {selected,statuses,values} = filters;
    const accepts = id => !selected.length || selected.includes(id);
    if (!filters.terms.every(term => text.some(value => value.includes(term)))) return null;
    for (const key of ['family','kind','task','parameter','lifecycle']) {
      if (values.get(key) && d[key] !== values.get(key)) return null;
    }
    if (!grouped) {
      const used = hypotheses.filter(accepts);
      return kind === 'paper' && selected.length && !used.length ? null : {total:Number(d.total || 0),used};
    }
    const outcomes = comparisons.filter(c => accepts(c.hypothesis) && statuses.includes(c.status));
    function matchingHypotheses(bound) {
      return bound.hypotheses.filter(id => accepts(id) && (!statuses.length ||
        outcomes.some(c => c.hypothesis === id && (!c.bound || c.bound === bound.id))));
    }
    const bounds = statements.filter(b => matchingHypotheses(b).length);
    for (const row of entry.querySelectorAll('[data-recovery-outcome]')) {
      row.hidden = !outcomes.some(c => c.status === row.dataset.recoveryOutcome && c.hypothesis === row.dataset.hypothesis &&
        c.target === row.dataset.target);
    }
    const why = entry.querySelector('[data-matching-hypotheses]');
    const used = [...new Set(bounds.flatMap(matchingHypotheses))];
    why.hidden = !selected.length || !!statuses.length;
    why.textContent = why.hidden ? '' : ' · ' + used.map(id => hypothesisLabels.get(id)).join(', ');
    return bounds.length ? {total:bounds.length} : null;
  }

  function render() {
    const f = state();
    const arranged = [];
    let parameterCount = 0;
    for (const group of groups) {
      const matches = [];
      for (const record of group.records) {
        const result = match(record,f);
        record.entry.hidden = !result;
        if (result) matches.push(result);
      }
      group.node.hidden = !matches.length;
      if (!matches.length) continue;
      parameterCount += matches.length;
      const total = matches.reduce((sum,r) => sum+r.total,0);
      let label = '';
      const filtering = f.terms.length || f.selected.length || f.statuses.length || [...f.values].some(([key,v]) =>
        ['lifecycle','task','parameter','family','kind'].includes(key) && v);
      if (kind === 'paper' && f.selected.length) label = 'Cited for a lower bound under ' + matches[0].used.map(id => hypothesisLabels.get(id)).join(', ');
      else if (kind === 'hypothesis' || f.sort === 'bounds' || (grouped && filtering))
        label = quantity(total, filtering && grouped ? 'matching lower bound' : 'lower bound');
      if (grouped && f.sort === 'parameters') label = quantity(matches.length,'matching parameterization');
      group.note.textContent = label;
      group.note.hidden = !label;
      arranged.push({group,total,parameters:matches.length,year:Number(group.records[0].d.year)});
    }
    arranged.sort((a,b) => {
      let rank = 0;
      if (kind === 'paper' && !f.sort) rank = a.group.node.dataset.authorRank - b.group.node.dataset.authorRank;
      if (f.sort === 'bounds') rank = b.total - a.total;
      if (f.sort === 'parameters') rank = b.parameters - a.parameters;
      if (f.sort === 'newest' || f.sort === 'oldest') rank = (!a.year - !b.year) || (f.sort === 'newest' ? b.year-a.year : a.year-b.year);
      return rank || byName(a.group.name,b.group.name);
    });
    const visible = [...results.children].filter(node => !node.hidden);
    if (arranged.some(({group},i) => visible[i] !== group.node)) results.append(...arranged.map(({group}) => group.node));
    count.textContent = quantity(arranged.length,kind) + (grouped ? ' · ' + quantity(parameterCount,'matching parameterization') : '');
    empty.hidden = !!arranged.length;
  }

  const fields = [...new Set(controls.map(el => el.name))];
  function restore() {
    const url = new URL(location.href);
    const params = url.hash.startsWith('#?') ? new URLSearchParams(url.hash.slice(2)) : url.searchParams;
    for (const el of controls) {
      if (el.type === 'checkbox') el.checked = params.getAll(el.name).includes(el.value);
      else {
        el.value = params.get(el.name) || '';
        if (el.selectedIndex === -1) el.selectedIndex = 0;
      }
    }
    render();
  }
  function update(push) {
    render();
    form.querySelector('[data-copy-feedback]').textContent = '';
    const url = new URL(location.href);
    const file = url.protocol === 'file:';
    const params = file ? new URLSearchParams() : url.searchParams;
    fields.forEach(key => params.delete(key));
    for (const el of controls) {
      if (el.value && (el.type !== 'checkbox' || el.checked)) params.append(el.name,el.value);
    }
    if (file) url.hash = params.size ? '?' + params.toString() : '';
    if (url.href !== location.href) history[push ? 'pushState' : 'replaceState'](null,'',url);
  }
  form.querySelector('[data-copy-search]').addEventListener('click',async () => {
    const feedback = form.querySelector('[data-copy-feedback]');
    try {
      await navigator.clipboard.writeText(location.href);
      feedback.textContent = 'Search link copied.';
    } catch {
      feedback.textContent = 'Copy the current address from your browser.';
    }
  });
  form.addEventListener('input',e => update(e.target.name !== 'q'));
  form.addEventListener('submit',e => { e.preventDefault(); update(false); });
  form.addEventListener('reset',() => setTimeout(() => update(true),0));
  window.addEventListener('pageshow',restore);
  window.addEventListener('popstate',restore);
  window.addEventListener('hashchange',restore);
  restore();
  form.hidden = false;
})();
