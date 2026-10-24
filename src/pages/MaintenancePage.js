import { pageFragment } from './pageFragment.js';

/** FE-004: каркас плана ТО. Сохранение и статусы сроков — отдельные задачи. */
export function renderMaintenancePage() {
  return pageFragment(`
    <header class="page-heading">
      <div class="page-heading__text">
        <p class="eyebrow">Мой автомобиль / Планирование</p>
        <h1>План ТО</h1>
        <p>Предстоящие работы и контрольные сроки обслуживания.</p>
      </div>
    </header>
    <section class="section section--single" aria-labelledby="plan-heading">
      <h2 id="plan-heading" class="section-heading">Запланированные работы</h2>
      <article class="plan-item">
        <div>
          <h3>Замена моторного масла</h3>
          <p>Контрольный пробег: 90 000 км</p>
        </div>
        <span class="status status--soon">Запланировано</span>
      </article>
      <p class="placeholder-note">Это пример плановой работы. Создание, изменение и отметка выполнения появятся в задачах планирования ТО.</p>
    </section>
  `);
}
