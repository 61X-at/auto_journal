import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createMaintenancePlanList,
  groupMaintenancePlans,
  markMaintenancePlanDone,
} from '../src/pages/MaintenancePage.js';
import { readPlans, STORAGE_KEYS } from '../src/storage/localStorage.js';

const example = (id, changes = {}) => ({
  id, title: `Работа ${id}`, dueDate: '2026-12-12', dueMileage: 120000,
  status: 'planned', ...changes,
});
const options = { today: '2026-10-25', currentMileage: 85000 };

function fakeStorage() {
  const store = new Map();
  return {
    getItem(key) { return store.has(key) ? store.get(key) : null; },
    setItem(key, value) { store.set(key, String(value)); },
    raw(key) { return store.get(key); },
    setRaw(key, value) { store.set(key, value); },
  };
}

test('FE-022: активные и выполненные работы разделяются без изменения порядка', () => {
  const data = [example('1'), example('2', {status:'done'}), example('3'), example('4', {status:'done'})];
  const before = JSON.stringify(data);
  const groups = groupMaintenancePlans(data, options);
  assert.deepEqual(groups.active.map(x => x.plan.id), ['1', '3']);
  assert.deepEqual(groups.completed.map(x => x.plan.id), ['2', '4']);
  assert.equal(groups.invalid.length, 0);
  assert.equal(JSON.stringify(data), before);
});

test('FE-022: наступившая дата выделяется как требующая внимания', () => {
  const { active } = groupMaintenancePlans([example('1', { dueDate: '2026-10-25' })], options);
  assert.equal(active[0].due.state, 'due');
  assert.equal(active[0].due.dueByDate, true);
});

test('FE-022: достигнутый пробег выделяется как требующий внимания', () => {
  const { active } = groupMaintenancePlans([example('1', { dueMileage: 85000, dueDate: null })], options);
  assert.equal(active[0].due.state, 'due');
  assert.equal(active[0].due.dueByMileage, true);
});

test('FE-022: выполненная работа не отмечается как просроченная', () => {
  const { completed } = groupMaintenancePlans([example('1', {status:'done',dueDate:'2026-01-01'})], options);
  assert.equal(completed[0].due.state, 'done');
  assert.equal(completed[0].due.needsAttention, false);
});

test('FE-022: отсутствие текущего пробега не создаёт ложную просрочку', () => {
  const { active } = groupMaintenancePlans([example('1', {dueDate:null,dueMileage:1000})], { today:'2026-10-25' });
  assert.equal(active[0].due.state, 'planned');
});

test('FE-022: повреждённый отдельный план не ломает отображение остальных', () => {
  const result = groupMaintenancePlans([example('good'), { id:'bad' }, example('done', {status:'done'})], options);
  assert.equal(result.invalid.length, 1);
  assert.deepEqual(result.active.map(x => x.plan.id), ['good']);
  assert.deepEqual(result.completed.map(x => x.plan.id), ['done']);
});

test('FE-022: статус выбранной работы сохраняется, другие записи не меняются', () => {
  const storage = fakeStorage();
  const plans = [example('a'),example('b')];
  storage.setRaw(STORAGE_KEYS.plans, JSON.stringify(plans));
  const result = markMaintenancePlanDone('a', { storage });
  assert.equal(result.ok, true);
  assert.equal(result.status, 'saved');
  assert.equal(result.data.id, 'a');
  assert.equal(result.data.status, 'done');
  const after = readPlans({ storage }).data;
  assert.deepEqual(after, [{...plans[0],status:'done'},plans[1]]);
  assert.equal(after[0].id, 'a');
});

test('FE-022: после повторного чтения work остаётся done', () => {
  const storage = fakeStorage();
  storage.setRaw(STORAGE_KEYS.plans, JSON.stringify([example('a')]));
  assert.equal(markMaintenancePlanDone('a',{storage}).ok,true);
  assert.equal(readPlans({storage}).data[0].status,'done');
  assert.equal(groupMaintenancePlans(readPlans({storage}).data,options).completed.length,1);
});

test('FE-022: отметка выполнения не создаёт запись ServiceEntry', () => {
  const storage = fakeStorage();
  storage.setRaw(STORAGE_KEYS.plans, JSON.stringify([example('a')]));
  storage.setRaw(STORAGE_KEYS.entries, JSON.stringify([{id:'entry-one'}]));
  storage.setRaw(STORAGE_KEYS.car, JSON.stringify({brand:'Lada'}));
  const entriesBefore = storage.raw(STORAGE_KEYS.entries);
  const carBefore = storage.raw(STORAGE_KEYS.car);
  assert.equal(markMaintenancePlanDone('a',{storage}).ok,true);
  assert.equal(storage.raw(STORAGE_KEYS.entries), entriesBefore);
  assert.equal(storage.raw(STORAGE_KEYS.car), carBefore);
});

test('FE-022: повторное выполнение уже done не перезаписывает localStorage', () => {
  const storage = fakeStorage();
  storage.setRaw(STORAGE_KEYS.plans, JSON.stringify([example('a',{status:'done'})]));
  storage.setItem = () => { throw Error('must not write'); };
  const result = markMaintenancePlanDone('a', {storage});
  assert.equal(result.ok,true);
  assert.equal(result.status,'already_done');
});

test('FE-022: несуществующий ID отклоняется без записи', () => {
  const storage = fakeStorage();
  const before = JSON.stringify([example('a')]);
  storage.setRaw(STORAGE_KEYS.plans, before);
  assert.equal(markMaintenancePlanDone('missing',{storage}).status,'not_found');
  assert.equal(storage.raw(STORAGE_KEYS.plans), before);
});

test('FE-022: при дублирующемся ID не изменяется ни один план', () => {
  const storage = fakeStorage();
  const before = JSON.stringify([example('a'),example('a')]);
  storage.setRaw(STORAGE_KEYS.plans, before);
  assert.equal(markMaintenancePlanDone('a',{storage}).status,'duplicate_id');
  assert.equal(storage.raw(STORAGE_KEYS.plans), before);
});

test('FE-022: пустой ID и неверная схема найденного плана отклоняются', () => {
  const storage = fakeStorage();
  storage.setRaw(STORAGE_KEYS.plans, JSON.stringify([{id:'x',title:'',status:'planned'}]));
  assert.equal(markMaintenancePlanDone(' ',{storage}).status,'invalid_id');
  assert.equal(markMaintenancePlanDone('x',{storage}).status,'invalid_plan');
});

test('FE-022: повреждённый JSON не удаляется и не перезаписывается', () => {
  const storage = fakeStorage();
  storage.setRaw(STORAGE_KEYS.plans, '{bad json');
  const result = markMaintenancePlanDone('a',{storage});
  assert.equal(result.ok,false);
  assert.equal(result.status,'corrupt');
  assert.equal(storage.raw(STORAGE_KEYS.plans),'{bad json');
});

test('FE-022: ошибка записи оставляет прежнюю историю', () => {
  const storage = fakeStorage();
  const original = JSON.stringify([example('a')]);
  storage.setRaw(STORAGE_KEYS.plans, original);
  storage.setItem = () => { throw Error('QuotaExceededError'); };
  const result = markMaintenancePlanDone('a',{storage});
  assert.equal(result.status,'write_error');
  assert.equal(storage.raw(STORAGE_KEYS.plans),original);
});

test('FE-022: недоступное localStorage не приводит к необработанной ошибке', () => {
  const storage = { getItem: () => {throw Error('SecurityError');} };
  assert.equal(markMaintenancePlanDone('a',{storage}).status,'unavailable');
});

test('FE-022: список явно показывает текст просрочки, значок и кнопку действия', () => {
  class Element {
    constructor(tag) { this.tagName = tag; this.children=[]; this.textContent=''; this.attrs={}; this.handlers={};this.className=''; }
    append(...nodes) { this.children.push(...nodes); }
    prepend(...nodes) { this.children.unshift(...nodes); }
    setAttribute(key,val) { this.attrs[key]=String(val); }
    addEventListener(event,callback) { this.handlers[event]=callback; }
  }
  const previous = globalThis.document;
  globalThis.document = { createElement: (tag) => new Element(tag) };
  try {
    const fired = [];
    const list = createMaintenancePlanList([example('a', {dueDate:'2026-01-01'})], {
      ...options, onMarkDone: (id) => fired.push(id),
    });
    const article = list.children[0].children[0];
    assert.match(article.children[1].textContent,/Требует внимания/);
    assert.equal(article.children[1].children[0].attrs['aria-hidden'],'true');
    const button = article.children[2].children[0];
    assert.equal(button.textContent,'Выполнено');
    assert.match(button.attrs['aria-label'],/Работа a/);
    button.handlers.click();
    assert.deepEqual(fired,['a']);
  } finally {
    if (previous === undefined) delete globalThis.document;
    else globalThis.document = previous;
  }
});

test('FE-022: выполненная работа не имеет кнопки повторного выполнения', () => {
  class Element {
    constructor(tag) { this.tagName=tag;this.children=[];this.textContent='';this.className=''; }
    append(...nodes) {this.children.push(...nodes);}
    setAttribute() {}
  }
  const previous = globalThis.document;
  globalThis.document = {createElement: tag => new Element(tag)};
  try {
    const list = createMaintenancePlanList([example('a',{status:'done'})], options);
    const article = list.children[0].children[0];
    assert.equal(article.children.length,2);
    assert.equal(article.children[1].textContent,'Выполнено');
  } finally {
    if (previous === undefined) delete globalThis.document;
    else globalThis.document = previous;
  }
});
