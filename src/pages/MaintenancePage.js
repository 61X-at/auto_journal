import { pageFragment } from './pageFragment.js';
import { createButton } from '../components/Button.js';
import { createEmptyState } from '../components/EmptyState.js';
import { createErrorNotice } from '../components/ErrorNotice.js';
import { createSuccessNotice } from '../components/SuccessNotice.js';
import { createFormField, setFieldError } from '../components/FormField.js';
import { createMaintenancePlan, validateMaintenancePlan } from '../models/maintenancePlan.js';
import { validateCar } from '../models/car.js';
import { getMaintenanceDueStatus } from '../utils/maintenanceDue.js';
import { readCar, readPlans, savePlans } from '../storage/localStorage.js';

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
  form.setAttribute('aria-describedby', 'maintenance-form-required-note');
  form.hidden = true;
  const requiredNote = document.createElement('p');
  requiredNote.id = 'maintenance-form-required-note';
  requiredNote.className = 'form-required-note';
  requiredNote.textContent = 'Поле со знаком * обязательно. Для срока ТО укажите дату или пробег (можно оба).';

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
  form.append(fields, requiredNote, actions, feedback);
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

/**
 * FE-022: делит планы на активные и выполненные, сохраняя их исходный порядок.
 * Требующие внимания определяются по расчёту FE-021, а не отдельным полем в storage.
 */
export function groupMaintenancePlans(plans, options = {}) {
  if (!Array.isArray(plans)) throw new TypeError('Ожидается массив плановых работ.');
  const active = [];
  const completed = [];
  const invalid = [];
  for (const plan of plans) {
    const validated = validateMaintenancePlan(plan);
    if (!validated.ok) {
      invalid.push(plan);
      continue;
    }
    const due = getMaintenanceDueStatus(validated.data, options);
    const row = { plan: validated.data, due };
    if (due.state === 'done') completed.push(row);
    else active.push(row);
  }
  return { active, completed, invalid };
}

/**
 * Отмечает один план выполненным. Не добавляет ServiceEntry и не меняет другие хранилища.
 * Защищает от потери истории при повреждении JSON, дубле ID и ошибке записи.
 */
export function markMaintenancePlanDone(id, options = {}) {
  if (typeof id !== 'string' || !id.trim()) {
    return { ok: false, status: 'invalid_id', message: 'Не удалось определить плановую работу.' };
  }
  const existing = readPlans(options);
  if (!existing.ok) return { ok: false, status: existing.status, message: existing.message };

  const matches = existing.data.filter(plan => plan && plan.id === id);
  if (matches.length !== 1) {
    return {
      ok: false, status: matches.length ? 'duplicate_id' : 'not_found',
      message: matches.length ? 'Найдено несколько работ с одинаковым ID. Изменения не сохранены.' : 'Плановая работа не найдена.',
    };
  }
  const validation = validateMaintenancePlan(matches[0]);
  if (!validation.ok) {
    return { ok: false, status: 'invalid_plan', message: 'Запись содержит некорректные данные. Статус не изменён.' };
  }
  if (validation.data.status === 'done') {
    return { ok: true, status: 'already_done', data: validation.data };
  }
  const updated = existing.data.map(plan => plan.id === id ? { ...plan, status: 'done' } : plan);
  const saved = savePlans(updated, options);
  if (!saved.ok) return { ok: false, status: saved.status, message: saved.message };
  return { ok: true, status: 'saved', data: updated.find(plan => plan.id === id) };
}

/** Одна переиспользуемая разметка для активной и выполненной истории. */
export function createMaintenancePlanList(plans, { currentMileage = null, today = new Date(), onMarkDone } = {}) {
  if (!plans.length) {
    return createEmptyState({
      title: 'План ТО пока пуст',
      description: 'Добавьте первую работу с датой или контрольным пробегом.',
    });
  }
  const list = document.createElement('ul');
  list.className = 'maintenance-plan-list';
  for (const plan of plans) {
    const validated = validateMaintenancePlan(plan);
    // Повреждённая отдельная запись не должна аварийно закрывать весь экран.
    if (!validated.ok) continue;
    const state = getMaintenanceDueStatus(validated.data, { currentMileage, today });
    const item = document.createElement('li');
    const article = document.createElement('article');
    article.className = 'plan-item';
    const info = document.createElement('div');
    const heading = document.createElement('h3');
    heading.textContent = validated.data.title;
    const details = document.createElement('p');
    const points = [];
    if (validated.data.dueDate) points.push(`Дата: ${formatDate(validated.data.dueDate)}`);
    if (validated.data.dueMileage !== null) {
      points.push(`Пробег: ${validated.data.dueMileage.toLocaleString('ru-RU')} км`);
    }
    details.textContent = points.join(' · ');
    info.append(heading, details);

    const badge = document.createElement('span');
    badge.className = `status status--${state.state === 'due' ? 'attention' : state.state}`;
    badge.textContent = state.state === 'done' ? 'Выполнено' : state.state === 'due' ? 'Требует внимания' : 'Запланировано';
    if (state.needsAttention) {
      const icon = document.createElement('span');
      icon.textContent = '⚠';
      icon.setAttribute('aria-hidden', 'true');
      icon.className = 'status__icon';
      badge.prepend(icon);
    }
    article.append(info, badge);
    if (state.state !== 'done' && typeof onMarkDone === 'function' && validated.data.id) {
      const actions = document.createElement('div');
      actions.className = 'maintenance-plan__actions';
      const done = createButton({ label: 'Выполнено', variant: 'secondary' });
      done.setAttribute('aria-label', `Отметить выполненной: ${validated.data.title}`);
      done.addEventListener('click', () => onMarkDone(validated.data.id));
      actions.append(done);
      article.append(actions);
    }
    item.append(article);
    list.append(item);
  }
  return list;
}

/** FE-022: активные и выполненные планы отображаются отдельно. */
export function renderMaintenancePage() {
  const initial = readPlans();
  const car = readCar();
  const validatedCar = car.ok && car.data ? validateCar(car.data) : null;
  const currentMileage = validatedCar?.ok ? validatedCar.data.currentMileage : null;
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
      <h2 id="plan-heading" class="section-heading" tabindex="-1">Активные работы</h2>
      <div id="maintenance-result" aria-live="polite"></div>
      <div id="maintenance-list"></div>
      <div id="maintenance-form-container"></div>
      <section class="maintenance-completed" aria-labelledby="completed-heading">
        <h2 id="completed-heading" class="section-heading">Выполненные работы</h2>
        <div id="maintenance-completed-list"></div>
        <p class="maintenance-plan__hint">Отметка «Выполнено» не создаёт запись в журнале.
          Для учёта фактических работ и стоимости добавьте запись вручную
          в <a href="#/journal/new">журнал обслуживания</a>.</p>
      </section>
    </section>
  `);
  const listHost = page.querySelector('#maintenance-list');
  const completedHost = page.querySelector('#maintenance-completed-list');
  const resultHost = page.querySelector('#maintenance-result');
  const heading = page.querySelector('#plan-heading');
  const addButton = createButton({ label: 'Добавить работу', disabled: !initial.ok });
  addButton.setAttribute('aria-controls', 'maintenance-form');
  addButton.setAttribute('aria-expanded', 'false');
  page.querySelector('#maintenance-add-action').append(addButton);

  const { form, cancel, feedback } = createMaintenanceForm(initial.ok);
  page.querySelector('#maintenance-form-container').append(form);

  function renderLists(plans) {
    const groups = groupMaintenancePlans(plans, { currentMileage });
    listHost.replaceChildren(groups.active.length
      ? createMaintenancePlanList(groups.active.map(row => row.plan), { currentMileage, onMarkDone: completeWork })
      : createEmptyState({
        title: 'Активных работ нет',
        description: 'Добавьте план ТО или посмотрите историю выполненных работ ниже.',
      }));
    completedHost.replaceChildren(groups.completed.length
      ? createMaintenancePlanList(groups.completed.map(row => row.plan), { currentMileage })
      : createEmptyState({
        title: 'Выполненных работ пока нет',
        description: 'Когда вы отметите план как выполненный, он появится здесь.',
      }));
    if (groups.invalid.length) {
      resultHost.append(createErrorNotice('Некоторые записи плана ТО имеют некорректные данные и не отображаются. Они не были удалены.'));
    }
    if (currentMileage === null && groups.active.some(({ plan }) => plan.dueMileage !== null)) {
      const notice = document.createElement('p');
      notice.className = 'maintenance-plan__hint';
      notice.textContent = 'Текущий пробег не указан. Сроки по пробегу будут проверяться после заполнения карточки автомобиля.';
      listHost.append(notice);
    }
  }

  function completeWork(id) {
    resultHost.replaceChildren();
    const response = markMaintenancePlanDone(id);
    if (!response.ok) {
      resultHost.append(createErrorNotice(response.message));
      return;
    }
    const latest = readPlans();
    if (!latest.ok) {
      resultHost.append(createErrorNotice(latest.message));
      return;
    }
    renderLists(latest.data);
    resultHost.append(createSuccessNotice(
      'Работа отмечена как выполненная. Фактические работы и расходы можно добавить в журнал вручную.',
    ));
    heading.focus();
  }

  if (initial.ok) {
    renderLists(initial.data);
  } else {
    listHost.replaceChildren(createEmptyState({
      title: 'Не удалось загрузить план ТО',
      description: 'Сохранённые данные не были удалены или перезаписаны.',
    }));
    completedHost.replaceChildren();
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
    const latest = readPlans();
    if (!latest.ok) {
      feedback.append(createErrorNotice(latest.message));
      return;
    }
    renderLists(latest.data);
    form.reset();
    showMaintenanceFormErrors(form);
    form.hidden = true;
    addButton.setAttribute('aria-expanded', 'false');
    resultHost.append(createSuccessNotice('Плановая работа сохранена.'));
    heading.focus();
  });

  return page;
}
