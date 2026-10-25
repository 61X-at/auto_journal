import { pageFragment } from './pageFragment.js';
import { createButton } from '../components/Button.js';
import { createFormField, setFieldError } from '../components/FormField.js';
import { createErrorNotice } from '../components/ErrorNotice.js';
import { SERVICE_ENTRY_TYPES, createServiceEntry } from '../models/serviceEntry.js';
import { readEntries, saveEntries } from '../storage/localStorage.js';
import { setFlashNotice } from '../utils/flashNotice.js';

const FIELD_IDS = Object.freeze({
  type: 'new-entry-type',
  date: 'new-entry-date',
  mileage: 'new-entry-mileage',
  description: 'new-entry-description',
  amount: 'new-entry-amount',
});

/**
 * FE-010: одна атомарная операция «проверить → прочитать массив → добавить → записать».
 * Повреждённый JSON не перезаписывается; при ошибке сохранения возвращается причина.
 * Переданный storage нужен для изолированных тестов, в браузере не используется.
 */
export function saveNewServiceEntry(raw, options = {}) {
  const result = createServiceEntry(raw);
  if (!result.ok) {
    return { ok: false, status: 'validation_error', errors: result.errors,
      message: 'Исправьте ошибки в отмеченных полях.' };
  }

  const existing = readEntries(options);
  if (!existing.ok) {
    return { ok: false, status: existing.status, errors: {}, message: existing.message };
  }
  // Не меняем исходный массив: запись создаётся только после успешного сохранения.
  const saved = saveEntries([...existing.data, result.data], options);
  if (!saved.ok) {
    return { ok: false, status: saved.status, errors: {}, message: saved.message };
  }
  return { ok: true, status: 'saved', data: result.data, errors: {} };
}

function localDateISO() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Общая форма для создания и редактирования записи (FE-010 / FE-012). */
export function createServiceEntryForm(readable, { entry = null } = {}) {
  const form = document.createElement('form');
  form.id = entry ? 'edit-service-entry-form' : 'new-service-entry-form';
  form.className = 'service-form';
  form.noValidate = true;
  form.setAttribute('aria-label', entry ? 'Редактирование записи обслуживания' : 'Новая запись обслуживания');
  form.setAttribute('aria-describedby', 'service-form-required-note');
  const requiredNote = document.createElement('p');
  requiredNote.id = 'service-form-required-note';
  requiredNote.className = 'form-required-note';
  requiredNote.textContent = 'Поля со знаком * обязательны для заполнения.';

  const fields = document.createElement('div');
  fields.className = 'service-form__fields';
  fields.append(
    createFormField({
      id: FIELD_IDS.type, name: 'type', label: 'Тип события', type: 'select',
      required: true, value: entry?.type ?? '', disabled: !readable, options: [
        { value: '', label: 'Выберите тип события' },
        ...SERVICE_ENTRY_TYPES.map((type) => ({ value: type, label: type === 'ТО' ? 'ТО' : type[0].toUpperCase() + type.slice(1) })),
      ],
    }),
    createFormField({ id: FIELD_IDS.date, name: 'date', label: 'Дата', type: 'date',
      required: true, value: entry?.date ?? localDateISO(), disabled: !readable }),
    createFormField({ id: FIELD_IDS.mileage, name: 'mileage', label: 'Пробег, км', type: 'number',
      min: 0, step: 1, required: true, value: entry?.mileage ?? '', placeholder: '85000', disabled: !readable }),
    createFormField({ id: FIELD_IDS.description, name: 'description', label: 'Описание',
      required: true, value: entry?.description ?? '', placeholder: 'Например, замена моторного масла и фильтра', disabled: !readable }),
    createFormField({ id: FIELD_IDS.amount, name: 'amount', label: 'Стоимость, ₽', type: 'number',
      min: 0, step: 'any', required: true, value: entry?.amount ?? '', placeholder: '7500', disabled: !readable }),
  );
  const actions = document.createElement('div');
  actions.className = 'service-form__actions';
  actions.append(
    createButton({ label: entry ? 'Сохранить изменения' : 'Сохранить запись', type: 'submit', disabled: !readable }),
    createButton({ label: 'Отмена', variant: 'secondary', href: '#/journal' }),
  );
  const feedback = document.createElement('div');
  feedback.className = 'service-form__feedback';
  feedback.setAttribute('aria-live', 'polite');
  form.append(fields, requiredNote, actions, feedback);
  return { form, feedback };
}

export function readServiceEntryFormValues(form) {
  return Object.fromEntries(Object.entries(FIELD_IDS).map(
    ([key, id]) => [key, form.querySelector(`#${id}`).value],
  ));
}

export function showServiceEntryErrors(form, errors) {
  for (const [name, id] of Object.entries(FIELD_IDS)) {
    const field = form.querySelector(`#${id}`).closest('.form-field');
    setFieldError(field, errors[name] || '');
  }
}

/** Реальная форма новой записи, вызываемая из главной и журнала. */
export function renderNewServiceEntryPage() {
  const available = readEntries();
  const page = pageFragment(`
    <header class="page-heading">
      <div class="page-heading__text">
        <p class="eyebrow">Мой автомобиль / Журнал / Новая запись</p>
        <h1>Добавить запись</h1>
        <p>Сохраните информацию о ТО, ремонте, замене детали или покупке.</p>
      </div>
    </header>
    <section class="section section--single" aria-labelledby="new-entry-heading">
      <h2 id="new-entry-heading" class="section-heading">Сведения о событии</h2>
      <div id="new-entry-container"></div>
    </section>
  `);
  const { form, feedback } = createServiceEntryForm(available.ok);
  page.querySelector('#new-entry-container').append(form);
  if (!available.ok) {
    feedback.append(createErrorNotice('Хранилище недоступно или содержит повреждённые данные. Добавление записи заблокировано во избежание потери истории.'));
  }
  form.addEventListener('input', () => feedback.replaceChildren());
  form.addEventListener('change', () => feedback.replaceChildren());
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!available.ok) return;

    const result = saveNewServiceEntry(readServiceEntryFormValues(form));
    showServiceEntryErrors(form, result.errors || {});
    feedback.replaceChildren();
    if (!result.ok) {
      feedback.append(createErrorNotice(result.message));
      if (result.status === 'validation_error') {
        form.querySelector('[aria-invalid="true"]')?.focus();
      }
      return;
    }
    // На странице журнала показываем одно подтверждение, не сохраняем его в localStorage.
    setFlashNotice('journal', 'Запись обслуживания сохранена.');
    window.location.hash = '#/journal';
  });
  return page;
}
