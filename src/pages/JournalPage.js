import { pageFragment } from './pageFragment.js';
import { createButton } from '../components/Button.js';
import { createDemoForm } from '../components/DemoForm.js';
import { createEmptyState } from '../components/EmptyState.js';
import { createErrorNotice } from '../components/ErrorNotice.js';
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

    const detail = document.createElement('p');
    const dateText = formatServiceDate(entry?.date);
    if (dateText === 'Дата не указана') {
      detail.append(document.createTextNode(dateText));
    } else {
      const when = document.createElement('time');
      when.dateTime = entry.date;
      when.textContent = dateText;
      detail.append(when);
    }
    const mileage = Number(entry?.mileage);
    const mileageText = Number.isFinite(mileage) && mileage >= 0
      ? `${mileage.toLocaleString('ru-RU')} км`
      : 'Пробег не указан';
    detail.append(document.createTextNode(` · ${entry?.type ?? 'Тип не указан'} · ${mileageText}`));
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

/** FE-011: история по дате и пустое состояние с прямым переходом к форме. */
export function renderJournalPage() {
  const stored = readEntries();
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
      <div id="journal-records"></div>
      <div id="journal-action-feedback" aria-live="polite"></div>
      <p class="placeholder-note">Записи отсортированы от новых к старым. Поиск и фильтрация появятся в следующей задаче.</p>
      <details class="component-example">
        <summary>Проверить общие компоненты формы (FE-005)</summary>
        <p class="component-example__note">Демонстрационная проверка полей без создания записи.</p>
        <div id="journal-form-demo"></div>
      </details>
    </section>
  `);
  const host = page.querySelector('#journal-records');
  if (stored.ok && stored.data.length > 0) {
    host.append(createServiceHistoryList(stored.data));
  } else if (stored.ok) {
    host.append(createEmptyJournalState());
  } else {
    host.append(createEmptyState({
      title: 'История недоступна',
      description: 'Данные журнала не удалось прочитать; сохранённое содержимое не перезаписывается.',
    }));
  }
  // Делегирование: после удаления список заменяется, но обработчик остаётся один.
  const actionFeedback = page.querySelector('#journal-action-feedback');
  host.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-action="delete-entry"]');
    if (!button || !host.contains(button)) return;
    const id = button.getAttribute('data-entry-id');
    // Отмена диалога не вызывает запись в localStorage.
    if (!window.confirm('Удалить эту запись из журнала? Действие нельзя отменить.')) return;
    const deleted = deleteServiceEntry(id, { confirmed: true });
    actionFeedback.replaceChildren();
    if (!deleted.ok) {
      actionFeedback.append(createErrorNotice(deleted.message));
      return;
    }
    const current = readEntries();
    if (!current.ok) {
      host.replaceChildren(createEmptyState({
        title: 'История недоступна',
        description: 'Не удалось прочитать данные после удаления.',
      }));
      actionFeedback.append(createErrorNotice(current.message));
      return;
    }
    host.replaceChildren(current.data.length
      ? createServiceHistoryList(current.data)
      : createEmptyJournalState());
    const status = document.createElement('p');
    status.className = 'journal-action-success';
    status.textContent = 'Запись удалена.';
    actionFeedback.append(status);
  });
  page.querySelector('#journal-form-demo').append(createDemoForm({
    id: 'journal-component-demo',
    fields: [
      { id: 'journal-demo-title', label: 'Описание работы', required: true, placeholder: 'Например, замена масла' },
      { id: 'journal-demo-amount', label: 'Стоимость, ₽', type: 'number', min: 0, required: true, placeholder: '7500' },
    ],
  }));
  return page;
}
