/**
 * FE-011. Возвращает копию журнала, отсортированную от новых дат к старым.
 * Даты из модели FE-009 имеют формат YYYY-MM-DD, поэтому строки ISO
 * сравниваются без преобразования в Date и без влияния часового пояса.
 * Для одинаковых дат сохраняем исходный порядок записей.
 * Неизвестные даты идут в конце: чтение старых записей не должно ломать UI.
 */
export function sortServiceEntriesByDate(entries) {
  if (!Array.isArray(entries)) {
    throw new TypeError('История обслуживания должна быть массивом');
  }

  const sortableDate = (entry) => {
    const date = entry?.date;
    return typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : '';
  };

  return [...entries].sort((a, b) => {
    const firstDate = sortableDate(a);
    const secondDate = sortableDate(b);
    return firstDate < secondDate ? 1 : firstDate > secondDate ? -1 : 0;
  });
}

/** Показывает дату из модели в привычном русскоязычном формате. */
export function formatServiceDate(isoDate) {
  if (typeof isoDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
    return 'Дата не указана';
  }
  const [year, month, day] = isoDate.split('-');
  return `${day}.${month}.${year}`;
}
