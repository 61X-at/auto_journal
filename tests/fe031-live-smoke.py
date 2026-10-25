#!/usr/bin/env python3
"""FE-031: настоящий HTTPS smoke-тест опубликованного «АвтоЖурнала».

Этот тест НЕ подменяет localStorage, HTML, CSS или JS. Он открывает опубликованный
адрес в изолированном Chromium context, вводит запись через форму, обновляет страницу,
закрывает вкладку, открывает сайт заново и ищет сохранённое событие. Каждый запуск
создаёт новый временный профиль, не затрагивающий пользовательский браузер.

Установка: python -m pip install playwright && python -m playwright install chromium
Пример: python tests/fe031-live-smoke.py --url https://61x-at.github.io/auto_journal/
"""

import argparse
import json
import re
import sys
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlsplit

from playwright.sync_api import sync_playwright

DEFAULT_URL = 'https://61x-at.github.io/auto_journal/'
STORAGE_KEY = 'autojournal_v1_entries'


def normalize_url(value):
    parsed = urlsplit(value)
    if parsed.scheme != 'https' or not parsed.netloc or parsed.username or parsed.password:
        raise ValueError('Для опубликованного демо требуется HTTPS URL без учётных данных')
    if parsed.fragment or parsed.query:
        raise ValueError('Передайте корневой адрес сайта без hash-маршрута и query-параметров')
    return value if value.endswith('/') else value + '/'


def assert_step(condition, message, checks):
    if not condition:
        raise AssertionError(message)
    checks.append(message)


def navigate(page, route, expected_heading):
    page.evaluate('(route) => { location.hash = "#/" + route; }', route)
    page.locator('#main-content h1').filter(has_text=expected_heading).wait_for(timeout=12000)


def open_published(page, url):
    response = page.goto(url, wait_until='domcontentloaded', timeout=30000)
    # The first index.html uses client-side location.replace to enter tempPage.
    if response is not None and response.status >= 400:
        raise AssertionError(f'HTTPS запрос завершился статусом HTTP {response.status}')
    page.locator('#main-content h1').filter(has_text='Обзор автомобиля').wait_for(timeout=20000)
    if '/tempPage/index.html' not in urlsplit(page.url).path:
        raise AssertionError('Корневая страница не перенаправила пользователя в собранное приложение')


def run_one(browser, url, viewport, screenshots_dir=None):
    context = browser.new_context(
        viewport={'width': viewport, 'height': 900},
        locale='ru-RU',
        service_workers='block',
    )
    checks = []
    errors = []
    page = context.new_page()
    page.on('pageerror', lambda error: errors.append(str(error)))
    description = 'FE031 Публикация ' + uuid.uuid4().hex[:12]
    try:
        open_published(page, url)
        assert_step(page.url.startswith('https://'), 'Приложение открыто по HTTPS', checks)
        assert_step('github.io' in urlsplit(page.url).hostname or urlsplit(page.url).hostname == urlsplit(url).hostname,
                    'Открыт ожидаемый домен публикации', checks)
        assert_step(page.locator('input[type=password]').count() == 0,
                    'На главной нет обязательной формы входа', checks)
        assert_step(page.evaluate('localStorage.getItem(key)', STORAGE_KEY) is None,
                    'Временный профиль изначально не содержит записей', checks)

        for route, heading in [('car', 'Автомобиль'), ('maintenance', 'План ТО'), ('journal', 'Журнал обслуживания')]:
            navigate(page, route, heading)
            assert_step(f'#/{route}' in page.url, f'Навигация работает: {route}', checks)

        navigate(page, 'journal/new', 'Добавить запись')
        page.locator('#new-entry-type').select_option('ТО')
        page.locator('#new-entry-date').fill('2026-10-20')
        page.locator('#new-entry-mileage').fill('25000')
        page.locator('#new-entry-description').fill(description)
        page.locator('#new-entry-amount').fill('1234')
        page.locator('#new-service-entry-form button[type=submit]').click()
        page.wait_for_function('() => location.hash === "#/journal"', timeout=12000)
        page.locator('#journal-records .entry-card').filter(has_text=description).wait_for()
        assert_step(page.get_by_text('Запись обслуживания сохранена.', exact=False).count() > 0,
                    'После создания показано подтверждение сохранения', checks)
        value = page.evaluate('key => localStorage.getItem(key)', STORAGE_KEY)
        saved = json.loads(value) if value else []
        assert_step(any(item.get('description') == description for item in saved),
                    'Новая запись реально записалась в localStorage опубликованного сайта', checks)

        page.reload(wait_until='domcontentloaded')
        page.locator('#journal-records .entry-card').filter(has_text=description).wait_for(timeout=15000)
        assert_step(True, 'После реального reload запись осталась в журнале', checks)
        page.close()

        # Вторая вкладка в том же браузерном контексте читает нативный localStorage.
        page = context.new_page()
        page.on('pageerror', lambda error: errors.append(str(error)))
        open_published(page, url)
        navigate(page, 'journal', 'Журнал обслуживания')
        assert_step(page.locator('#journal-records .entry-card').filter(has_text=description).count() == 1,
                    'После повторного открытия сайта запись всё ещё существует', checks)
        page.locator('#journal-query').fill(description)
        page.locator('#journal-filters button[type=submit]').click()
        page.wait_for_function('() => location.hash.includes("q=")', timeout=12000)
        page.locator('#journal-records .entry-card').filter(has_text=description).wait_for()
        assert_step(page.locator('#journal-records .entry-card').count() == 1,
                    'Поиск на опубликованном сайте находит сохранённую запись', checks)

        navigate(page, 'home', 'Обзор автомобиля')
        assert_step(description in page.locator('#history').inner_text(),
                    'Созданная запись появилась в последних событиях на главной', checks)
        assert_step(page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'),
                    f'Главная без горизонтальной прокрутки при {viewport} px', checks)
        navigate(page, 'journal', 'Журнал обслуживания')
        assert_step(page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'),
                    f'Журнал без горизонтальной прокрутки при {viewport} px', checks)
        assert_step(not errors, 'Во время проверки не возникло ошибок JavaScript', checks)

        if screenshots_dir:
            screenshots_dir.mkdir(parents=True, exist_ok=True)
            page.screenshot(path=str(screenshots_dir / f'fe031-live-journal-{viewport}.png'), full_page=True)
        return {'viewport': viewport, 'status': 'PASS', 'checks': checks,
                'total_checks': len(checks)}
    except Exception:
        if screenshots_dir and not page.is_closed():
            screenshots_dir.mkdir(parents=True, exist_ok=True)
            try:
                page.screenshot(path=str(screenshots_dir / f'fe031-error-{viewport}.png'), full_page=True)
            except Exception:
                pass
        raise
    finally:
        context.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--url', default=DEFAULT_URL, help='HTTPS корень GitHub Pages')
    parser.add_argument('--report', type=Path, help='Путь к JSON протоколу')
    parser.add_argument('--screenshots', type=Path, help='Папка для необязательных скриншотов')
    parser.add_argument('--attempts', type=int, default=3, help='Попытки при задержке публикации')
    parser.add_argument('--retry-delay', type=int, default=10, help='Пауза между попытками, секунды')
    args = parser.parse_args()
    url = normalize_url(args.url)
    if args.attempts < 1 or args.retry_delay < 0:
        parser.error('--attempts должен быть >= 1, --retry-delay >= 0')
    report = {'task': 'FE-031', 'site': url, 'checked_at_utc': datetime.now(timezone.utc).isoformat(),
              'mode': 'real deployed HTTPS page, native browser localStorage, isolated contexts',
              'status': 'FAIL', 'viewports': []}
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True, args=['--no-sandbox', '--disable-dev-shm-usage'])
            try:
                for viewport in (1200, 360):
                    for attempt in range(1, args.attempts + 1):
                        try:
                            outcome = run_one(browser, url, viewport, args.screenshots)
                            report['viewports'].append(outcome)
                            print(f'{viewport}px: {outcome["total_checks"]} проверок пройдено')
                            break
                        except Exception as error:
                            print(f'{viewport}px, попытка {attempt}/{args.attempts}: {error}', file=sys.stderr)
                            if attempt >= args.attempts:
                                raise
                            time.sleep(args.retry_delay)
            finally:
                browser.close()
        report['status'] = 'PASS'
        report['total_checks'] = sum(result['total_checks'] for result in report['viewports'])
        print(f'FE-031: PASS — {report["total_checks"]} проверок опубликованного сайта')
    except Exception as error:
        report['error'] = f'{type(error).__name__}: {error}'
        print('FE-031: FAIL —', report['error'], file=sys.stderr)
    finally:
        if args.report:
            args.report.parent.mkdir(parents=True, exist_ok=True)
            args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    return 0 if report['status'] == 'PASS' else 1


if __name__ == '__main__':
    sys.exit(main())
