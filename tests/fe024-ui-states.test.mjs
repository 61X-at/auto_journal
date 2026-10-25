import test from 'node:test';
import assert from 'node:assert/strict';
import { mountHomeCarCard } from '../src/components/HomeCarCard.js';
import { createSuccessNotice } from '../src/components/SuccessNotice.js';
import { setFlashNotice, takeFlashNotice } from '../src/utils/flashNotice.js';
import { saveCarFormData } from '../src/pages/CarPage.js';
import { saveNewServiceEntry } from '../src/pages/NewServiceEntryPage.js';
import { updateServiceEntry } from '../src/utils/serviceEntryActions.js';
import { saveNewMaintenancePlan, markMaintenancePlanDone } from '../src/pages/MaintenancePage.js';
import { readLocalData, STORAGE_KEYS } from '../src/storage/localStorage.js';

// Достаточно для DOM-компонентов; никаких дополнительных npm-пакетов.
class Element {
  constructor(tag = 'div') { this.tagName = tag; this.className = ''; this.children = []; this._text = ''; this.attributes = {}; this.href = ''; }
  set textContent(text) { this._text = String(text); this.children = []; }
  get textContent() { return this._text + this.children.map(child => child.textContent).join(''); }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this._text = ''; this.children = [...children]; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name] ?? null; }
  querySelector(selector) {
    if (selector === '.car-card') return this.card;
    if (selector === '.car-card__subtitle') return this.subtitle;
    if (selector === '.car-properties__item dd') return this.mileage;
    if (selector === '.car-card__details') return this.details;
    if (selector === 'h3') return this.heading;
    return null;
  }
}
const originalDocument = globalThis.document;
globalThis.document = {
  createElement(tag) { return new Element(tag); },
  createTextNode(text) { const node = new Element('#text'); node.textContent = text; return node; },
};
test.after(() => {
  if (originalDocument === undefined) delete globalThis.document;
  else globalThis.document = originalDocument;
});
function setupCar() {
  const section = new Element('section');
  const card = new Element('article');
  const details = new Element('div');
  const heading = new Element('h3');
  const subtitle = new Element('p');
  const mileage = new Element('dd');
  card.heading = heading; card.subtitle = subtitle; card.details = details; card.mileage = mileage;
  details.append(heading, subtitle, mileage);
  card.append(details);
  section.card = card;
  return { section, card, heading, subtitle, mileage, details };
}
const car = { brand: 'Toyota', model: 'Camry', year: 2020, currentMileage: 125000 };

test('FE-024: карточка главной показывает реальную марку, модель и пробег', () => {
  const ui = setupCar();
  const result = mountHomeCarCard(ui.section, { ok: true, data: car });
  assert.equal(result.status, 'loaded');
  assert.equal(ui.heading.textContent, 'Toyota Camry');
  assert.match(ui.subtitle.textContent, /2020 год/);
  assert.match(ui.mileage.textContent, /125\s?000 км/);
  assert.equal(ui.details.children.at(-1).href, '#/car');
});
test('FE-024: пустая карточка показывает действие добавления, а не выдуманную Lada', () => {
  const ui = setupCar();
  assert.equal(mountHomeCarCard(ui.section, { ok: true, data: null }).status, 'empty');
  assert.match(ui.card.textContent, /Автомобиль ещё не добавлен/);
  assert.doesNotMatch(ui.card.textContent, /Lada Vesta/);
  assert.equal(ui.card.children[0].children.at(-1).href, '#/car');
});
test('FE-024: ошибка чтения автомобиля не выглядит как отсутствие машины', () => {
  const ui = setupCar();
  assert.equal(mountHomeCarCard(ui.section, { ok: false, status: 'corrupt' }).ok, false);
  assert.match(ui.card.textContent, /недоступна/);
  assert.doesNotMatch(ui.card.textContent, /Добавить автомобиль/);
});
test('FE-024: некорректные поля уже сохранённого авто не рендерятся как валидные', () => {
  const ui = setupCar();
  const result = mountHomeCarCard(ui.section, { ok: true, data: { brand: 'X' } });
  assert.equal(result.status, 'invalid');
  assert.match(ui.card.textContent, /требуют проверки/);
  assert.equal(ui.card.children[0].children.at(-1).href, '#/car');
});
test('FE-024: ввод с HTML-тегами не исполняется и вставляется текстом', () => {
  const ui = setupCar();
  mountHomeCarCard(ui.section, { ok: true, data: { ...car, brand: '<img src=x>' } });
  assert.equal(ui.heading.textContent, '<img src=x> Camry');
  assert.equal(ui.heading.children.length, 0);
});
test('FE-024: переданный автомобиль не изменяется при рендере', () => {
  const ui = setupCar();
  const before = JSON.stringify(car);
  mountHomeCarCard(ui.section, { ok: true, data: car });
  assert.equal(JSON.stringify(car), before);
});
test('FE-024: сообщение об успехе использует role=status и textContent', () => {
  const message = createSuccessNotice('Успешно <script>');
  assert.equal(message.getAttribute('role'), 'status');
  assert.equal(message.textContent, 'Успешно <script>');
  assert.match(message.className, /success-notice/);
});
test('FE-024: подтверждение показывается только один раз на правильном маршруте', () => {
  setFlashNotice('journal', 'Запись сохранена');
  assert.equal(takeFlashNotice('journal'), 'Запись сохранена');
  assert.equal(takeFlashNotice('journal'), null);
});
test('FE-024: подтверждение не показывается на чужом маршруте', () => {
  setFlashNotice('journal', 'Запись сохранена');
  assert.equal(takeFlashNotice('car'), null);
  assert.equal(takeFlashNotice('journal'), null);
});
test('FE-024: новое подтверждение заменяет предыдущее', () => {
  setFlashNotice('journal', 'Запись сохранена');
  setFlashNotice('journal', 'Запись изменена');
  assert.equal(takeFlashNotice('journal'), 'Запись изменена');
});
test('FE-024: пустой текст подтверждения не принимается', () => {
  assert.throws(() => setFlashNotice('journal', '   '), TypeError);
  assert.throws(() => setFlashNotice('', 'Сохранено'), TypeError);
});

function storage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem(key) { return map.has(key) ? map.get(key) : null; },
    setItem(key, value) { map.set(key, String(value)); },
    raw(key) { return map.get(key); },
  };
}
const entryRaw = { type: 'ТО', date: '2026-10-22', mileage: '5000', description: 'Замена масла', amount: '1500' };
const planRaw = { title: 'Замена масла', dueDate: '', dueMileage: '90000' };
const carRaw = { brand: 'Toyota', model: 'Camry', year: '2020', currentMileage: '125000' };
const entry = { ...entryRaw, id: 'entry-1', mileage: 5000, amount: 1500 };
const plan = { id: 'plan-1', title: 'Замена масла', dueDate: null, dueMileage: 90000, status: 'planned' };
const errorStorage = before => ({
  getItem: key => before.getItem(key),
  setItem() { throw new Error('Квота исчерпана'); },
});

test('FE-024: сбой записи автомобиля возвращает ошибку и сохраняет старые данные', () => {
  const original = storage({ [STORAGE_KEYS.car]: JSON.stringify(car) });
  const result = saveCarFormData(carRaw, { storage: errorStorage(original) });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'write_error');
  assert.match(result.message, /Не удалось сохранить/);
  assert.deepEqual(JSON.parse(original.raw(STORAGE_KEYS.car)), car);
});
test('FE-024: сбой добавления события не удаляет историю', () => {
  const original = storage({ [STORAGE_KEYS.entries]: JSON.stringify([entry]) });
  const result = saveNewServiceEntry(entryRaw, { storage: errorStorage(original) });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'write_error');
  assert.equal(JSON.parse(original.raw(STORAGE_KEYS.entries)).length, 1);
});
test('FE-024: сбой редактирования оставляет исходную запись', () => {
  const original = storage({ [STORAGE_KEYS.entries]: JSON.stringify([entry]) });
  const result = updateServiceEntry(entry.id, { ...entryRaw, description: 'Новые данные' }, { storage: errorStorage(original) });
  assert.equal(result.ok, false);
  assert.equal(JSON.parse(original.raw(STORAGE_KEYS.entries))[0].description, 'Замена масла');
});
test('FE-024: повреждённый JSON не перезаписывается при добавлении', () => {
  const original = storage({ [STORAGE_KEYS.entries]: '{invalid' });
  const result = saveNewServiceEntry(entryRaw, { storage: original });
  assert.equal(result.status, 'corrupt');
  assert.equal(original.raw(STORAGE_KEYS.entries), '{invalid');
});
test('FE-024: сбой создания плана не удаляет остальные планы', () => {
  const original = storage({ [STORAGE_KEYS.plans]: JSON.stringify([plan]) });
  const result = saveNewMaintenancePlan(planRaw, { storage: errorStorage(original) });
  assert.equal(result.ok, false);
  assert.equal(JSON.parse(original.raw(STORAGE_KEYS.plans)).length, 1);
});
test('FE-024: ошибка при отметке выполнения не помечает работу done', () => {
  const original = storage({ [STORAGE_KEYS.plans]: JSON.stringify([plan]) });
  const result = markMaintenancePlanDone('plan-1', { storage: errorStorage(original) });
  assert.equal(result.status, 'write_error');
  assert.equal(JSON.parse(original.raw(STORAGE_KEYS.plans))[0].status, 'planned');
});
test('FE-024: пустой журнал и пустой план — допустимые значения, повреждение — ошибка', () => {
  const empty = storage();
  assert.deepEqual(readLocalData('entries', { storage: empty }).data, []);
  assert.deepEqual(readLocalData('plans', { storage: empty }).data, []);
  assert.equal(readLocalData('car', { storage: empty }).data, null);
  const corrupt = storage({ [STORAGE_KEYS.entries]: '{broken' });
  assert.equal(readLocalData('entries', { storage: corrupt }).ok, false);
});
