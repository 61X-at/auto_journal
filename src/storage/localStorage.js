/**
 * FE-006. Единый безопасный доступ к данным одного автомобиля в localStorage.
 * Не зависит от DOM, backend или сетевых запросов.
 *
 * Чтение: { ok: true, data, status: 'empty'|'loaded' }
 *         { ok: false, data: безопасное значение, status, message }
 * Запись: { ok: true, status: 'saved' } или { ok: false, status, message }.
 * Ошибки чтения не удаляют и не перезаписывают повреждённое содержимое.
 */
export const STORAGE_KEYS = Object.freeze({
  car: 'autojournal_v1_car',
  entries: 'autojournal_v1_entries',
  plans: 'autojournal_v1_plans',
});

const ERROR_MESSAGES = Object.freeze({
  unavailable: 'Локальное хранилище недоступно. Проверьте настройки браузера.',
  corrupt: 'Сохранённые данные повреждены или имеют неверный формат. Они не были удалены.',
  invalid: 'Не удалось сохранить данные: неверный формат.',
  write_error: 'Не удалось сохранить данные в браузере. Возможно, хранилище заполнено или запись заблокирована.',
});

function fallbackFor(type) {
  return type === 'car' ? null : [];
}

function hasValidShape(type, value) {
  return type === 'car'
    ? value === null || (typeof value === 'object' && !Array.isArray(value))
    : Array.isArray(value);
}

function resolveStorage(storage) {
  if (storage !== undefined) return storage;
  // Доступ к window.localStorage сам может выбросить SecurityError.
  return typeof window !== 'undefined' ? window.localStorage : null;
}

function failedRead(type, status) {
  return { ok: false, data: fallbackFor(type), status, message: ERROR_MESSAGES[status] };
}

/**
 * @param {'car'|'entries'|'plans'} type
 * @param {{ storage?: Storage }} options — подмена storage используется в тестах.
 */
export function readLocalData(type, options = {}) {
  if (!Object.hasOwn(STORAGE_KEYS, type)) {
    throw new TypeError(`Неизвестная область хранения: ${String(type)}`);
  }

  let raw;
  try {
    const storage = resolveStorage(options.storage);
    if (!storage || typeof storage.getItem !== 'function') return failedRead(type, 'unavailable');
    raw = storage.getItem(STORAGE_KEYS[type]);
  } catch {
    return failedRead(type, 'unavailable');
  }

  if (raw === null) {
    return { ok: true, data: fallbackFor(type), status: 'empty' };
  }

  try {
    const data = JSON.parse(raw);
    if (!hasValidShape(type, data)) return failedRead(type, 'corrupt');
    return { ok: true, data, status: 'loaded' };
  } catch {
    return failedRead(type, 'corrupt');
  }
}

/** Сохраняет значение по одному из трёх ключей без перезаписи остальных. */
export function writeLocalData(type, data, options = {}) {
  if (!Object.hasOwn(STORAGE_KEYS, type)) {
    throw new TypeError(`Неизвестная область хранения: ${String(type)}`);
  }
  if (!hasValidShape(type, data)) {
    return { ok: false, status: 'invalid', message: ERROR_MESSAGES.invalid };
  }

  let serialized;
  try {
    serialized = JSON.stringify(data);
    if (typeof serialized !== 'string') {
      return { ok: false, status: 'invalid', message: ERROR_MESSAGES.invalid };
    }
  } catch {
    return { ok: false, status: 'invalid', message: ERROR_MESSAGES.invalid };
  }

  try {
    const storage = resolveStorage(options.storage);
    if (!storage || typeof storage.setItem !== 'function') {
      return { ok: false, status: 'unavailable', message: ERROR_MESSAGES.unavailable };
    }
    storage.setItem(STORAGE_KEYS[type], serialized);
    return { ok: true, status: 'saved' };
  } catch {
    return { ok: false, status: 'write_error', message: ERROR_MESSAGES.write_error };
  }
}

// API для будущих моделей/страниц. Проверка конкретных полей — FE-007/009/019.
export const readCar = (options) => readLocalData('car', options);
export const readEntries = (options) => readLocalData('entries', options);
export const readPlans = (options) => readLocalData('plans', options);
export const saveCar = (data, options) => writeLocalData('car', data, options);
export const saveEntries = (data, options) => writeLocalData('entries', data, options);
export const savePlans = (data, options) => writeLocalData('plans', data, options);
