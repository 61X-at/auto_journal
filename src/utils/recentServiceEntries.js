import { sortServiceEntriesByDate } from './serviceHistory.js';

/** FE-014: три самых новых события для краткого списка на главной.
 * Использует ту же сортировку, что и журнал, и не изменяет хранимые данные.
 */
export function selectRecentServiceEntries(entries) {
  return sortServiceEntriesByDate(entries).slice(0, 3);
}
