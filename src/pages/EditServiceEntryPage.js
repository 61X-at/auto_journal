import { pageFragment } from './pageFragment.js';
import { createButton } from '../components/Button.js';
import { createErrorNotice } from '../components/ErrorNotice.js';
import { readEntries } from '../storage/localStorage.js';
import { updateServiceEntry } from '../utils/serviceEntryActions.js';
import {
  createServiceEntryForm, readServiceEntryFormValues, showServiceEntryErrors,
} from './NewServiceEntryPage.js';

/** FE-012: форма редактирования сохраняет ID и использует валидацию FE-009. */
export function renderEditServiceEntryPage(id) {
  const page = pageFragment(`
    <header class="page-heading">
      <div class="page-heading__text">
        <p class="eyebrow">Мой автомобиль / Журнал / Редактирование</p>
        <h1>Редактировать запись</h1>
        <p>Измените необходимые поля существующей записи.</p>
      </div>
    </header>
    <section class="section section--single" aria-labelledby="edit-entry-heading">
      <h2 id="edit-entry-heading" class="section-heading">Сведения о событии</h2>
      <div id="edit-entry-container"></div>
    </section>
  `);
  const host = page.querySelector('#edit-entry-container');
  const stored = readEntries();
  if (!stored.ok) {
    host.append(createErrorNotice(stored.message));
    host.append(createButton({ label: 'Вернуться в журнал', href: '#/journal', variant: 'secondary' }));
    return page;
  }
  const matches = stored.data.filter((entry) => entry?.id === id);
  if (matches.length !== 1) {
    host.append(createErrorNotice(matches.length ? 'Записи с одинаковыми ID нельзя редактировать.' : 'Запись не найдена. Возможно, она уже была удалена.'));
    host.append(createButton({ label: 'Вернуться в журнал', href: '#/journal', variant: 'secondary' }));
    return page;
  }

  const { form, feedback } = createServiceEntryForm(true, { entry: matches[0] });
  host.append(form);
  form.addEventListener('input', () => feedback.replaceChildren());
  form.addEventListener('change', () => feedback.replaceChildren());
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const result = updateServiceEntry(id, readServiceEntryFormValues(form));
    showServiceEntryErrors(form, result.errors || {});
    feedback.replaceChildren();
    if (!result.ok) {
      feedback.append(createErrorNotice(result.message));
      if (result.status === 'validation_error') form.querySelector('[aria-invalid="true"]')?.focus();
      return;
    }
    // Переход перечитывает localStorage и отображает изменённую запись.
    window.location.hash = '#/journal';
  });
  return page;
}
