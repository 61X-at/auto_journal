import { renderHomePage } from './pages/HomePage.js';
import { renderCarPage } from './pages/CarPage.js';
import { renderJournalPage } from './pages/JournalPage.js';
import { renderNewServiceEntryPage } from './pages/NewServiceEntryPage.js';
import { renderEditServiceEntryPage } from './pages/EditServiceEntryPage.js';
import { renderMaintenancePage } from './pages/MaintenancePage.js';
import { readCar, readEntries, readPlans } from './storage/localStorage.js';
import { createErrorNotice } from './components/ErrorNotice.js';
import { createEmptyState } from './components/EmptyState.js';

/** FE-004: навигация по разделам без перезагрузки страницы и данных. */
const routes = {
  home: { title: 'Обзор автомобиля', render: renderHomePage },
  car: { title: 'Автомобиль', render: renderCarPage },
  journal: { title: 'Журнал обслуживания', render: renderJournalPage },
  'journal/new': { title: 'Новая запись обслуживания', render: renderNewServiceEntryPage },
  'journal/edit': { title: 'Редактирование записи', render: () => renderEditServiceEntryPage(getEditId()) },
  maintenance: { title: 'План ТО', render: renderMaintenancePage },
};

const main = document.getElementById('main-content');
const navigationLinks = [...document.querySelectorAll('.nav-list .nav-link')];

function getCurrentRoute() {
  const route = window.location.hash.replace(/^#\//, '');
  if (/^journal\/edit\/[^/]+$/.test(route)) return 'journal/edit';
  return Object.hasOwn(routes, route) ? route : 'home';
}

function getEditId() {
  const encoded = window.location.hash.replace(/^#\/journal\/edit\//, '');
  try { return decodeURIComponent(encoded); } catch { return ''; }
}

// FE-006: показываем ошибку чтения, не отображая демонстрационные данные
// как будто это повреждённые пользовательские записи.
const storageSections = {
  home: ['car', 'entries', 'plans'],
  car: ['car'],
  journal: ['entries'],
  'journal/new': ['entries'],
  'journal/edit': ['entries'],
  maintenance: ['plans'],
};
const storageReaders = { car: readCar, entries: readEntries, plans: readPlans };
const storageNames = { car: 'автомобиля', entries: 'журнала', plans: 'плана ТО' };

function showStorageErrors(current, content) {
  const broken = storageSections[current].filter(type => !storageReaders[type]().ok);
  if (broken.length === 0) return;

  const alert = createErrorNotice(
    `Не удалось прочитать сохранённые данные: ${broken.map(type => storageNames[type]).join(', ')}. ` +
    'Данные не удалены. Проверьте доступ к localStorage или повреждённый JSON.'
  );
  alert.classList.add('storage-warning');
  const heading = content.querySelector('.page-heading');
  if (heading) heading.after(alert);
  else content.prepend(alert);

  const safeState = () => createEmptyState({
    title: 'Данные недоступны',
    description: 'Содержимое хранилища не удалось прочитать. Мы не отображаем повреждённые записи.',
  });

  if (broken.includes('car')) {
    content.querySelector('.car-card, .profile-card')?.replaceWith(safeState());
  }
  if (broken.includes('entries')) {
    content.querySelector('.section--history .entry-list, .section--single .entry-list')?.replaceWith(safeState());
    content.querySelector('.summary-grid')?.replaceChildren(safeState());
    content.querySelector('.expense-breakdown')?.remove();
  }
  if (broken.includes('plans')) {
    content.querySelector('.maintenance-card, .plan-item')?.replaceWith(safeState());
  }
}

function renderRoute() {
  const current = getCurrentRoute();
  const route = routes[current];

  const content = route.render();
  showStorageErrors(current, content);
  main.replaceChildren(content);
  document.title = `АвтоЖурнал — ${route.title}`;

  for (const link of navigationLinks) {
    const isActive = link.getAttribute('href') === `#/${current === 'journal/new' || current === 'journal/edit' ? 'journal' : current}`;
    link.classList.toggle('nav-link--active', isActive);
    if (isActive) {
      link.setAttribute('aria-current', 'page');
    } else {
      link.removeAttribute('aria-current');
    }
  }
}

window.addEventListener('hashchange', () => {
  renderRoute();
  window.scrollTo(0, 0);
  main.focus({ preventScroll: true });
});

renderRoute();
