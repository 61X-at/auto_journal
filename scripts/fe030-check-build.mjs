/** FE-030: проверка, что Vite собрал все файлы для статической публикации. */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

function assert(condition, message) {
  if (!condition) throw new Error(`FE-030: ${message}`);
}

/** @param {string} distPath Абсолютный путь к каталогу публикации. */
export function verifyStaticBuild(distPath) {
  const dist = resolve(distPath);
  const landing = resolve(dist, 'index.html');
  const app = resolve(dist, 'tempPage/index.html');
  assert(existsSync(landing), 'нет корневого dist/index.html для GitHub Pages');
  assert(existsSync(app), 'нет dist/tempPage/index.html приложения');
  const landingHtml = readFileSync(landing, 'utf8');
  assert(landingHtml.includes("new URL('./tempPage/index.html'"), 'корневая страница не перенаправляет в приложение');
  assert(landingHtml.includes('window.location.hash'), 'переход теряет hash-маршрут');

  const html = readFileSync(app, 'utf8');
  assert(html.includes('id="main-content"'), 'потеряна основная область приложения');
  const tags = [...html.matchAll(/<(?:script|link)\b[^>]*>/gi)].map(match => match[0]);
  const referenced = tags.flatMap(tag => {
    const match = tag.match(/\b(?:src|href)=["']([^"']+)["']/i);
    if (!match) return [];
    if (/^https?:\/\//.test(match[1])) return [];
    if (tag.startsWith('<link') && !/\brel=["'](?:stylesheet|modulepreload)["']/i.test(tag)) return [];
    return [match[1]];
  });
  assert(referenced.length > 0, 'в HTML нет собранных JS/CSS-ресурсов');

  for (const url of referenced) {
    const clean = url.split(/[?#]/, 1)[0];
    assert(!clean.startsWith('/'), `абсолютная ссылка ${clean} не переносима в подпапку GitHub Pages`);
    const asset = resolve(dirname(app), decodeURIComponent(clean));
    assert(asset.startsWith(dist + sep), `ресурс выходит за каталог dist: ${url}`);
    assert(existsSync(asset) && statSync(asset).isFile(), `отсутствует ресурс: ${url}`);
  }
  const assetsFolder = resolve(dist, 'assets');
  assert(existsSync(assetsFolder) && readdirSync(assetsFolder).length > 0, 'нет собранных файлов в dist/assets');
  return { pathsChecked: 2 + referenced.length, assetReferences: referenced.length };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = verifyStaticBuild(resolve(process.cwd(), process.argv[2] || 'dist'));
    process.stdout.write(`FE-030: статическая сборка готова (${result.pathsChecked} файла проверено, ссылок на ресурсы: ${result.assetReferences}).\n`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
