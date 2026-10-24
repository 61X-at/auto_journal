/** Информационная карточка с названием, значением и пояснением. */
export function createSummaryCard({ label, value, hint = '', icon = '•', numericValue } = {}) {
  const card = document.createElement('article');
  card.className = 'summary-card';

  const title = document.createElement('p');
  title.className = 'summary-card__label';
  title.append(document.createTextNode(label));

  const symbol = document.createElement('span');
  symbol.className = 'summary-icon';
  symbol.setAttribute('aria-hidden', 'true');
  symbol.textContent = icon;
  title.append(symbol);

  const amount = document.createElement('p');
  amount.className = 'summary-card__value';
  if (numericValue !== undefined) {
    const data = document.createElement('data');
    data.value = String(numericValue);
    data.textContent = String(value);
    amount.append(data);
  } else {
    amount.textContent = String(value);
  }

  const note = document.createElement('p');
  note.className = 'summary-card__hint';
  note.textContent = hint;
  card.append(title, amount, note);
  return card;
}
