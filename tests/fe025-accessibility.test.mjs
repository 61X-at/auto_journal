import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// DOM-заглушка: тесты доступны через npm test, без браузера и сторонних пакетов.
class Element {
  constructor(tagName) {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.attributes = {};
    this.className = '';
    this.value = '';
    this.hidden = false;
    this.disabled = false;
    this.required = false;
    this.listeners = {};
    this._text = '';
  }
  set textContent(text) { this._text = String(text); this.children = []; }
  get textContent() { return this._text + this.children.map(node => typeof node === 'string' ? node : node.textContent).join(''); }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = [...children]; this._text = ''; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name] ?? null; }
  removeAttribute(name) { delete this.attributes[name]; }
  addEventListener(name, callback) { (this.listeners[name] ||= []).push(callback); }
  emit(name) { for (const callback of this.listeners[name] || []) callback({ preventDefault() {} }); }
  focus() { document.activeElement = this; }
  get validity() {
    const n = Number(this.value);
    const numeric = this.type === 'number' && this.value !== '';
    return {
      valueMissing: this.required && !String(this.value).trim(),
      rangeUnderflow: numeric && this.min !== undefined && n < Number(this.min),
      rangeOverflow: numeric && this.max !== undefined && n > Number(this.max),
      badInput: numeric && !Number.isFinite(n),
      stepMismatch: false,
      typeMismatch: false,
    };
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  querySelectorAll(selector) {
    const found = [];
    const match = el => selector.startsWith('.')
      ? el.className.split(' ').includes(selector.slice(1))
      : el.tagName.toLowerCase() === selector;
    const visit = el => { for (const c of el.children) { if (!(c instanceof Element)) continue; if (match(c)) found.push(c); visit(c); } };
    visit(this);
    return found;
  }
}
globalThis.document = {
  activeElement: null,
  createElement: name => new Element(name),
};
const { createFormField, setFieldError, validateFormFields } = await import('../src/components/FormField.js');
const { createServiceEntryForm } = await import('../src/pages/NewServiceEntryPage.js');
const { createMaintenanceForm } = await import('../src/pages/MaintenancePage.js');

const source = relative => readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8');

// Поведение ARIA на реальных переиспользуемых компонентах.
test('FE-025: каждое поле имеет явно связанный label и required', () => {
  const field = createFormField({ id: 'field-required', label: 'Описание', required: true });
  assert.equal(field.querySelector('label').htmlFor, 'field-required');
  assert.equal(field.querySelector('input').id, 'field-required');
  assert.equal(field.querySelector('input').required, true);
  assert.match(field.querySelector('label').textContent, /\*/);
});

test('FE-025: ошибка связана с вводом через aria-describedby и aria-errormessage', () => {
  const field = createFormField({ id: 'field-with-hint', label: 'Пробег', helpText: 'Только километры' });
  setFieldError(field, 'Пробег не может быть отрицательным');
  const input = field.querySelector('input');
  assert.equal(input.getAttribute('aria-invalid'), 'true');
  assert.equal(input.getAttribute('aria-describedby'), 'field-with-hint-hint field-with-hint-error');
  assert.equal(input.getAttribute('aria-errormessage'), 'field-with-hint-error');
  assert.equal(field.querySelector('.form-field__error').textContent, 'Пробег не может быть отрицательным');
  assert.equal(field.querySelector('.form-field__error').hidden, false);
});

test('FE-025: у поля без подсказки ошибка тоже доступна', () => {
  const field = createFormField({ id: 'only-error', label: 'Марка' });
  setFieldError(field, 'Укажите марку');
  assert.equal(field.querySelector('input').getAttribute('aria-describedby'), 'only-error-error');
  assert.equal(field.querySelector('input').getAttribute('aria-errormessage'), 'only-error-error');
});

test('FE-025: после исправления очищаются aria-invalid, aria-errormessage, скрытая ошибка', () => {
  const field = createFormField({ id: 'corrected', label: 'Модель', helpText: 'Укажите модель' });
  setFieldError(field, 'Обязательное поле');
  setFieldError(field, '');
  const input = field.querySelector('input');
  assert.equal(input.getAttribute('aria-invalid'), null);
  assert.equal(input.getAttribute('aria-errormessage'), null);
  assert.equal(input.getAttribute('aria-describedby'), 'corrected-hint');
  assert.equal(field.querySelector('.form-field__error').hidden, true);
});

test('FE-025: при input удаляется ошибка без потери подсказки', () => {
  const field = createFormField({ id: 'typed', label: 'Марка', helpText: 'Пример: Toyota' });
  setFieldError(field, 'Нужно исправить');
  field.querySelector('input').emit('input');
  assert.equal(field.querySelector('input').getAttribute('aria-invalid'), null);
  assert.equal(field.querySelector('input').getAttribute('aria-describedby'), 'typed-hint');
});

test('FE-025: ошибка select очищается при смене значения клавиатурой', () => {
  const field = createFormField({ id: 'category', label: 'Тип события', type: 'select', required: true, options: [
    { value: '', label: 'Выберите' }, { value: 'ТО', label: 'ТО' },
  ] });
  setFieldError(field, 'Выберите тип события');
  field.querySelector('select').value = 'ТО';
  field.querySelector('select').emit('change');
  assert.equal(field.querySelector('select').getAttribute('aria-invalid'), null);
  assert.equal(field.querySelector('select').getAttribute('aria-errormessage'), null);
});

test('FE-025: первым ошибочным полем становится первый ввод в DOM-порядке', () => {
  const form = document.createElement('form');
  const first = createFormField({ id: 'a-first', label: 'Марка', required: true });
  const second = createFormField({ id: 'b-second', label: 'Модель', required: true });
  form.append(first, second);
  const result = validateFormFields(form);
  assert.equal(result.valid, false);
  assert.equal(result.firstInvalid, first.querySelector('input'));
  assert.equal(second.querySelector('input').getAttribute('aria-invalid'), 'true');
});

test('FE-025: исправление значений позволяет пройти валидацию', () => {
  const form = document.createElement('form');
  const a = createFormField({ id: 'a', label: 'Название', required: true });
  const b = createFormField({ id: 'b', label: 'Пробег', type: 'number', min: 0, required: true });
  form.append(a, b);
  a.querySelector('input').value = 'Замена масла';
  b.querySelector('input').value = '86000';
  assert.equal(validateFormFields(form).valid, true);
  assert.equal(a.querySelector('input').getAttribute('aria-errormessage'), null);
  assert.equal(b.querySelector('input').getAttribute('aria-invalid'), null);
});

test('FE-025: форма новой записи подписана и перечисляет обязательные поля', () => {
  const { form } = createServiceEntryForm(true);
  assert.equal(form.getAttribute('aria-label'), 'Новая запись обслуживания');
  assert.equal(form.getAttribute('aria-describedby'), 'service-form-required-note');
  assert.match(form.textContent, /Поля со знаком \* обязательны/);
  assert.equal(form.querySelectorAll('.form-field--shared').length, 5);
  assert.ok(form.querySelectorAll('.form-field--shared').every(f => f.querySelector('input')?.required || f.querySelector('select')?.required));
});

test('FE-025: форма редактирования также подписана', () => {
  const { form } = createServiceEntryForm(true, { entry: { type:'ТО',date:'2026-10-10',mileage:86000,description:'Работа',amount:1500 } });
  assert.equal(form.getAttribute('aria-label'), 'Редактирование записи обслуживания');
});

test('FE-025: форма ТО объясняет, что дата и пробег альтернативны', () => {
  const { form } = createMaintenanceForm(true);
  assert.equal(form.getAttribute('aria-describedby'), 'maintenance-form-required-note');
  assert.match(form.textContent, /дату или пробег/);
  const controls = form.querySelectorAll('.form-field--shared');
  assert.equal(controls.length, 3);
  assert.equal(controls[0].querySelector('input').required, true);
  assert.equal(controls[1].querySelector('input').required, false);
  assert.equal(controls[2].querySelector('input').required, false);
});

test('FE-025: форма автомобиля содержит подписи и пояснение обязательных полей', () => {
  const js = source('src/pages/CarPage.js');
  assert.match(js, /aria-describedby', 'car-form-required-note'/);
  assert.match(js, /label: field.label, type: field.type \|\| 'text', required: true/);
});

test('FE-025: ссылка пропуска навигации ведёт в основной main', () => {
  const html = source('tempPage/index.html');
  assert.match(html, /class="skip-link" href="#main-content"/);
  assert.match(html, /<main id="main-content"[^>]+tabindex="-1"/);
  assert.match(html, /<nav aria-label="Основная навигация">/);
});

test('FE-025: смена маршрута переносит фокус в main', () => {
  const js = source('src/main.js');
  assert.match(js, /window\.addEventListener\('hashchange'/);
  assert.match(js, /main\.focus\(\{ preventScroll: true \}\)/);
});

test('FE-025: поисковая форма журнала подписывает оба поля', () => {
  const js = source('src/pages/JournalPage.js');
  assert.match(js, /<label for="journal-query">Поиск по описанию<\/label>/);
  assert.match(js, /<label for="journal-type">Тип события<\/label>/);
  assert.match(js, /form\.setAttribute\('role', 'search'\)/);
});

test('FE-025: предупреждение о сроке ТО текстовое, не только цветное', () => {
  const js = source('src/pages/MaintenancePage.js');
  assert.match(js, /'Требует внимания'/);
  assert.match(js, /badge\.textContent/);
  assert.match(js, /icon\.setAttribute\('aria-hidden', 'true'\)/);
});

function luminance(hex) {
  const channels = hex.match(/[0-9a-f]{2}/gi).map(part => parseInt(part, 16)/255)
    .map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126*channels[0] + 0.7152*channels[1] + 0.0722*channels[2];
}
function contrast(a,b) { const x = luminance(a), y = luminance(b); return (Math.max(x,y)+.05)/(Math.min(x,y)+.05); }

test('FE-025: цвета фокуса контрастны на белом фоне и тёмной навигации', () => {
  const css = source('tempPage/styles.css');
  assert.match(css, /--keyboard-focus:\s*#1245a5/);
  assert.match(css, /--keyboard-focus-dark:\s*#ffcf70/);
  assert.ok(contrast('1245a5','ffffff')>=3);
  assert.ok(contrast('ffcf70','101829')>=3);
});

test('FE-025: фокус заметен у полей, кнопок, ссылок и summary', () => {
  const css = source('tempPage/styles.css');
  assert.match(css, /:focus-visible \{ outline: 3px solid var\(--keyboard-focus\)/);
  assert.match(css, /\.site-header :focus-visible \{ outline-color: var\(--keyboard-focus-dark\)/);
  assert.match(css, /\.form-field--shared input:focus-visible/);
  assert.match(css, /\.form-field--shared select:focus-visible/);
  assert.match(css, /\.entry-card__actions \.button \{ min-height: 44px; \}/);
});
