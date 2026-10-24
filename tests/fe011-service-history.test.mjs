import test from 'node:test';
import assert from 'node:assert/strict';
import { sortServiceEntriesByDate, formatServiceDate } from '../src/utils/serviceHistory.js';
import { createServiceHistoryList, createEmptyJournalState } from '../src/pages/JournalPage.js';
import { readEntries, saveEntries } from '../src/storage/localStorage.js';

const entry = (id, date, overrides = {}) => ({
  id, date, type: 'ТО', description: `Запись ${id}`, mileage: 85000, amount: 7500, ...overrides,
});

function storageStub() {
  const db = new Map();
  return {
    getItem: (k) => db.get(k) ?? null,
    setItem: (k, value) => db.set(k, String(value)),
  };
}

class Element {
  constructor(tag) { this.tagName = tag.toUpperCase(); this.children = []; this.attrs = {}; this._text = ''; this.className = ''; }
  get textContent() { return this._text + this.children.map(c => c.textContent).join(''); }
  set textContent(text) { this._text = String(text); this.children = []; }
  append(...children) { this.children.push(...children); }
  setAttribute(key, value) { this.attrs[key] = String(value); }
  getAttribute(key) { return this.attrs[key] ?? null; }
  querySelectorAll(tag) {
    const nodes = [];
    const walk = (node) => { for (const child of node.children) { if (child.tagName.toLowerCase() === tag) nodes.push(child); walk(child); } };
    walk(this);
    return nodes;
  }
}

const before = globalThis.document;
globalThis.document = {
  createElement: tag => new Element(tag),
  createTextNode: text => { const node = new Element('#text'); node.textContent = text; return node; },
};

test.after(() => {
  if (before === undefined) delete globalThis.document;
  else globalThis.document = before;
});

test('FE-011: сортировка — более новая дата перед старой независимо от порядка сохранения', () => {
  const data = [entry('old', '2026-01-10'), entry('new', '2026-10-20'), entry('middle', '2026-05-04')];
  assert.deepEqual(sortServiceEntriesByDate(data).map(x => x.id), ['new', 'middle', 'old']);
});

test('FE-011: сортировка не изменяет исходный массив и сами объекты', () => {
  const data = [entry('1', '2026-03-10'), entry('2', '2026-05-10')];
  const snapshot = JSON.stringify(data);
  const sorted = sortServiceEntriesByDate(data);
  assert.notEqual(sorted, data);
  assert.equal(JSON.stringify(data), snapshot);
  assert.equal(sorted[0], data[1]);
});

test('FE-011: одинаковые даты сохраняют порядок добавления', () => {
  assert.deepEqual(sortServiceEntriesByDate([
    entry('a', '2026-01-15'), entry('b', '2026-01-15'), entry('c', '2025-12-12'),
  ]).map(x => x.id), ['a', 'b', 'c']);
});

test('FE-011: неизвестная дата находится в конце и не ломает сортировку', () => {
  assert.deepEqual(sortServiceEntriesByDate([
    entry('bad', ''), entry('valid', '2026-08-02'), entry('missing', undefined),
  ]).map(x => x.id), ['valid', 'bad', 'missing']);
});

test('FE-011: пустой массив сортируется в пустой массив; объект вызывает ошибку', () => {
  assert.deepEqual(sortServiceEntriesByDate([]), []);
  assert.throws(() => sortServiceEntriesByDate({}), /массивом/);
});

test('FE-011: дата выводится читабельно и без пересчёта временной зоны', () => {
  assert.equal(formatServiceDate('2026-10-01'), '01.10.2026');
  assert.equal(formatServiceDate(''), 'Дата не указана');
});

test('FE-011: список выводит каждое поле и сортирует карточки', () => {
  const result = createServiceHistoryList([
    entry('old', '2026-02-01', { type: 'ремонт', mileage: 100, amount: 1200 }),
    entry('new', '2026-10-01', { type: 'ТО', mileage: 85000, amount: 7500, description: 'Замена масла' }),
  ]);
  assert.equal(result.tagName, 'UL');
  assert.equal(result.children.length, 2);
  assert.match(result.children[0].textContent, /Замена масла/);
  assert.match(result.children[0].textContent, /01\.10\.2026/);
  assert.match(result.children[0].textContent, /ТО/);
  assert.match(result.children[0].textContent, /85\s?000 км/);
  assert.match(result.children[0].textContent, /7\s?500 ₽/);
  const time = result.querySelectorAll('time')[0];
  assert.equal(time.dateTime, '2026-10-01');
  assert.match(result.children[1].textContent, /ремонт/);
});

test('FE-011: описание записывается текстом, а не HTML-разметкой', () => {
  const result = createServiceHistoryList([entry('1', '2026-09-01', { description: '<script>alert(1)</script>' })]);
  const headings = result.querySelectorAll('h3');
  assert.equal(headings.length, 1);
  assert.equal(headings[0].textContent, '<script>alert(1)</script>');
  assert.equal(result.querySelectorAll('script').length, 0);
});

test('FE-011: чтение и сортировка не меняют порядок элементов в localStorage', () => {
  const storage = storageStub();
  const input = [entry('old', '2026-01-01'), entry('new', '2026-10-01')];
  assert.equal(saveEntries(input, { storage }).ok, true);
  const sorted = sortServiceEntriesByDate(readEntries({ storage }).data);
  assert.deepEqual(sorted.map(x => x.id), ['new', 'old']);
  assert.deepEqual(readEntries({ storage }).data.map(x => x.id), ['old', 'new']);
});


test('FE-011: пустое состояние показывает объяснение и ссылку на форму создания', () => {
  const empty = createEmptyJournalState();
  assert.equal(empty.tagName, 'SECTION');
  assert.match(empty.textContent, /Пока нет записей/);
  const links = empty.querySelectorAll('a');
  assert.equal(links.length, 1);
  assert.equal(links[0].href, '#/journal/new');
  assert.equal(links[0].textContent, 'Добавить запись');
});
