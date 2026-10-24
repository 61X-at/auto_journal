import { pageFragment } from './pageFragment.js';
import { createButton } from '../components/Button.js';
import { createEmptyState } from '../components/EmptyState.js';
import { createErrorNotice } from '../components/ErrorNotice.js';
import { createFormField, setFieldError } from '../components/FormField.js';
import { validateCar, MIN_CAR_YEAR } from '../models/car.js';
import { readCar, saveCar } from '../storage/localStorage.js';

const INPUT_IDS = Object.freeze({
  brand: 'car-brand',
  model: 'car-model',
  year: 'car-year',
  currentMileage: 'car-mileage',
});

/**
 * FE-008: единый сценарий проверки и сохранения карточки.
 * При неверных полях или ошибке localStorage существующая запись не изменяется.
 * options.storage служит только для тестов.
 */
export function saveCarFormData(raw, options = {}) {
  const validation = validateCar(raw);
  if (!validation.ok) {
    return {
      ok: false,
      status: 'validation_error',
      errors: validation.errors,
      message: 'Исправьте ошибки в отмеченных полях.',
    };
  }
  const saved = saveCar(validation.data, options);
  if (!saved.ok) {
    return { ok: false, status: saved.status, errors: {}, message: saved.message };
  }
  return { ok: true, status: 'saved', data: validation.data, errors: {} };
}

function createProfile(car) {
  const article = document.createElement('article');
  article.className = 'profile-card';
  const heading = document.createElement('h3');
  heading.textContent = `${car.brand} ${car.model}`;
  const info = document.createElement('dl');
  info.className = 'profile-list';

  for (const [label, value] of [
    ['Марка', car.brand],
    ['Модель', car.model],
    ['Год выпуска', car.year],
    ['Пробег', `${car.currentMileage.toLocaleString('ru-RU')} км`],
  ]) {
    const row = document.createElement('div');
    const term = document.createElement('dt');
    term.textContent = label;
    const description = document.createElement('dd');
    description.textContent = String(value);
    row.append(term, description);
    info.append(row);
  }
  article.append(heading, info);
  return article;
}

function renderProfile(host, car, readable) {
  if (!readable) {
    host.replaceChildren(createEmptyState({
      title: 'Карточка недоступна',
      description: 'Сохранённые данные не прочитаны. Исправьте проблему с хранилищем перед редактированием.',
    }));
  } else if (!car) {
    host.replaceChildren(createEmptyState({
      title: 'Автомобиль ещё не добавлен',
      description: 'Заполните форму ниже, чтобы создать карточку одного автомобиля.',
    }));
  } else {
    host.replaceChildren(createProfile(car));
  }
}

function createCarForm(initial, readable) {
  const form = document.createElement('form');
  form.className = 'car-form';
  form.id = 'car-profile-form';
  form.noValidate = true;
  form.setAttribute('aria-label', 'Сведения об автомобиле');

  const grid = document.createElement('div');
  grid.className = 'car-form__fields';
  const fields = [
    { name: 'brand', label: 'Марка', placeholder: 'Например, Lada' },
    { name: 'model', label: 'Модель', placeholder: 'Например, Vesta' },
    { name: 'year', label: 'Год выпуска', type: 'number', min: MIN_CAR_YEAR,
      max: new Date().getFullYear() + 1, placeholder: '2021' },
    { name: 'currentMileage', label: 'Текущий пробег, км', type: 'number',
      min: 0, placeholder: '86200', helpText: 'Пробег указывается целым числом.' },
  ];

  for (const field of fields) {
    const value = initial?.[field.name];
    grid.append(createFormField({
      id: INPUT_IDS[field.name], name: field.name,
      label: field.label, type: field.type || 'text', required: true,
      min: field.min, max: field.max, placeholder: field.placeholder,
      helpText: field.helpText || '', value: value == null ? '' : String(value),
      disabled: !readable,
    }));
  }
  const actions = document.createElement('div');
  actions.className = 'car-form__actions';
  const submit = createButton({ label: initial ? 'Сохранить изменения' : 'Сохранить автомобиль', type: 'submit', disabled: !readable });
  actions.append(submit);
  const feedback = document.createElement('div');
  feedback.className = 'car-form__feedback';
  feedback.setAttribute('aria-live', 'polite');
  form.append(grid, actions, feedback);
  return { form, submit, feedback };
}

/** Экран одного автомобиля. Создание и редактирование с сохранением в FE-006. */
export function renderCarPage() {
  const stored = readCar();
  const validated = stored.ok && stored.data !== null ? validateCar(stored.data) : null;
  const initial = stored.ok ? stored.data : null;
  const page = pageFragment(`
    <header class="page-heading">
      <div class="page-heading__text">
        <p class="eyebrow">Мой автомобиль / Профиль</p>
        <h1>Автомобиль</h1>
        <p>Создайте карточку машины и обновляйте текущий пробег.</p>
      </div>
    </header>
    <section class="section section--single" aria-labelledby="car-profile-heading">
      <h2 id="car-profile-heading" class="section-heading">Карточка автомобиля</h2>
      <div id="car-profile-content"></div>
      <h2 id="car-form-heading" class="section-heading car-form__heading">Данные автомобиля</h2>
      <div id="car-form-container"></div>
    </section>
  `);
  const profileHost = page.querySelector('#car-profile-content');
  const formHost = page.querySelector('#car-form-container');
  renderProfile(profileHost, validated?.ok ? validated.data : null, stored.ok);

  const { form, submit, feedback } = createCarForm(initial, stored.ok);
  formHost.append(form);

  if (stored.ok && validated && !validated.ok) {
    feedback.append(createErrorNotice('Сохранённая карточка содержит некорректные значения. Исправьте поля и сохраните её заново.'));
  }
  if (!stored.ok) {
    feedback.append(createErrorNotice('Сохранение отключено, чтобы случайно не перезаписать недоступные или повреждённые данные.'));
  }

  form.addEventListener('input', () => feedback.replaceChildren());
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!stored.ok) return;
    const raw = Object.fromEntries(
      Object.entries(INPUT_IDS).map(([name, id]) => [name, form.querySelector(`#${id}`).value]),
    );
    const result = saveCarFormData(raw);
    feedback.replaceChildren();
    for (const [name, id] of Object.entries(INPUT_IDS)) {
      const field = form.querySelector(`#${id}`).closest('.form-field');
      setFieldError(field, result.errors?.[name] || '');
    }
    if (!result.ok) {
      feedback.append(createErrorNotice(result.message));
      if (result.status === 'validation_error') {
        const firstInvalid = form.querySelector('input[aria-invalid="true"]');
        firstInvalid?.focus();
      }
      return;
    }

    renderProfile(profileHost, result.data, true);
    for (const [name, id] of Object.entries(INPUT_IDS)) {
      form.querySelector(`#${id}`).value = String(result.data[name]);
    }
    submit.textContent = 'Сохранить изменения';
    const success = document.createElement('p');
    success.className = 'car-form__success';
    success.setAttribute('role', 'status');
    success.textContent = 'Карточка автомобиля сохранена.';
    feedback.append(success);
  });
  return page;
}
