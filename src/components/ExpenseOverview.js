/**
 * FE-017 — сводка расходов на главной и выбор периода.
 * Только отображает результаты чистых расчётов FE-016; не сохраняет итоги.
 */
import { createSummaryCard } from './SummaryCard.js';
import { createFormField, setFieldError } from './FormField.js';
import { createEmptyState } from './EmptyState.js';
import { calculateExpenseSummary } from '../utils/expenses.js';
import { SERVICE_ENTRY_TYPES } from '../models/serviceEntry.js';

export const CATEGORY_LABELS = Object.freeze({
  'ТО': 'Техническое обслуживание',
  'ремонт': 'Ремонт',
  'замена детали': 'Замена деталей',
  'покупка': 'Покупки',
});

const rubles = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });
export const formatExpenseRubles = value => `${rubles.format(value)} ₽`;

/** Проверяем введённые границы с помощью единой логики FE-016. */
export function validateExpensePeriod(period) {
  try {
    calculateExpenseSummary([], period);
    return { ok: true, errors: {} };
  } catch (error) {
    const message = String(error.message || 'Проверьте выбранный период.');
    const field = message.startsWith('startDate:') ? 'startDate' : 'endDate';
    return { ok: false, errors: { [field]: message.includes('раньше даты окончания') || message.includes('не позже')
      ? 'Дата окончания не может быть раньше даты начала.'
      : 'Проверьте указанную дату.' } };
  }
}

/** Формирует результат для UI, не изменяя записи и не записывая сумму в localStorage. */
export function prepareExpenseOverview(entries, period = {}) {
  const summary = calculateExpenseSummary(entries, period);
  return {
    ...summary,
    hasEventsInPeriod: summary.total > 0 || entries.some(entry =>
      (!period.startDate || entry.date >= period.startDate) &&
      (!period.endDate || entry.date <= period.endDate)),
    recordCount: entries.length,
  };
}

function createCategoryBreakdown(details, byCategory, emptyHint) {
  const summary = document.createElement('summary');
  summary.textContent = 'Расходы по категориям';

  const list = document.createElement('ul');
  for (const type of SERVICE_ENTRY_TYPES) {
    const item = document.createElement('li');
    const title = document.createElement('span');
    title.textContent = CATEGORY_LABELS[type];
    const value = document.createElement('strong');
    value.textContent = formatExpenseRubles(byCategory[type]);
    item.append(title, value);
    list.append(item);
  }
  const explanation = document.createElement('p');
  explanation.className = 'expense-breakdown__note';
  explanation.textContent = emptyHint || 'Суммы рассчитаны по сохранённым записям журнала.';
  details.replaceChildren(summary, list, explanation);
}

/**
 * Подключается только на главной: фильтрация не меняет записи и не затрагивает журнал.
 * { ok:false } означает недоступное/повреждённое хранилище, а не нулевые расходы.
 */
export function mountExpenseOverview(section, stored, { activeMaintenanceCount = 0 } = {}) {
  const cards = section.querySelector('.summary-grid');
  const details = section.querySelector('.expense-breakdown');
  if (!cards || !details) throw new Error('Отсутствует разметка сводки расходов');

  if (!stored.ok) {
    cards.replaceChildren(createEmptyState({
      title: 'Расходы недоступны',
      description: 'Не удалось прочитать журнал. Сохранённые данные не изменены.',
    }));
    details.remove();
    return;
  }

  const form = document.createElement('form');
  form.className = 'expense-period-form';
  form.setAttribute('aria-label', 'Выбор периода расходов');
  form.noValidate = true;
  const start = createFormField({ id: 'expense-start-date', name: 'startDate', label: 'С даты', type: 'date' });
  const end = createFormField({ id: 'expense-end-date', name: 'endDate', label: 'По дату', type: 'date' });
  const startInput = start.querySelector('input');
  const endInput = end.querySelector('input');
  const actions = document.createElement('div');
  actions.className = 'expense-period-form__actions';
  const apply = document.createElement('button');
  apply.className = 'button button--primary';
  apply.type = 'submit';
  apply.textContent = 'Показать';
  const clear = document.createElement('button');
  clear.className = 'button button--secondary';
  clear.type = 'button';
  clear.textContent = 'Сбросить';
  actions.append(apply, clear);
  form.append(start, end, actions);
  cards.before(form);

  const feedback = document.createElement('p');
  feedback.className = 'expense-period-feedback';
  feedback.setAttribute('aria-live', 'polite');
  form.after(feedback);

  const showSummary = period => {
    const result = prepareExpenseOverview(stored.data, period);
    const periodHint = period.startDate || period.endDate ? 'За выбранный период' : 'За всё время';
    cards.replaceChildren(
      createSummaryCard({
        label: 'Всего расходов', value: formatExpenseRubles(result.total),
        numericValue: result.total, hint: periodHint, icon: '₽',
      }),
      createSummaryCard({
        label: 'Записей в журнале', value: String(result.recordCount),
        numericValue: result.recordCount, hint: 'Всего сохранённых записей', icon: '≡',
      }),
      createSummaryCard({
        label: 'Активных работ ТО', value: activeMaintenanceCount === null ? '—' : String(activeMaintenanceCount),
        hint: activeMaintenanceCount === null ? 'План ТО недоступен' : 'В плане обслуживания', icon: '▣',
      }),
    );
    const noEvents = !result.hasEventsInPeriod;
    const emptyHint = noEvents
      ? (stored.data.length ? 'За выбранный период записей нет — расходы составляют 0 ₽.' : 'В журнале пока нет записей — расходы составляют 0 ₽.')
      : '';
    createCategoryBreakdown(details, result.byCategory, emptyHint);
    feedback.textContent = emptyHint;
    feedback.classList.toggle('expense-period-feedback--empty', noEvents);
  };

  function resetErrors() {
    setFieldError(start, '');
    setFieldError(end, '');
  }

  form.addEventListener('submit', event => {
    event.preventDefault();
    resetErrors();
    const period = { startDate: startInput.value, endDate: endInput.value };
    const checked = validateExpensePeriod(period);
    if (!checked.ok) {
      if (checked.errors.startDate) setFieldError(start, checked.errors.startDate);
      if (checked.errors.endDate) setFieldError(end, checked.errors.endDate);
      (checked.errors.startDate ? startInput : endInput).focus();
      return;
    }
    try {
      feedback.classList.remove('expense-period-feedback--error');
      showSummary(period);
    } catch {
      feedback.textContent = 'Не удалось рассчитать расходы. Проверьте сохранённые записи журнала.';
      feedback.classList.add('expense-period-feedback--error');
    }
  });
  clear.addEventListener('click', () => {
    startInput.value = '';
    endInput.value = '';
    resetErrors();
    feedback.classList.remove('expense-period-feedback--error');
    showSummary({});
  });

  try {
    showSummary({});
  } catch {
    // FE-016 отклоняет некорректные события: не показываем выдуманную нулевую сумму.
    cards.replaceChildren(createEmptyState({
      title: 'Не удалось рассчитать расходы',
      description: 'Проверьте данные сохранённых записей; исходные данные не изменены.',
    }));
    details.remove();
    form.remove();
    feedback.remove();
  }
}
