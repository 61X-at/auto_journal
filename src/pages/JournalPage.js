import { pageFragment } from './pageFragment.js';
import { createDemoForm } from '../components/DemoForm.js';
import { createEmptyState } from '../components/EmptyState.js';

/** FE-004: каркас журнала. Поиск и CRUD будут реализованы в отдельных задачах. */
export function renderJournalPage() {
  const page = pageFragment(`
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
      <details class="component-example">
        <summary>Проверить общие компоненты формы (FE-005)</summary>
        <p class="component-example__note">Демонстрационная проверка полей без создания записи.</p>
        <div id="journal-form-demo"></div>
      </details>
      <details class="component-example">
        <summary>Посмотреть пустое состояние списка (FE-005)</summary>
        <div id="journal-empty-demo"></div>
      </details>
    </section>
  `);
  page.querySelector('#journal-form-demo').append(createDemoForm({
    id: 'journal-component-demo',
    fields: [
      { id: 'journal-demo-title', label: 'Описание работы', required: true, placeholder: 'Например, замена масла' },
      { id: 'journal-demo-amount', label: 'Стоимость, ₽', type: 'number', min: 0, required: true, placeholder: '7500' },
    ],
  }));
  page.querySelector('#journal-empty-demo').append(createEmptyState({
    title: 'Записей пока нет',
    description: 'После добавления первой записи она будет отображаться в этом разделе.',
  }));
  return page;
}
