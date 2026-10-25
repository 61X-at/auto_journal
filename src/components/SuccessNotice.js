/** FE-024: единое подтверждение успешно завершённого действия. */
export function createSuccessNotice(message) {
  const notice = document.createElement('p');
  notice.className = 'success-notice';
  notice.setAttribute('role', 'status');
  notice.textContent = message;
  return notice;
}
