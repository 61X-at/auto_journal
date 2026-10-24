/** Создаёт DOM-фрагмент только из статической разметки раздела. */
export function pageFragment(html) {
  const template = document.createElement('template');
  template.innerHTML = html.trim();
  return template.content.cloneNode(true);
}
