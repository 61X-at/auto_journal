import { pageFragment } from './pageFragment.js';
import { createButton } from '../components/Button.js';
import { createDemoForm } from '../components/DemoForm.js';
import { createEmptyState } from '../components/EmptyState.js';
import { readEntries } from '../storage/localStorage.js';

/** FE-010: минимальный вывод сохранённого массива без сортировки/CRUD (FE-011/012). */
function renderBasicEntries(list, entries) {
  list.replaceChildren();
  for (const entry of entries) {
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
    title.textContent = String(entry.description ?? 'Запись обслуживания');
    const detail = document.createElement('p');
    const when = document.createElement('time');
    when.dateTime = String(entry.date ?? '');
    when.textContent = String(entry.date ?? '');
    detail.append(when, document.createTextNode(` · ${entry.type ?? ''} · ${entry.mileage ?? 0} км`));
    text.append(title, detail);
    const amount = document.createElement('p');
    amount.className = 'entry-card__price';
    amount.textContent = `${Number(entry.amount ?? 0).toLocaleString('ru-RU')} ₽`;
    card.append(marker, text, amount);
    item.append(card);
    list.append(item);
  }
}

/** FE-010: после сохранения новая запись доступна в этом простом списке. */
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
      <h2 id="journal-page-heading" class="section-heading">Сохранённые события</h2>
      <div id="journal-records"></div>
      <p class="placeholder-note">Записи сохраняются локально. Сортировка по датам, поиск и редактирование появятся в следующих задачах.</p>
      <details class="component-example">
        <summary>Проверить общие компоненты формы (FE-005)</summary>
        <p class="component-example__note">Демонстрационная проверка полей без создания записи.</p>
        <div id="journal-form-demo"></div>
      </details>
    </section>
  `);
  const host = page.querySelector('#journal-records');
  if (stored.ok && stored.data.length) {
    const list = document.createElement('ul');
    list.className = 'entry-list';
    renderBasicEntries(list, stored.data);
    host.append(list);
  } else if (stored.ok) {
    host.append(createEmptyState({
      title: 'Пока нет записей',
      description: 'Нажмите «Добавить запись», чтобы сохранить первое событие обслуживания.',
    }));
  } else {
    host.append(createEmptyState({
      title: 'История недоступна',
      description: 'Данные журнала не удалось прочитать; сохранённое содержимое не перезаписывается.',
    }));
  }
  page.querySelector('#journal-form-demo').append(createDemoForm({
    id: 'journal-component-demo',
    fields: [
      { id: 'journal-demo-title', label: 'Описание работы', required: true, placeholder: 'Например, замена масла' },
      { id: 'journal-demo-amount', label: 'Стоимость, ₽', type: 'number', min: 0, required: true, placeholder: '7500' },
    ],
  }));
  return page;
}
