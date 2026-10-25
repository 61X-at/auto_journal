/**
 * FE-021. Вычисление наступления планового ТО — без DOM, localStorage и уведомлений.
 * Порог по дате и порог по пробегу независимы: достаточно любого одного.
 */
import { validateMaintenancePlan } from '../models/maintenancePlan.js';

/** Возвращает календарный день в локальном часовом поясе, не через UTC/toISOString(). */
export function getLocalDateISO(now = new Date()) {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new TypeError('Ожидается корректный объект Date.');
  }
  const year = now.getFullYear();
  if (year < 1 || year > 9999) throw new RangeError('Год даты вне допустимого диапазона.');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${String(year).padStart(4, '0')}-${month}-${day}`;
}

function isRealISODate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000-')) {
    return false;
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function normalizeToday(today) {
  if (today instanceof Date) return getLocalDateISO(today);
  if (isRealISODate(today)) return today;
  throw new TypeError('Сегодняшняя дата должна быть объектом Date или YYYY-MM-DD.');
}

/**
 * Проверяет, требуется ли внимание к работе на данный момент.
 *
 * @param {object} plan - MaintenancePlan из FE-019 (status: planned или done).
 * @param {object} [options]
 * @param {number|null} [options.currentMileage] - Пробег автомобиля; null, если неизвестен.
 * @param {Date|string} [options.today] - Локальная дата пользователя; можно задать явно для тестов.
 * @returns {{state:'planned'|'due'|'done', needsAttention:boolean,
 *            dueByDate:boolean, dueByMileage:boolean, checkedDate:string}}
 *
 * Результат вычисляется, но никогда не меняет plan.status и не сохраняется автоматически.
 * Статус done исключён из требующих внимания даже при уже пройденных порогах.
 */
export function getMaintenanceDueStatus(plan, { currentMileage = null, today = new Date() } = {}) {
  const validated = validateMaintenancePlan(plan);
  if (!validated.ok) throw new TypeError('Некорректная плановая работа ТО.');
  if (currentMileage !== null && currentMileage !== undefined &&
      !(Number.isSafeInteger(currentMileage) && currentMileage >= 0)) {
    throw new TypeError('Текущий пробег должен быть целым неотрицательным числом или null.');
  }
  const checkedDate = normalizeToday(today);
  const entry = validated.data;

  if (entry.status === 'done') {
    return { state: 'done', needsAttention: false, dueByDate: false, dueByMileage: false, checkedDate };
  }

  const dueByDate = entry.dueDate !== null && entry.dueDate <= checkedDate;
  const dueByMileage = entry.dueMileage !== null && currentMileage !== null &&
    currentMileage !== undefined && currentMileage >= entry.dueMileage;
  const needsAttention = dueByDate || dueByMileage;
  return {
    state: needsAttention ? 'due' : 'planned',
    needsAttention,
    dueByDate,
    dueByMileage,
    checkedDate,
  };
}

/** Короткий вариант проверки для будущего интерфейса FE-022/FE-023. */
export function isMaintenanceDue(plan, options) {
  return getMaintenanceDueStatus(plan, options).needsAttention;
}
