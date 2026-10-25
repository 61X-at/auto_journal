import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Структурные регрессионные проверки CSS без браузерных зависимостей.
// Дополнительно FE-026 проверяется реальным Chromium на 360/768/1200 px.
const css = readFileSync(new URL('../tempPage/styles.css', import.meta.url), 'utf8');
const html = readFileSync(new URL('../tempPage/index.html', import.meta.url), 'utf8');
const responsive = css.slice(css.lastIndexOf('/* FE-026:'));

function declarationsFor(selectors) {
  const escaped = selectors.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = responsive.match(new RegExp(`${escaped}\\s*\\{([^}]+)\\}`));
  assert.ok(match, `Отсутствует CSS-правило: ${selectors}`);
  return match[1];
}

test('FE-026: HTML имеет viewport для настоящей мобильной ширины', () => {
  assert.match(html, /<meta\s+name="viewport"\s+content="width=device-width,\s*initial-scale=1(?:\.0)?"\s*\/?>/);
});

test('FE-026: основной grid допускает сжатие колонок', () => {
  assert.match(css, /grid-template-columns:\s*238px\s+minmax\(0,\s*1fr\)/);
  assert.match(css, /\.container\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1\.4fr\)/s);
});

test('FE-026: при ширине планшета боковая навигация становится горизонтальной', () => {
  assert.match(css, /@media\s*\(max-width:\s*1050px\)[\s\S]*?body\s*\{\s*display:\s*block;/);
  assert.match(css, /\.nav-list\s*\{\s*display:\s*flex;\s*flex-wrap:\s*wrap;/);
});

test('FE-026: при ширине 740px основное содержимое становится одноколоночным', () => {
  assert.match(css, /@media\s*\(max-width:\s*740px\)\s*\{\s*\.container\s*\{\s*grid-template-columns:\s*minmax\(0,\s*1fr\);/);
});

test('FE-026: при ширине телефона навигация остаётся доступной', () => {
  assert.match(css, /@media\s*\(max-width:\s*520px\)/);
  assert.match(css, /\.nav-list\s*\{\s*display:\s*grid;\s*grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(css, /\.nav-link\s*\{[^}]*min-height:\s*52px/s);
});

for (const selector of [
  '.page-heading__text',
  '.car-card',
  '.car-card__details',
  '.profile-list dd',
  '.profile-card h3',
  '.maintenance-card',
  '.maintenance-plan-list .plan-item',
  '.summary-card',
  '.entry-card__text',
  '.entry-card__price',
  '.empty-state',
]) {
  test(`FE-026: длинный текст не расширяет сетку — ${selector}`, () => {
    const shared = responsive.match(/\.page-heading__text,[\s\S]+?\.empty-state\s*\{([^}]+)\}/);
    assert.ok(shared, 'Ожидалось общее правило для динамических данных');
    assert.ok(shared[0].includes(selector), `${selector} не включён в защиту от переполнения`);
    assert.match(shared[1], /min-width:\s*0\s*;/);
    assert.match(shared[1], /overflow-wrap:\s*anywhere\s*;/);
  });
}

test('FE-026: заголовок последних записей и ссылка могут переноситься на мобильном экране', () => {
  assert.match(declarationsFor('.section-header'), /flex-wrap:\s*wrap;/);
  assert.match(declarationsFor('.section-header .text-link'), /max-width:\s*100%/);
});

test('FE-026: длинный текст в кнопках формы не выталкивает соседние кнопки', () => {
  const match = responsive.match(/\.service-form__actions \.button,[\s\S]*?\.expense-period-form__actions \.button\s*\{([^}]+)\}/);
  assert.ok(match);
  assert.match(match[1], /min-width:\s*0/);
  assert.match(match[1], /white-space:\s*normal/);
});

test('FE-026: все формы становятся одноколоночными на телефоне', () => {
  for (const name of ['car-form__fields', 'service-form__fields', 'maintenance-form__fields']) {
    assert.match(css, new RegExp(`\\.${name}\\s*\\{\\s*grid-template-columns:\\s*minmax\\(0,\\s*1fr\\)`));
  }
});

test('FE-026: кнопки и поля сохраняют высоту не менее 44px', () => {
  assert.match(css, /\.button\s*\{[^}]*min-height:\s*44px/s);
  assert.match(css, /\.form-field--shared input,\s*\.form-field--shared select\s*\{[^}]*min-height:\s*44px/s);
});

test('FE-026: исправление не скрывает горизонтальное переполнение у body/container', () => {
  assert.doesNotMatch(responsive, /(?:body|\.container)\s*\{[^}]*overflow-x:\s*hidden/s);
  assert.doesNotMatch(responsive, /(?:body|\.container)\s*\{[^}]*overflow:\s*hidden/s);
});
