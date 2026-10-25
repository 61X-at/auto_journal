import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServiceHistoryList } from '../src/pages/JournalPage.js';
import { sortServiceEntriesByDate } from '../src/utils/serviceHistory.js';

class Element {
  constructor(tagName) {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.attrs = {};
    this._text = '';
    this.className = '';
  }
  set textContent(value) { this._text = String(value); this.children = []; }
  get textContent() { return this._text + this.children.map(item => item.textContent).join(''); }
  append(...elements) { this.children.push(...elements); }
  setAttribute(key, value) { this.attrs[key] = String(value); }
  getAttribute(key) { return this.attrs[key] ?? null; }
  querySelectorAll(selector) {
    const elements = [];
    const walk = node => {
      for (const child of node.children) {
        if (selector.startsWith('.')) {
          if (child.className.split(' ').includes(selector.slice(1))) elements.push(child);
        } else if (child.tagName.toLowerCase() === selector) elements.push(child);
        walk(child);
      }
    };
    walk(this);
    return elements;
  }
}
const previousDocument = globalThis.document;
globalThis.document = {
  createElement: tag => new Element(tag),
  createTextNode: value => { const el = new Element('#text'); el.textContent = value; return el; },
};
test.after(() => {
  if (previousDocument === undefined) delete globalThis.document;
  else globalThis.document = previousDocument;
});
const record = (id, date, properties = {}) => ({
  id, date, type: 'ТО', description: 'Замена масла и фильтра', mileage: 85000, amount: 7500, ...properties,
});
const style = readFileSync(new URL('../tempPage/styles.css', import.meta.url), 'utf-8');

test('FE-015: история содержит одну карточку на запись с тем же ID для действий', () => {
  const list = createServiceHistoryList([record('id-1', '2026-08-01')]);
  assert.equal(list.children.length, 1);
  const card = list.children[0].children[0];
  assert.equal(card.className, 'entry-card');
  assert.equal(card.querySelectorAll('.entry-card__actions').length, 1);
  assert.equal(card.querySelectorAll('button')[0].getAttribute('data-entry-id'), 'id-1');
});

test('FE-015: в карточке есть дата, тип, пробег, описание и сумма', () => {
  const list = createServiceHistoryList([record('one', '2026-10-24')]);
  const card = list.children[0];
  for (const value of ['Замена масла и фильтра', '24.10.2026', 'ТО', '85', '000 км', '7', '500 ₽']) {
    assert.ok(card.textContent.includes(value), `Нет значения: ${value}`);
  }
  assert.equal(card.querySelectorAll('time')[0].dateTime, '2026-10-24');
});

test('FE-015: для мобильной компоновки дата, тип и пробег разделены на три части', () => {
  const list = createServiceHistoryList([record('one', '2026-10-24')]);
  const meta = list.querySelectorAll('.entry-card__meta-part');
  assert.equal(meta.length, 3);
  assert.match(meta[0].textContent, /Дата:/);
  assert.match(meta[1].textContent, /Тип:/);
  assert.match(meta[2].textContent, /Пробег:/);
});

test('FE-015: длинный текст и крупная сумма не обрезаются CSS на 360px', () => {
  assert.match(style, /@media\s*\(max-width:\s*620px\)/);
  assert.match(style, /#journal-records\s+\.entry-card__text\s*\{[^}]*overflow-wrap:\s*anywhere/s);
  assert.match(style, /#journal-records\s+\.entry-card__price\s*\{[^}]*white-space:\s*normal/s);
  assert.match(style, /#journal-records\s+\.entry-card__actions\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/s);
});

test('FE-015: правки адаптивности применяются только к журналу, не к главной', () => {
  assert.match(style, /#journal-records\s+\.entry-list/);
  assert.match(style, /#journal-records\s+\.entry-card/);
});

test('FE-015: сортировка остаётся прежней, исходный массив неизменен', () => {
  const data = [record('old', '2026-01-01'), record('new', '2026-10-24')];
  const snapshot = JSON.stringify(data);
  assert.deepEqual(sortServiceEntriesByDate(data).map(x => x.id), ['new', 'old']);
  assert.equal(JSON.stringify(data), snapshot);
});

test('FE-015: кнопки редактирования и удаления присутствуют в мобильной карточке', () => {
  const card = createServiceHistoryList([record('abc', '2026-01-01')]).children[0];
  assert.match(card.textContent, /Изменить/);
  assert.match(card.textContent, /Удалить/);
  assert.equal(card.querySelectorAll('.entry-card__actions').length, 1);
});

test('FE-015: потенциально длинные значения не вставляются как HTML', () => {
  const text = '<img src=x onerror=alert(1)>'.repeat(4);
  const card = createServiceHistoryList([record('abc', '2026-01-01', { description: text })]);
  assert.match(card.textContent, /<img/);
  assert.equal(card.querySelectorAll('img').length, 0);
});
