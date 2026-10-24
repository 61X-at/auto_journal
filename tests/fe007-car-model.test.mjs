import assert from 'node:assert/strict';
import test from 'node:test';
import { CAR_FIELDS, MIN_CAR_YEAR, validateCar } from '../src/models/car.js';
import { readCar, saveCar, STORAGE_KEYS } from '../src/storage/localStorage.js';

const validCar = () => ({
  brand: 'Lada',
  model: 'Vesta',
  year: 2021,
  currentMileage: 86200,
});

function fakeStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    raw: (key) => values.get(key),
  };
}

test('FE-007: модель состоит из четырёх полей MVP', () => {
  assert.deepEqual(CAR_FIELDS, ['brand', 'model', 'year', 'currentMileage']);
  const result = validateCar(validCar());
  assert.equal(result.ok, true);
  assert.deepEqual(result.data, validCar());
  assert.deepEqual(result.errors, {});
});

test('FE-007: строки обрезаются, числовые строки нормализуются в числа', () => {
  assert.deepEqual(validateCar({
    brand: '  Toyota  ', model: ' Camry ', year: ' 2020 ', currentMileage: ' 085000 ',
  }).data, { brand: 'Toyota', model: 'Camry', year: 2020, currentMileage: 85000 });
});

test('FE-007: пустая или пробельная марка отклоняется', () => {
  for (const brand of ['', ' \t ', null, 10]) {
    const result = validateCar({ ...validCar(), brand });
    assert.equal(result.ok, false);
    assert.ok(result.errors.brand);
    assert.equal(result.data, null);
  }
});

test('FE-007: пустая или пробельная модель отклоняется', () => {
  for (const model of ['', '  ', undefined, {}]) {
    const result = validateCar({ ...validCar(), model });
    assert.equal(result.ok, false);
    assert.ok(result.errors.model);
  }
});

test('FE-007: год в установленном диапазоне принимается', () => {
  const maxYear = new Date().getFullYear() + 1;
  assert.equal(validateCar({ ...validCar(), year: MIN_CAR_YEAR }).ok, true);
  assert.equal(validateCar({ ...validCar(), year: maxYear }).ok, true);
});

test('FE-007: некорректный год не проходит проверку', () => {
  const maxYear = new Date().getFullYear() + 1;
  for (const year of [undefined, '', 0, MIN_CAR_YEAR - 1, maxYear + 1, 2020.5, '2020.5', '2e3', NaN, Infinity]) {
    const result = validateCar({ ...validCar(), year });
    assert.equal(result.ok, false, `Отклонить: ${String(year)}`);
    assert.ok(result.errors.year);
  }
});

test('FE-007: нулевой пробег разрешён', () => {
  assert.equal(validateCar({ ...validCar(), currentMileage: 0 }).data.currentMileage, 0);
  assert.equal(validateCar({ ...validCar(), currentMileage: '0' }).data.currentMileage, 0);
});

test('FE-007: отрицательный, дробный и небезопасный пробег отклоняются', () => {
  for (const currentMileage of [-1, '-1', 1.2, '1.2', '1e4', '', ' ', null, Number.MAX_SAFE_INTEGER + 1]) {
    const result = validateCar({ ...validCar(), currentMileage });
    assert.equal(result.ok, false, `Отклонить: ${String(currentMileage)}`);
    assert.ok(result.errors.currentMileage);
  }
});

test('FE-007: некорректная карточка возвращает ошибки по каждому полю', () => {
  const result = validateCar({});
  assert.equal(result.ok, false);
  assert.deepEqual(Object.keys(result.errors), CAR_FIELDS);
  assert.equal(result.data, null);
});

test('FE-007: null, массив и отсутствующий объект безопасно отклоняются', () => {
  for (const data of [null, [], undefined]) {
    assert.equal(validateCar(data).ok, false);
  }
});

test('FE-007: входной объект не изменяется при нормализации', () => {
  const input = Object.freeze({ brand: ' Audi ', model: ' A4 ', year: '2020', currentMileage: '5000' });
  const result = validateCar(input);
  assert.equal(result.ok, true);
  assert.equal(input.brand, ' Audi ');
  assert.equal(typeof input.year, 'string');
  assert.deepEqual(result.data, { brand: 'Audi', model: 'A4', year: 2020, currentMileage: 5000 });
});

test('FE-007: корректная карточка сохраняется и восстанавливается через FE-006', () => {
  const storage = fakeStorage();
  const car = validateCar({ brand: '  Lada ', model: 'Vesta', year: '2021', currentMileage: '86200' });
  assert.equal(car.ok, true);
  assert.equal(saveCar(car.data, { storage }).ok, true);
  assert.equal(storage.raw(STORAGE_KEYS.car), JSON.stringify(car.data));
  // Новое чтение имитирует открытие приложения после перезагрузки.
  const loaded = readCar({ storage });
  assert.equal(loaded.status, 'loaded');
  assert.deepEqual(loaded.data, car.data);
  assert.deepEqual(validateCar(loaded.data).data, car.data);
});

test('FE-007: одна карточка хранится под единственным ключом', () => {
  const storage = fakeStorage();
  const firstCar = validateCar(validCar()).data;
  const nextCar = validateCar({ ...validCar(), currentMileage: 90000 }).data;
  saveCar(firstCar, { storage });
  saveCar(nextCar, { storage });
  assert.deepEqual(readCar({ storage }).data, nextCar);
});
