import { pageFragment } from './pageFragment.js';
import { createDemoForm } from '../components/DemoForm.js';

/** FE-004: каркас раздела «Автомобиль». Редактирование — задача FE-007/FE-008. */
export function renderCarPage() {
  const page = pageFragment(`
    <header class="page-heading">
      <div class="page-heading__text">
        <p class="eyebrow">Мой автомобиль / Профиль</p>
        <h1>Автомобиль</h1>
        <p>Основные сведения об автомобиле и текущем пробеге.</p>
      </div>
    </header>
    <section class="section section--single" aria-labelledby="car-profile-heading">
      <h2 id="car-profile-heading" class="section-heading">Карточка автомобиля</h2>
      <article class="profile-card">
        <h3>Lada Vesta</h3>
        <dl class="profile-list">
          <div><dt>Марка</dt><dd>Lada</dd></div>
          <div><dt>Модель</dt><dd>Vesta</dd></div>
          <div><dt>Год выпуска</dt><dd>2021</dd></div>
          <div><dt>Пробег</dt><dd>86 200 км</dd></div>
        </dl>
      </article>
      <p class="placeholder-note">Данные демонстрационные. Редактирование карточки появится в задачах FE-007 и FE-008.</p>
      <details class="component-example">
        <summary>Проверить общий компонент формы (FE-005)</summary>
        <p class="component-example__note">Демонстрационная проверка полей без сохранения изменений.</p>
        <div id="car-form-demo"></div>
      </details>
    </section>
  `);
  page.querySelector('#car-form-demo').append(createDemoForm({
    id: 'car-component-demo',
    fields: [
      { id: 'car-demo-brand', label: 'Марка автомобиля', required: true, placeholder: 'Например, Lada' },
      { id: 'car-demo-mileage', label: 'Текущий пробег, км', type: 'number', min: 0, required: true, placeholder: '86200' },
    ],
  }));
  return page;
}
