import { journalHash } from '../utils/serviceFilters.js';
import { selectRecentServiceEntries } from '../utils/recentServiceEntries.js';
import { formatServiceDate } from '../utils/serviceHistory.js';
import { readEntries, readPlans, readCar } from '../storage/localStorage.js';
import { createButton } from '../components/Button.js';
import { createEmptyState } from '../components/EmptyState.js';
import { mountHomeCarCard } from '../components/HomeCarCard.js';
import { mountExpenseOverview } from '../components/ExpenseOverview.js';
import { mountUpcomingMaintenance } from '../components/UpcomingMaintenance.js';

/** FE-014: краткие карточки сохранённых событий, без действий редактирования. */
export function createRecentServiceEntriesList(entries) {
  const list = document.createElement('ul');
  list.className = 'entry-list';

  for (const entry of selectRecentServiceEntries(entries)) {
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

    const details = document.createElement('p');
    if (formatServiceDate(entry?.date) !== 'Дата не указана') {
      const date = document.createElement('time');
      date.dateTime = entry.date;
      date.textContent = formatServiceDate(entry.date);
      details.append(date);
    } else {
      details.append(document.createTextNode('Дата не указана'));
    }
    details.append(document.createTextNode(` · ${entry?.type ?? 'Тип не указан'}`));
    text.append(title, details);

    const price = document.createElement('p');
    price.className = 'entry-card__price';
    const value = Number(entry?.amount);
    if (Number.isFinite(value) && value >= 0) {
      const data = document.createElement('data');
      data.value = String(value);
      data.textContent = `${value.toLocaleString('ru-RU')} ₽`;
      price.append(data);
    } else {
      price.textContent = 'Стоимость не указана';
    }

    card.append(marker, text, price);
    item.append(card);
    list.append(item);
  }
  return list;
}

/** FE-023: главная использует актуальные записи расходов и ближайший план ТО. */
export function renderHomePage() {
  const template = document.getElementById('home-page-template');
  if (!template) throw new Error('Не найден шаблон главной страницы');

  const page = template.content.cloneNode(true);
  const link = page.querySelector('.page-heading .button');
  link.replaceWith(createButton({ label: 'Добавить запись +', href: '#/journal/new' }));

  // Читаем журнал единожды: и сводка расходов, и последние события согласованы.
  const stored = readEntries();
  const car = readCar();
  mountHomeCarCard(page.querySelector('#car'), car);
  const upcoming = mountUpcomingMaintenance(page.querySelector('#maintenance'), {
    plansResult: readPlans(), carResult: car,
  });
  mountExpenseOverview(page.querySelector('#expenses'), stored, {
    activeMaintenanceCount: upcoming.ok ? upcoming.activeCount : null,
  });

  // FE-013: поля на главной открывают результаты поиска в полном журнале.
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

  // FE-014: никаких фиктивных записей. При каждом открытии читаем актуальный журнал.
  const preview = page.querySelector('#history .entry-list');
  if (!stored.ok) {
    preview.replaceWith(createEmptyState({
      title: 'История недоступна',
      description: 'Не удалось прочитать сохранённые записи. Данные не удалены.',
    }));
  } else if (stored.data.length === 0) {
    const empty = createEmptyState({
      title: 'Пока нет записей',
      description: 'Добавьте первое ТО, ремонт, замену детали или покупку.',
    });
    empty.append(createButton({ label: 'Добавить запись', href: '#/journal/new' }));
    preview.replaceWith(empty);
  } else {
    preview.replaceWith(createRecentServiceEntriesList(stored.data));
  }
  return page;
}
