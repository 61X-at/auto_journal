/** FE-028: integration checks for eight user stories and three acceptance groups.
 * Browser E2E of the same flow: python tests/fe028-e2e-browser.py
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { saveCarFormData } from '../src/pages/CarPage.js';
import { saveNewServiceEntry } from '../src/pages/NewServiceEntryPage.js';
import { updateServiceEntry, deleteServiceEntry } from '../src/utils/serviceEntryActions.js';
import { saveNewMaintenancePlan, markMaintenancePlanDone } from '../src/pages/MaintenancePage.js';
import { readCar, readEntries, readPlans, STORAGE_KEYS } from '../src/storage/localStorage.js';
import { filterServiceEntries } from '../src/utils/serviceFilters.js';
import { sortServiceEntriesByDate } from '../src/utils/serviceHistory.js';
import { calculateExpenseSummary } from '../src/utils/expenses.js';
import { getMaintenanceDueStatus } from '../src/utils/maintenanceDue.js';
import { getUpcomingMaintenanceSummary } from '../src/utils/upcomingMaintenance.js';

function memoryStorage() {
  const map = new Map();
  return {
    getItem: key => map.has(key) ? map.get(key) : null,
    setItem(key, value) { map.set(key, String(value)); },
    removeItem: key => map.delete(key),
    snapshot: () => Object.fromEntries(map),
  };
}
const auto = { brand: 'Toyota', model: 'Camry', year: '2018', currentMileage: '120000' };
const oil = { type: 'ТО', date: '2026-10-20', mileage: '120000', description: 'Замена масла (масло 5W-30)', amount: '2700' };
const pads = { type: 'замена детали', date: '2026-09-05', mileage: '119000', description: 'Замена колодок', amount: '5000' };
const nextOil = { title: 'Следующая замена масла', dueDate: '2026-12-31', dueMileage: '119500' };

function scenario() {
  const storage = memoryStorage();
  const options = { storage };
  return { storage, options };
}
function seedAutoAndOil(options) {
  assert.equal(saveCarFormData(auto, options).ok, true);
  const saved = saveNewServiceEntry(oil, options);
  assert.equal(saved.ok, true);
  return saved.data.id;
}

test('FE-028 US-01: создание и обновление пробега автомобиля', () => {
  const { options } = scenario();
  assert.equal(saveCarFormData(auto, options).ok, true);
  assert.equal(saveCarFormData({ ...auto, currentMileage: '121000' }, options).ok, true);
  assert.deepEqual(readCar(options).data, { brand:'Toyota', model:'Camry', year:2018, currentMileage:121000 });
});

test('FE-028 US-02: запись замены масла сохраняет дату, стоимость и описание', () => {
  const { options } = scenario();
  const result = saveNewServiceEntry(oil, options);
  assert.equal(result.ok, true);
  assert.equal(readEntries(options).data[0].description, oil.description);
  assert.equal(readEntries(options).data[0].amount, 2700);
  assert.equal(readEntries(options).data[0].date, oil.date);
});

test('FE-028 US-03: редактирование и удаление исправляют историю без дубликата', () => {
  const { options } = scenario();
  const id = seedAutoAndOil(options);
  assert.equal(updateServiceEntry(id, { ...oil, amount: '3000' }, options).ok, true);
  assert.equal(readEntries(options).data.length, 1);
  assert.equal(readEntries(options).data[0].amount, 3000);
  assert.equal(deleteServiceEntry(id, options).status, 'cancelled');
  assert.equal(readEntries(options).data.length, 1);
  assert.equal(deleteServiceEntry(id, { ...options, confirmed:true }).ok, true);
  assert.equal(readEntries(options).data.length, 0);
});

test('FE-028 US-04: поиск и фильтр категории работают совместно без учёта регистра', () => {
  const { options } = scenario();
  seedAutoAndOil(options);
  assert.equal(saveNewServiceEntry(pads, options).ok, true);
  const entries = readEntries(options).data;
  assert.equal(filterServiceEntries(entries, { query:'МАСЛО', type:'ТО' }).length, 1);
  assert.equal(filterServiceEntries(entries, { query:'МАСЛО', type:'замена детали' }).length, 0);
});

test('FE-028 US-05: общая сумма, категории и период после редактирования', () => {
  const { options } = scenario();
  const id = seedAutoAndOil(options);
  assert.equal(saveNewServiceEntry(pads, options).ok, true);
  assert.equal(updateServiceEntry(id, { ...oil, amount:'3000' }, options).ok, true);
  const entries = readEntries(options).data;
  const all = calculateExpenseSummary(entries);
  assert.equal(all.total, 8000);
  assert.equal(all.byCategory['ТО'], 3000);
  assert.equal(all.byCategory['замена детали'], 5000);
  assert.equal(calculateExpenseSummary(entries,{startDate:'2026-10-20',endDate:'2026-10-20'}).total,3000);
});

test('FE-028 US-06: план следующего ТО и ближайшая активная работа', () => {
  const { options } = scenario();
  assert.equal(saveCarFormData(auto, options).ok, true);
  assert.equal(saveNewMaintenancePlan(nextOil, options).ok, true);
  const summary = getUpcomingMaintenanceSummary(readPlans(options).data, {
    currentMileage: readCar(options).data.currentMileage, today: new Date('2026-10-25T12:00:00'),
  });
  assert.equal(summary.next.plan.title, nextOil.title);
  assert.equal(summary.next.due.needsAttention, true);
});

test('FE-028 US-07: выполненная работа больше не активна и не создаёт запись в журнале', () => {
  const { options } = scenario();
  const created = saveNewMaintenancePlan(nextOil, options);
  assert.equal(created.ok, true);
  assert.equal(markMaintenancePlanDone(created.data.id, options).ok,true);
  assert.equal(readPlans(options).data[0].status, 'done');
  assert.equal(getUpcomingMaintenanceSummary(readPlans(options).data,{currentMileage:120000}).activeCount,0);
  assert.equal(readEntries(options).data.length, 0);
});

test('FE-028 US-08: все данные восстанавливаются из сохранённого JSON', () => {
  const { storage, options } = scenario();
  seedAutoAndOil(options);
  assert.equal(saveNewMaintenancePlan(nextOil,options).ok,true);
  const snapshot=storage.snapshot();
  assert.equal(Object.keys(snapshot).length,3);
  const reopened=memoryStorage();
  Object.entries(snapshot).forEach(([key,val])=>reopened.setItem(key,val));
  assert.equal(readCar({storage:reopened}).data.brand,'Toyota');
  assert.equal(readEntries({storage:reopened}).data.length,1);
  assert.equal(readPlans({storage:reopened}).data.length,1);
});

test('FE-028 AC-01: отрицательная сумма не изменяет сохранённую историю', () => {
  const {storage,options}=scenario();
  const result=saveNewServiceEntry({...oil,amount:'-1'},options);
  assert.equal(result.status,'validation_error');
  assert.equal(readEntries(options).data.length,0);
  assert.equal(storage.snapshot()[STORAGE_KEYS.entries],undefined);
});

test('FE-028 AC-02: новые события первые, отсутствие совпадений распознаётся', () => {
  const {options}=scenario();
  assert.equal(saveNewServiceEntry(pads,options).ok,true);
  assert.equal(saveNewServiceEntry(oil,options).ok,true);
  assert.equal(sortServiceEntriesByDate(readEntries(options).data)[0].date,oil.date);
  assert.deepEqual(filterServiceEntries(readEntries(options).data,{query:'не существует'}),[]);
});

test('FE-028 AC-03: дата и пробег — независимые причины наступления срока', () => {
  const {options}=scenario();
  const created=saveNewMaintenancePlan(nextOil,options);
  assert.equal(created.ok,true);
  assert.equal(getMaintenanceDueStatus(created.data,{currentMileage:120000,today:new Date('2026-10-25T12:00:00')}).needsAttention,true);
  assert.equal(getMaintenanceDueStatus(created.data,{currentMileage:90000,today:new Date('2027-01-01T12:00:00')}).needsAttention,true);
  assert.equal(getMaintenanceDueStatus(created.data,{currentMileage:90000,today:new Date('2026-10-25T12:00:00')}).needsAttention,false);
  assert.equal(markMaintenancePlanDone(created.data.id,options).ok,true);
  assert.equal(getMaintenanceDueStatus(readPlans(options).data[0],{currentMileage:120000}).needsAttention,false);
});
