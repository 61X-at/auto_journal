import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateExpenseSummary,
  calculateTotalExpenses,
  calculateExpensesByCategory,
} from '../src/utils/expenses.js';
import { EXPENSE_FIXTURE_ENTRIES as EVENTS, EXPECTED } from './fixtures-expense-data.mjs';

const fixed = EVENTS;
const empty = EXPECTED.zero;

test('FE-018: зафиксированный набор из 12 событий сохраняет ожидаемый результат 15101.49 ₽', () => {
  assert.equal(fixed.length, 12);
  assert.equal(calculateTotalExpenses(fixed), EXPECTED.all.total);
  assert.deepEqual(calculateExpenseSummary(fixed), EXPECTED.all);
});

test('FE-018: категории имеют известные суммы, вместе равные общему итогу', () => {
  const byCategory = calculateExpensesByCategory(fixed);
  assert.deepEqual(byCategory, EXPECTED.all.byCategory);
  assert.equal(Math.round(Object.values(byCategory).reduce((sum, amount) => sum + amount, 0) * 100) / 100, EXPECTED.all.total);
});

test('FE-018: пустой список возвращает 0 для общего итога и каждой категории', () => {
  assert.deepEqual(calculateExpenseSummary([]), empty);
  assert.deepEqual(calculateExpenseSummary([], { startDate: '2026-01-01', endDate: '2026-12-31' }), empty);
});

test('FE-018: период без совпадений возвращает все нулевые суммы', () => {
  assert.deepEqual(calculateExpenseSummary(fixed, { startDate: '2023-01-01', endDate: '2023-12-31' }), empty);
});

test('FE-018: расчёт за календарный 2026 год учитывает только события выбранного года', () => {
  assert.deepEqual(calculateExpenseSummary(fixed, { startDate: '2026-01-01', endDate: '2026-12-31' }), EXPECTED.year2026);
});

test('FE-018: квартал включает оба конца периода и исключает соседние даты', () => {
  assert.deepEqual(calculateExpenseSummary(fixed, { startDate: '2026-01-01', endDate: '2026-03-31' }), EXPECTED.firstQuarter2026);
});

test('FE-018: начало периода включено, запись за предыдущий день исключена', () => {
  assert.equal(calculateTotalExpenses(fixed, { startDate: '2026-01-01', endDate: '2026-01-01' }), 1800);
  assert.equal(calculateTotalExpenses(fixed, { startDate: '2025-12-31', endDate: '2026-01-01' }), 2250.50);
});

test('FE-018: конец февраля включён, следующий день исключён', () => {
  assert.equal(calculateTotalExpenses(fixed, { startDate: '2026-02-01', endDate: '2026-02-28' }), 449.99);
  assert.equal(calculateTotalExpenses(fixed, { startDate: '2026-02-28', endDate: '2026-02-28' }), 99.99);
});

test('FE-018: високосный день 29 февраля 2024 учитывается как существующая дата', () => {
  assert.equal(calculateTotalExpenses(fixed, { startDate: '2024-02-29', endDate: '2024-02-29' }), 1200.25);
});

test('FE-018: пустая стоимость равна нулю и не меняет другие суммы', () => {
  assert.deepEqual(calculateExpenseSummary(fixed, { startDate: '2026-03-01', endDate: '2026-03-01' }), empty);
});

test('FE-018: отсутствие одной границы поддерживается независимо', () => {
  assert.equal(calculateTotalExpenses(fixed, { endDate: '2025-12-31' }), 4150.75);
  assert.equal(calculateTotalExpenses(fixed, { startDate: '2026-10-01' }), 1200);
});

test('FE-018: изменения суммы одного события влияют только на общий итог и его категорию', () => {
  const replaced = fixed.map(e => e.id === 'fe018-entry-6' ? { ...e, amount: 450 } : e);
  assert.equal(calculateTotalExpenses(replaced), EXPECTED.all.total + 100);
  assert.equal(calculateExpensesByCategory(replaced)['ремонт'], EXPECTED.all.byCategory['ремонт'] + 100);
  assert.equal(calculateExpensesByCategory(replaced)['ТО'], EXPECTED.all.byCategory['ТО']);
});

test('FE-018: перенос события в другую категорию сохраняет общий итог', () => {
  const moved = fixed.map(e => e.id === 'fe018-entry-6' ? { ...e, type: 'ТО' } : e);
  assert.equal(calculateTotalExpenses(moved), EXPECTED.all.total);
  assert.equal(calculateExpensesByCategory(moved)['ТО'], EXPECTED.all.byCategory['ТО'] + 350);
  assert.equal(calculateExpensesByCategory(moved)['ремонт'], EXPECTED.all.byCategory['ремонт'] - 350);
});

test('FE-018: повторные вызовы и перестановка событий не изменяют сумму', () => {
  const first = calculateExpenseSummary(fixed);
  assert.deepEqual(calculateExpenseSummary([...fixed].reverse()), first);
  assert.deepEqual(calculateExpenseSummary(fixed), first);
});

test('FE-018: вычисление не изменяет входные данные и период', () => {
  const snapshot = JSON.stringify(fixed);
  const period = Object.freeze({ startDate: '2026-01-01', endDate: '2026-12-31' });
  calculateExpenseSummary(fixed, period);
  assert.equal(JSON.stringify(fixed), snapshot);
  assert.deepEqual(period, { startDate: '2026-01-01', endDate: '2026-12-31' });
});

test('FE-018: обратные и несуществующие даты обнаруживаются отдельным запуском', () => {
  assert.throws(() => calculateTotalExpenses(fixed, { startDate: '2026-02-30' }), RangeError);
  assert.throws(() => calculateTotalExpenses(fixed, { startDate: '2026-05-01', endDate: '2026-04-30' }), RangeError);
});

test('FE-018: ошибочная стоимость не должна незаметно попадать в расчёт', () => {
  assert.throws(() => calculateTotalExpenses([{ ...fixed[0], amount: -1 }]), TypeError);
});
