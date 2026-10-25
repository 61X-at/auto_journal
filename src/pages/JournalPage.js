import { SERVICE_ENTRY_TYPES } from '../models/serviceEntry.js';
import { filterServiceEntries, journalHash, parseJournalFilters } from '../utils/serviceFilters.js';
import { pageFragment } from './pageFragment.js';
import { createButton } from '../components/Button.js';
import { createDemoForm } from '../components/DemoForm.js';
import { createEmptyState } from '../components/EmptyState.js';
import { createErrorNotice } from '../components/ErrorNotice.js';
import { createSuccessNotice } from '../components/SuccessNotice.js';
import { takeFlashNotice } from '../utils/flashNotice.js';
import { deleteServiceEntry } from '../utils/serviceEntryActions.js';
import { readEntries } from '../storage/localStorage.js';
import { sortServiceEntriesByDate, formatServiceDate } from '../utils/serviceHistory.js';

/** FE-011: карточки полной истории. Не изменяет исходные записи в localStorage. */
export function createServiceHistoryList(entries) {
  const list = document.createElement('ul');
  list.className = 'entry-list';
  for (const entry of sortServiceEntriesByDate(entries)) {
    const item = document.createElement('li');
    const card = document.createElement('article');
    card.className = 'entry-card';

    const marker = document.createElement('span');
    marker.className = 'entry-icon';
    marker.setAttribute('aria-hidden', 'true');
    marker.textContent = '✦';

    const text = document.createElement('div');
    text.className = 'entry-card__text';
    const title = document.createElement('h3');
    title.textContent = String(entry?.description ?? 'Запись обслуживания');

    // FE-015: отдельные части метаданных можно перестраивать на узком экране,
    // не теряя ни одного значения и не создавая мобильную копию записи.
    const detail = document.createElement('p');
    detail.className = 'entry-card__meta';
    const metaPart = (modifier, label, value) => {
      const part = document.createElement('span');
      part.className = `entry-card__meta-part entry-card__meta-part--${modifier}`;
      const labelNode = document.createElement('span');
      labelNode.className = 'entry-card__meta-label';
      labelNode.textContent = `${label}: `;
      part.append(labelNode, value);
      return part;
    };
    const dateText = formatServiceDate(entry?.date);
    let dateValue = document.createTextNode(dateText);
    if (dateText !== 'Дата не указана') {
      const when = document.createElement('time');
      when.dateTime = entry.date;
      when.textContent = dateText;
      dateValue = when;
    }
    const mileage = Number(entry?.mileage);
    const mileageText = Number.isFinite(mileage) && mileage >= 0
      ? `${mileage.toLocaleString('ru-RU')} км`
      : 'Пробег не указан';
    detail.append(
      metaPart('date', 'Дата', dateValue),
      metaPart('type', 'Тип', document.createTextNode(String(entry?.type ?? 'Тип не указан'))),
      metaPart('mileage', 'Пробег', document.createTextNode(mileageText)),
    );
    text.append(title, detail);

    const amount = document.createElement('p');
    amount.className = 'entry-card__price';
    const price = Number(entry?.amount);
    const priceText = Number.isFinite(price) && price >= 0
      ? `${price.toLocaleString('ru-RU')} ₽`
      : 'Стоимость не указана';
    amount.textContent = priceText;
    const actions = document.createElement('div');
    actions.className = 'entry-card__actions';
    // Ссылка сохраняет ID записи в адресе; новая запись не создаётся.
    if (typeof entry?.id === 'string' && entry.id.trim()) {
      actions.append(createButton({
        label: 'Изменить', variant: 'secondary',
        href: `#/journal/edit/${encodeURIComponent(entry.id)}`,
      }));
      const remove = createButton({ label: 'Удалить', variant: 'secondary' });
      remove.setAttribute('data-action', 'delete-entry');
      remove.setAttribute('data-entry-id', entry.id);
      actions.append(remove);
    }
    card.append(marker, text, amount, actions);
    item.append(card);
    list.append(item);
  }
  return list;
}

/** Переиспользует общие компоненты FE-005 для пустой истории. */
export function createEmptyJournalState() {
  const empty = createEmptyState({
    title: 'Пока нет записей',
    description: 'Добавьте первое ТО, ремонт, замену детали или покупку — они появятся в этом журнале.',
  });
  empty.append(createButton({ label: 'Добавить запись', href: '#/journal/new' }));
  return empty;
}

/** FE-013: поисковая форма с двумя независимыми условиями. */
export function createJournalFilters({ query = '', type = '' } = {}) {
  const form = document.createElement('form');
  form.className = 'filters journal-filters';
  form.id = 'journal-filters';
  form.setAttribute('role', 'search');
  form.setAttribute('aria-label', 'Поиск и фильтрация истории');
  form.innerHTML = `
    <div class="form-field">
      <label for="journal-query">Поиск по описанию</label>
      <input id="journal-query" name="q" type="search" placeholder="Например, замена масла">
    </div>
    <div class="form-field">
      <label for="journal-type">Тип события</label>
      <select id="journal-type" name="type"></select>
    </div>
    <button class="button button--secondary" type="submit">Найти</button>
    <button class="button button--secondary" type="reset">Сбросить</button>
  `;
  const selector = form.querySelector('#journal-type');
  const all = document.createElement('option');
  all.value = '';
  all.textContent = 'Все типы';
  selector.append(all);
  for (const category of SERVICE_ENTRY_TYPES) {
    const option = document.createElement('option');
    option.value = category;
    option.textContent = category === 'ТО' ? category : category[0].toUpperCase() + category.slice(1);
    selector.append(option);
  }
  form.querySelector('#journal-query').value = query;
  selector.value = type;
  return form;
}

/** Отдельное состояние для отсутствия совпадений, отличное от пустого журнала. */
export function createNoSearchResultsState() {
  const empty = createEmptyState({
    title: 'Ничего не найдено',
    description: 'Попробуйте другой запрос или сбросьте условия поиска.',
  });
  const reset = createButton({ label: 'Сбросить фильтры', variant: 'secondary' });
  reset.setAttribute('data-action', 'reset-journal-filters');
  empty.append(reset);
  return empty;
}

/** FE-011/FE-012/FE-013: журнал, сортировка, действия и комбинированная фильтрация. */
export function renderJournalPage() {
  const initial = parseJournalFilters(window.location.hash);
  const page = pageFragment(`
    <header class="page-heading">
      <div class="page-heading__text">
        <p class="eyebrow">Мой автомобиль / История</p>
        <h1>Журнал обслуживания</h1>
        <p>Записи о выполненных работах и покупках.</p>
      </div>
      <a class="button button--primary" href="#/journal/new">Добавить запись</a>
    </header>
    <section class="section section--single" aria-labelledby="journal-page-heading">
      <h2 id="journal-page-heading" class="section-heading">История обслуживания</h2>
      <div id="journal-filter-controls"></div>
      <div id="journal-records" aria-live="polite"></div>
      <div id="journal-action-feedback" aria-live="polite"></div>
      <p class="placeholder-note">События отсортированы от новых к старым. Поиск и тип события можно использовать вместе.</p>
      <details class="component-example">
        <summary>Проверить общие компоненты формы (FE-005)</summary>
        <p class="component-example__note">Демонстрационная проверка полей без создания записи.</p>
        <div id="journal-form-demo"></div>
      </details>
    </section>
  `);
  const form = createJournalFilters(initial);
  page.querySelector('#journal-filter-controls').append(form);
  const host = page.querySelector('#journal-records');
  const actionFeedback = page.querySelector('#journal-action-feedback');
  const savedMessage = takeFlashNotice('journal');
  if (savedMessage) actionFeedback.append(createSuccessNotice(savedMessage));

  const currentFilters = () => ({
    query: form.querySelector('#journal-query').value,
    type: form.querySelector('#journal-type').value,
  });

  // Перечитываем состояние после изменения и удаления: не держим устаревший массив.
  function updateResults() {
    const stored = readEntries();
    if (!stored.ok) {
      host.replaceChildren(createEmptyState({
        title: 'История недоступна',
        description: 'Данные журнала не удалось прочитать; сохранённое содержимое не перезаписывается.',
      }));
      return;
    }
    if (!stored.data.length) {
      host.replaceChildren(createEmptyJournalState());
      return;
    }
    const results = filterServiceEntries(stored.data, currentFilters());
    host.replaceChildren(results.length
      ? createServiceHistoryList(results)
      : createNoSearchResultsState());
  }

  function setRouteForFilters(filters) {
    const target = journalHash(filters);
    if (window.location.hash !== target) {
      // Обработчик hashchange в FE-004 восстановит форму и результаты из адреса.
      window.location.hash = target;
    } else {
      updateResults();
    }
  }

  form.addEventListener('submit', event => {
    event.preventDefault();
    actionFeedback.replaceChildren();
    setRouteForFilters(currentFilters());
  });
  form.addEventListener('reset', event => {
    event.preventDefault();
    form.querySelector('#journal-query').value = '';
    form.querySelector('#journal-type').value = '';
    actionFeedback.replaceChildren();
    setRouteForFilters({});
  });

  // Делегирование сохраняет действие «Удалить» после обновления списка.
  host.addEventListener('click', event => {
    const reset = event.target.closest('button[data-action="reset-journal-filters"]');
    if (reset && host.contains(reset)) {
      form.querySelector('button[type="reset"]').click();
      return;
    }
    const button = event.target.closest('button[data-action="delete-entry"]');
    if (!button || !host.contains(button)) return;
    const id = button.getAttribute('data-entry-id');
    if (!window.confirm('Удалить эту запись из журнала? Действие нельзя отменить.')) return;
    const deleted = deleteServiceEntry(id, { confirmed: true });
    actionFeedback.replaceChildren();
    if (!deleted.ok) {
      actionFeedback.append(createErrorNotice(deleted.message));
      return;
    }
    updateResults();
    actionFeedback.append(createSuccessNotice('Запись удалена.'));
  });

  updateResults();
  page.querySelector('#journal-form-demo').append(createDemoForm({
    id: 'journal-component-demo',
    fields: [
      { id: 'journal-demo-title', label: 'Описание работы', required: true, placeholder: 'Например, замена масла' },
      { id: 'journal-demo-amount', label: 'Стоимость, ₽', type: 'number', min: 0, required: true, placeholder: '7500' },
    ],
  }));
  return page;
}
