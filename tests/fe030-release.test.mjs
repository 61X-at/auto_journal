import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { verifyStaticBuild } from '../scripts/fe030-check-build.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = path => readFileSync(join(root, path), 'utf8');
const landing = read('public/index.html');
const workflow = read('.github/workflows/pages.yml');

function followLanding(url) {
  const script = landing.match(/<script>([\s\S]*?)<\/script>/)[1];
  const location = { href: url, search: new URL(url).search, hash: new URL(url).hash, replace(next) { this.target = next; } };
  runInNewContext(script, { window: { location }, URL });
  return location.target;
}

function fixture() {
  const folder = mkdtempSync(join(tmpdir(), 'fe030-'));
  mkdirSync(join(folder, 'tempPage'));
  mkdirSync(join(folder, 'assets'));
  writeFileSync(join(folder, 'index.html'), landing);
  writeFileSync(join(folder, 'tempPage/index.html'), '<main id="main-content"></main><script type="module" src="../assets/index-abc.js"></script><link rel="stylesheet" href="../assets/index-abc.css">');
  writeFileSync(join(folder, 'assets/index-abc.js'), 'console.log("ok")');
  writeFileSync(join(folder, 'assets/index-abc.css'), 'html{}');
  return folder;
}

// Важные проверки публикации не требуют npm-пакетов или реального сетевого сервера.
test('FE-030: root redirect сохраняет адрес проекта GitHub Pages', () => {
  assert.equal(followLanding('https://example.github.io/auto_journal/'), 'https://example.github.io/auto_journal/tempPage/index.html#/home');
});
test('FE-030: root redirect сохраняет маршрут автомобиля', () => {
  assert.equal(followLanding('https://example.github.io/auto_journal/#/car'), 'https://example.github.io/auto_journal/tempPage/index.html#/car');
});
test('FE-030: root redirect сохраняет маршрут журнала', () => {
  assert.equal(followLanding('https://example.github.io/auto_journal/#/journal'), 'https://example.github.io/auto_journal/tempPage/index.html#/journal');
});
test('FE-030: root redirect сохраняет фильтр и query-параметры', () => {
  assert.equal(followLanding('https://example.github.io/auto_journal/?ref=demo#/journal?q=%D0%A2%D0%9E'), 'https://example.github.io/auto_journal/tempPage/index.html?ref=demo#/journal?q=%D0%A2%D0%9E');
});
test('FE-030: root redirect работает в корне отдельного домена', () => {
  assert.equal(followLanding('https://demo.example.org/#/maintenance'), 'https://demo.example.org/tempPage/index.html#/maintenance');
});
test('FE-030: landing содержит HTML-ссылку на случай запрета JavaScript', () => {
  assert.match(landing, /href="\.\/tempPage\/index\.html#\/home"/);
});
test('FE-030: Vite сохраняет относительный base и HTML-вход', () => {
  const config = read('vite.config.js');
  assert.match(config, /base:\s*['"]\.\/['"]/);
  assert.match(config, /tempPage\/index\.html/);
});
test('FE-030: npm build проверяет созданную Vite сборку', () => {
  const scripts = JSON.parse(read('package.json')).scripts;
  assert.equal(scripts.build, 'vite build && node scripts/fe030-check-build.mjs');
  assert.match(scripts.preview, /vite preview/);
});
test('FE-030: workflow запускается после merge в main и вручную', () => {
  assert.match(workflow, /push:[\s\S]*?branches:\s*\[main\]/);
  assert.match(workflow, /workflow_dispatch:/);
});
test('FE-030: workflow проверяет тесты, сборку и загружает dist', () => {
  assert.match(workflow, /run: npm ci/);
  assert.match(workflow, /run: npm test/);
  assert.match(workflow, /run: npm run build/);
  assert.match(workflow, /actions\/upload-pages-artifact@v3/);
  assert.match(workflow, /path: dist/);
  assert.match(workflow, /actions\/deploy-pages@v4/);
});
test('FE-030: GitHub Pages deploy использует требуемые права', () => {
  assert.match(workflow, /pages:\s*write/);
  assert.match(workflow, /id-token:\s*write/);
});
test('FE-030: валидная статическая структура проверяется успешно', () => {
  const d = fixture();
  try { assert.deepEqual(verifyStaticBuild(d), { pathsChecked: 4, assetReferences: 2 }); }
  finally { rmSync(d, { recursive: true, force: true }); }
});
test('FE-030: отсутствующая корневая страница отклоняется', () => {
  const d = fixture();
  try { rmSync(join(d, 'index.html')); assert.throws(() => verifyStaticBuild(d), /dist\/index.html/); }
  finally { rmSync(d, { recursive: true, force: true }); }
});
test('FE-030: отсутствие JS-файла обнаруживается', () => {
  const d = fixture();
  try { rmSync(join(d, 'assets/index-abc.js')); assert.throws(() => verifyStaticBuild(d), /отсутствует ресурс/); }
  finally { rmSync(d, { recursive: true, force: true }); }
});
test('FE-030: абсолютная ссылка на assets отклоняется для вложенного URL', () => {
  const d = fixture();
  try {
    writeFileSync(join(d, 'tempPage/index.html'), '<main id="main-content"></main><script src="/assets/index-abc.js"></script>');
    assert.throws(() => verifyStaticBuild(d), /абсолютная ссылка/);
  } finally { rmSync(d, { recursive: true, force: true }); }
});
test('FE-030: отсутствие основного приложения обнаруживается', () => {
  const d = fixture();
  try { rmSync(join(d, 'tempPage/index.html')); assert.throws(() => verifyStaticBuild(d), /tempPage\/index.html/); }
  finally { rmSync(d, { recursive: true, force: true }); }
});
test('FE-030: README документирует запуск, деплой, ограничения и сценарий', () => {
  const doc = read('README.md');
  for (const term of ['npm ci', 'npm run dev', 'npm run build', 'GitHub Actions', 'localStorage', 'Демо-сценарий', 'Структура проекта', 'Ограничения']) assert.ok(doc.includes(term), `не найдено: ${term}`);
});
test('FE-030: документация не объявляет публикацию выполненной', () => {
  const guide = read('docs/deployment.md');
  const checklist = read('docs/release-checklist.md');
  assert.match(guide, /FE-031/);
  assert.match(checklist, /HTTPS-версия относится к FE-031/);
});
test('FE-030: dist и node_modules исключены из Git', () => {
  const ignores = read('.gitignore');
  assert.match(ignores, /^dist\/$/m);
  assert.match(ignores, /^node_modules\/$/m);
});
test('FE-030: устаревшее сообщение о демонстрационной машине исправлено', () => {
  const html = read('tempPage/index.html');
  assert.ok(!html.includes('Карточка автомобиля на главной пока демонстрационная.'));
  assert.ok(html.includes('Карточка автомобиля загружается из сохранённого профиля.'));
});
