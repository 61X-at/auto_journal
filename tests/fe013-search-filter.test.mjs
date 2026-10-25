import test from 'node:test';
import assert from 'node:assert/strict';
import { filterServiceEntries, journalHash, parseJournalFilters } from '../src/utils/serviceFilters.js';
import { SERVICE_ENTRY_TYPES } from '../src/models/serviceEntry.js';
import { createNoSearchResultsState } from '../src/pages/JournalPage.js';

const source = [
  { id: 'a', type: 'ТО', description: 'Замена моторного МАСЛА', date: '2026-09-01' },
  { id: 'b', type: 'ремонт', description: 'Ремонт генератора', date: '2026-10-01' },
  { id: 'c', type: 'замена детали', description: 'Масляный фильтр', date: '2026-08-01' },
  { id: 'd', type: 'покупка', description: 'Масло для двигателя', date: '2026-04-01' },
];
const ids = array => array.map(item => item.id);

test('FE-013: поиск по описанию игнорирует регистр кириллицы', () => {
  assert.deepEqual(ids(filterServiceEntries(source, { query: 'масло' })), ['d']);
  assert.deepEqual(ids(filterServiceEntries(source, { query: 'МАСЛА' })), ['a']);
  assert.deepEqual(ids(filterServiceEntries(source, { query: 'рЕмОнТ' })), ['b']);
});

test('FE-013: поиск удаляет пробелы по краям запроса', () => {
  assert.deepEqual(ids(filterServiceEntries(source, { query: '   ГЕНЕРАТОРА  ' })), ['b']);
});

test('FE-013: тип события работает независимо от описания', () => {
  assert.deepEqual(ids(filterServiceEntries(source, { type: 'ТО' })), ['a']);
  assert.deepEqual(ids(filterServiceEntries(source, { type: 'покупка' })), ['d']);
});

test('FE-013: все четыре категории поддерживаются моделью и фильтром', () => {
  assert.equal(SERVICE_ENTRY_TYPES.length, 4);
  for (const type of SERVICE_ENTRY_TYPES) {
    assert.equal(filterServiceEntries(source, { type }).length, 1);
  }
});

test('FE-013: поиск и тип применяются одновременно по AND', () => {
  assert.deepEqual(ids(filterServiceEntries(source, { query: 'масл', type: 'ТО' })), ['a']);
  assert.deepEqual(ids(filterServiceEntries(source, { query: 'масл', type: 'ремонт' })), []);
});

test('FE-013: сброшенные условия возвращают весь журнал', () => {
  assert.deepEqual(filterServiceEntries(source, { query: '', type: '' }), source);
  assert.equal(filterServiceEntries(source).length, source.length);
});

test('FE-013: поиск не изменяет исходные данные в localStorage', () => {
  const snapshot = JSON.stringify(source);
  const results = filterServiceEntries(source, { query: 'масл' });
  assert.notEqual(results, source);
  assert.equal(JSON.stringify(source), snapshot);
});

test('FE-013: пустой результат при несовпадении запроса', () => {
  assert.deepEqual(filterServiceEntries(source, { query: 'отсутствующая деталь' }), []);
});

test('FE-013: неизвестный тип не скрывает записи и не меняет данные', () => {
  assert.deepEqual(ids(filterServiceEntries(source, { type: 'unknown' })), ids(source));
});

test('FE-013: пустое описание записи не приводит к ошибке поиска', () => {
  assert.deepEqual(filterServiceEntries([{ type: 'ремонт', description: null }], { query: 'масло' }), []);
});

test('FE-013: вместо массива записей возвращается явная ошибка', () => {
  assert.throws(() => filterServiceEntries(null, {}), /массивом/);
});

test('FE-013: поисковые параметры кодируются в hash и восстанавливаются', () => {
  const filter = { query: ' Масло & фильтр ', type: 'ТО' };
  const hash = journalHash(filter);
  assert.match(hash, /^#\/journal\?q=/);
  assert.deepEqual(parseJournalFilters(hash), { query: 'Масло & фильтр', type: 'ТО' });
});

test('FE-013: сброс возвращает #/journal, без параметров', () => {
  assert.equal(journalHash({}), '#/journal');
  assert.deepEqual(parseJournalFilters('#/journal'), { query: '', type: '' });
});

test('FE-013: неизвестный тип и чужая страница игнорируются', () => {
  assert.deepEqual(parseJournalFilters('#/journal?q=масло&type=other'), { query: 'масло', type: '' });
  assert.deepEqual(parseJournalFilters('#/car?q=масло'), { query: '', type: '' });
});

class Element {
  constructor(tag) { this.tagName = tag.toUpperCase(); this.children = []; this._text = ''; this.attrs = {}; }
  append(...items) { this.children.push(...items); }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  get textContent() { return this._text + this.children.map(item => item.textContent).join(''); }
  set textContent(v) { this._text = String(v); this.children = []; }
}

test('FE-013: «Ничего не найдено» содержит действие сброса фильтров', () => {
  const originalDocument = globalThis.document;
  globalThis.document = { createElement: tag => new Element(tag) };
  try {
    const state = createNoSearchResultsState();
    assert.match(state.textContent, /Ничего не найдено/);
    assert.equal(state.children.at(-1).textContent, 'Сбросить фильтры');
    assert.equal(state.children.at(-1).attrs['data-action'], 'reset-journal-filters');
  } finally {
    if (originalDocument === undefined) delete globalThis.document;
    else globalThis.document = originalDocument;
  }
});
