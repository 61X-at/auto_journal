import { pageFragment } from './pageFragment.js';

/** FE-004: каркас журнала. Поиск и CRUD будут реализованы в отдельных задачах. */
export function renderJournalPage() {
  return pageFragment(`
    <header class="page-heading">
      <div class="page-heading__text">
        <p class="eyebrow">Мой автомобиль / История</p>
        <h1>Журнал обслуживания</h1>
        <p>История выполненных работ и покупок.</p>
      </div>
    </header>
    <section class="section section--single" aria-labelledby="journal-page-heading">
      <h2 id="journal-page-heading" class="section-heading">Последние события</h2>
      <ul class="entry-list">
        <li>
          <article class="entry-card">
            <span class="entry-icon" aria-hidden="true">✦</span>
            <div class="entry-card__text">
              <h3>Замена масла и фильтра</h3>
              <p><time datetime="2026-09-15">15.09.2026</time> · ТО · 85 000 км</p>
            </div>
            <p class="entry-card__price">7 500 ₽</p>
          </article>
        </li>
        <li>
          <article class="entry-card">
            <span class="entry-icon" aria-hidden="true">✦</span>
            <div class="entry-card__text">
              <h3>Замена тормозных колодок</h3>
              <p><time datetime="2026-08-10">10.08.2026</time> · Замена детали · 83 500 км</p>
            </div>
            <p class="entry-card__price">4 000 ₽</p>
          </article>
        </li>
      </ul>
      <p class="placeholder-note">Это примеры записей. Добавление, редактирование, поиск и фильтрация появятся в следующих задачах backlog.</p>
    </section>
  `);
}
