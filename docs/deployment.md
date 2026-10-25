# FE-030 — Сборка и публикация на GitHub Pages

## 1. Сборка локально

В корне репозитория:

```bash
npm ci
npm test
npm run build
npm run preview
```

Откройте адрес `npm run preview`, проверьте корень сайта `/` и переход на `/tempPage/index.html#/home`.
В `dist/` должны быть:

```text
dist/
├── index.html                # корневой переход, копируется из public/
├── tempPage/index.html       # приложение, собирает Vite
└── assets/                   # JS и CSS с хэшами
```

`npm run build` запускает `vite build`, затем `scripts/fe030-check-build.mjs`.
Проверка не пропустит отсутствующий входной HTML или путь до JS/CSS за пределами `dist`.

## 2. GitHub Pages

1. Убедитесь, что FE-030 объединена с веткой `main` репозитория `61X-at/auto_journal`.
2. На GitHub выберите **Settings → Pages → Build and deployment → Source → GitHub Actions**.
3. В **Actions** выберите **Deploy AutoJournal to GitHub Pages** и при необходимости нажмите **Run workflow** (ветка `main`). Push в `main` также запускает workflow автоматически.
4. Дождитесь успешных шагов `npm ci`, `npm test`, `npm run build`, `Upload static site` и `Deploy to GitHub Pages`.
5. Ссылку на результат возьмите в карточке deployment workflow или в Settings → Pages. Не считайте URL доступным до первого успешного деплоя.

Отдельный токен или секрет для стандартной публикации через GitHub Actions не требуется; права `pages: write` и `id-token: write` заданы в workflow.

## 3. Почему есть переход с главной страницы

Исходный HTML приложения находится в `tempPage/index.html`; Vite сохраняет структуру входного файла в `dist/`. GitHub Pages при открытии корня требует `dist/index.html`, поэтому файл `public/index.html` копируется Vite в корень сборки и переносит пользователя на `tempPage/index.html`, **не теряя** hash-маршрут и параметры URL. Значение `base: './'` позволяет ссылкам на собранные ресурсы работать из подпапки GitHub Pages.

## 4. Финальная проверка после деплоя (FE-031)

- Открыть полученную **HTTPS-ссылку**, убедиться, что не нужна авторизация.
- Проверить `#/home`, `#/car`, `#/journal`, `#/maintenance` через меню и Back/Forward.
- Создать тестовый автомобиль и запись, найти запись в журнале.
- Перезагрузить опубликованную страницу, убедиться, что тестовые данные остались.
- Проверить план ТО, расходы и мобильную ширину 360 px.
- Проверить ошибки загрузки ресурсов и консоль браузера.

**Важно.** `localStorage` привязан к origin. Данные с `localhost:5173` автоматически **не появятся** на опубликованном GitHub Pages. Тестируйте в чистом отдельном профиле, чтобы не затронуть рабочие данные.

## 5. Устранение типовых проблем

- `vite: not found`: выполните `npm ci` из корня репозитория с доступом к npm registry.
- Нет страницы по корню URL: проверьте наличие `dist/index.html` после `npm run build` и источник Pages = GitHub Actions.
- Нет CSS или JS: проверьте относительные пути `../assets/...` в `dist/tempPage/index.html`; запустите `npm run check:build`.
- Нет записи после публикации: `localStorage` у localhost и GitHub Pages разный — добавьте данные заново на новом адресе.
- GitHub Actions завершился ошибкой: изучите красный шаг workflow; не объявляйте FE-031 завершённой до успешного деплоя и проверки HTTPS.
