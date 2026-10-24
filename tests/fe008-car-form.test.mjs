import assert from 'node:assert/strict';
import test from 'node:test';
import { saveCarFormData } from '../src/pages/CarPage.js';
import { readCar, STORAGE_KEYS } from '../src/storage/localStorage.js';

function fakeStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    raw: (key) => values.get(key),
  };
}
const valid = { brand: ' Lada ', model: 'Vesta ', year: '2021', currentMileage: '86200' };

test('FE-008: новая карточка сохраняется и доступна после повторного чтения', () => {
  const storage = fakeStorage();
  const result = saveCarFormData(valid, { storage });
  assert.equal(result.ok, true);
  assert.deepEqual(result.data, { brand: 'Lada', model: 'Vesta', year: 2021, currentMileage: 86200 });
  assert.deepEqual(readCar({ storage }).data, result.data);
});

test('FE-008: пробег можно изменить без потери марки, модели и года', () => {
  const storage = fakeStorage();
  saveCarFormData(valid, { storage });
  const old = readCar({ storage }).data;
  const changed = saveCarFormData({ ...old, currentMileage: '90000' }, { storage });
  assert.equal(changed.ok, true);
  assert.deepEqual(readCar({ storage }).data, { ...old, currentMileage: 90000 });
});

test('FE-008: некорректная марка не сохраняется', () => {
  const storage = fakeStorage();
  saveCarFormData(valid, { storage });
  const before = storage.raw(STORAGE_KEYS.car);
  const invalid = saveCarFormData({ ...valid, brand: '   ' }, { storage });
  assert.equal(invalid.ok, false);
  assert.equal(invalid.status, 'validation_error');
  assert.ok(invalid.errors.brand);
  assert.equal(storage.raw(STORAGE_KEYS.car), before);
});

test('FE-008: недопустимый год и отрицательный пробег показывают ошибки без записи', () => {
  const storage = fakeStorage();
  const result = saveCarFormData({ ...valid, year: '1800', currentMileage: '-1' }, { storage });
  assert.equal(result.ok, false);
  assert.ok(result.errors.year);
  assert.ok(result.errors.currentMileage);
  assert.equal(storage.raw(STORAGE_KEYS.car), undefined);
});

test('FE-008: ошибка localStorage не сообщает об успешном сохранении', () => {
  const storage = { setItem() { throw Error('quota exceeded'); } };
  const result = saveCarFormData(valid, { storage });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'write_error');
  assert.ok(result.message);
});

test('FE-008: сохраняется ровно один автомобиль в существующем ключе', () => {
  const storage = fakeStorage();
  saveCarFormData(valid, { storage });
  saveCarFormData({ ...valid, brand: 'Toyota' }, { storage });
  assert.equal(readCar({ storage }).data.brand, 'Toyota');
  assert.equal(storage.raw(STORAGE_KEYS.entries), undefined);
  assert.equal(storage.raw(STORAGE_KEYS.plans), undefined);
});
