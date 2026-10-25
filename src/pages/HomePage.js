import { journalHash } from '../utils/serviceFilters.js';
import { createButton } from '../components/Button.js';
import { createSummaryCard } from '../components/SummaryCard.js';

/** Главная страница: статические данные, общие компоненты FE-005. */
export function renderHomePage() {
  const template = document.getElementById('home-page-template');
  if (!template) throw new Error('Не найден шаблон главной страницы');

  const page = template.content.cloneNode(true);
  const link = page.querySelector('.page-heading .button');
  link.replaceWith(createButton({ label: 'Добавить запись +', href: '#/journal/new' }));

  const summary = page.querySelector('.summary-grid');
  summary.replaceChildren(
    createSummaryCard({ label: 'Всего расходов', value: '24 500 ₽', numericValue: 24500, hint: 'По всем событиям в журнале', icon: '₽' }),
    createSummaryCard({ label: 'Записей в журнале', value: '2', hint: 'Примеры выполненных работ', icon: '≡' }),
    createSummaryCard({ label: 'Ближайшее ТО', value: '1', hint: 'Запланированная работа', icon: '▣' }),
  );
  // FE-013: поисковые поля на главной ведут к реальным записям журнала.
  // Сами демонстрационные карточки главной обновляются в FE-014.
  const search = page.querySelector('#history .filters');
  search.setAttribute('aria-label', 'Поиск по сохранённому журналу');
  const query = search.querySelector('#entry-query');
  const type = search.querySelector('#entry-category');
  query.disabled = false;
  type.disabled = false;
  const submit = search.querySelector('button');
  submit.disabled = false;
  submit.type = 'submit';
  search.addEventListener('submit', (event) => {
    event.preventDefault();
    window.location.hash = journalHash({ query: query.value, type: type.value });
  });
  return page;
}
