import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateExpenseSummary,
  calculateTotalExpenses,
  calculateExpensesByCategory,
} from '../src/utils/expenses.js';
import { SERVICE_ENTRY_TYPES, createServiceEntry } from '../src/models/serviceEntry.js';
import { readEntries, saveEntries } from '../src/storage/localStorage.js';

const fixtures = [
  ['2026-01-01', 'ТО', 1000],
  ['2026-01-05', 'ремонт', 2300],
  ['2026-01-10', 'замена детали', 400],
  ['2026-02-01', 'покупка', 550],
  ['2026-02-28', 'ТО', 1500],
  ['2026-03-01', 'ремонт', 1100],
  ['2026-03-10', 'покупка', 200],
  ['2026-04-01', 'замена детали', 3000],
  ['2026-05-20', 'ТО', 750],
  ['2026-12-31', 'покупка', 1200],
];
const entries = fixtures.map(([date, type, amount], index) =>
  Object.freeze({
    id: `entry-${index + 1}`, type, date, amount,
    description: `Работа № ${index + 1}`, mileage: 10000 + index * 1000,
  }),
);
const categoryTotals = { 'ТО': 3250, 'ремонт': 3400, 'замена детали': 3400, 'покупка': 1950 };

function memoryStorage() {
  const map = new Map();
  return {
    getItem: key => map.get(key) ?? null,
    setItem: (key, value) => map.set(key, String(value)),
    get snapshot() { return new Map(map); },
  };
}

test('FE-016: сумма фиксированного набора из 10 ServiceEntry', () => {
  assert.equal(entries.length, 10);
  assert.equal(calculateTotalExpenses(entries), 12000);
});

test('FE-016: разбивка по всем четырём категориям', () => {
  assert.deepEqual(calculateExpensesByCategory(entries), categoryTotals);
  assert.deepEqual(Object.keys(calculateExpensesByCategory(entries)), SERVICE_ENTRY_TYPES);
});

test('FE-016: общий расчёт возвращает одинаковые суммы для тех же записей', () => {
  assert.deepEqual(calculateExpenseSummary(entries), { total: 12000, byCategory: categoryTotals });
});

test('FE-016: интервал включает события на начальной и конечной дате', () => {
  const period = { startDate: '2026-02-01', endDate: '2026-02-28' };
  assert.equal(calculateTotalExpenses(entries, period), 2050);
  assert.deepEqual(calculateExpensesByCategory(entries, period),
    { 'ТО': 1500, 'ремонт': 0, 'замена детали': 0, 'покупка': 550 });
});

test('FE-016: при одинаковых границах учитывается событие в этот день', () => {
  assert.equal(calculateTotalExpenses(entries, { startDate: '2026-04-01', endDate: '2026-04-01' }), 3000);
});

test('FE-016: только начальная граница', () => {
  assert.equal(calculateTotalExpenses(entries, { startDate: '2026-12-31' }), 1200);
});

test('FE-016: только конечная граница', () => {
  assert.equal(calculateTotalExpenses(entries, { endDate: '2026-01-10' }), 3700);
});

test('FE-016: отсутствие подходящих записей даёт нули', () => {
  assert.deepEqual(calculateExpenseSummary(entries, { startDate: '2025-01-01', endDate: '2025-12-31' }),
    { total: 0, byCategory: Object.fromEntries(SERVICE_ENTRY_TYPES.map(type => [type, 0])) });
  assert.equal(calculateTotalExpenses([]), 0);
});

test('FE-016: изменение только даты меняет итог', () => {
  assert.equal(calculateTotalExpenses(entries, { endDate: '2026-01-05' }), 3300);
  assert.equal(calculateTotalExpenses(entries, { endDate: '2026-01-10' }), 3700);
});

test('FE-016: изменение категории в валидной записи меняет разбивку, но не итог', () => {
  const changed = entries.map(entry => entry.id === 'entry-1' ? { ...entry, type: 'покупка' } : entry);
  assert.equal(calculateTotalExpenses(changed), 12000);
  assert.equal(calculateExpensesByCategory(changed)['ТО'], 2250);
  assert.equal(calculateExpensesByCategory(changed)['покупка'], 2950);
});

test('FE-016: не меняет исходный массив и входные объекты', () => {
  const frozen = Object.freeze([...entries]);
  const snapshot = JSON.stringify(frozen);
  calculateExpenseSummary(frozen, Object.freeze({ startDate: '2026-02-01' }));
  assert.equal(JSON.stringify(frozen), snapshot);
});

test('FE-016: нулевая цена допускается, дробные суммы отображаются с копейками', () => {
  const goods = [
    createServiceEntry({ type: 'покупка', date: '2026-10-01', mileage: 4, description: 'А', amount: 0 }).data,
    createServiceEntry({ type: 'покупка', date: '2026-10-01', mileage: 5, description: 'Б', amount: 0.1 }).data,
    createServiceEntry({ type: 'покупка', date: '2026-10-01', mileage: 5, description: 'В', amount: 0.2 }).data,
  ];
  assert.equal(calculateTotalExpenses(goods), 0.3);
  assert.equal(calculateExpensesByCategory(goods)['покупка'], 0.3);
});

test('FE-016: несуществующие даты и обратный период отклоняются', () => {
  assert.throws(() => calculateTotalExpenses(entries, { startDate: '2026-02-30' }), RangeError);
  assert.throws(() => calculateTotalExpenses(entries, { startDate: '2026-05-01', endDate: '2026-04-30' }), RangeError);
  assert.throws(() => calculateTotalExpenses(entries, { endDate: '01.10.2026' }), TypeError);
});

test('FE-016: принимает допустимые высокосные даты и пустые границы', () => {
  assert.equal(calculateTotalExpenses(entries, { startDate: '', endDate: null }), 12000);
  assert.equal(calculateTotalExpenses(entries, { startDate: '2024-02-29', endDate: '2026-01-01' }), 1000);
});

test('FE-016: не пропускает некорректные ServiceEntry незаметно', () => {
  assert.throws(() => calculateTotalExpenses([{ ...entries[0], amount: -10 }]), TypeError);
  assert.throws(() => calculateTotalExpenses([{ ...entries[0], type: 'прочее' }]), TypeError);
  assert.throws(() => calculateTotalExpenses('не массив'), TypeError);
});

test('FE-016: работает на восстановленных ServiceEntry без отдельного хранения итогов', () => {
  const storage = memoryStorage();
  assert.equal(saveEntries(entries, { storage }).ok, true);
  const before = storage.snapshot;
  const loaded = readEntries({ storage });
  assert.equal(loaded.ok, true);
  assert.equal(calculateTotalExpenses(loaded.data), 12000);
  assert.deepEqual(calculateExpensesByCategory(loaded.data), categoryTotals);
  assert.deepEqual(storage.snapshot, before);
});
