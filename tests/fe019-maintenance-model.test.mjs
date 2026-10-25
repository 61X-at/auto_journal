import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MAINTENANCE_PLAN_FIELDS,
  MAINTENANCE_PLAN_STATUSES,
  validateMaintenancePlan,
  createMaintenancePlan,
} from '../src/models/maintenancePlan.js';
import { readPlans, savePlans, STORAGE_KEYS } from '../src/storage/localStorage.js';

const valid = () => ({ title: 'Замена масла', dueDate: '2026-11-15', dueMileage: 120000, status: 'planned' });

function fakeStorage() {
  const map = new Map();
  return {
    getItem: key => map.has(key) ? map.get(key) : null,
    setItem: (key, val) => map.set(key, String(val)),
    raw: key => map.get(key),
  };
}

test('FE-019: модель содержит все пять обязательных ключей схемы', () => {
  assert.deepEqual(MAINTENANCE_PLAN_FIELDS, ['id', 'title', 'dueDate', 'dueMileage', 'status']);
  assert.deepEqual(MAINTENANCE_PLAN_STATUSES, ['planned', 'done']);
});

test('FE-019: план с датой и пробегом проходит проверку', () => {
  const result = validateMaintenancePlan(valid());
  assert.equal(result.ok, true);
  assert.deepEqual(result.data, valid());
});

test('FE-019: достаточно только даты — пробег нормализуется в null', () => {
  const result = validateMaintenancePlan({ ...valid(), dueMileage: '' });
  assert.equal(result.ok, true);
  assert.equal(result.data.dueMileage, null);
});

test('FE-019: достаточно только пробега — дата нормализуется в null', () => {
  const result = validateMaintenancePlan({ ...valid(), dueDate: '  ', dueMileage: ' 120000 ' });
  assert.equal(result.ok, true);
  assert.equal(result.data.dueDate, null);
  assert.equal(result.data.dueMileage, 120000);
});

test('FE-019: отсутствие обеих контрольных точек отклоняется', () => {
  for (const inputs of [{dueDate:'',dueMileage:''},{dueDate:null,dueMileage:undefined},{dueDate:undefined,dueMileage:null}]) {
    const result = validateMaintenancePlan({ ...valid(), ...inputs });
    assert.equal(result.ok, false);
    assert.ok(result.errors.dueDate);
    assert.ok(result.errors.dueMileage);
  }
});

test('FE-019: пустое название или неправильный объект отклоняются', () => {
  for (const value of ['', '  ', null, 55, undefined]) {
    const result = validateMaintenancePlan({ ...valid(), title: value });
    assert.equal(result.ok, false);
    assert.ok(result.errors.title);
  }
  for (const value of [null, [], undefined, 'text']) {
    assert.equal(validateMaintenancePlan(value).ok, false);
  }
});

test('FE-019: строки обрезаются по краям', () => {
  const data = validateMaintenancePlan({ ...valid(), title:'  Замена масла  ', dueDate:' 2026-11-15 ', status:' planned ' }).data;
  assert.equal(data.title, 'Замена масла');
  assert.equal(data.dueDate, '2026-11-15');
  assert.equal(data.status, 'planned');
});

test('FE-019: даты должны существовать в календаре и иметь ISO-формат', () => {
  for (const dueDate of ['2026-02-29','2026-13-01','2026-04-31','0000-01-01','15.11.2026','2026-1-05',12, {},'2026-00-01']) {
    const result = validateMaintenancePlan({ ...valid(), dueDate });
    assert.equal(result.ok, false, `${String(dueDate)} должна отклоняться`);
    assert.ok(result.errors.dueDate);
  }
  assert.equal(validateMaintenancePlan({ ...valid(), dueDate:'2028-02-29' }).ok, true);
  assert.equal(validateMaintenancePlan({ ...valid(), dueDate:'2025-01-01' }).ok, true);
});

test('FE-019: пробег может быть нулём', () => {
  const result = validateMaintenancePlan({ ...valid(), dueDate:null, dueMileage:'0' });
  assert.equal(result.ok, true);
  assert.equal(result.data.dueMileage, 0);
});

test('FE-019: отрицательный, дробный и слишком большой пробег отклоняются', () => {
  for (const dueMileage of [-1, '-1', 1.5, '1.5', '1e3', '1 000', NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, {}, false]) {
    const result = validateMaintenancePlan({ ...valid(), dueMileage });
    assert.equal(result.ok, false, `Отклонить ${String(dueMileage)}`);
    assert.ok(result.errors.dueMileage);
  }
});

test('FE-019: статусы planned и done допустимы, другие запрещены', () => {
  assert.equal(validateMaintenancePlan({ ...valid(), status:'done' }).ok, true);
  for (const status of ['', null, undefined, 'expired', 'completed', false]) {
    const result = validateMaintenancePlan({ ...valid(), status });
    assert.equal(result.ok, false);
    assert.ok(result.errors.status);
  }
});

test('FE-019: id существующей работы сохраняется, пустой id запрещён', () => {
  const old = validateMaintenancePlan({ ...valid(), id:'  plan-123  ' });
  assert.equal(old.ok, true);
  assert.equal(old.data.id, 'plan-123');
  for (const id of ['', ' ', 10, null]) {
    assert.ok(validateMaintenancePlan({ ...valid(), id }).errors.id);
  }
});

test('FE-019: создание назначает planned и новые id; не доверяет id/status из формы', () => {
  const one = createMaintenancePlan({ title:'Замена масла', dueMileage: 120000, status:'done', id:'forged' });
  const two = createMaintenancePlan({ title:'Замена масла', dueMileage: 120000 });
  assert.equal(one.ok, true);
  assert.equal(two.ok, true);
  assert.equal(one.data.status, 'planned');
  assert.notEqual(one.data.id, 'forged');
  assert.ok(one.data.id);
  assert.notEqual(one.data.id, two.data.id);
  assert.equal(one.data.dueDate, null);
});

test('FE-019: при ошибке создания объект не появляется', () => {
  const result = createMaintenancePlan({ title:' ', dueDate:'', dueMileage:'' });
  assert.equal(result.ok, false);
  assert.equal(result.data, null);
  assert.ok(result.errors.title);
  assert.ok(result.errors.dueMileage);
});

test('FE-019: входные данные не изменяются', () => {
  const input = Object.freeze({ ...valid(), title:'  Замена масла  ' });
  assert.equal(validateMaintenancePlan(input).ok, true);
  assert.equal(input.title, '  Замена масла  ');
  assert.equal(createMaintenancePlan(input).ok, true);
});

test('FE-019: несколько планов сохраняются и восстанавливаются из FE-006 без потерь', () => {
  const storage = fakeStorage();
  const a = createMaintenancePlan({ title:'Замена масла', dueMileage: '120000' }).data;
  const b = createMaintenancePlan({ title:'Проверка тормозов', dueDate: '2026-12-01' }).data;
  assert.equal(savePlans([a, b], { storage }).ok, true);
  assert.equal(storage.raw(STORAGE_KEYS.plans), JSON.stringify([a, b]));
  assert.deepEqual(readPlans({ storage }).data, [a, b]);
  assert.equal(readPlans({ storage }).data[1].dueMileage, null);
});

test('FE-019: чтение пустого и повреждённого хранилища не меняет содержимое', () => {
  const storage = fakeStorage();
  assert.deepEqual(readPlans({ storage }).data, []);
  storage.setItem(STORAGE_KEYS.plans, '{broken json');
  const result = readPlans({ storage });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'corrupt');
  assert.equal(storage.raw(STORAGE_KEYS.plans), '{broken json');
});
