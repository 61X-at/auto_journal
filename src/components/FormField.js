/** Подписанное поле ввода с поддержкой required, подсказки и ошибки. */
export function createFormField({
  id, label, name = id, type = 'text', required = false,
  min, max, step, placeholder = '', value = '', helpText = '', disabled = false, options = [],
} = {}) {
  if (!id || !label) {
    throw new TypeError('Компонент FormField требует id и label');
  }

  const wrapper = document.createElement('div');
  wrapper.className = 'form-field form-field--shared';

  const labelElement = document.createElement('label');
  labelElement.htmlFor = id;
  labelElement.textContent = label;
  if (required) {
    const requiredMark = document.createElement('span');
    requiredMark.className = 'required-mark';
    requiredMark.textContent = ' *';
    requiredMark.setAttribute('aria-hidden', 'true');
    labelElement.append(requiredMark);
  }

  // FE-010: тот же компонент используется и для выпадающего списка категорий.
  const input = document.createElement(type === 'select' ? 'select' : 'input');
  input.id = id;
  input.name = name;
  if (type !== 'select') input.type = type;
  input.required = required;
  input.disabled = disabled;
  if (type === 'select') {
    for (const option of options) {
      const optionElement = document.createElement('option');
      optionElement.value = option.value;
      optionElement.textContent = option.label;
      input.append(optionElement);
    }
  } else {
    input.placeholder = placeholder;
  }
  input.value = value;
  if (min !== undefined) input.min = String(min);
  if (max !== undefined) input.max = String(max);
  if (step !== undefined) input.step = String(step);

  const descriptions = [];
  if (helpText) {
    const hint = document.createElement('p');
    hint.id = `${id}-hint`;
    hint.className = 'form-field__hint';
    hint.textContent = helpText;
    wrapper.append(labelElement, input, hint);
    descriptions.push(hint.id);
  } else {
    wrapper.append(labelElement, input);
  }

  const error = document.createElement('p');
  error.className = 'form-field__error';
  error.id = `${id}-error`;
  error.hidden = true;
  wrapper.append(error);
  if (descriptions.length) input.setAttribute('aria-describedby', descriptions.join(' '));

  input.addEventListener('input', () => setFieldError(wrapper, ''));
  if (type === 'select') input.addEventListener('change', () => setFieldError(wrapper, ''));
  return wrapper;
}

export function setFieldError(field, message) {
  const input = (field.querySelector('input') || field.querySelector('select'));
  const error = field.querySelector('.form-field__error');
  if (!input || !error) throw new TypeError('Передан не компонент FormField');

  error.textContent = message;
  error.hidden = !message;
  if (message) {
    input.setAttribute('aria-invalid', 'true');
  } else {
    input.removeAttribute('aria-invalid');
  }

  const descriptionIds = (input.getAttribute('aria-describedby') || '')
    .split(/\s+/).filter((id) => id && id !== error.id);
  if (message) descriptionIds.push(error.id);
  if (descriptionIds.length) {
    input.setAttribute('aria-describedby', descriptionIds.join(' '));
  } else {
    input.removeAttribute('aria-describedby');
  }
}

/** Проверяет только UI-поля; не записывает данные автомобиля или журнала. */
export function validateFormFields(form) {
  let firstInvalid = null;
  for (const field of form.querySelectorAll('.form-field--shared')) {
    const input = (field.querySelector('input') || field.querySelector('select'));
    const label = field.querySelector('label')?.textContent?.replace(/\s*\*$/, '') || 'Поле';
    let message = '';

    if (input.validity.valueMissing || (input.required && !input.value.trim())) {
      message = `Поле «${label}» обязательно для заполнения.`;
    } else if (input.validity.rangeUnderflow) {
      message = `Значение поля «${label}» должно быть не меньше ${input.min}.`;
    } else if (input.validity.rangeOverflow) {
      message = `Значение поля «${label}» должно быть не больше ${input.max}.`;
    } else if (input.validity.badInput || input.validity.stepMismatch || input.validity.typeMismatch) {
      message = `Проверьте значение поля «${label}».`;
    }

    setFieldError(field, message);
    if (message && !firstInvalid) firstInvalid = input;
  }
  return { valid: !firstInvalid, firstInvalid };
}
