import { createButton } from './Button.js';
import { createFormField, validateFormFields } from './FormField.js';
import { createErrorNotice } from './ErrorNotice.js';

/** Только демонстрация повторного использования и валидации компонентов FE-005. */
export function createDemoForm({ id, fields }) {
  const form = document.createElement('form');
  form.className = 'component-demo-form';
  form.id = id;
  form.noValidate = true;

  const grid = document.createElement('div');
  grid.className = 'component-demo-form__fields';
  for (const field of fields) grid.append(createFormField(field));

  const result = document.createElement('div');
  result.className = 'component-demo-form__result';
  result.setAttribute('aria-live', 'polite');
  const button = createButton({ label: 'Проверить поля', type: 'submit' });
  form.append(grid, button, result);
  form.addEventListener('input', () => result.replaceChildren());

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const { valid, firstInvalid } = validateFormFields(form);
    result.replaceChildren();
    if (!valid) {
      result.append(createErrorNotice('Исправьте ошибки в отмеченных полях.'));
      firstInvalid.focus();
      return;
    }
    const message = document.createElement('p');
    message.className = 'demo-success';
    message.setAttribute('role', 'status');
    message.textContent = 'Поля заполнены корректно. Это пример UI: данные не сохраняются.';
    result.append(message);
  });
  return form;
}
