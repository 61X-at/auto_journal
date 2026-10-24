import test from 'node:test';
import assert from 'node:assert/strict';
import { saveNewServiceEntry } from '../src/pages/NewServiceEntryPage.js';
import { readEntries, STORAGE_KEYS } from '../src/storage/localStorage.js';

function fakeStorage() {
  const map = new Map();
  return {
    getItem: key => map.has(key) ? map.get(key) : null,
    setItem: (key, value) => map.set(key, String(value)),
    putRaw: (key, value) => map.set(key, value),
    raw: key => map.get(key),
  };
}
const valid = Object.freeze({
  type: 'ТО', date: '2026-09-15', mileage: '85000',
  description: '  Замена масла и фильтра  ', amount: '7500',
});

test('FE-010: валидная запись о замене масла сохраняется в массив с уникальным id', () => {
  const storage = fakeStorage();
  const result = saveNewServiceEntry(valid, { storage });
  assert.equal(result.ok, true);
  assert.match(result.data.id, /^.+$/);
  assert.equal(result.data.description, 'Замена масла и фильтра');
  assert.deepEqual(readEntries({ storage }).data, [result.data]);
});

test('FE-010: следующая запись не удаляет предыдущую и получает новый id', () => {
  const storage = fakeStorage();
  const first = saveNewServiceEntry(valid, { storage });
  const second = saveNewServiceEntry({ ...valid, type: 'ремонт', amount: '1200' }, { storage });
  const all = readEntries({ storage });
  assert.equal(all.data.length, 2);
  assert.notEqual(first.data.id, second.data.id);
  assert.equal(all.data[0].id, first.data.id);
  assert.equal(all.data[1].id, second.data.id);
});

test('FE-010: форма блокирует пустое описание и отмечает ошибку конкретного поля', () => {
  const storage = fakeStorage();
  const result = saveNewServiceEntry({ ...valid, description: '  ' }, { storage });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'validation_error');
  assert.ok(result.errors.description);
  assert.equal(storage.raw(STORAGE_KEYS.entries), undefined);
});

test('FE-010: неполная дата, отрицательная стоимость и дробный пробег блокируются', () => {
  const storage = fakeStorage();
  const result = saveNewServiceEntry({
    ...valid, date: '2026-02-30', mileage: '1.5', amount: '-99', type: '',
  }, { storage });
  assert.equal(result.ok, false);
  for (const field of ['type', 'date', 'mileage', 'amount']) assert.ok(result.errors[field]);
  assert.equal(storage.raw(STORAGE_KEYS.entries), undefined);
});

test('FE-010: запись в localStorage переживает повторное чтение', () => {
  const storage = fakeStorage();
  const original = saveNewServiceEntry(valid, { storage });
  const reconstructed = JSON.parse(storage.raw(STORAGE_KEYS.entries));
  assert.deepEqual(reconstructed, [original.data]);
});

test('FE-010: повреждённое содержимое не перезаписывается', () => {
  const storage = fakeStorage();
  storage.putRaw(STORAGE_KEYS.entries, '{broken json');
  const result = saveNewServiceEntry(valid, { storage });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'corrupt');
  assert.equal(storage.raw(STORAGE_KEYS.entries), '{broken json');
});

test('FE-010: ошибка записи сохраняет прежний массив и не сообщает об успехе', () => {
  const storage = fakeStorage();
  const previous = JSON.stringify([{ id: 'old', ...valid }]);
  storage.putRaw(STORAGE_KEYS.entries, previous);
  storage.setItem = () => { throw Error('quota'); };
  const result = saveNewServiceEntry(valid, { storage });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'write_error');
  assert.equal(storage.raw(STORAGE_KEYS.entries), previous);
});

test('FE-010: запись событий не затрагивает карточку автомобиля и планы ТО', () => {
  const storage = fakeStorage();
  const car = JSON.stringify({ brand: 'Lada' });
  const plans = JSON.stringify([{ id: 'p1' }]);
  storage.putRaw(STORAGE_KEYS.car, car);
  storage.putRaw(STORAGE_KEYS.plans, plans);
  assert.equal(saveNewServiceEntry(valid, { storage }).ok, true);
  assert.equal(storage.raw(STORAGE_KEYS.car), car);
  assert.equal(storage.raw(STORAGE_KEYS.plans), plans);
});

test('FE-010: общая форма поддерживает обязательный select и ошибку с aria-describedby', async () => {
  const { createFormField, setFieldError } = await import('../src/components/FormField.js');
  class Element {
    constructor(tag) { this.tagName = tag.toLowerCase(); this.children = []; this.attrs = {}; this.className = ''; this.hidden = false; }
    append(...items) { this.children.push(...items); }
    setAttribute(key, value) { this.attrs[key] = String(value); }
    getAttribute(key) { return this.attrs[key] ?? null; }
    removeAttribute(key) { delete this.attrs[key]; }
    addEventListener() {}
    querySelector(selector) {
      const candidates = [this, ...this.children.flatMap(function walk(node) { return [node, ...node.children.flatMap(walk)]; })];
      return candidates.find(node => selector.startsWith('.')
        ? node.className.split(' ').includes(selector.slice(1))
        : node.tagName === selector) ?? null;
    }
  }
  const before = globalThis.document;
  globalThis.document = { createElement: tag => new Element(tag) };
  try {
    const field = createFormField({
      id: 'kind', label: 'Тип события', type: 'select', required: true,
      options: [{ value: '', label: 'Выберите' }, { value: 'ТО', label: 'ТО' }],
    });
    const select = field.querySelector('select');
    assert.equal(select.required, true);
    assert.equal(select.children.length, 2);
    assert.equal(select.children[1].value, 'ТО');
    setFieldError(field, 'Выберите тип события');
    assert.equal(select.getAttribute('aria-invalid'), 'true');
    assert.equal(select.getAttribute('aria-describedby'), 'kind-error');
    setFieldError(field, '');
    assert.equal(select.getAttribute('aria-invalid'), null);
  } finally {
    if (before === undefined) delete globalThis.document;
    else globalThis.document = before;
  }
});
