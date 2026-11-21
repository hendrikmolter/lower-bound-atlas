(() => {
  const form = document.querySelector('[data-bound-filter]');
  const choices = [...form.querySelectorAll('[name=hypothesis]')];
  const recorded = form.querySelector('[value=recorded]');
  const links = [...document.querySelectorAll('[data-parameter-card] h3 a, .param-nav a')];

  function writeFilter(url, selected) {
    url.searchParams.delete('bounds');
    url.searchParams.delete('hypotheses');
    if (recorded.checked) url.searchParams.set('bounds','recorded');
    if (selected.length !== choices.length) url.searchParams.set('hypotheses',selected.join(','));
    return url;
  }

  function render() {
    const selected = choices.filter(choice => choice.checked).map(choice => choice.value);
    const cards = document.querySelectorAll('[data-hypothesis], [data-parameter-card]');
    for (const card of cards) {
      if (card.hasAttribute('data-parameter-card')) {
        card.hidden = !selected.some(id => !recorded.checked || card.dataset.recorded.split(' ').includes(id));
        continue;
      }
      for (const row of card.querySelectorAll('[data-hardness-only]')) row.hidden = recorded.checked;
      const earlier = card.querySelector('[data-earlier-bounds]');
      if (earlier) earlier.hidden = !earlier.querySelector('.bound-row:not([hidden])');
      card.hidden = !selected.includes(card.dataset.hypothesis) ||
        (recorded.checked && !card.querySelector('.bound-row:not([hidden])'));
    }
    document.querySelector('[data-bound-empty]').hidden = [...cards].some(card => !card.hidden);
    for (const link of links) link.href = writeFilter(new URL(link.href),selected).href;
    return selected;
  }

  function restore() {
    const params = new URL(location.href).searchParams;
    form.elements.bounds.value = params.get('bounds') === 'recorded' ? 'recorded' : 'all';
    const subset = params.get('hypotheses')?.split(',');
    for (const choice of choices) choice.checked = !subset || subset.includes(choice.value);
    render();
    form.hidden = false;
  }
  form.addEventListener('change', () => history.replaceState(null,'',writeFilter(new URL(location.href),render())));
  window.addEventListener('pageshow',restore);
  window.addEventListener('popstate',restore);
  restore();
})();
