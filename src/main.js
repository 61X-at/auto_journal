import { renderHomePage } from './pages/HomePage.js';
import { renderCarPage } from './pages/CarPage.js';
import { renderJournalPage } from './pages/JournalPage.js';
import { renderMaintenancePage } from './pages/MaintenancePage.js';

/** FE-004: навигация по разделам без перезагрузки страницы и данных. */
const routes = {
  home: { title: 'Обзор автомобиля', render: renderHomePage },
  car: { title: 'Автомобиль', render: renderCarPage },
  journal: { title: 'Журнал обслуживания', render: renderJournalPage },
  maintenance: { title: 'План ТО', render: renderMaintenancePage },
};

const main = document.getElementById('main-content');
const navigationLinks = [...document.querySelectorAll('.nav-list .nav-link')];

function getCurrentRoute() {
  const route = window.location.hash.replace(/^#\//, '');
  return Object.hasOwn(routes, route) ? route : 'home';
}

function renderRoute() {
  const current = getCurrentRoute();
  const route = routes[current];

  main.replaceChildren(route.render());
  document.title = `АвтоЖурнал — ${route.title}`;

  for (const link of navigationLinks) {
    const isActive = link.getAttribute('href') === `#/${current}`;
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
