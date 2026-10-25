import test from 'node:test';
import assert from 'node:assert/strict';
import { getUpcomingMaintenanceSummary } from '../src/utils/upcomingMaintenance.js';
import { mountUpcomingMaintenance } from '../src/components/UpcomingMaintenance.js';
import { STORAGE_KEYS, readCar, readPlans } from '../src/storage/localStorage.js';

const plan = (id, changes = {}) => ({ id, title: `ТО ${id}`, dueDate: '2026-12-01', dueMileage: null, status: 'planned', ...changes });
const options = { today: '2026-10-25', currentMileage: 85000 };
const selectedId = (plans, opts = options) => getUpcomingMaintenanceSummary(plans, opts).next?.plan.id;

function fakeStorage() {
  const map = new Map();
  return {
    getItem(key) { return map.has(key) ? map.get(key) : null; },
    setItem(key, value) { map.set(key, String(value)); },
    setRaw(key, value) { map.set(key, value); },
    raw(key) { return map.get(key); },
  };
}

test('FE-023: выбирается самая ранняя контрольная дата из активных работ', () => {
  assert.equal(selectedId([
    plan('late', { dueDate:'2027-12-12' }),
    plan('near', { dueDate:'2026-10-26' }),
    plan('far', { dueDate:'2026-11-02' }),
  ]), 'near');
});

test('FE-023: выполненные работы не попадают в выбор и в счётчик', () => {
  const result = getUpcomingMaintenanceSummary([
    plan('done', { status:'done', dueDate:'2025-01-01' }),
    plan('active'),
  ], options);
  assert.equal(result.next.plan.id, 'active');
  assert.equal(result.activeCount, 1);
});

test('FE-023: работа с наступившей датой идёт впереди будущей', () => {
  const result = getUpcomingMaintenanceSummary([
    plan('future', {dueDate:'2026-11-01'}),
    plan('today', {dueDate:'2026-10-25'}),
  ], options);
  assert.equal(result.next.plan.id, 'today');
  assert.equal(result.next.due.dueByDate, true);
});

test('FE-023: работа с достигнутым пробегом приоритетнее будущей даты', () => {
  const result = getUpcomingMaintenanceSummary([
    plan('future', {dueDate:'2026-10-26'}),
    plan('mileage', {dueDate:null, dueMileage:85000}),
  ], options);
  assert.equal(result.next.plan.id, 'mileage');
  assert.equal(result.next.due.needsAttention, true);
  assert.equal(result.next.due.dueByMileage, true);
});

test('FE-023: оба достигнутых порога и выполненный статус', () => {
  const all = [
    plan('done', {status:'done',dueDate:'2025-01-01',dueMileage:1}),
    plan('both', {dueDate:'2026-10-24',dueMileage:84999}),
  ];
  const result = getUpcomingMaintenanceSummary(all, options);
  assert.equal(result.next.plan.id,'both');
  assert.equal(result.next.due.dueByMileage,true);
  assert.equal(result.next.due.dueByDate,true);
});

test('FE-023: планы только по пробегу выбираются по наименьшему остатку километров', () => {
  const result = getUpcomingMaintenanceSummary([
    plan('far', {dueDate:null,dueMileage:95000}),
    plan('near', {dueDate:null,dueMileage:85010}),
    plan('mid', {dueDate:null,dueMileage:90000}),
  ], options);
  assert.equal(result.next.plan.id,'near');
  assert.equal(result.next.remainingMileage,10);
});

test('FE-023: планы с датой имеют явный приоритет перед будущим пробегом', () => {
  assert.equal(selectedId([
    plan('mileage', {dueDate:null,dueMileage:85001}),
    plan('date', {dueDate:'2027-01-01'}),
  ]), 'date');
});

test('FE-023: при неизвестном пробеге нет ложного предупреждения', () => {
  const result = getUpcomingMaintenanceSummary([plan('only-mileage', {dueDate:null,dueMileage:400})],
    { today: options.today });
  assert.equal(result.next.plan.id,'only-mileage');
  assert.equal(result.next.due.needsAttention,false);
  assert.equal(result.next.remainingMileage,null);
});

test('FE-023: при неизвестном пробеге предпочтение получает работа с датой', () => {
  assert.equal(selectedId([
    plan('mileage', {dueDate:null,dueMileage:10}),
    plan('date', {dueDate:'2026-10-26'}),
  ], {today:options.today}), 'date');
});

test('FE-023: если активных планов нет, результат пустой', () => {
  assert.deepEqual(getUpcomingMaintenanceSummary([], options), {next:null,activeCount:0,invalidCount:0});
  assert.deepEqual(getUpcomingMaintenanceSummary([plan('done',{status:'done'})],options),
    {next:null,activeCount:0,invalidCount:0});
});

test('FE-023: повреждённые отдельные планы пропускаются, не уничтожая остальные', () => {
  const result = getUpcomingMaintenanceSummary([null, {status:'wrong'},plan('valid')], options);
  assert.equal(result.invalidCount,2);
  assert.equal(result.activeCount,1);
  assert.equal(result.next.plan.id,'valid');
});

test('FE-023: стабильность при одинаковых сроках', () => {
  assert.equal(selectedId([plan('first'),plan('second')]), 'first');
  assert.equal(selectedId([
    plan('first',{dueDate:null,dueMileage:86000}),
    plan('second',{dueDate:null,dueMileage:86000}),
  ]),'first');
});

test('FE-023: сортировка не изменяет сохранённые данные и сам массив', () => {
  const plans = [plan('a',{dueDate:'2027-01-01'}),plan('b',{dueDate:'2026-10-24'})];
  const before = JSON.stringify(plans);
  const result = getUpcomingMaintenanceSummary(plans,options);
  assert.equal(result.next.plan.id,'b');
  assert.equal(JSON.stringify(plans),before);
  assert.notStrictEqual(result.next.plan, plans[1]);
});

test('FE-023: не-массив планов отклоняется', () => {
  assert.throws(()=>getUpcomingMaintenanceSummary(null,options),TypeError);
});

test('FE-023: срок на следующий день не считается просроченным', () => {
  assert.equal(getUpcomingMaintenanceSummary([plan('next',{dueDate:'2026-10-26'})],options).next.due.needsAttention,false);
});

test('FE-023: граница пробега равная текущему требует внимания', () => {
  assert.equal(getUpcomingMaintenanceSummary([plan('threshold',{dueDate:null,dueMileage:85000})],options).next.due.needsAttention,true);
});

// Проверка реальной разметки из компонента без дополнительных npm-зависимостей.
class Element {
  constructor(tag) { this.tagName=tag.toLowerCase(); this.className=''; this._text=''; this.children=[]; this.attrs={}; this.href=''; }
  set textContent(value) {this.children=[];this._text=String(value);}
  get textContent() {return this._text+this.children.map(x=>x.textContent).join('');}
  append(...items) {this.children.push(...items);}
  replaceChildren(...items) {this.children=[...items];this._text='';}
  setAttribute(key,value) {this.attrs[key]=String(value);}
  querySelector(selector) {
    if (selector === '.section-topline .status') return this.status;
    if (selector === '.maintenance-card') return this.card;
    return null;
  }
}
const originalDocument=globalThis.document;
globalThis.document={
  createElement: tag => new Element(tag),
  createTextNode: str => {const node=new Element('#text');node.textContent=str;return node;},
};
test.after(()=>{
  if (originalDocument===undefined) delete globalThis.document;
  else globalThis.document=originalDocument;
});
function section() {const el = new Element('section');el.status=new Element('span');el.card=new Element('article');return el;}
function render(plans, car = {ok:true,data:{brand:'Toyota',model:'Camry',year:2020,currentMileage:85000}}) {
  const host=section();
  const result=mountUpcomingMaintenance(host,{plansResult:{ok:true,data:plans},carResult:car,today:'2026-10-25'});
  return {host,result};
}

test('FE-023 DOM: реальное название и точная дата с прямой ссылкой на план ТО', () => {
  const {host,result}=render([plan('oil',{title:'Замена масла',dueDate:'2026-10-30'})]);
  assert.equal(result.activeCount,1);
  assert.match(host.card.textContent,/Замена масла/);
  assert.match(host.card.textContent,/30\.10\.2026/);
  assert.equal(host.status.textContent,'Запланировано');
  assert.equal(host.card.children.at(-1).href,'#/maintenance');
});

test('FE-023 DOM: при наступившем сроке отображается текст и знак предупреждения', () => {
  const {host}=render([plan('oil',{title:'Масло',dueDate:'2026-10-24'})]);
  assert.match(host.status.textContent,/Требует внимания/);
  assert.equal(host.status.children[0].attrs['aria-hidden'],'true');
  assert.match(host.card.textContent,/Требует внимания: дата наступила/);
});

test('FE-023 DOM: остаток километров берётся из настоящего пробега автомобиля', () => {
  const {host}=render([plan('oil',{dueDate:null,dueMileage:90100})]);
  assert.match(host.card.textContent,/5\s?100 км/);
  assert.match(host.card.textContent,/90\s?100 км/);
  assert.doesNotMatch(host.card.textContent,/3\s?800 км/);
});

test('FE-023 DOM: несуществующая карточка автомобиля не считается известным пробегом', () => {
  const {host,result}=render([plan('oil',{dueDate:null,dueMileage:1000})],{ok:true,data:null});
  assert.equal(result.next.due.needsAttention,false);
  assert.match(host.card.textContent,/пробег не указан/);
});

test('FE-023 DOM: пустой план не показывает статическую замену масла', () => {
  const {host,result}=render([]);
  assert.equal(result.activeCount,0);
  assert.match(host.card.textContent,/План ТО пока пуст/);
  assert.doesNotMatch(host.card.textContent,/Замена моторного масла/);
  assert.equal(host.card.children.at(-1).href,'#/maintenance');
});

test('FE-023 DOM: выполненные работы не считаются активными', () => {
  const {host,result}=render([plan('done',{status:'done'})]);
  assert.equal(result.activeCount,0);
  assert.match(host.card.textContent,/Все плановые работы выполнены/);
});

test('FE-023 DOM: повреждённый localStorage не подменяется нулём или демонстрационным ТО', () => {
  const host=section();
  const result=mountUpcomingMaintenance(host,{plansResult:{ok:false,data:[],status:'corrupt'},carResult:{ok:true,data:null}});
  assert.equal(result.ok,false);
  assert.equal(result.activeCount,null);
  assert.match(host.card.textContent,/План ТО недоступен/);
  assert.equal(host.card.children.at(-1).href,'#/maintenance');
});

test('FE-023 DOM: название от пользователя вставляется как текст, не HTML', () => {
  const {host}=render([plan('html',{title:'<img src=x onerror=alert(1)>',dueDate:'2026-12-01'})]);
  assert.match(host.card.textContent,/<img src=x onerror=alert\(1\)>/);
  assert.equal(host.card.children[0].tagName,'h3');
  assert.equal(host.card.children.filter(x=>x.tagName==='img').length,0);
});

test('FE-023: чтение планов и автомобиля сохраняет их данные неизменными', () => {
  const storage=fakeStorage();
  const storedPlans=[plan('a',{dueDate:null,dueMileage:90000})];
  const car={brand:'Honda',model:'Civic',year:2015,currentMileage:85000};
  const planText=JSON.stringify(storedPlans);const carText=JSON.stringify(car);
  storage.setRaw(STORAGE_KEYS.plans,planText);storage.setRaw(STORAGE_KEYS.car,carText);
  const host=section();
  mountUpcomingMaintenance(host,{
    plansResult:readPlans({storage}),carResult:readCar({storage}),today:'2026-10-25',
  });
  assert.match(host.card.textContent,/5\s?000 км/);
  assert.equal(storage.raw(STORAGE_KEYS.plans),planText);
  assert.equal(storage.raw(STORAGE_KEYS.car),carText);
});
