import { SERVICE_ENTRY_TYPES } from '../models/serviceEntry.js';

/** FE-013: независимый поиск по описанию и фильтр по типу. Без изменения исходного массива. */
export function filterServiceEntries(entries, { query = '', type = '' } = {}) {
  if (!Array.isArray(entries)) throw new TypeError('История обслуживания должна быть массивом');
  const text = String(query ?? '').trim().toLocaleLowerCase('ru-RU');
  const category = SERVICE_ENTRY_TYPES.includes(type) ? type : '';
  return entries.filter(entry => {
    const description = String(entry?.description ?? '').toLocaleLowerCase('ru-RU');
    return (!text || description.includes(text)) && (!category || entry?.type === category);
  });
}

/** Параметры в hash оставляют возможность открыть результат с главной страницы. */
export function parseJournalFilters(hash = '') {
  const route = String(hash).replace(/^#\//, '');
  if (route.split('?')[0] !== 'journal') return { query: '', type: '' };
  const params = new URLSearchParams(route.includes('?') ? route.slice(route.indexOf('?') + 1) : '');
  const type = params.get('type') ?? '';
  return {
    query: (params.get('q') ?? '').trim(),
    type: SERVICE_ENTRY_TYPES.includes(type) ? type : '',
  };
}

export function journalHash({ query = '', type = '' } = {}) {
  const params = new URLSearchParams();
  const text = String(query ?? '').trim();
  if (text) params.set('q', text);
  if (SERVICE_ENTRY_TYPES.includes(type)) params.set('type', type);
  const suffix = params.toString();
  return `#/journal${suffix ? `?${suffix}` : ''}`;
}
