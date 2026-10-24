/**
 * FE-007. Модель одного автомобиля и проверка введённых данных.
 *
 * Не обращается к DOM, localStorage или сети. Подходит для FE-008: страница
 * принимает результат validateCar(...).data только при ok === true.
 */
export const CAR_FIELDS = Object.freeze(['brand', 'model', 'year', 'currentMileage']);

// Нижняя граница включает исторические автомобили; верхняя допускает
// следующий модельный год. Изменение текущего года не требует правки кода.
export const MIN_CAR_YEAR = 1886;

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Принимает целое число или строку десятичных цифр (например, из input).
 * Не принимает дроби, отрицательные числа, экспоненциальную запись, NaN.
 */
function parseUnsignedInteger(value) {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value >= 0 ? value : null;
  }
  if (typeof value !== 'string' || !/^\d+$/.test(value.trim())) return null;
  const number = Number(value.trim());
  return Number.isSafeInteger(number) ? number : null;
}

/**
 * Проверяет и нормализует карточку одного автомобиля.
 *
 * @param {unknown} input - объект brand, model, year, currentMileage.
 * @returns {{ok: true, data: {brand: string, model: string, year: number, currentMileage: number}, errors: {}} |
 *           {ok: false, data: null, errors: Record<string, string>}}
 */
export function validateCar(input) {
  const source = input !== null && typeof input === 'object' && !Array.isArray(input)
    ? input
    : {};

  const brand = normalizeText(source.brand);
  const model = normalizeText(source.model);
  const year = parseUnsignedInteger(source.year);
  const currentMileage = parseUnsignedInteger(source.currentMileage);
  const currentYear = new Date().getFullYear();
  const errors = {};

  if (!brand) errors.brand = 'Укажите марку автомобиля.';
  if (!model) errors.model = 'Укажите модель автомобиля.';
  if (year === null || year < MIN_CAR_YEAR || year > currentYear + 1) {
    errors.year = `Год выпуска должен быть от ${MIN_CAR_YEAR} до ${currentYear + 1}.`;
  }
  if (currentMileage === null) {
    errors.currentMileage = 'Пробег должен быть целым неотрицательным числом.';
  }

  if (Object.keys(errors).length > 0) return { ok: false, data: null, errors };
  return {
    ok: true,
    data: { brand, model, year, currentMileage },
    errors: {},
  };
}
