(() => {
  'use strict';

  const form = document.querySelector('[data-atlas-filters]');
  const results = document.querySelector('[data-atlas-results]');
  if (!form || !results) return;

  const count = document.querySelector('[data-atlas-count]');
  const empty = document.querySelector('[data-atlas-empty]');
  const fields = ['q', 'family', 'kind', 'assumption', 'status', 'rule', 'task', 'parameter'];
  const controls = new Map(fields
    .map(field => [field, form.elements.namedItem(field)])
    .filter(([, control]) => control));
  const fold = value => value.normalize('NFKC').toLowerCase().trim();
  const compareText = (left, right) => left < right ? -1 : left > right ? 1 : 0;
  const records = Array.from(results.querySelectorAll('[data-atlas-case]'), node => {
    const { id, name, aliases, search, assumptions, recoveries } = node.dataset;
    return {
      node,
      id,
      exact: [id, ...JSON.parse(aliases ?? '[]')].filter(Boolean).map(fold),
      entries: [name, ...JSON.parse(search ?? '[]')].filter(value => typeof value === 'string').map(fold),
      assumptions: JSON.parse(assumptions ?? '[]'),
      recoveries: JSON.parse(recoveries ?? '[]')
    };
  });

  function score(record, query, terms) {
    if (!query) return 1;
    if (record.exact.includes(query)) return 4;
    if (record.entries.includes(query)) return 3;
    if (record.entries.some(entry => entry.includes(query))) return 2;
    return terms.every(term => record.entries.some(entry => entry.includes(term))) ? 1 : 0;
  }

  function matchesFilters(record, filters) {
    const { assumption, status } = filters;
    if (!['family', 'kind', 'task', 'parameter'].every(field =>
      !filters[field] || fold(filters[field]) === fold(record.node.dataset[field] ?? ''))) {
      return false;
    }
    if (!status) return !assumption || record.assumptions.includes(assumption);
    return record.recoveries.some(item => item.status === status && (!assumption || item.hypothesis === assumption));
  }

  function syncRecovery() {
    const status = controls.get('status');
    if (!status) return;
    status.disabled = controls.get('assumption')?.value === 'eth';
    if (status.disabled) status.value = '';
    form.querySelector('[data-recovery-help]').textContent = status.disabled
      ? 'Choose another hypothesis to compare its lower bounds with the historical ETH bounds.'
      : 'Compare each current historical ETH bound with the bounds under another hypothesis.';
  }

  function render() {
    syncRecovery();
    const filters = Object.fromEntries(Array.from(controls, ([field, control]) => [field, control.value.trim()]));
    const query = fold(filters.q ?? '');
    const terms = query.split(/\s+/u);
    const matches = [];
    for (const record of records) {
      const rank = matchesFilters(record, filters) ? score(record, query, terms) : 0;
      record.node.hidden = !rank;
      for (const row of record.node.querySelectorAll('[data-recovery-outcome]')) {
        row.hidden = !filters.status || row.dataset.recoveryOutcome !== filters.status ||
          Boolean(filters.assumption && row.dataset.hypothesis !== filters.assumption);
      }
      if (rank) matches.push({ record, rank });
    }
    if (query && !results.hasAttribute('data-alphabetical')) matches.sort((left, right) => right.rank - left.rank || compareText(left.record.id, right.record.id));
    const containers = [...new Set(matches.map(({ record }) => record.node.closest('[data-atlas-group]') ?? record.node))];
    for (const group of results.querySelectorAll('[data-atlas-group]')) group.hidden = !containers.includes(group);
    const displayed = Array.from(results.children).filter(node => !node.hidden);
    if (containers.some((node, index) => node !== displayed[index])) {
      for (const node of containers) results.append(node);
    }
    if (count) {
      const label = containers.length === 1 ? count.dataset.atlasSingular ?? 'case' : count.dataset.atlasPlural ?? 'cases';
      const labelText = `${containers.length} ${label}`;
      if (count.textContent !== labelText) count.textContent = labelText;
    }
    if (empty) empty.hidden = matches.length !== 0;
  }

  function restore() {
    const url = new URL(location.href);
    const filters = new URLSearchParams(url.hash.startsWith('#?') ? url.hash.slice(2) : url.search);
    for (const [field, control] of controls) {
      const value = filters.get(field) ?? '';
      control.value = value;
      // A URL from an older edition may carry a filter value outside the current options.
      if (control.value !== value && control.tagName === 'SELECT') control.value = '';
    }
    render();
  }

  function update() {
    syncRecovery();
    const url = new URL(location.href);
    // Browsers may forbid modifying the query string of a local file URL.
    if (url.protocol === 'file:') {
      const filters = new URLSearchParams(url.hash.startsWith('#?') ? url.hash.slice(2) : url.search);
      for (const [field, control] of controls) {
        const value = control.value.trim();
        if (value || url.searchParams.has(field)) filters.set(field, value);
        else filters.delete(field);
      }
      if (filters.size) url.hash = '?' + filters.toString();
      else if (url.hash.startsWith('#?')) url.hash = '';
    } else {
      if (url.hash.startsWith('#?')) {
        for (const [field, value] of new URLSearchParams(url.hash.slice(2))) url.searchParams.set(field, value);
        url.hash = '';
      }
      for (const [field, control] of controls) {
        const value = control.value.trim();
        if (value) url.searchParams.set(field, value);
        else url.searchParams.delete(field);
      }
    }
    if (url.href !== location.href) history.replaceState(history.state, '', url);
    render();
  }

  form.addEventListener('input', update);
  form.addEventListener('submit', event => {
    event.preventDefault();
    update();
  });
  form.addEventListener('reset', () => setTimeout(update, 0));
  window.addEventListener('popstate', restore);
  window.addEventListener('hashchange', restore);
  document.querySelector('.skip-link')?.addEventListener('click', event => {
    if (location.protocol !== 'file:' || !location.hash.startsWith('#?')) return;
    const main = document.querySelector('#main-content');
    if (!main) return;
    event.preventDefault();
    main.focus();
    main.scrollIntoView();
  });
  restore();
  form.hidden = false;
})();
