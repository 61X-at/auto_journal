import test from 'node:test';
import assert from 'node:assert/strict';
import { mountExpenseOverview } from '../src/components/ExpenseOverview.js';

class Element {
  constructor(tag) {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.parent = null;
    this._text = '';
    this.attributes = {};
    this.value = '';
    this.className = '';
    this.hidden = false;
    this.handlers = {};
    this.classList = {
      add: name => { if (!this.className.split(/\s+/).includes(name)) this.className = `${this.className} ${name}`.trim(); },
      remove: name => { this.className = this.className.split(/\s+/).filter(value => value !== name).join(' '); },
      toggle: (name, force) => {
        if (force) this.classList.add(name);
        else this.classList.remove(name);
      },
    };
  }
  get textContent() { return this._text + this.children.map(child => child.textContent).join(''); }
  set textContent(text) { this.children = []; this._text = String(text); }
  append(...nodes) { for (const node of nodes) { this.children.push(node); node.parent = this; } }
  replaceChildren(...nodes) { this.children = []; this._text = ''; this.append(...nodes); }
  before(node) { const index = this.parent.children.indexOf(this); this.parent.children.splice(index, 0, node); node.parent = this.parent; }
  after(node) { const index = this.parent.children.indexOf(this); this.parent.children.splice(index + 1, 0, node); node.parent = this.parent; }
  remove() { if (this.parent) this.parent.children.splice(this.parent.children.indexOf(this), 1); this.parent = null; }
  setAttribute(key, value) { this.attributes[key] = String(value); }
  getAttribute(key) { return this.attributes[key] ?? null; }
  removeAttribute(key) { delete this.attributes[key]; }
  addEventListener(name, handler) { (this.handlers[name] ||= []).push(handler); }
  dispatch(name) { for (const handler of this.handlers[name] || []) handler({ preventDefault(){} }); }
  focus() { this.focused = true; }
  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
  querySelectorAll(selector) {
    const found = [];
    const match = e => selector.startsWith('.')
      ? e.className.split(/\s+/).includes(selector.slice(1))
      : e.tagName.toLowerCase() === selector.toLowerCase();
    const visit = el => { for (const child of el.children) { if (match(child)) found.push(child); visit(child); } };
    visit(this);
    return found;
  }
}

const oldDocument = globalThis.document;
globalThis.document = {
  createElement: tag => new Element(tag),
  createTextNode: text => { const element = new Element('#text'); element.textContent = text; return element; },
};
test.after(() => {
  if (oldDocument === undefined) delete globalThis.document;
  else globalThis.document = oldDocument;
});

const entries = [
  { id: '1', type: 'ТО', date: '2026-02-01', description: 'Масло', mileage: 40000, amount: 1000 },
  { id: '2', type: 'ремонт', date: '2026-03-01', description: 'Тормоза', mileage: 40200, amount: 2400 },
];
function setup(data = entries) {
  const section = new Element('section');
  const heading = new Element('h2');
  const cards = new Element('div'); cards.className = 'summary-grid';
  const details = new Element('details'); details.className = 'expense-breakdown';
  section.append(heading, cards, details);
  mountExpenseOverview(section, { ok: true, data });
  return { section, cards, details, form: section.querySelector('form') };
}

test('FE-017 DOM: реальные суммы, четыре категории, счётчик записей и форма', () => {
  const { cards, details, form } = setup();
  assert.match(cards.textContent, /3\s?400 ₽/);
  assert.match(cards.textContent, /Записей в журнале≡2/);
  assert.equal(details.querySelectorAll('li').length, 4);
  assert.equal(form.querySelectorAll('input').length, 2);
  assert.equal(form.querySelectorAll('label').length, 2);
});

test('FE-017 DOM: применение периода пересчитывает сумму', () => {
  const { cards, details, form } = setup();
  const [start, end] = form.querySelectorAll('input');
  start.value = '2026-03-01'; end.value = '2026-03-01';
  form.dispatch('submit');
  assert.match(cards.textContent, /2\s?400 ₽/);
  assert.match(details.textContent, /Ремонт2\s?400 ₽/);
});

test('FE-017 DOM: пустой диапазон показывает ноль и пояснение', () => {
  const { section, cards, form } = setup();
  const [start, end] = form.querySelectorAll('input');
  start.value = '2025-01-01'; end.value = '2025-12-31';
  form.dispatch('submit');
  assert.match(cards.textContent, /0 ₽/);
  assert.match(section.textContent, /За выбранный период записей нет/);
});

test('FE-017 DOM: обратный интервал показывает привязанную к полю ошибку без изменения суммы', () => {
  const { cards, form } = setup();
  const [start, end] = form.querySelectorAll('input');
  start.value = '2026-05-01'; end.value = '2026-01-01';
  form.dispatch('submit');
  assert.equal(end.getAttribute('aria-invalid'), 'true');
  assert.equal(end.getAttribute('aria-describedby'), 'expense-end-date-error');
  assert.equal(end.focused, true);
  assert.match(cards.textContent, /3\s?400 ₽/);
});

test('FE-017 DOM: сброс возвращает общую сумму и очищает даты', () => {
  const { cards, form } = setup();
  const [start, end] = form.querySelectorAll('input');
  start.value = '2026-03-01'; end.value = '2026-03-01';
  form.dispatch('submit');
  form.querySelectorAll('button')[1].dispatch('click');
  assert.equal(start.value, ''); assert.equal(end.value, '');
  assert.match(cards.textContent, /3\s?400 ₽/);
});

test('FE-017 DOM: пустой журнал имеет нулевую сводку, а недоступный — не подменяется нулём', () => {
  const { section, cards, details } = setup([]);
  assert.match(cards.textContent, /0 ₽/);
  assert.match(section.textContent, /В журнале пока нет записей/);
  assert.equal(details.querySelectorAll('li').length, 4);

  const badSection = new Element('section');
  const badCards = new Element('div'); badCards.className = 'summary-grid';
  const badDetails = new Element('details'); badDetails.className = 'expense-breakdown';
  badSection.append(badCards, badDetails);
  mountExpenseOverview(badSection, { ok: false, data: [] });
  assert.match(badCards.textContent, /Расходы недоступны/);
  assert.equal(badDetails.parent, null);
  assert.equal(badSection.querySelector('form'), null);
});
