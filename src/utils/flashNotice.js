/**
 * FE-024: однократное подтверждение после перехода между экранами SPA.
 * Намеренно хранится только в памяти: данные пользователя и уведомления
 * не записываются в localStorage/sessionStorage.
 */
let pending = null;

export function setFlashNotice(route, message) {
  if (typeof route !== 'string' || !route.trim() || typeof message !== 'string' || !message.trim()) {
    throw new TypeError('Требуются маршрут и текст уведомления.');
  }
  pending = { route, message };
}

/** Чужой маршрут не получает чужое уведомление, оно удаляется при чтении. */
export function takeFlashNotice(route) {
  const current = pending;
  pending = null;
  return current?.route === route ? current.message : null;
}
