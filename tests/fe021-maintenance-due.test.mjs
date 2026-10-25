import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  getLocalDateISO,
  getMaintenanceDueStatus,
  isMaintenanceDue,
} from '../src/utils/maintenanceDue.js';
import { createMaintenancePlan } from '../src/models/maintenancePlan.js';

const planned = (overrides = {}) => Object.freeze({
  id: 'plan-1', title: 'Замена масла', dueDate: '2026-11-01', dueMileage: 120000,
  status: 'planned', ...overrides,
});
const context = { today: '2026-10-25', currentMileage: 100000 };

test('FE-021: будущая дата и меньший пробег — работа запланирована', () => {
  assert.deepEqual(getMaintenanceDueStatus(planned(), context), {
    state: 'planned', needsAttention: false, dueByDate: false,
    dueByMileage: false, checkedDate: '2026-10-25',
  });
  assert.equal(isMaintenanceDue(planned(), context), false);
});

test('FE-021: контрольная дата уже прошла — требует внимания', () => {
  const result = getMaintenanceDueStatus(planned({ dueDate: '2026-10-24' }), context);
  assert.equal(result.state, 'due');
  assert.equal(result.needsAttention, true);
  assert.equal(result.dueByDate, true);
  assert.equal(result.dueByMileage, false);
});

test('FE-021: контрольная дата сегодня включается в срок', () => {
  assert.equal(getMaintenanceDueStatus(planned({ dueDate: '2026-10-25' }), context).dueByDate, true);
});

test('FE-021: дата завтра ещё не требует обслуживания', () => {
  assert.equal(getMaintenanceDueStatus(planned({ dueDate: '2026-10-26' }), context).needsAttention, false);
});

test('FE-021: контрольный пробег превышен — требует внимания', () => {
  const result = getMaintenanceDueStatus(planned({ dueMileage: 95000 }), context);
  assert.equal(result.needsAttention, true);
  assert.equal(result.dueByMileage, true);
  assert.equal(result.dueByDate, false);
});

test('FE-021: равенство текущего и контрольного пробега — порог достигнут', () => {
  assert.equal(getMaintenanceDueStatus(planned(), { ...context, currentMileage: 120000 }).dueByMileage, true);
});

test('FE-021: до пробега не хватает 1 км — порог не достигнут', () => {
  assert.equal(getMaintenanceDueStatus(planned(), { ...context, currentMileage: 119999 }).needsAttention, false);
});

test('FE-021: достаточно только контрольной даты', () => {
  assert.equal(getMaintenanceDueStatus(planned({ dueMileage: null, dueDate: '2026-10-25' }), context).needsAttention, true);
});

test('FE-021: достаточно только контрольного пробега', () => {
  assert.equal(getMaintenanceDueStatus(planned({ dueDate: null, dueMileage: 100000 }), context).needsAttention, true);
});

test('FE-021: если сработали оба порога, оба признака истинны', () => {
  const result = getMaintenanceDueStatus(planned({ dueDate: '2026-10-01', dueMileage: 90000 }), context);
  assert.equal(result.dueByDate, true);
  assert.equal(result.dueByMileage, true);
  assert.equal(result.needsAttention, true);
});

test('FE-021: когда срок по дате не наступил, одного пробега достаточно', () => {
  const result = getMaintenanceDueStatus(planned({ dueDate: '2027-01-01', dueMileage: 99000 }), context);
  assert.equal(result.dueByDate, false);
  assert.equal(result.needsAttention, true);
});

test('FE-021: текущий пробег неизвестен — сравнение пробега пропускается', () => {
  const result = getMaintenanceDueStatus(planned(), { today: '2026-10-25' });
  assert.equal(result.dueByMileage, false);
  assert.equal(result.needsAttention, false);
  const dateReached = getMaintenanceDueStatus(planned({ dueDate: '2026-10-24' }), { today: '2026-10-25' });
  assert.equal(dateReached.needsAttention, true);
});

test('FE-021: нулевой пробег — допустимый порог', () => {
  const result = getMaintenanceDueStatus(planned({ dueDate: null, dueMileage: 0 }), { ...context, currentMileage: 0 });
  assert.equal(result.dueByMileage, true);
});

test('FE-021: выполненная работа не требует внимания после обоих порогов', () => {
  const result = getMaintenanceDueStatus(planned({ status: 'done', dueDate: '2026-01-01', dueMileage: 0 }), context);
  assert.deepEqual(result, {
    state: 'done', needsAttention: false, dueByDate: false,
    dueByMileage: false, checkedDate: '2026-10-25',
  });
});

test('FE-021: расчёт не меняет план и внешние данные', () => {
  const plan = planned({ dueDate: '2026-10-25' });
  const before = JSON.stringify(plan);
  const result = getMaintenanceDueStatus(plan, context);
  assert.equal(result.needsAttention, true);
  assert.equal(JSON.stringify(plan), before);
  assert.equal(plan.status, 'planned');
});

test('FE-021: модель FE-019 подходит как источник расчёта', () => {
  const created = createMaintenancePlan({ title: 'Жидкость', dueMileage: 120000 });
  assert.equal(created.ok, true);
  assert.equal(getMaintenanceDueStatus(created.data, { ...context, currentMileage: 125000 }).state, 'due');
});

test('FE-021: некорректные данные плана не дают ложного статуса', () => {
  for (const bad of [null, [], {}, { ...planned(), status: 'unknown' }, { ...planned(), dueDate: '2026-02-30' }]) {
    assert.throws(() => getMaintenanceDueStatus(bad, context), TypeError);
  }
});

test('FE-021: некорректный пробег отклоняется явно', () => {
  for (const bad of [-1, 10.5, '100000', NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => getMaintenanceDueStatus(planned(), { ...context, currentMileage: bad }), TypeError);
  }
});

test('FE-021: некорректную текущую дату нельзя использовать', () => {
  for (const today of ['2026-02-30', '2026-10-5', '0000-01-01', null, 123, new Date('invalid')]) {
    assert.throws(() => getMaintenanceDueStatus(planned(), { ...context, today }), TypeError);
  }
});

test('FE-021: локальная дата создаётся из компонентов времени, а не из UTC ISO', () => {
  const date = new Date(2026, 9, 25, 23, 59, 59);
  assert.equal(getLocalDateISO(date), '2026-10-25');
  assert.equal(getMaintenanceDueStatus(planned({ dueDate: '2026-10-25' }), { currentMileage: null, today: date }).dueByDate, true);
});

test('FE-021: близко к полуночи часовой пояс меняет локальную дату, а не правило срока', () => {
  const snippet = `import {getLocalDateISO} from './src/utils/maintenanceDue.js'; process.stdout.write(getLocalDateISO(new Date('2026-10-25T00:30:00.000Z')))`;
  const options = { cwd: process.cwd(), encoding: 'utf8' };
  const ny = execFileSync(process.execPath, ['--input-type=module', '-e', snippet], {
    ...options, env: { ...process.env, TZ: 'America/New_York' },
  });
  const tokyo = execFileSync(process.execPath, ['--input-type=module', '-e', snippet], {
    ...options, env: { ...process.env, TZ: 'Asia/Tokyo' },
  });
  assert.equal(ny, '2026-10-24');
  assert.equal(tokyo, '2026-10-25');
});
