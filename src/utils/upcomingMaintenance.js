/**
 * FE-023. Ближайшая активная работа ТО на главной, без DOM и localStorage.
 * Невозможно точно перевести километры в дни без прогноза пробега, поэтому:
 * 1) уже наступившие работы первыми;
 * 2) среди остальных — самая ранняя календарная дата;
 * 3) планы только по пробегу — по наименьшему остатку километров;
 * 4) неизвестный пробег оставляет такие планы в конце.
 * При равных критериях сохраняется порядок записи (стабильная сортировка).
 */
import { validateMaintenancePlan } from '../models/maintenancePlan.js';
import { getMaintenanceDueStatus } from './maintenanceDue.js';

export function getUpcomingMaintenanceSummary(plans, { currentMileage = null, today = new Date() } = {}) {
  if (!Array.isArray(plans)) throw new TypeError('Ожидается массив плановых работ.');
  const active = [];
  let invalidCount = 0;

  for (const plan of plans) {
    const checked = validateMaintenancePlan(plan);
    if (!checked.ok) {
      invalidCount += 1;
      continue;
    }
    if (checked.data.status === 'done') continue;

    const due = getMaintenanceDueStatus(checked.data, { currentMileage, today });
    const remainingMileage = checked.data.dueMileage === null || currentMileage === null
      ? null : Math.max(0, checked.data.dueMileage - currentMileage);
    active.push({ plan: checked.data, due, remainingMileage });
  }

  // Сортируем копию элементов, не сами сохранённые планы.
  active.sort((a, b) => {
    if (a.due.needsAttention !== b.due.needsAttention) return a.due.needsAttention ? -1 : 1;
    const kind = item => item.plan.dueDate ? 0 : item.remainingMileage !== null ? 1 : 2;
    const kindA = kind(a);
    const kindB = kind(b);
    if (kindA !== kindB) return kindA - kindB;
    if (kindA === 0) return a.plan.dueDate.localeCompare(b.plan.dueDate);
    if (kindA === 1) return a.remainingMileage - b.remainingMileage;
    return 0;
  });

  return { next: active[0] ?? null, activeCount: active.length, invalidCount };
}
