/**
 * FE-019. Модель одной запланированной работы по обслуживанию автомобиля.
 *
 * Бизнес-модель не зависит от DOM, localStorage и часов пользователя.
 * Проверка наступления срока — FE-021, форма создания — FE-020.
 */

export const MAINTENANCE_PLAN_FIELDS = Object.freeze([
  'id', 'title', 'dueDate', 'dueMileage', 'status',
]);
export const MAINTENANCE_PLAN_STATUSES = Object.freeze(['planned', 'done']);

function normalizeTitle(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/** Пустое поле даты означает отсутствие порога; непустое должно быть реальной датой. */
function normalizeOptionalDate(value) {
  if (value === undefined || value === null || value === '') return { value: null, valid: true };
  if (typeof value !== 'string') return { value: null, valid: false };
  const date = value.trim();
  if (!date) return { value: null, valid: true };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date.startsWith('0000-')) {
    return { value: null, valid: false };
  }
  const calendarDate = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(calendarDate.getTime()) || calendarDate.toISOString().slice(0, 10) !== date) {
    return { value: null, valid: false };
  }
  return { value: date, valid: true };
}

/** Пустое поле пробега означает отсутствие порога; допускаются только целые >= 0. */
function normalizeOptionalMileage(value) {
  if (value === undefined || value === null || value === '') return { value: null, valid: true };
  if (typeof value === 'string') {
    const text = value.trim();
    if (!text) return { value: null, valid: true };
    if (!/^\d+$/.test(text)) return { value: null, valid: false };
    const number = Number(text);
    return { value: Number.isSafeInteger(number) ? number : null, valid: Number.isSafeInteger(number) };
  }
  const valid = typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
  return { value: valid ? value : null, valid };
}

/**
 * Проверяет готовую запись MaintenancePlan (в том числе существующую).
 * Не изменяет входной объект и не сохраняет результат в браузере.
 *
 * @param {unknown} input
 * @returns {{ok:true, data:{id?:string,title:string,dueDate:string|null,dueMileage:number|null,status:'planned'|'done'}, errors:{}} |
 *           {ok:false, data:null, errors:Record<string,string>}}
 */
export function validateMaintenancePlan(input) {
  const source = input !== null && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const title = normalizeTitle(source.title);
  const dueDate = normalizeOptionalDate(source.dueDate);
  const dueMileage = normalizeOptionalMileage(source.dueMileage);
  const status = typeof source.status === 'string' ? source.status.trim() : '';
  const errors = {};

  if (!title) errors.title = 'Укажите название плановой работы.';
  if (!dueDate.valid) errors.dueDate = 'Укажите существующую дату в формате ГГГГ-ММ-ДД.';
  if (!dueMileage.valid) errors.dueMileage = 'Пробег должен быть целым неотрицательным числом.';
  if (dueDate.value === null && dueMileage.value === null && dueDate.valid && dueMileage.valid) {
    errors.dueDate = 'Укажите хотя бы одну контрольную точку: дату или пробег.';
    errors.dueMileage = 'Укажите хотя бы одну контрольную точку: дату или пробег.';
  }
  if (!MAINTENANCE_PLAN_STATUSES.includes(status)) {
    errors.status = 'Статус должен быть planned или done.';
  }
  if (Object.hasOwn(source, 'id') && (typeof source.id !== 'string' || !source.id.trim())) {
    errors.id = 'Идентификатор плановой работы должен быть непустой строкой.';
  }

  if (Object.keys(errors).length > 0) return { ok: false, data: null, errors };

  const data = { title, dueDate: dueDate.value, dueMileage: dueMileage.value, status };
  if (Object.hasOwn(source, 'id')) data.id = source.id.trim();
  return { ok: true, data, errors: {} };
}

let fallbackCounter = 0;

function createId() {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  // Резервный генератор для ограниченных сред без Web Crypto.
  fallbackCounter += 1;
  return `plan-${Date.now().toString(36)}-${fallbackCounter.toString(36)}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Создаёт новую плановую работу со статусом planned и собственным id.
 * status/id из внешней формы игнорируются. В localStorage не записывает (FE-020).
 */
export function createMaintenancePlan(input) {
  const source = input !== null && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const normalized = validateMaintenancePlan({
    title: source.title,
    dueDate: source.dueDate,
    dueMileage: source.dueMileage,
    status: 'planned',
  });
  if (!normalized.ok) return normalized;
  return {
    ok: true,
    data: { id: createId(), ...normalized.data },
    errors: {},
  };
}
