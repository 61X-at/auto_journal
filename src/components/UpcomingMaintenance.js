/** FE-023: карточка ближайшего ТО на главной. Данные только из сохранённых планов. */
import { validateCar } from '../models/car.js';
import { getUpcomingMaintenanceSummary } from '../utils/upcomingMaintenance.js';

function shortDate(iso) {
  const [year, month, day] = iso.split('-');
  return `${day}.${month}.${year}`;
}

function addParagraph(card, value, className = '') {
  const p = document.createElement('p');
  if (className) p.className = className;
  p.textContent = value;
  card.append(p);
  return p;
}

/** Отображает состояние, не изменяя ни plan, ни car, ни localStorage. */
export function mountUpcomingMaintenance(section, { plansResult, carResult, today = new Date() }) {
  const status = section.querySelector('.section-topline .status');
  const card = section.querySelector('.maintenance-card');
  if (!status || !card) throw new Error('Отсутствует разметка ближайшего ТО.');
  card.replaceChildren();

  const heading = document.createElement('h3');
  card.append(heading);

  const link = document.createElement('a');
  link.className = 'text-link';
  link.href = '#/maintenance';
  link.textContent = 'Перейти к плану ТО →';

  function setStatus(label, kind) {
    status.className = `status status--${kind}`;
    status.replaceChildren();
    if (kind === 'attention') {
      const icon = document.createElement('span');
      icon.className = 'status__icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.textContent = '⚠';
      status.append(icon);
    }
    status.append(document.createTextNode(label));
  }

  if (!plansResult?.ok) {
    setStatus('Недоступно', 'planned');
    heading.textContent = 'План ТО недоступен';
    addParagraph(card, 'Не удалось прочитать план обслуживания. Сохранённые данные не изменены.');
    card.append(link);
    return { ok: false, activeCount: null, next: null };
  }

  const checkedCar = carResult?.ok && carResult.data ? validateCar(carResult.data) : null;
  const currentMileage = checkedCar?.ok ? checkedCar.data.currentMileage : null;
  const summary = getUpcomingMaintenanceSummary(plansResult.data, { currentMileage, today });
  const { next } = summary;

  if (!next) {
    setStatus('Нет активных работ', 'planned');
    heading.textContent = summary.invalidCount ? 'Не удалось определить ближайшее ТО'
      : plansResult.data.some(plan => plan?.status === 'done') ? 'Все плановые работы выполнены' : 'План ТО пока пуст';
    addParagraph(card, summary.invalidCount
      ? 'Некоторые планы содержат ошибки. Проверьте их в разделе «План ТО».'
      : 'Добавьте плановую работу с датой или контрольным пробегом.');
    card.append(link);
    return { ok: true, ...summary };
  }

  setStatus(next.due.needsAttention ? 'Требует внимания' : 'Запланировано',
    next.due.needsAttention ? 'attention' : 'planned');
  heading.textContent = next.plan.title;

  if (next.plan.dueDate) {
    addParagraph(card, `Контрольная дата: ${shortDate(next.plan.dueDate)}`, 'maintenance-card__subtitle');
  }
  if (next.plan.dueMileage !== null) {
    addParagraph(card, `Контрольный пробег: ${next.plan.dueMileage.toLocaleString('ru-RU')} км`,
      'maintenance-card__subtitle');
  }
  if (next.due.needsAttention) {
    const reasons = [];
    if (next.due.dueByDate) reasons.push('дата наступила');
    if (next.due.dueByMileage) reasons.push('пробег достигнут');
    addParagraph(card, `Требует внимания: ${reasons.join(', ')}.`);
  } else if (next.remainingMileage !== null) {
    addParagraph(card, `Осталось по пробегу: ${next.remainingMileage.toLocaleString('ru-RU')} км`);
  }
  if (currentMileage === null && next.plan.dueMileage !== null) {
    addParagraph(card, 'Текущий пробег не указан — срок по пробегу проверить нельзя.');
  }
  card.append(link);
  return { ok: true, ...summary };
}
