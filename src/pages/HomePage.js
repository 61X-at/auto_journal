/** FE-004: главная страница остаётся из семантической HTML-разметки ЛР № 5. */
export function renderHomePage() {
  const template = document.getElementById('home-page-template');
  if (!template) {
    throw new Error('Не найден шаблон главной страницы');
  }
  return template.content.cloneNode(true);
}
