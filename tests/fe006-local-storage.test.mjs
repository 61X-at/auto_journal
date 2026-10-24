import assert from 'node:assert/strict';
import test from 'node:test';
import {
  STORAGE_KEYS,
  readCar,
  readEntries,
  readPlans,
  saveCar,
  saveEntries,
  savePlans,
  readLocalData,
} from '../src/storage/localStorage.js';

function memoryStorage() {
  const data = new Map();
  return {
    getItem: (key) => data.has(key) ? data.get(key) : null,
    setItem: (key, value) => { data.set(key, String(value)); },
    inspect: (key) => data.get(key),
  };
}

test('FE-006: при пустом storage значения безопасны и независимы', () => {
  const storage = memoryStorage();
  assert.deepEqual(readCar({ storage }), { ok: true, data: null, status: 'empty' });
  const first = readEntries({ storage });
  assert.equal(first.ok, true);
  assert.deepEqual(first.data, []);
  first.data.push({ id: 1 });
  assert.deepEqual(readEntries({ storage }).data, []);
  assert.deepEqual(readPlans({ storage }).data, []);
});

test('FE-006: сохранённые значения читаются повторным вызовом (перезагрузка)', () => {
  const storage = memoryStorage();
  const car = { brand: 'Lada', model: 'Vesta', year: 2021, currentMileage: 86200 };
  const entries = [{ id: 'e1', date: '2026-09-15', amount: 7500 }];
  const plans = [{ id: 'p1', dueMileage: 90000 }];
  assert.equal(saveCar(car, { storage }).ok, true);
  assert.equal(saveEntries(entries, { storage }).ok, true);
  assert.equal(savePlans(plans, { storage }).ok, true);
  assert.deepEqual(readCar({ storage }), { ok: true, status: 'loaded', data: car });
  assert.deepEqual(readEntries({ storage }).data, entries);
  assert.deepEqual(readPlans({ storage }).data, plans);
  assert.equal(storage.inspect(STORAGE_KEYS.car), JSON.stringify(car));
  assert.equal(storage.inspect(STORAGE_KEYS.entries), JSON.stringify(entries));
  assert.equal(storage.inspect(STORAGE_KEYS.plans), JSON.stringify(plans));
});

test('FE-006: некорректный JSON не падает и не перезаписывается', () => {
  const storage = memoryStorage();
  storage.setItem(STORAGE_KEYS.entries, '{not valid JSON');
  const result = readEntries({ storage });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'corrupt');
  assert.deepEqual(result.data, []);
  assert.match(result.message, /повреждены/);
  assert.equal(storage.inspect(STORAGE_KEYS.entries), '{not valid JSON');
});

test('FE-006: неверная форма JSON безопасно отклоняется', () => {
  const storage = memoryStorage();
  storage.setItem(STORAGE_KEYS.car, '[1]');
  storage.setItem(STORAGE_KEYS.plans, '{"id":1}');
  assert.equal(readCar({ storage }).data, null);
  assert.equal(readCar({ storage }).status, 'corrupt');
  assert.deepEqual(readPlans({ storage }).data, []);
  assert.equal(readPlans({ storage }).status, 'corrupt');
});

test('FE-006: ошибка чтения (SecurityError) не прерывает работу', () => {
  const storage = { getItem() { throw new Error('SecurityError'); } };
  const result = readCar({ storage });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'unavailable');
  assert.equal(result.data, null);
  assert.ok(result.message);
});

test('FE-006: ошибка записи (quota exceeded) возвращается вызывающему коду', () => {
  const storage = {
    getItem() { return null; },
    setItem() { throw new Error('QuotaExceededError'); },
  };
  const result = saveEntries([{ id: 'e1' }], { storage });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'write_error');
  assert.match(result.message, /Не удалось сохранить/);
});

test('FE-006: некорректные данные не записываются', () => {
  const storage = memoryStorage();
  assert.equal(saveEntries({ id: 'e1' }, { storage }).status, 'invalid');
  assert.equal(savePlans(null, { storage }).status, 'invalid');
  assert.equal(saveCar([], { storage }).status, 'invalid');
  assert.equal(storage.inspect(STORAGE_KEYS.entries), undefined);
});

test('FE-006: циклические объекты не приводят к исключению наружу', () => {
  const storage = memoryStorage();
  const car = { brand: 'Lada' };
  car.self = car;
  assert.equal(saveCar(car, { storage }).status, 'invalid');
});

test('FE-006: неизвестный тип ключа выбрасывает ошибку программиста', () => {
  assert.throws(() => readLocalData('passwords', { storage: memoryStorage() }), TypeError);
});


test('FE-006: пустая строка JSON не считается пустым хранилищем', () => {
  const storage = memoryStorage();
  storage.setItem(STORAGE_KEYS.entries, '');
  assert.equal(readEntries({ storage }).status, 'corrupt');
});

test('FE-006: недоступный storage и отсутствие window возвращают безопасное значение', () => {
  const result = readPlans({ storage: null });
  assert.equal(result.status, 'unavailable');
  assert.deepEqual(result.data, []);
});
