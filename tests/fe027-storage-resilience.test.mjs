/**
 * FE-027: повторный запуск, повреждённые данные, запрет доступа и безопасность записи.
 * Тестам не нужен браузер, сеть, сервер или дополнительные npm-зависимости.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  STORAGE_KEYS, readCar, readEntries, readPlans,
  saveCar, saveEntries, savePlans,
} from '../src/storage/localStorage.js';
import { saveCarFormData } from '../src/pages/CarPage.js';
import { saveNewServiceEntry } from '../src/pages/NewServiceEntryPage.js';
import { updateServiceEntry, deleteServiceEntry } from '../src/utils/serviceEntryActions.js';
import { saveNewMaintenancePlan, markMaintenancePlanDone } from '../src/pages/MaintenancePage.js';

const car = Object.freeze({ brand: 'Toyota', model: 'Camry', year: 2020, currentMileage: 125000 });
const entry = Object.freeze({
  id: 'entry-1', type: 'ТО', date: '2026-10-21', mileage: 125000,
  description: 'Замена масла', amount: 2500,
});
const plan = Object.freeze({
  id: 'plan-1', title: 'Тормозные колодки', dueDate: '2026-12-01',
  dueMileage: 130000, status: 'planned',
});

function makeStorage(seed = {}) {
  const map = new Map(Object.entries(seed));
  let reads = 0;
  let writes = 0;
  return {
    getItem(key) { reads++; return map.has(key) ? map.get(key) : null; },
    setItem(key, value) { writes++; map.set(key, String(value)); },
    removeItem(key) { map.delete(key); },
    clear() { map.clear(); },
    snapshot() { return Object.fromEntries(map); },
    stats() { return { reads, writes }; },
  };
}
const read = { car: readCar, entries: readEntries, plans: readPlans };
const save = { car: saveCar, entries: saveEntries, plans: savePlans };
const fallback = { car: null, entries: [], plans: [] };
const examples = { car, entries: [entry], plans: [plan] };

for (const kind of Object.keys(read)) {
  test(`FE-027: чистый браузер — ${kind} имеет пустое безопасное состояние`, () => {
    const storage = makeStorage();
    const response = read[kind]({ storage });
    assert.deepEqual(response, { ok: true, status: 'empty', data: fallback[kind] });
    assert.deepEqual(storage.snapshot(), {});
    assert.equal(storage.stats().writes, 0);
  });

  test(`FE-027: ${kind} переживает повторный запуск приложения`, () => {
    const storage = makeStorage();
    assert.equal(save[kind](examples[kind], { storage }).ok, true);
    // Второй запуск пользуется теми же ключами браузера, но читает новые объекты из JSON.
    const first = read[kind]({ storage });
    const second = read[kind]({ storage });
    assert.equal(first.status, 'loaded');
    assert.equal(second.ok, true);
    assert.deepEqual(second.data, examples[kind]);
    assert.notStrictEqual(first.data, second.data);
    assert.equal(storage.stats().writes, 1);
  });

  test(`FE-027: сломанный JSON ${kind} сохраняется без автоочистки`, () => {
    const broken = '{ "data": '; // намеренно оборванный JSON
    const storage = makeStorage({ [STORAGE_KEYS[kind]]: broken });
    for (let i = 0; i < 2; i++) {
      const result = read[kind]({ storage });
      assert.equal(result.ok, false);
      assert.equal(result.status, 'corrupt');
      assert.ok(result.message);
      assert.deepEqual(result.data, fallback[kind]);
    }
    assert.equal(storage.snapshot()[STORAGE_KEYS[kind]], broken);
    assert.equal(storage.stats().writes, 0);
  });

  test(`FE-027: некорректный корень JSON ${kind} не удаляется`, () => {
    const invalid = kind === 'car' ? '[]' : '{}';
    const storage = makeStorage({ [STORAGE_KEYS[kind]]: invalid });
    assert.equal(read[kind]({ storage }).status, 'corrupt');
    assert.equal(storage.snapshot()[STORAGE_KEYS[kind]], invalid);
    assert.equal(storage.stats().writes, 0);
  });

  test(`FE-027: запрет чтения ${kind} возвращает предупреждение`, () => {
    const storage = { getItem() { throw new DOMException('Denied', 'SecurityError'); } };
    const result = read[kind]({ storage });
    assert.equal(result.ok, false);
    assert.equal(result.status, 'unavailable');
    assert.deepEqual(result.data, fallback[kind]);
    assert.ok(result.message);
  });

  test(`FE-027: запрет записи ${kind} даёт ошибку, а не ложный успех`, () => {
    const storage = makeStorage({ [STORAGE_KEYS[kind]]: JSON.stringify(examples[kind]) });
    const original = storage.snapshot();
    storage.setItem = () => { throw new DOMException('Full', 'QuotaExceededError'); };
    const result = save[kind](examples[kind], { storage });
    assert.equal(result.ok, false);
    assert.equal(result.status, 'write_error');
    assert.match(result.message, /Не удалось сохранить/);
    assert.deepEqual(storage.snapshot(), original);
  });
}

test('FE-027: автомобиль, журнал и план хранятся независимо, без очистки соседних ключей', () => {
  const storage = makeStorage();
  assert.equal(saveCar(car, { storage }).ok, true);
  assert.equal(saveEntries([entry], { storage }).ok, true);
  assert.equal(savePlans([plan], { storage }).ok, true);
  const before = storage.snapshot();
  assert.equal(saveCar({ ...car, currentMileage: 129999 }, { storage }).ok, true);
  assert.equal(storage.snapshot()[STORAGE_KEYS.entries], before[STORAGE_KEYS.entries]);
  assert.equal(storage.snapshot()[STORAGE_KEYS.plans], before[STORAGE_KEYS.plans]);
  assert.deepEqual(readCar({ storage }).data.currentMileage, 129999);
});

test('FE-027: недоступное хранилище — новые записи не считаются сохранёнными', () => {
  const noStorage = { storage: null };
  assert.equal(saveCarFormData(car, noStorage).status, 'unavailable');
  assert.equal(saveNewServiceEntry(entry, noStorage).status, 'unavailable');
  assert.equal(saveNewMaintenancePlan(plan, noStorage).status, 'unavailable');
});

test('FE-027: при повреждённом журнале новая запись не затирает плохой JSON', () => {
  const raw = '[{"id":oops}]';
  const storage = makeStorage({ [STORAGE_KEYS.entries]: raw });
  assert.equal(saveNewServiceEntry(entry, { storage }).status, 'corrupt');
  assert.equal(storage.snapshot()[STORAGE_KEYS.entries], raw);
  assert.equal(storage.stats().writes, 0);
});

test('FE-027: при повреждённом плане новое ТО и отметка выполнения не стирают JSON', () => {
  const raw = '[not-a-plan';
  const storage = makeStorage({ [STORAGE_KEYS.plans]: raw });
  assert.equal(saveNewMaintenancePlan(plan, { storage }).status, 'corrupt');
  assert.equal(markMaintenancePlanDone('plan-1', { storage }).status, 'corrupt');
  assert.equal(storage.snapshot()[STORAGE_KEYS.plans], raw);
  assert.equal(storage.stats().writes, 0);
});

test('FE-027: ошибка записи при добавлении события сохраняет предыдущий журнал', () => {
  const storage = makeStorage({ [STORAGE_KEYS.entries]: JSON.stringify([entry]) });
  const before = storage.snapshot();
  storage.setItem = () => { throw new DOMException('Full', 'QuotaExceededError'); };
  const result = saveNewServiceEntry({ ...entry, description: 'Покупка фильтра' }, { storage });
  assert.equal(result.status, 'write_error');
  assert.deepEqual(storage.snapshot(), before);
});

test('FE-027: ошибка записи при редактировании не меняет уже сохранённую запись', () => {
  const storage = makeStorage({ [STORAGE_KEYS.entries]: JSON.stringify([entry]) });
  const before = storage.snapshot();
  storage.setItem = () => { throw Error('QuotaExceededError'); };
  const result = updateServiceEntry('entry-1', { ...entry, description: 'Новый текст' }, { storage });
  assert.equal(result.status, 'write_error');
  assert.deepEqual(storage.snapshot(), before);
});

test('FE-027: ошибка записи при удалении не удаляет событие', () => {
  const storage = makeStorage({ [STORAGE_KEYS.entries]: JSON.stringify([entry]) });
  const before = storage.snapshot();
  storage.setItem = () => { throw Error('QuotaExceededError'); };
  const result = deleteServiceEntry('entry-1', { confirmed: true, storage });
  assert.equal(result.status, 'write_error');
  assert.deepEqual(storage.snapshot(), before);
});

test('FE-027: при запрете записи создание плановой работы не удаляет предыдущие планы', () => {
  const storage = makeStorage({ [STORAGE_KEYS.plans]: JSON.stringify([plan]) });
  const before = storage.snapshot();
  storage.setItem = () => { throw Error('QuotaExceededError'); };
  const result = saveNewMaintenancePlan({ title: 'Замена масла', dueDate: '2027-01-01' }, { storage });
  assert.equal(result.status, 'write_error');
  assert.deepEqual(storage.snapshot(), before);
});

test('FE-027: отказ записи при завершении ТО не меняет статус planned', () => {
  const storage = makeStorage({ [STORAGE_KEYS.plans]: JSON.stringify([plan]) });
  storage.setItem = () => { throw Error('QuotaExceededError'); };
  const result = markMaintenancePlanDone('plan-1', { storage });
  assert.equal(result.status, 'write_error');
  assert.equal(readPlans({ storage }).data[0].status, 'planned');
});

test('FE-027: потеря данных после явной очистки данных сайта — ожидаемое ограничение MVP', () => {
  const storage = makeStorage();
  saveCar(car, { storage });
  saveEntries([entry], { storage });
  savePlans([plan], { storage });
  storage.clear(); // эквивалент очистки localStorage в DevTools
  assert.equal(readCar({ storage }).data, null);
  assert.deepEqual(readEntries({ storage }).data, []);
  assert.deepEqual(readPlans({ storage }).data, []);
  assert.equal(readCar({ storage }).status, 'empty');
});

test('FE-027: пустые новые значения не превращают повреждённый JSON в валидный автоматически', () => {
  const storage = makeStorage({
    [STORAGE_KEYS.entries]: '{broken',
    [STORAGE_KEYS.car]: JSON.stringify(car),
  });
  const current = readEntries({ storage });
  assert.equal(current.ok, false);
  assert.equal(current.status, 'corrupt');
  assert.equal(readCar({ storage }).ok, true);
  assert.equal(storage.snapshot()[STORAGE_KEYS.entries], '{broken');
  assert.equal(storage.stats().writes, 0);
});
