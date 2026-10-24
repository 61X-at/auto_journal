/** FE-012: операции с существующими записями, не зависят от DOM. */
import { validateServiceEntry } from '../models/serviceEntry.js';
import { readEntries, saveEntries } from '../storage/localStorage.js';

function invalidId() {
  return { ok: false, status: 'invalid_id', errors: {}, message: 'Некорректный идентификатор записи.' };
}

function failure(status, message) {
  return { ok: false, status, errors: {}, message };
}

function locateEntry(entries, id) {
  const matches = entries.filter((entry) => entry?.id === id);
  if (matches.length === 0) return failure('not_found', 'Запись больше не существует. Обновите журнал.');
  if (matches.length !== 1) return failure('duplicate_id', 'Обнаружены повторяющиеся ID. Изменение заблокировано во избежание потери данных.');
  return { ok: true, data: matches[0] };
}

/** Обновляет ровно одну существующую запись; входящий raw.id не может изменить её ID. */
export function updateServiceEntry(id, raw, options = {}) {
  if (typeof id !== 'string' || !id.trim()) return invalidId();
  const validation = validateServiceEntry({ ...raw, id });
  if (!validation.ok) return {
    ok: false, status: 'validation_error', errors: validation.errors,
    message: 'Исправьте ошибки в отмеченных полях.',
  };
  const existing = readEntries(options);
  if (!existing.ok) return failure(existing.status, existing.message);
  const found = locateEntry(existing.data, id);
  if (!found.ok) return found;
  const updated = { ...found.data, ...validation.data, id };
  const items = existing.data.map((item) => item.id === id ? updated : item);
  const result = saveEntries(items, options);
  if (!result.ok) return failure(result.status, result.message);
  return { ok: true, status: 'updated', data: updated, errors: {} };
}

/** Удаление невозможно без явного confirmed=true после диалога подтверждения. */
export function deleteServiceEntry(id, { confirmed = false, ...options } = {}) {
  if (!confirmed) return failure('cancelled', 'Удаление отменено.');
  if (typeof id !== 'string' || !id.trim()) return invalidId();
  const existing = readEntries(options);
  if (!existing.ok) return failure(existing.status, existing.message);
  const found = locateEntry(existing.data, id);
  if (!found.ok) return found;
  const items = existing.data.filter((item) => item.id !== id);
  const result = saveEntries(items, options);
  if (!result.ok) return failure(result.status, result.message);
  return { ok: true, status: 'deleted', data: found.data, errors: {} };
}
