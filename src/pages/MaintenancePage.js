import { pageFragment } from './pageFragment.js';
import { createButton } from '../components/Button.js';
import { createEmptyState } from '../components/EmptyState.js';
import { createErrorNotice } from '../components/ErrorNotice.js';
import { createFormField, setFieldError } from '../components/FormField.js';
import { createMaintenancePlan } from '../models/maintenancePlan.js';
import { readPlans, savePlans } from '../storage/localStorage.js';

const FIELD_IDS = Object.freeze({
  title: 'maintenance-title',
  dueDate: 'maintenance-date',
  dueMileage: 'maintenance-mileage',
});

/** FE-020: проверка, чтение текущих планов и атомарное добавление одного нового плана. */
export function saveNewMaintenancePlan(raw, options = {}) {
  const created = createMaintenancePlan(raw);
  if (!created.ok) {
    return {
      ok: false, status: 'validation_error', errors: created.errors,
      message: 'Исправьте ошибки в отмеченных полях.',
    };
  }
  const existing = readPlans(options);
  if (!existing.ok) {
    return { ok: false, status: existing.status, errors: {}, message: existing.message };
  }
  const saved = savePlans([...existing.data, created.data], options);
  if (!saved.ok) {
    return { ok: false, status: saved.status, errors: {}, message: saved.message };
  }
  return { ok: true, status: 'saved', errors: {}, data: created.data };
}

/** Использует общие поля FE-005; дата и пробег по отдельности необязательны. */
export function createMaintenanceForm(readable = true) {
  const form = document.createElement('form');
  form.id = 'maintenance-form';
  form.className = 'maintenance-form';
  form.noValidate = true;
  form.setAttribute('aria-label', 'Новая плановая работа');
  form.hidden = true;

  const fields = document.createElement('div');
  fields.className = 'maintenance-form__fields';
  fields.append(
    createFormField({
      id: FIELD_IDS.title, name: 'title', label: 'Название работы', required: true,
      placeholder: 'Например, замена масла', disabled: !readable,
    }),
    createFormField({
      id: FIELD_IDS.dueDate, name: 'dueDate', label: 'Контрольная дата', type: 'date',
      helpText: 'Укажите дату или пробег (можно оба).', disabled: !readable,
    }),
    createFormField({
      id: FIELD_IDS.dueMileage, name: 'dueMileage', label: 'Контрольный пробег, км',
      type: 'number', min: 0, step: 1, placeholder: '120000',
      helpText: 'Достаточно одной контрольной точки.', disabled: !readable,
    }),
  );

  const actions = document.createElement('div');
  actions.className = 'maintenance-form__actions';
  const submit = createButton({ label: 'Сохранить план', type: 'submit', disabled: !readable });
  const cancel = createButton({ label: 'Отмена', variant: 'secondary', type: 'button' });
  actions.append(submit, cancel);
  const feedback = document.createElement('div');
  feedback.className = 'maintenance-form__feedback';
  feedback.setAttribute('aria-live', 'polite');
  form.append(fields, actions, feedback);
  return { form, cancel, feedback };
}

export function readMaintenanceFormValues(form) {
  return Object.fromEntries(
    Object.entries(FIELD_IDS).map(([key, id]) => [key, form.querySelector(`#${id}`).value]),
  );
}

export function showMaintenanceFormErrors(form, errors = {}) {
  for (const [key, id] of Object.entries(FIELD_IDS)) {
    const field = form.querySelector(`#${id}`).closest('.form-field');
    setFieldError(field, errors[key] || '');
  }
}

function formatDate(date) {
  if (!date) return '';
  const [year, month, day] = date.split('-');
  return `${day}.${month}.${year}`;
}

/** FE-020: только базовый список сохранённых работ; статусы сроков и действия — FE-021/022. */
export function createMaintenancePlanList(plans) {
  if (!plans.length) {
    return createEmptyState({
      title: 'План ТО пока пуст',
      description: 'Добавьте первую работу с датой или контрольным пробегом.',
    });
  }
  const list = document.createElement('ul');
  list.className = 'maintenance-plan-list';
  for (const plan of plans) {
    const item = document.createElement('li');
    const article = document.createElement('article');
    article.className = 'plan-item';
    const info = document.createElement('div');
    const heading = document.createElement('h3');
    heading.textContent = String(plan?.title ?? 'Без названия');
    const details = document.createElement('p');
    const points = [];
    if (plan?.dueDate) points.push(`Дата: ${formatDate(plan.dueDate)}`);
    if (plan?.dueMileage !== null && plan?.dueMileage !== undefined) {
      const km = Number(plan.dueMileage);
      points.push(`Пробег: ${Number.isFinite(km) ? km.toLocaleString('ru-RU') : String(plan.dueMileage)} км`);
    }
    details.textContent = points.join(' · ') || 'Контрольная точка не указана';
    info.append(heading, details);
    const badge = document.createElement('span');
    badge.className = 'status';
    badge.textContent = plan?.status === 'done' ? 'Выполнено' : 'Запланировано';
    article.append(info, badge);
    item.append(article);
    list.append(item);
  }
  return list;
}

/** Список + форма на том же экране. После успешного создания возвращаем фокус к списку. */
export function renderMaintenancePage() {
  const initial = readPlans();
  const page = pageFragment(`
    <header class="page-heading">
      <div class="page-heading__text">
        <p class="eyebrow">Мой автомобиль / Планирование</p>
        <h1>План ТО</h1>
        <p>Предстоящие работы и контрольные сроки обслуживания.</p>
      </div>
      <div id="maintenance-add-action"></div>
    </header>
    <section class="section section--single" aria-labelledby="plan-heading">
      <h2 id="plan-heading" class="section-heading" tabindex="-1">Запланированные работы</h2>
      <div id="maintenance-result" aria-live="polite"></div>
      <div id="maintenance-list"></div>
      <div id="maintenance-form-container"></div>
    </section>
  `);
  const listHost = page.querySelector('#maintenance-list');
  const resultHost = page.querySelector('#maintenance-result');
  const heading = page.querySelector('#plan-heading');
  const addButton = createButton({ label: 'Добавить работу', disabled: !initial.ok });
  addButton.setAttribute('aria-controls', 'maintenance-form');
  addButton.setAttribute('aria-expanded', 'false');
  page.querySelector('#maintenance-add-action').append(addButton);

  const { form, cancel, feedback } = createMaintenanceForm(initial.ok);
  page.querySelector('#maintenance-form-container').append(form);

  function renderList(plans) {
    listHost.replaceChildren(createMaintenancePlanList(plans));
  }

  if (initial.ok) {
    renderList(initial.data);
  } else {
    listHost.replaceChildren(createEmptyState({
      title: 'Не удалось загрузить план ТО',
      description: 'Сохранённые данные не были удалены или перезаписаны.',
    }));
    resultHost.append(createErrorNotice(initial.message));
  }

  function toggleForm(open) {
    form.hidden = !open;
    addButton.setAttribute('aria-expanded', String(open));
    if (open) form.querySelector(`#${FIELD_IDS.title}`).focus();
    else addButton.focus();
  }
  addButton.addEventListener('click', () => {
    if (initial.ok) toggleForm(form.hidden);
  });
  cancel.addEventListener('click', () => {
    showMaintenanceFormErrors(form);
    feedback.replaceChildren();
    toggleForm(false);
  });
  form.addEventListener('input', () => feedback.replaceChildren());
  form.addEventListener('change', () => feedback.replaceChildren());
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!initial.ok) return;
    const saved = saveNewMaintenancePlan(readMaintenanceFormValues(form));
    showMaintenanceFormErrors(form, saved.errors);
    feedback.replaceChildren();
    resultHost.replaceChildren();
    if (!saved.ok) {
      feedback.append(createErrorNotice(saved.message));
      if (saved.status === 'validation_error') {
        form.querySelector('[aria-invalid="true"]')?.focus();
      }
      return;
    }
    // Перечитываем данные: на странице отображается именно сохранённый массив.
    const latest = readPlans();
    if (!latest.ok) {
      feedback.append(createErrorNotice(latest.message));
      return;
    }
    renderList(latest.data);
    form.reset();
    showMaintenanceFormErrors(form);
    form.hidden = true;
    addButton.setAttribute('aria-expanded', 'false');
    const message = document.createElement('p');
    message.className = 'maintenance-form__success';
    message.setAttribute('role', 'status');
    message.textContent = 'Плановая работа сохранена.';
    resultHost.append(message);
    heading.focus();
  });

  return page;
}
