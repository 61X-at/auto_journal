import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const packageJson = JSON.parse(read('package.json'));
const script = read('tests/fe031-live-smoke.py');
const workflow = read('.github/workflows/live-smoke.yml');
const pages = read('.github/workflows/pages.yml');
const docs = read('docs/fe031-final-acceptance.md');

// FE-031 acceptance: tests should fail if the real published-site test is weakened.
test('FE-031: URL демо и test:live зафиксированы в package.json', () => {
  assert.match(packageJson.scripts['test:live'], /https:\/\/61x-at\.github\.io\/auto_journal\//);
  assert.match(packageJson.scripts['test:live'], /fe031-live-smoke\.py/);
  assert.match(packageJson.scripts['test:live'], /--report/);
});

test('FE-031: корневой переход Pages сохраняет hash-маршрут', () => {
  const index = read('public/index.html');
  assert.match(index, /window\.location\.hash/);
  assert.match(index, /tempPage\/index\.html/);
  assert.match(index, /window\.location\.replace/);
});

test('FE-031: публикация запускается из main и не зависит от тестового workflow', () => {
  assert.match(pages, /branches:\s*\[main\]/);
  assert.match(pages, /actions\/deploy-pages@v4/);
  assert.doesNotMatch(pages, /fe031-live-smoke/);
});

test('FE-031: живой workflow стартует после успешного деплоя, не до него', () => {
  assert.match(workflow, /workflow_run:/);
  assert.match(workflow, /Deploy AutoJournal to GitHub Pages/);
  assert.match(workflow, /conclusion == 'success'/);
  assert.match(workflow, /workflow_dispatch:/);
});

test('FE-031: live workflow не запрашивает права для записи в репозиторий', () => {
  assert.match(workflow, /permissions:\s*\n\s+contents: read/);
  assert.doesNotMatch(workflow, /contents: write|pages: write|id-token: write/);
});

test('FE-031: live workflow запускает Chromium и сохраняет отчёт', () => {
  assert.match(workflow, /playwright install --with-deps chromium/);
  assert.match(workflow, /python tests\/fe031-live-smoke\.py/);
  assert.match(workflow, /actions\/upload-artifact@v4/);
  assert.match(workflow, /fe031-live-report\.json/);
});

test('FE-031: smoke требует HTTPS вместо HTTP', () => {
  assert.match(script, /parsed\.scheme != 'https'/);
  assert.match(script, /ValueError/);
});

test('FE-031: браузерный тест открывает настоящий опубликованный адрес', () => {
  assert.match(script, /page\.goto\(url/);
  assert.match(script, /response\.status >= 400/);
  assert.match(script, /tempPage\/index\.html/);
});

test('FE-031: реальный localStorage, без замены хранилища заглушкой', () => {
  assert.match(script, /localStorage\.getItem/);
  assert.doesNotMatch(script, /Object\.defineProperty\(window,\s*['"]localStorage/);
  assert.doesNotMatch(script, /window\.__fe028Saved/);
});

test('FE-031: добавление происходит через настоящую форму сайта', () => {
  for (const control of ['#new-entry-type', '#new-entry-date', '#new-entry-mileage',
    '#new-entry-description', '#new-entry-amount', '#new-service-entry-form button[type=submit]']) {
    assert.ok(script.includes(control), `Нет поля ${control}`);
  }
});

test('FE-031: проверены reload, повторное открытие сайта и поиск', () => {
  assert.match(script, /page\.reload/);
  assert.match(script, /page\.close\(\)/);
  assert.match(script, /page = context\.new_page\(\)/);
  assert.match(script, /#journal-query/);
  assert.match(script, /#journal-filters button\[type=submit\]/);
});

test('FE-031: проверены маршруты автомобиля, ТО и журнала', () => {
  assert.match(script, /'car', 'Автомобиль'/);
  assert.match(script, /'maintenance', 'План ТО'/);
  assert.match(script, /'journal', 'Журнал обслуживания'/);
});

test('FE-031: проверка идёт на 1200 и 360 px без горизонтальной прокрутки', () => {
  assert.match(script, /\(1200, 360\)/);
  assert.match(script, /scrollWidth <= innerWidth \+ 1/);
});

test('FE-031: изоляция браузера защищает обычные пользовательские данные', () => {
  assert.match(script, /browser\.new_context/);
  assert.match(script, /context\.close\(\)/);
  assert.match(script, /uuid\.uuid4/);
});

test('FE-031: при сбое публикуется FAIL и ненулевой код возврата', () => {
  assert.match(script, /'status': 'FAIL'/);
  assert.match(script, /return 0 if report\['status'\] == 'PASS' else 1/);
  assert.match(script, /except Exception as error/);
});

test('FE-031: критерии закрытия задокументированы без вымышленного PASS', () => {
  assert.match(docs, /Подтверждено владельцем/);
  assert.match(docs, /Требуется автоматический протокол/);
  assert.match(docs, /status: PASS/);
  assert.ok(existsSync(resolve(root, 'docs/fe031-final-acceptance.md')));
});
