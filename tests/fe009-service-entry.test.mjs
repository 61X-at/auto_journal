import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SERVICE_ENTRY_TYPES,
  SERVICE_ENTRY_FIELDS,
  validateServiceEntry,
  createServiceEntry,
} from '../src/models/serviceEntry.js';
import { readEntries, saveEntries, STORAGE_KEYS } from '../src/storage/localStorage.js';

const validEntry = () => ({
  type: 'ТО',
  date: '2026-09-15',
  mileage: 85000,
  description: 'Замена масла и фильтра',
  amount: 7500,
});

function fakeStorage() {
  const values = new Map();
  return {
    getItem: key => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    raw: key => values.get(key),
  };
}

test('FE-009: модель содержит шесть полей и четыре категории из backlog', () => {
  assert.deepEqual(SERVICE_ENTRY_FIELDS, ['type', 'date', 'mileage', 'description', 'amount']);
  assert.deepEqual(SERVICE_ENTRY_TYPES, ['ТО', 'ремонт', 'замена детали', 'покупка']);
  const result = createServiceEntry(validEntry());
  assert.equal(result.ok, true);
  assert.deepEqual(Object.keys(result.data), ['id', ...SERVICE_ENTRY_FIELDS]);
  assert.ok(typeof result.data.id === 'string' && result.data.id.length > 0);
});

test('FE-009: каждая категория принимается и сохраняется без замены', () => {
  for (const type of SERVICE_ENTRY_TYPES) {
    const result = createServiceEntry({ ...validEntry(), type });
    assert.equal(result.ok, true, type);
    assert.equal(result.data.type, type);
  }
});

test('FE-009: некорректная или пустая категория отклоняется', () => {
  for (const type of ['', 'другое', '  ', null, undefined]) {
    const result = validateServiceEntry({ ...validEntry(), type });
    assert.equal(result.ok, false);
    assert.ok(result.errors.type);
  }
});

test('FE-009: несуществующие даты и неверный формат отклоняются', () => {
  for (const date of ['2026-02-29', '2024-02-30', '2026-13-01', '2026-00-01', '2026-04-31', '15.09.2026', '2026-9-15', '', null, '0000-01-01']) {
    const result = validateServiceEntry({ ...validEntry(), date });
    assert.equal(result.ok, false, String(date));
    assert.ok(result.errors.date);
  }
});

test('FE-009: високосное 29 февраля и обычные даты проходят проверку', () => {
  assert.equal(validateServiceEntry({ ...validEntry(), date: '2024-02-29' }).ok, true);
  assert.equal(validateServiceEntry({ ...validEntry(), date: '2026-12-31' }).ok, true);
});

test('FE-009: пустое описание отклоняется, обычное — нормализуется', () => {
  for (const description of ['', '   ', null, undefined, 100]) {
    assert.ok(validateServiceEntry({ ...validEntry(), description }).errors.description);
  }
  assert.equal(validateServiceEntry({ ...validEntry(), description: '  Замена масла  ' }).data.description, 'Замена масла');
});

test('FE-009: отрицательный, дробный и небезопасный пробег отклоняется', () => {
  for (const mileage of [-1, '-1', 5.5, '10.2', '1e3', Number.MAX_SAFE_INTEGER + 1, '', ' ', null, NaN]) {
    const result = validateServiceEntry({ ...validEntry(), mileage });
    assert.equal(result.ok, false, String(mileage));
    assert.ok(result.errors.mileage);
  }
});

test('FE-009: нулевой пробег и цифровая строка принимаются', () => {
  assert.equal(validateServiceEntry({ ...validEntry(), mileage: '0000' }).data.mileage, 0);
  assert.equal(validateServiceEntry({ ...validEntry(), mileage: ' 085000 ' }).data.mileage, 85000);
});

test('FE-009: отрицательная, нечисловая и бесконечная стоимость отклоняются', () => {
  for (const amount of [-10, '-1', 'abc', '', null, Infinity, NaN, '1e3', Number.MAX_SAFE_INTEGER + 1]) {
    const result = validateServiceEntry({ ...validEntry(), amount });
    assert.equal(result.ok, false, String(amount));
    assert.ok(result.errors.amount);
  }
});

test('FE-009: нулевая стоимость, десятичные строки и запятая допустимы', () => {
  assert.equal(validateServiceEntry({ ...validEntry(), amount: 0 }).data.amount, 0);
  assert.equal(validateServiceEntry({ ...validEntry(), amount: '1 000' }).ok, false);
  assert.equal(validateServiceEntry({ ...validEntry(), amount: '7500.50' }).data.amount, 7500.5);
  assert.equal(validateServiceEntry({ ...validEntry(), amount: '7500,50' }).data.amount, 7500.5);
});

test('FE-009: отсутствие объекта возвращает ошибки, а не выбрасывает исключение', () => {
  for (const input of [null, undefined, [], {}]) {
    const result = validateServiceEntry(input);
    assert.equal(result.ok, false);
    assert.deepEqual(Object.keys(result.errors), SERVICE_ENTRY_FIELDS);
  }
});

test('FE-009: каждый новый объект получает собственный id', () => {
  const ids = new Set();
  for (let index = 0; index < 100; index += 1) {
    const result = createServiceEntry(validEntry());
    assert.equal(result.ok, true);
    assert.equal(ids.has(result.data.id), false);
    ids.add(result.data.id);
  }
});

test('FE-009: создание игнорирует чужой id, редактирование сохраняет существующий id', () => {
  const oldEntry = createServiceEntry(validEntry()).data;
  const newEntry = createServiceEntry({ ...oldEntry, description: 'Другая работа' });
  assert.notEqual(newEntry.data.id, oldEntry.id);
  const updated = validateServiceEntry({ ...oldEntry, amount: '1500' });
  assert.equal(updated.ok, true);
  assert.equal(updated.data.id, oldEntry.id);
  assert.equal(updated.data.amount, 1500);
  assert.ok(validateServiceEntry({ ...oldEntry, id: '' }).errors.id);
});

test('FE-009: неправильные данные не создают запись с id', () => {
  const result = createServiceEntry({ ...validEntry(), description: '', amount: '-1' });
  assert.equal(result.ok, false);
  assert.equal(result.data, null);
  assert.ok(result.errors.description);
  assert.ok(result.errors.amount);
});

test('FE-009: модель не изменяет входной объект', () => {
  const input = Object.freeze({ ...validEntry(), amount: ' 7500,50 ', mileage: '85000' });
  const result = createServiceEntry(input);
  assert.equal(result.ok, true);
  assert.equal(result.data.amount, 7500.5);
  assert.equal(input.amount, ' 7500,50 ');
});

test('FE-009: запись сериализуется в FE-006 с id и категорией и восстанавливается без потерь', () => {
  const storage = fakeStorage();
  const first = createServiceEntry(validEntry()).data;
  const second = createServiceEntry({ ...validEntry(), type: 'покупка', amount: 990 }).data;
  assert.equal(saveEntries([first, second], { storage }).ok, true);
  assert.equal(storage.raw(STORAGE_KEYS.entries), JSON.stringify([first, second]));
  assert.deepEqual(readEntries({ storage }).data, [first, second]);
  assert.equal(readEntries({ storage }).data[1].type, 'покупка');
  assert.notEqual(first.id, second.id);
});
