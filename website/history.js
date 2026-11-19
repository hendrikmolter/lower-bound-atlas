const historySection = document.querySelector('#version-history');
const days = [...historySection.querySelectorAll('.change-day')];
const entries = days.flatMap(day => [...day.querySelectorAll(':scope > ul > li')]);
const button = historySection.querySelector('button');
const batchSize = 10;
let visible = 0;

function showNextBatch() {
  const first = visible;
  visible = Math.min(first + batchSize, entries.length);
  for (let i = first; i < entries.length; i++) entries[i].hidden = i >= visible;
  for (const day of days) day.hidden = day.querySelector(':scope > ul > li').hidden;
  const remaining = entries.length - visible;
  button.hidden = remaining === 0;
  const next = Math.min(remaining, batchSize);
  button.textContent = 'Show ' + next + ' older ' + (next === 1 ? 'entry' : 'entries');
  if (first > 0) {
    const heading = entries[first].querySelector('h4');
    heading.tabIndex = -1;
    heading.focus();
  }
}

button.addEventListener('click', showNextBatch);
showNextBatch();
