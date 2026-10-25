import test from 'node:test';
import assert from 'node:assert/strict';
import { selectRecentServiceEntries } from '../src/utils/recentServiceEntries.js';
import { createRecentServiceEntriesList } from '../src/pages/HomePage.js';
import { readEntries, saveEntries } from '../src/storage/localStorage.js';

const entry = (id, date, overrides = {}) => ({
  id, date, type: 'ТО', description: `Запись ${id}`, mileage: 80000, amount: 1000,
  ...overrides,
});

class Element {
  constructor(tag) {
    this.tagName = tag.toUpperCase(); this.children = []; this.attrs = {};
    this._text = ''; this.className = '';
  }
  get textContent() { return this._text + this.children.map(node => node.textContent).join(''); }
  set textContent(text) { this._text = String(text); this.children = []; }
  append(...nodes) { this.children.push(...nodes); }
  setAttribute(key, value) { this.attrs[key] = String(value); }
  getAttribute(key) { return this.attrs[key] ?? null; }
  querySelectorAll(tag) {
    const results = [];
    const visit = (element) => {
      for (const child of element.children) {
        if (child.tagName.toLowerCase() === tag) results.push(child);
        visit(child);
      }
    };
    visit(this);
    return results;
  }
}

const previousDocument = globalThis.document;
globalThis.document = {
  createElement: tag => new Element(tag),
  createTextNode: text => {
    const node = new Element('#text');
    node.textContent = String(text);
    return node;
  },
};
test.after(() => {
  if (previousDocument === undefined) delete globalThis.document;
  else globalThis.document = previousDocument;
});

test('FE-014: пустое хранилище даёт пустой список', () => {
  assert.deepEqual(selectRecentServiceEntries([]), []);
  assert.equal(createRecentServiceEntriesList([]).children.length, 0);
});

test('FE-014: одна запись остаётся одной', () => {
  assert.deepEqual(selectRecentServiceEntries([entry('one', '2026-01-01')]).map(item => item.id), ['one']);
});

test('FE-014: более новые даты выше старых независимо от порядка добавления', () => {
  const data = [entry('old', '2026-02-10'), entry('new', '2026-10-20'), entry('middle', '2026-06-02')];
  assert.deepEqual(selectRecentServiceEntries(data).map(item => item.id), ['new', 'middle', 'old']);
});

test('FE-014: показывает не более трёх записей из пяти', () => {
  const data = [entry('one', '2026-01-01'), entry('two', '2026-02-01'), entry('three', '2026-03-01'), entry('four', '2026-04-01'), entry('five', '2026-05-01')];
  assert.deepEqual(selectRecentServiceEntries(data).map(item => item.id), ['five', 'four', 'three']);
  assert.equal(createRecentServiceEntriesList(data).children.length, 3);
});

test('FE-014: сортировка не мутирует объекты и массив из хранилища', () => {
  const source = [entry('a', '2026-01-01'), entry('b', '2026-02-01')];
  const before = JSON.stringify(source);
  const result = selectRecentServiceEntries(source);
  assert.equal(JSON.stringify(source), before);
  assert.notEqual(result, source);
});

test('FE-014: при одинаковых датах сохраняется исходный порядок', () => {
  const result = selectRecentServiceEntries([entry('first', '2026-10-10'), entry('second', '2026-10-10'), entry('third', '2026-10-09')]);
  assert.deepEqual(result.map(item => item.id), ['first', 'second', 'third']);
});

test('FE-014: карточка показывает тип, дату, описание и стоимость', () => {
  const list = createRecentServiceEntriesList([entry('oil', '2026-10-20', {
    type: 'замена детали', description: 'Замена тормозных колодок', amount: 12500,
  })]);
  assert.match(list.textContent, /Замена тормозных колодок/);
  assert.match(list.textContent, /20\.10\.2026/);
  assert.match(list.textContent, /замена детали/);
  assert.match(list.textContent, /12\s?500 ₽/);
  assert.equal(list.querySelectorAll('time')[0].dateTime, '2026-10-20');
  assert.equal(list.querySelectorAll('data')[0].value, '12500');
});

test('FE-014: краткие карточки не содержат кнопок редактирования и удаления', () => {
  const list = createRecentServiceEntriesList([entry('a', '2026-10-02')]);
  assert.equal(list.querySelectorAll('button').length, 0);
  assert.doesNotMatch(list.textContent, /Удалить|Изменить/);
});

test('FE-014: описание выводится текстом, не исполняется как HTML', () => {
  const list = createRecentServiceEntriesList([entry('unsafe', '2026-10-15', { description: '<img src=x onerror=alert(1)>' })]);
  assert.equal(list.querySelectorAll('img').length, 0);
  assert.match(list.textContent, /<img src=x onerror=alert\(1\)>/);
});

test('FE-014: сохранённые записи перечитываются и не меняются от построения списка', () => {
  const db = new Map();
  const storage = { getItem: k => db.get(k) ?? null, setItem: (k, v) => db.set(k, v) };
  const original = [entry('old', '2025-09-15'), entry('recent', '2026-10-15')];
  assert.equal(saveEntries(original, { storage }).ok, true);
  const before = db.get('autojournal_v1_entries');
  const stored = readEntries({ storage });
  assert.equal(stored.ok, true);
  createRecentServiceEntriesList(stored.data);
  assert.equal(db.get('autojournal_v1_entries'), before);
});

test('FE-014: неверный тип данных не отображается молча как список', () => {
  assert.throws(() => selectRecentServiceEntries(null), /массивом/);
});
