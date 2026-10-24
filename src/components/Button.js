/** Повторно используемая кнопка или ссылка с видимой текстовой подписью. */
export function createButton({ label, variant = 'primary', href, type = 'button', disabled = false } = {}) {
  if (typeof label !== 'string' || !label.trim()) {
    throw new TypeError('Компонент Button требует понятную подпись label');
  }
  if (!['primary', 'secondary'].includes(variant)) {
    throw new TypeError('Неизвестный вариант кнопки');
  }

  const element = document.createElement(href ? 'a' : 'button');
  element.className = `button button--${variant}`;
  element.textContent = label;

  if (href) {
    if (!disabled) element.href = href;
    if (disabled) {
      element.setAttribute('aria-disabled', 'true');
      element.tabIndex = -1;
    }
  } else {
    element.type = type;
    element.disabled = disabled;
  }
  return element;
}
