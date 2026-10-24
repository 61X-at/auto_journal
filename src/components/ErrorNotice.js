/** Общая ошибка формы с объявлением через скринридер. */
export function createErrorNotice(message) {
  const notice = document.createElement('p');
  notice.className = 'error-notice';
  notice.setAttribute('role', 'alert');
  notice.textContent = message;
  return notice;
}
