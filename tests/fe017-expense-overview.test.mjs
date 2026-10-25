import test from 'node:test';
import assert from 'node:assert/strict';
import { createServiceEntry } from '../src/models/serviceEntry.js';
import { calculateExpenseSummary } from '../src/utils/expenses.js';
import { CATEGORY_LABELS, formatExpenseRubles, prepareExpenseOverview, validateExpensePeriod } from '../src/components/ExpenseOverview.js';
import { SERVICE_ENTRY_TYPES } from '../src/models/serviceEntry.js';
import { readEntries, saveEntries } from '../src/storage/localStorage.js';

const example = (date, type, amount, id) => createServiceEntry({
  id, date, type, amount, mileage: 80000, description: `${type} ${id}`,
}).data;
const entries = [
  example('2026-02-01', 'ТО', 3000, 'oil'),
  example('2026-02-28', 'ремонт', 2250, 'repair'),
  example('2026-03-01', 'замена детали', 4100, 'parts'),
  example('2026-04-10', 'покупка', 650, 'buy'),
];
const period = { startDate: '2026-02-01', endDate: '2026-02-28' };

function memoryStore() {
  const map = new Map();
  return {
    getItem: key => map.get(key) ?? null,
    setItem: (key, value) => map.set(key, String(value)),
  };
}

test('FE-017: четыре категории отображаются с правильными подписями', () => {
  assert.deepEqual(Object.keys(CATEGORY_LABELS), SERVICE_ENTRY_TYPES);
  assert.deepEqual(Object.values(CATEGORY_LABELS), ['Техническое обслуживание', 'Ремонт', 'Замена деталей', 'Покупки']);
});

test('FE-017: общая сумма строится по реальным событиям', () => {
  const result = prepareExpenseOverview(entries);
  assert.equal(result.total, 10000);
  assert.equal(result.recordCount, 4);
  assert.deepEqual(result.byCategory, { 'ТО': 3000, 'ремонт': 2250, 'замена детали': 4100, 'покупка': 650 });
});

test('FE-017: добавление записи увеличивает итог ровно на сумму события', () => {
  const before = prepareExpenseOverview(entries).total;
  const after = prepareExpenseOverview([...entries, example('2026-04-11', 'ТО', 1510, 'new')]).total;
  assert.equal(after - before, 1510);
});

test('FE-017: интервал включает обе даты и отсекает внешние', () => {
  const selected = prepareExpenseOverview(entries, period);
  assert.equal(selected.total, 5250);
  assert.equal(selected.byCategory['замена детали'], 0);
  assert.equal(selected.byCategory['ремонт'], 2250);
});

test('FE-017: пустой журнал даёт ноль по всем категориям и ноль записей', () => {
  const selected = prepareExpenseOverview([]);
  assert.equal(selected.total, 0);
  assert.equal(selected.recordCount, 0);
  assert.equal(selected.hasEventsInPeriod, false);
  assert.deepEqual(selected.byCategory, Object.fromEntries(SERVICE_ENTRY_TYPES.map(type => [type, 0])));
});

test('FE-017: период без подходящих событий даёт ноль и отсутствие событий', () => {
  const selected = prepareExpenseOverview(entries, { startDate: '2025-01-01', endDate: '2025-12-31' });
  assert.equal(selected.total, 0);
  assert.equal(selected.hasEventsInPeriod, false);
});

test('FE-017: событие с нулевой стоимостью считается подходящей записью', () => {
  const selected = prepareExpenseOverview([example('2026-02-01', 'ТО', 0, 'free')]);
  assert.equal(selected.total, 0);
  assert.equal(selected.hasEventsInPeriod, true);
});

test('FE-017: обе незаполненные границы или одна незаполненная допустимы', () => {
  assert.equal(validateExpensePeriod({ startDate: '', endDate: '' }).ok, true);
  assert.equal(validateExpensePeriod({ startDate: '2026-01-01', endDate: '' }).ok, true);
  assert.equal(validateExpensePeriod({ startDate: '', endDate: '2026-10-25' }).ok, true);
});

test('FE-017: неверный интервал не проходит проверку', () => {
  assert.deepEqual(validateExpensePeriod({ startDate: '2026-06-01', endDate: '2026-05-31' }),
    { ok: false, errors: { endDate: 'Дата окончания не может быть раньше даты начала.' } });
});

test('FE-017: невозможные календарные даты не принимаются', () => {
  assert.equal(validateExpensePeriod({ startDate: '2026-02-30', endDate: '' }).ok, false);
  assert.equal(validateExpensePeriod({ startDate: '', endDate: '2026-02-30' }).ok, false);
});

test('FE-017: денежный формат поддерживает рубли и копейки', () => {
  assert.match(formatExpenseRubles(12345), /12\s?345 ₽/);
  assert.match(formatExpenseRubles(1250.5), /1\s?250,5 ₽/);
  assert.equal(formatExpenseRubles(0), '0 ₽');
});

test('FE-017: расчёт не мутирует исходный массив и объекты', () => {
  const frozen = Object.freeze(entries.map(item => Object.freeze({ ...item })));
  const before = JSON.stringify(frozen);
  prepareExpenseOverview(frozen, period);
  assert.equal(JSON.stringify(frozen), before);
});

test('FE-017: результат рассчитывается после повторного чтения из localStorage', () => {
  const storage = memoryStore();
  assert.equal(saveEntries(entries, { storage }).ok, true);
  const before = readEntries({ storage });
  assert.equal(prepareExpenseOverview(before.data).total, 10000);
  const added = example('2026-10-20', 'ТО', 2000, 'newer');
  assert.equal(saveEntries([...before.data, added], { storage }).ok, true);
  const after = readEntries({ storage });
  assert.equal(prepareExpenseOverview(after.data).total, 12000);
  assert.equal(after.data.length, 5);
});

test('FE-017: сумма не становится отрицательной', () => {
  assert.throws(() => prepareExpenseOverview([...entries, { ...entries[0], amount: -20 }]), /Некорректная запись/);
  assert.equal(calculateExpenseSummary(entries, {}).total >= 0, true);
});
