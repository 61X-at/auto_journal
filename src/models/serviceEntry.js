/**
 * FE-009. Модель события обслуживания автомобиля.
 *
 * Модуль не зависит от DOM или localStorage. Создание записи и проверка данных
 * выполняются здесь; чтение и запись массива событий будут подключены к форме
 * в FE-010 через общий слой хранения из FE-006.
 */

// В MVP только четыре категории из backlog; значения сохраняются без перевода.
export const SERVICE_ENTRY_TYPES = Object.freeze([
  'ТО',
  'ремонт',
  'замена детали',
  'покупка',
]);

export const SERVICE_ENTRY_FIELDS = Object.freeze([
  'type',
  'date',
  'mileage',
  'description',
  'amount',
]);

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/** HTML input[type=date] отдаёт дату YYYY-MM-DD. Проверяем реальный календарный день. */
function normalizeDate(value) {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || text.startsWith('0000-')) return null;
  const date = new Date(`${text}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== text) return null;
  return text;
}

/** Целые безопасные числа или строки десятичных цифр из формы. */
function normalizeMileage(value) {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value >= 0 ? value : null;
  }
  if (typeof value !== 'string' || !/^\d+$/.test(value.trim())) return null;
  const number = Number(value.trim());
  return Number.isSafeInteger(number) ? number : null;
}

/** Стоимость: число >= 0 или десятичная строка с точкой/запятой. */
function normalizeAmount(value) {
  let number;
  if (typeof value === 'number') {
    number = value;
  } else if (typeof value === 'string' && /^\d+(?:[.,]\d+)?$/.test(value.trim())) {
    number = Number(value.trim().replace(',', '.'));
  } else {
    return null;
  }
  return Number.isFinite(number) && number >= 0 && number <= Number.MAX_SAFE_INTEGER
    ? number
    : null;
}

/**
 * Проверяет запись до создания или обновления. Ничего не записывает в хранилище.
 * Если `id` передан для существующей записи, валидирует и сохраняет его.
 *
 * @param {unknown} input
 * @returns {{ok: true, data: object, errors: {}} |
 *           {ok: false, data: null, errors: Record<string,string>}}
 */
export function validateServiceEntry(input) {
  const source = input !== null && typeof input === 'object' && !Array.isArray(input)
    ? input
    : {};
  const type = normalizeText(source.type);
  const date = normalizeDate(source.date);
  const mileage = normalizeMileage(source.mileage);
  const description = normalizeText(source.description);
  const amount = normalizeAmount(source.amount);
  const errors = {};

  if (!SERVICE_ENTRY_TYPES.includes(type)) {
    errors.type = 'Выберите тип события: ТО, ремонт, замена детали или покупка.';
  }
  if (date === null) {
    errors.date = 'Укажите существующую дату в формате ГГГГ-ММ-ДД.';
  }
  if (mileage === null) {
    errors.mileage = 'Пробег должен быть целым неотрицательным числом.';
  }
  if (!description) {
    errors.description = 'Добавьте описание выполненной работы или покупки.';
  }
  if (amount === null) {
    errors.amount = 'Стоимость должна быть неотрицательным числом.';
  }

  // Присутствующий id относится к редактируемой записи; пустой/чужой тип отклоняем.
  if (Object.hasOwn(source, 'id') &&
    (typeof source.id !== 'string' || !source.id.trim())) {
    errors.id = 'Идентификатор записи должен быть непустой строкой.';
  }

  if (Object.keys(errors).length > 0) return { ok: false, data: null, errors };

  const data = { type, date, mileage, description, amount };
  if (Object.hasOwn(source, 'id')) data.id = source.id.trim();
  return { ok: true, data, errors: {} };
}

let fallbackCounter = 0;

function newUniqueId() {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  // Старые браузеры без randomUUID; при наличии генератора используем
  // криптографически случайные байты, чтобы избежать одинаковых id.
  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  // Резервный вариант для ограниченных тестовых сред без Web Crypto.
  fallbackCounter += 1;
  return `entry-${Date.now().toString(36)}-${fallbackCounter.toString(36)}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Создаёт новую запись только из валидных полей и выдаёт уникальный id.
 * Переданный извне id игнорируется: новая запись получает новый идентификатор.
 * Сам массив в localStorage здесь не меняется (это задача FE-010).
 */
export function createServiceEntry(input) {
  // Исключаем входящий id: это операция создания, а не изменения существующей записи.
  const source = input !== null && typeof input === 'object' && !Array.isArray(input)
    ? input
    : {};
  const { id: _ignored, ...withoutId } = source;
  const validated = validateServiceEntry(withoutId);
  if (!validated.ok) return validated;
  return {
    ok: true,
    data: { id: newUniqueId(), ...validated.data },
    errors: {},
  };
}
