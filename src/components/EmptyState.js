/** Единое пустое состояние для списков без записей. */
export function createEmptyState({ title = 'Пока ничего нет', description = '' } = {}) {
  const state = document.createElement('section');
  state.className = 'empty-state';
  state.setAttribute('aria-label', title);
  const heading = document.createElement('h3');
  heading.textContent = title;
  const text = document.createElement('p');
  text.textContent = description;
  state.append(heading, text);
  return state;
}
