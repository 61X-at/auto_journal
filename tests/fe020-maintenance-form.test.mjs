import test from 'node:test';
import assert from 'node:assert/strict';
import {
  saveNewMaintenancePlan, createMaintenanceForm, createMaintenancePlanList,
} from '../src/pages/MaintenancePage.js';
import { readPlans, STORAGE_KEYS } from '../src/storage/localStorage.js';

function makeStorage() {
  const values = new Map();
  return {
    getItem: key => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    raw: key => values.get(key),
    setRaw: (key, value) => values.set(key, value),
  };
}
const valid = Object.freeze({ title: 'Замена масла', dueDate: '', dueMileage: '120000' });

test('FE-020: можно добавить работу только с пробегом 120000', () => {
  const storage = makeStorage();
  const result = saveNewMaintenancePlan(valid, { storage });
  assert.equal(result.ok, true);
  assert.equal(result.data.title, 'Замена масла');
  assert.equal(result.data.status, 'planned');
  assert.equal(result.data.dueDate, null);
  assert.equal(result.data.dueMileage, 120000);
  assert.ok(result.data.id);
  assert.deepEqual(readPlans({ storage }).data, [result.data]);
});

test('FE-020: план можно сохранить только с датой', () => {
  const result = saveNewMaintenancePlan({ title: 'Осмотр тормозов', dueDate: '2026-12-01', dueMileage: '' }, { storage: makeStorage() });
  assert.equal(result.ok, true);
  assert.equal(result.data.dueDate, '2026-12-01');
  assert.equal(result.data.dueMileage, null);
});

test('FE-020: две контрольные точки допустимы одновременно', () => {
  const result = saveNewMaintenancePlan({ ...valid, dueDate: '2026-12-01' }, { storage: makeStorage() });
  assert.equal(result.ok, true);
  assert.equal(result.data.dueMileage, 120000);
  assert.equal(result.data.dueDate, '2026-12-01');
});

test('FE-020: без даты и пробега ошибки привязаны к обоим полям, ничего не сохранено', () => {
  const storage = makeStorage();
  const result = saveNewMaintenancePlan({ ...valid, dueDate: '', dueMileage: '' }, { storage });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'validation_error');
  assert.ok(result.errors.dueDate);
  assert.ok(result.errors.dueMileage);
  assert.equal(storage.raw(STORAGE_KEYS.plans), undefined);
});

test('FE-020: без названия показывает ошибку названия', () => {
  const result = saveNewMaintenancePlan({ ...valid, title: '   ' }, { storage: makeStorage() });
  assert.equal(result.ok, false);
  assert.ok(result.errors.title);
});

test('FE-020: несуществующая дата не проходит проверку', () => {
  const storage = makeStorage();
  const result = saveNewMaintenancePlan({ ...valid, dueDate: '2026-02-30' }, { storage });
  assert.equal(result.ok, false);
  assert.ok(result.errors.dueDate);
  assert.equal(storage.raw(STORAGE_KEYS.plans), undefined);
});

test('FE-020: дробный и отрицательный пробег не сохраняются', () => {
  for (const dueMileage of ['-1', '2.5', '1e4']) {
    const storage = makeStorage();
    const result = saveNewMaintenancePlan({ ...valid, dueMileage }, { storage });
    assert.equal(result.ok, false, dueMileage);
    assert.ok(result.errors.dueMileage);
    assert.equal(storage.raw(STORAGE_KEYS.plans), undefined);
  }
});

test('FE-020: новые работы дописываются, а предыдущие сохраняют id и порядок', () => {
  const storage = makeStorage();
  const first = saveNewMaintenancePlan(valid, { storage });
  const second = saveNewMaintenancePlan({ title: 'Тормозная жидкость', dueDate: '2026-12-04' }, { storage });
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.notEqual(first.data.id, second.data.id);
  assert.deepEqual(readPlans({ storage }).data, [first.data, second.data]);
});

test('FE-020: новая работа сохраняется после повторного чтения JSON', () => {
  const storage = makeStorage();
  const saved = saveNewMaintenancePlan(valid, { storage });
  assert.deepEqual(JSON.parse(storage.raw(STORAGE_KEYS.plans)), [saved.data]);
});

test('FE-020: повреждённое хранилище блокирует запись, JSON не удаляется', () => {
  const storage = makeStorage();
  storage.setRaw(STORAGE_KEYS.plans, '{bad');
  const result = saveNewMaintenancePlan(valid, { storage });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'corrupt');
  assert.equal(storage.raw(STORAGE_KEYS.plans), '{bad');
});

test('FE-020: недоступное хранилище безопасно отклоняет запись', () => {
  const storage = { getItem: () => { throw Error('security'); }, setItem: () => assert.fail('should not write') };
  const result = saveNewMaintenancePlan(valid, { storage });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'unavailable');
});

test('FE-020: ошибка записи не изменяет существующие планы', () => {
  const storage = makeStorage();
  const old = JSON.stringify([{ id: 'old-plan', title: 'Осмотр', status: 'planned', dueDate: null, dueMileage: 90000 }]);
  storage.setRaw(STORAGE_KEYS.plans, old);
  storage.setItem = () => { throw Error('quota exceeded'); };
  const result = saveNewMaintenancePlan(valid, { storage });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'write_error');
  assert.equal(storage.raw(STORAGE_KEYS.plans), old);
});

test('FE-020: при добавлении работы не затрагиваются автомобиль и журнал', () => {
  const storage = makeStorage();
  storage.setRaw(STORAGE_KEYS.car, '{"brand":"Toyota"}');
  storage.setRaw(STORAGE_KEYS.entries, '[]');
  assert.equal(saveNewMaintenancePlan(valid, { storage }).ok, true);
  assert.equal(storage.raw(STORAGE_KEYS.car), '{"brand":"Toyota"}');
  assert.equal(storage.raw(STORAGE_KEYS.entries), '[]');
});

test('FE-020: неподтверждённые статус и id формы игнорируются', () => {
  const input = Object.freeze({ ...valid, status: 'done', id: 'forged' });
  const result = saveNewMaintenancePlan(input, { storage: makeStorage() });
  assert.equal(result.ok, true);
  assert.equal(result.data.status, 'planned');
  assert.notEqual(result.data.id, 'forged');
  assert.equal(input.title, 'Замена масла');
});

test('FE-020: форма использует общие FormField и Button и прячется до команды', () => {
  class Element {
    constructor(tag) { this.tagName = tag; this.children = []; this.attributes = {}; this.hidden = false; this.className = ''; }
    append(...nodes) { this.children.push(...nodes); }
    setAttribute(name, value) { this.attributes[name] = String(value); }
    getAttribute(name) { return this.attributes[name] ?? null; }
    addEventListener() {}
  }
  const before = globalThis.document;
  globalThis.document = { createElement: tag => new Element(tag) };
  try {
    const { form, cancel, feedback } = createMaintenanceForm(true);
    assert.equal(form.hidden, true);
    assert.equal(form.id, 'maintenance-form');
    assert.equal(cancel.textContent, 'Отмена');
    assert.equal(feedback.getAttribute('aria-live'), 'polite');
    const grid = form.children[0];
    assert.equal(grid.children.length, 3);
    assert.deepEqual(grid.children.map(f => f.children[1].id), [
      'maintenance-title', 'maintenance-date', 'maintenance-mileage',
    ]);
    assert.deepEqual(grid.children.map(f => f.children[1].required), [true, false, false]);
    assert.equal(grid.children[2].children[1].type, 'number');
  } finally {
    if (before === undefined) delete globalThis.document;
    else globalThis.document = before;
  }
});

test('FE-020: список показывает реальные данные без вставки пользовательского HTML', () => {
  class Element {
    constructor(tag) { this.tagName = tag; this.children = []; this.textContent = ''; }
    append(...children) { this.children.push(...children); }
    setAttribute() {}
  }
  const previous = globalThis.document;
  globalThis.document = { createElement: tag => new Element(tag) };
  try {
    const list = createMaintenancePlanList([
      { title: '<img src=x onerror=alert(1)>', dueDate: null, dueMileage: 120000, status: 'planned' },
    ]);
    assert.equal(list.tagName, 'ul');
    const card = list.children[0].children[0];
    assert.equal(card.children[0].children[0].textContent, '<img src=x onerror=alert(1)>');
    assert.match(card.children[0].children[1].textContent, /120\s?000 км/);
    assert.equal(card.children[1].textContent, 'Запланировано');
  } finally {
    if (previous === undefined) delete globalThis.document;
    else globalThis.document = previous;
  }
});
