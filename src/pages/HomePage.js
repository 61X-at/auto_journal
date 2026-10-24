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
  return page;
}
