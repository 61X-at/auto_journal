/**
 * FE-016 — чистые расчёты расходов по ServiceEntry (FE-009).
 * Не обращается к DOM и localStorage; итоги каждый раз вычисляются из записей.
 */
import { SERVICE_ENTRY_TYPES, validateServiceEntry } from '../models/serviceEntry.js';

/** Проверка дат для границ периода. Пустое значение означает открытую границу. */
function normalizeBoundary(value, field) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new TypeError(`${field}: ожидается дата в формате ГГГГ-ММ-ДД`);
  }
  const checked = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(checked.getTime()) || checked.toISOString().slice(0, 10) !== value) {
    throw new RangeError(`${field}: дата не существует`);
  }
  return value;
}

function normalizePeriod(period) {
  if (period === null || typeof period !== 'object' || Array.isArray(period)) {
    throw new TypeError('Период должен быть объектом { startDate, endDate }');
  }
  const startDate = normalizeBoundary(period.startDate, 'startDate');
  const endDate = normalizeBoundary(period.endDate, 'endDate');
  if (startDate !== null && endDate !== null && startDate > endDate) {
    throw new RangeError('Дата начала периода должна быть не позже даты окончания');
  }
  return { startDate, endDate };
}

/**
 * Общий расчёт: сумма по всем событиям и разбивка по четырём категориям.
 * Обе границы периода включаются. Без периода учитываются все даты.
 *
 * Ожидает массив ServiceEntry из модели FE-009. Неверную запись не пропускает
 * незаметно — сообщает об ошибке, чтобы не показывать ложную сумму.
 * Стоимость округляется для отображения до копеек (2 знака) после суммирования.
 *
 * @param {unknown[]} entries
 * @param {{startDate?: string|null, endDate?: string|null}} [period]
 * @returns {{total: number, byCategory: Record<string,number>}}
 */
export function calculateExpenseSummary(entries, period = {}) {
  if (!Array.isArray(entries)) {
    throw new TypeError('Записи обслуживания должны быть массивом');
  }
  const { startDate, endDate } = normalizePeriod(period);
  const byCategory = Object.fromEntries(SERVICE_ENTRY_TYPES.map(type => [type, 0]));
  let total = 0;

  for (const [index, entry] of entries.entries()) {
    const checked = validateServiceEntry(entry);
    if (!checked.ok) {
      throw new TypeError(`Некорректная запись обслуживания с индексом ${index}`);
    }
    const { date, type, amount } = checked.data;
    if ((startDate !== null && date < startDate) ||
        (endDate !== null && date > endDate)) continue;
    total += amount;
    byCategory[type] += amount;
    if (!Number.isFinite(total) || !Number.isFinite(byCategory[type])) {
      throw new RangeError('Сумма расходов выходит за допустимый диапазон');
    }
  }

  // Не округляем исходные записи, только рассчитанные результаты для вывода в рублях.
  const toRubles = value => Number(value.toFixed(2));
  return {
    total: toRubles(total),
    byCategory: Object.fromEntries(
      SERVICE_ENTRY_TYPES.map(type => [type, toRubles(byCategory[type])]),
    ),
  };
}

/** Сумма стоимости всех событий за выбранный период (включительно). */
export function calculateTotalExpenses(entries, period = {}) {
  return calculateExpenseSummary(entries, period).total;
}

/** Суммы по категориям «ТО», «ремонт», «замена детали», «покупка». */
export function calculateExpensesByCategory(entries, period = {}) {
  return calculateExpenseSummary(entries, period).byCategory;
}
