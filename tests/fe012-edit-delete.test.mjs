import test from 'node:test';
import assert from 'node:assert/strict';
import { updateServiceEntry, deleteServiceEntry } from '../src/utils/serviceEntryActions.js';
import { createServiceHistoryList } from '../src/pages/JournalPage.js';
import { STORAGE_KEYS, readEntries, saveEntries } from '../src/storage/localStorage.js';

const entry = (id, overrides = {}) => ({
  id, type: 'ТО', date: '2026-10-01', mileage: 85000,
  description: 'Замена масла', amount: 7500, ...overrides,
});
const initial = [entry('a'), entry('b', { description: 'Замена ремня', amount: 4300 })];

function storageStub() {
  const db = new Map();
  return {
    getItem(key) { return db.get(key) ?? null; },
    setItem(key, value) { db.set(key, String(value)); },
    raw(key) { return db.get(key); },
    putRaw(key, value) { db.set(key, value); },
  };
}
function seeded() {
  const storage = storageStub();
  assert.equal(saveEntries(initial, { storage }).ok, true);
  return storage;
}

test('FE-012: редактирование меняет только выбранную запись и сохраняет прежний ID', () => {
  const storage = seeded();
  const before = readEntries({ storage }).data;
  const result = updateServiceEntry('a', { ...before[0], description: 'Новый фильтр', amount: '9800', id: 'подмена' }, { storage });
  assert.equal(result.ok, true);
  assert.equal(result.status, 'updated');
  assert.equal(result.data.id, 'a');
  const after = readEntries({ storage }).data;
  assert.deepEqual(after[1], before[1]);
  assert.equal(after.length, 2);
  assert.equal(after[0].description, 'Новый фильтр');
  assert.equal(after[0].amount, 9800);
  assert.equal(after[0].id, 'a');
});

test('FE-012: изменение переживает повторное чтение localStorage', () => {
  const storage = seeded();
  updateServiceEntry('b', { ...initial[1], mileage: '90000' }, { storage });
  assert.equal(JSON.parse(storage.raw(STORAGE_KEYS.entries))[1].mileage, 90000);
  assert.equal(readEntries({ storage }).data[1].id, 'b');
});

test('FE-012: ошибка валидации оставляет историю без изменений', () => {
  const storage = seeded();
  const snapshot = storage.raw(STORAGE_KEYS.entries);
  const result = updateServiceEntry('a', { ...initial[0], date: '2026-02-31', description: '' }, { storage });
  assert.equal(result.status, 'validation_error');
  assert.ok(result.errors.date);
  assert.ok(result.errors.description);
  assert.equal(storage.raw(STORAGE_KEYS.entries), snapshot);
});

test('FE-012: редактирование не создаёт запись по отсутствующему ID', () => {
  const storage = seeded();
  const snapshot = storage.raw(STORAGE_KEYS.entries);
  assert.equal(updateServiceEntry('missing', initial[0], { storage }).status, 'not_found');
  assert.equal(storage.raw(STORAGE_KEYS.entries), snapshot);
});

test('FE-012: дублирующиеся ID блокируют редактирование и удаление', () => {
  const storage = seeded();
  storage.putRaw(STORAGE_KEYS.entries, JSON.stringify([initial[0], { ...initial[1], id: 'a' }]));
  const snapshot = storage.raw(STORAGE_KEYS.entries);
  assert.equal(updateServiceEntry('a', initial[0], { storage }).status, 'duplicate_id');
  assert.equal(deleteServiceEntry('a', { storage, confirmed: true }).status, 'duplicate_id');
  assert.equal(storage.raw(STORAGE_KEYS.entries), snapshot);
});

test('FE-012: без подтверждения удаление не изменяет записи', () => {
  const storage = seeded();
  const snapshot = storage.raw(STORAGE_KEYS.entries);
  assert.equal(deleteServiceEntry('a', { storage }).status, 'cancelled');
  assert.equal(deleteServiceEntry('a', { storage, confirmed: false }).status, 'cancelled');
  assert.equal(storage.raw(STORAGE_KEYS.entries), snapshot);
});

test('FE-012: подтверждённое удаление удаляет только одну запись, без дублей', () => {
  const storage = seeded();
  const result = deleteServiceEntry('a', { storage, confirmed: true });
  assert.equal(result.ok, true);
  assert.equal(result.status, 'deleted');
  assert.equal(result.data.id, 'a');
  assert.deepEqual(readEntries({ storage }).data, [initial[1]]);
  assert.equal(deleteServiceEntry('a', { storage, confirmed: true }).status, 'not_found');
  assert.deepEqual(readEntries({ storage }).data, [initial[1]]);
});

test('FE-012: удаление последней записи оставляет пустой массив', () => {
  const storage = storageStub();
  saveEntries([initial[0]], { storage });
  assert.equal(deleteServiceEntry('a', { confirmed: true, storage }).ok, true);
  assert.deepEqual(readEntries({ storage }).data, []);
});

test('FE-012: повреждённый JSON не перезаписывается при редактировании и удалении', () => {
  const storage = seeded();
  storage.putRaw(STORAGE_KEYS.entries, '{bad json');
  assert.equal(updateServiceEntry('a', initial[0], { storage }).status, 'corrupt');
  assert.equal(deleteServiceEntry('a', { storage, confirmed: true }).status, 'corrupt');
  assert.equal(storage.raw(STORAGE_KEYS.entries), '{bad json');
});

test('FE-012: ошибки записи сообщаются и исходный массив остаётся прежним', () => {
  const storage = seeded();
  const snapshot = storage.raw(STORAGE_KEYS.entries);
  storage.setItem = () => { throw new Error('quota exceeded'); };
  assert.equal(updateServiceEntry('a', initial[0], { storage }).status, 'write_error');
  assert.equal(deleteServiceEntry('a', { storage, confirmed: true }).status, 'write_error');
  assert.equal(storage.raw(STORAGE_KEYS.entries), snapshot);
});

test('FE-012: ошибка ID блокирует действия', () => {
  const storage = seeded();
  const snapshot = storage.raw(STORAGE_KEYS.entries);
  assert.equal(updateServiceEntry('', initial[0], { storage }).status, 'invalid_id');
  assert.equal(deleteServiceEntry(null, { storage, confirmed: true }).status, 'invalid_id');
  assert.equal(storage.raw(STORAGE_KEYS.entries), snapshot);
});

// Минимальная DOM-модель для проверки ссылок и кнопок списка без браузера.
class Element {
  constructor(tag) { this.tagName = tag.toUpperCase(); this.children = []; this.attrs = {}; this.className = ''; this._text = ''; }
  append(...items) { this.children.push(...items); }
  setAttribute(key, value) { this.attrs[key] = String(value); }
  getAttribute(key) { return this.attrs[key] ?? null; }
  get textContent() { return this._text + this.children.map(x => x.textContent).join(''); }
  set textContent(value) { this._text = String(value); this.children = []; }
  querySelectorAll(tag) {
    const found = [];
    function walk(node) { for (const child of node.children) { if (child.tagName === tag.toUpperCase()) found.push(child); walk(child); } }
    walk(this);
    return found;
  }
}

test('FE-012: у каждой записи есть ссылка изменения и отдельная кнопка удаления', () => {
  const before = globalThis.document;
  globalThis.document = {
    createElement: tag => new Element(tag),
    createTextNode: text => { const node = new Element('#text'); node.textContent = text; return node; },
  };
  try {
    const list = createServiceHistoryList([initial[0], initial[1]]);
    const links = list.querySelectorAll('a');
    const buttons = list.querySelectorAll('button');
    assert.equal(links.length, 2);
    assert.equal(buttons.length, 2);
    assert.equal(links[0].href, '#/journal/edit/a');
    assert.equal(links[1].href, '#/journal/edit/b');
    assert.equal(buttons[0].getAttribute('data-entry-id'), 'a');
    assert.equal(buttons[1].getAttribute('data-entry-id'), 'b');
    assert.equal(buttons[0].textContent, 'Удалить');
  } finally {
    if (before === undefined) delete globalThis.document;
    else globalThis.document = before;
  }
});
