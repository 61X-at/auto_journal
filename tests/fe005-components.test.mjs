import test from 'node:test';
import assert from 'node:assert/strict';

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.attributes = {};
    this.className = '';
    this._text = '';
    this.value = '';
    this.required = false;
    this.hidden = false;
    this.disabled = false;
    this.listeners = {};
  }
  set textContent(value) { this._text = String(value); this.children = []; }
  get textContent() { return this._text + this.children.map(x => x.textContent).join(''); }
  append(...items) { this.children.push(...items); }
  replaceChildren(...items) { this.children = [...items]; this._text = ''; }
  setAttribute(key, value) { this.attributes[key] = String(value); }
  getAttribute(key) { return this.attributes[key] ?? null; }
  removeAttribute(key) { delete this.attributes[key]; }
  addEventListener(type, cb) { (this.listeners[type] ||= []).push(cb); }
  dispatch(type) { for (const cb of this.listeners[type] || []) cb({preventDefault(){}}); }
  focus() { this.focused = true; }
  get validity() {
    const numeric = this.type === 'number' && this.value !== '';
    const n = Number(this.value);
    return {
      valueMissing: this.required && !this.value,
      rangeUnderflow: numeric && this.min !== undefined && n < Number(this.min),
      rangeOverflow: numeric && this.max !== undefined && n > Number(this.max),
      badInput: numeric && !Number.isFinite(n),
      stepMismatch: false,
      typeMismatch: false,
    };
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  querySelectorAll(selector) {
    const matches = (element) => selector.startsWith('.')
      ? element.className.split(' ').includes(selector.slice(1))
      : element.tagName.toLowerCase() === selector;
    const found = [];
    const walk = node => { for (const child of node.children) { if (matches(child)) found.push(child); walk(child); } };
    walk(this);
    return found;
  }
}

globalThis.document = {
  createElement(tag) { return new FakeElement(tag); },
  createTextNode(text) { const node = new FakeElement('#text'); node.textContent = text; return node; },
};

const { createButton } = await import('../src/components/Button.js');
const { createFormField, setFieldError, validateFormFields } = await import('../src/components/FormField.js');
const { createSummaryCard } = await import('../src/components/SummaryCard.js');
const { createEmptyState } = await import('../src/components/EmptyState.js');
const { createErrorNotice } = await import('../src/components/ErrorNotice.js');
const { createDemoForm } = await import('../src/components/DemoForm.js');

test('Button: доступная подпись, ссылка или кнопка', () => {
  const action = createButton({label: 'Проверить поля'});
  assert.equal(action.tagName, 'BUTTON');
  assert.equal(action.type, 'button');
  assert.equal(action.textContent, 'Проверить поля');
  const link = createButton({label: 'К журналу',href:'#/journal'});
  assert.equal(link.tagName,'A');
  assert.equal(link.href,'#/journal');
  assert.throws(() => createButton({label:''}), /подпись/);
});

test('FormField: required, label и ошибка связаны с input', () => {
  const field = createFormField({id:'brand',label:'Марка',required:true,helpText:'Укажите марку'});
  const input = field.querySelector('input');
  assert.equal(field.querySelector('label').htmlFor, 'brand');
  assert.equal(input.required, true);
  assert.equal(input.getAttribute('aria-describedby'), 'brand-hint');
  setFieldError(field,'Заполните марку');
  assert.equal(input.getAttribute('aria-invalid'),'true');
  assert.equal(input.getAttribute('aria-describedby'),'brand-hint brand-error');
  setFieldError(field,'');
  assert.equal(input.getAttribute('aria-invalid'),null);
  assert.equal(input.getAttribute('aria-describedby'),'brand-hint');
});

test('Две формы используют единый FormField и показывают ошибки отдельно', () => {
  const car = createDemoForm({id:'car',fields:[
    {id:'car-brand',label:'Марка',required:true},
    {id:'car-km',label:'Пробег',required:true,type:'number',min:0},
  ]});
  const journal = createDemoForm({id:'journal',fields:[
    {id:'journal-description',label:'Работа',required:true},
    {id:'journal-amount',label:'Стоимость',required:true,type:'number',min:0},
  ]});
  assert.equal(car.querySelectorAll('.form-field--shared').length,2);
  assert.equal(journal.querySelectorAll('.form-field--shared').length,2);
  car.dispatch('submit');
  assert.equal(car.querySelectorAll('input').filter(i=>i.getAttribute('aria-invalid')==='true').length,2);
  assert.equal(car.querySelector('.error-notice').getAttribute('role'),'alert');
  assert.equal(car.querySelectorAll('input')[0].getAttribute('aria-describedby'),'car-brand-error');
  car.querySelectorAll('input')[0].value='Lada';
  car.querySelectorAll('input')[1].value='86000';
  car.dispatch('submit');
  assert.equal(car.querySelectorAll('input').filter(i=>i.getAttribute('aria-invalid')==='true').length,0);
  assert.ok(car.querySelector('.demo-success').textContent.includes('не сохраняются'));
  journal.querySelectorAll('input')[0].value='Замена масла';
  journal.querySelectorAll('input')[1].value='-5';
  assert.equal(validateFormFields(journal).valid,false);
  assert.equal(journal.querySelectorAll('input')[1].getAttribute('aria-invalid'),'true');
});

test('SummaryCard, EmptyState и ErrorNotice имеют ожидаемую семантику', () => {
  const summary=createSummaryCard({label:'Расходы',value:'100 ₽',numericValue:100,hint:'Всего',icon:'₽'});
  assert.equal(summary.tagName,'ARTICLE');
  assert.equal(summary.querySelector('data').value,'100');
  assert.ok(summary.textContent.includes('Расходы'));
  const empty=createEmptyState({title:'Нет записей',description:'Добавьте запись'});
  assert.equal(empty.tagName,'SECTION');
  assert.equal(empty.querySelector('h3').textContent,'Нет записей');
  const error=createErrorNotice('Ошибка поля');
  assert.equal(error.getAttribute('role'),'alert');
});
