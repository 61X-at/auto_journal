#!/usr/bin/env python3
"""FE-028: browser E2E of AutoJournal on a clean in-memory profile, no server.

Requires Python 3.10+, playwright and installed Chromium browser. Usage:
    python tests/fe028-e2e-browser.py
    python tests/fe028-e2e-browser.py --report /tmp/fe028-result.json

The isolated browser's localStorage is represented by an in-page storage shim because
some environments forbid file:// and loopback/network origins. No backend, fetch or
fixture preloading is involved; all test data are entered through actual UI forms.
When emulating a refresh, the same stored JSON values are passed to a new page.
This covers UI reload hydration but does NOT prove native browser-storage durability
(that is covered by FE-027 and manual testing on a normal http://localhost origin).
"""

import argparse
import json
import re
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
ENTRY = ROOT / 'src' / 'main.js'
HTML = ROOT / 'tempPage' / 'index.html'
CSS = ROOT / 'tempPage' / 'styles.css'
IMPORT = re.compile(r'(?<=from\s)([\'\"])(\.{1,2}/[^\'\"]+)(\1)')
KEYS = ('autojournal_v1_car', 'autojournal_v1_entries', 'autojournal_v1_plans')


def module_graph(entry):
    output = []
    visited = set()
    def visit(path):
        path = path.resolve()
        assert path.is_relative_to(ROOT), f'Небезопасный импорт: {path}'
        if path in visited:
            return
        code = path.read_text(encoding='utf-8')
        for match in IMPORT.finditer(code):
            visit(path.parent / match.group(2))
        visited.add(path)
        output.append((path, code))
    visit(entry)
    return output


GRAPH = module_graph(ENTRY)
DOCUMENT = re.sub(r'<script\s+type="module"\s+src="[^"]+"\s*>\s*</script>', '', HTML.read_text(encoding='utf-8'))
STYLE = CSS.read_text(encoding='utf-8')


def launch_page(context, stored=None):
    """Render real application sources in Chromium with an isolated localStorage shim."""
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda exc: errors.append(str(exc)))
    page.set_content(DOCUMENT, wait_until='domcontentloaded')
    page.add_style_tag(content=STYLE)
    page.evaluate('''seed => {
      const values = {...seed};
      const storage = {
        getItem(key) { return Object.hasOwn(values,key) ? values[key] : null; },
        setItem(key, value) { values[key] = String(value); },
        removeItem(key) { delete values[key]; },
        clear() { Object.keys(values).forEach(k => delete values[k]); },
        key(index) { return Object.keys(values)[index] ?? null; },
        get length() { return Object.keys(values).length; },
      };
      Object.defineProperty(window, 'localStorage', {configurable:true, value:storage});
      window.__fe028Saved = values;
    }''', stored or {})
    urls = {}
    for file, code in GRAPH:
        transformed = IMPORT.sub(lambda m: repr(urls[(file.parent / m.group(2)).resolve()]), code)
        urls[file] = page.evaluate(
            'code => URL.createObjectURL(new Blob([code], {type:"text/javascript"}))',
            transformed,
        )
    page.evaluate('url => import(url)', urls[ENTRY.resolve()])
    page.locator('#main-content h1').wait_for()
    return page, errors


def saved(page):
    return page.evaluate('() => ({...window.__fe028Saved})')


def records(page, name):
    value = saved(page).get('autojournal_v1_' + name)
    return json.loads(value) if value is not None else (None if name == 'car' else [])


def go(page, route, heading=None):
    page.evaluate('route => window.location.hash = "#/" + route', route)
    page.wait_for_function('expected => location.hash === "#/" + expected', arg=route)
    if heading:
        page.locator('#main-content h1').filter(has_text=heading).wait_for()
    else:
        page.wait_for_timeout(50)


def ensure(condition, message):
    if not condition:
        raise AssertionError(message)


def check(condition, label, tests):
    ensure(condition, label)
    tests.append(label)


def add_entry(page, desc, date, amount, category='ТО', mileage='120000'):
    go(page, 'journal/new', 'Добавить запись')
    page.locator('#new-entry-type').select_option(category)
    page.locator('#new-entry-date').fill(date)
    page.locator('#new-entry-mileage').fill(mileage)
    page.locator('#new-entry-description').fill(desc)
    page.locator('#new-entry-amount').fill(str(amount))
    page.locator('#new-service-entry-form button[type=submit]').click()
    page.wait_for_function('() => location.hash === "#/journal"')
    page.get_by_text('Запись обслуживания сохранена.', exact=False).wait_for()


def run_workflow(browser, width=1200, screenshots=None):
    context = browser.new_context(viewport={'width':width,'height':900}, locale='ru-RU')
    page, errors = launch_page(context)
    tests = []
    try:
        # Fresh profile: no fixture data in localStorage.
        check(all(k not in saved(page) for k in KEYS), 'Чистый профиль: исходные данные отсутствуют', tests)
        check('Автомобиль ещё не добавлен' in page.locator('#main-content').inner_text(), 'Чистый профиль: безопасное пустое состояние', tests)

        # US-01: create, then update vehicle.
        go(page, 'car', 'Автомобиль')
        page.locator('#car-brand').fill('Toyota')
        page.locator('#car-model').fill('Camry')
        page.locator('#car-year').fill('2018')
        page.locator('#car-mileage').fill('118000')
        page.locator('#car-profile-form button[type=submit]').click()
        check(records(page,'car')['brand']=='Toyota', 'US-01: автомобиль создан и сохранён', tests)
        page.locator('#car-mileage').fill('120000')
        page.locator('#car-profile-form button[type=submit]').click()
        check(records(page,'car')['currentMileage']==120000, 'US-01: пробег изменён и сохранён', tests)
        go(page, 'home', 'Обзор автомобиля')
        check('Toyota Camry' in page.locator('.car-card').inner_text(), 'US-01: главная отражает автомобиль из хранилища', tests)

        # AC-01 validation: invalid entry does not change data.
        go(page,'journal/new','Добавить запись')
        page.locator('#new-entry-type').select_option('ТО')
        page.locator('#new-entry-date').fill('2026-10-20')
        page.locator('#new-entry-mileage').fill('120000')
        page.locator('#new-entry-description').fill('Замена масла (масло 5W-30)')
        page.locator('#new-entry-amount').fill('-500')
        page.locator('#new-service-entry-form button[type=submit]').click()
        check(page.locator('#new-entry-amount').get_attribute('aria-invalid')=='true', 'AC-01: отрицательная сумма подсвечивается ошибкой', tests)
        check(len(records(page,'entries'))==0, 'AC-01: ошибочная запись не сохраняется', tests)
        page.locator('#new-entry-amount').fill('2700')
        page.locator('#new-entry-description').fill('')
        page.locator('#new-entry-date').fill('')
        page.locator('#new-service-entry-form button[type=submit]').click()
        check(page.locator('#new-entry-description').get_attribute('aria-invalid')=='true', 'AC-01: пустое описание вызывает ошибку', tests)
        check(page.locator('#new-entry-date').get_attribute('aria-invalid')=='true', 'AC-01: отсутствие даты вызывает ошибку', tests)
        check(len(records(page,'entries'))==0, 'AC-01: невалидная форма не создаёт запись', tests)
        page.locator('#new-entry-description').fill('Замена масла (масло 5W-30)')
        page.locator('#new-entry-date').fill('2026-10-20')

        # US-02: record oil replacement, then another event for filter/sort/delete.
        page.locator('#new-entry-amount').fill('2700')
        page.locator('#new-service-entry-form button[type=submit]').click()
        page.wait_for_function('() => location.hash === "#/journal"')
        check(len(records(page,'entries'))==1, 'US-02: замена масла создана через форму', tests)
        add_entry(page,'Замена тормозных колодок','2026-09-05',5000,'замена детали', '119100')
        check(len(records(page,'entries'))==2, 'AC-01: журнал хранит обе записи', tests)

        # AC-02: order, combined search and category, no result.
        go(page,'journal','Журнал обслуживания')
        cards=page.locator('#journal-records .entry-card h3').all_inner_texts()
        check(cards==['Замена масла (масло 5W-30)','Замена тормозных колодок'], 'AC-02: журнал отсортирован от новой даты к старой', tests)
        page.locator('#journal-query').fill('МАСЛО')
        page.locator('#journal-type').select_option('ТО')
        page.locator('#journal-filters button[type=submit]').click()
        page.wait_for_function('() => location.hash.includes("q=")')
        page.locator('#journal-records .entry-card h3').filter(has_text='Замена масла').wait_for()
        check(page.locator('#journal-records .entry-card').count()==1, 'US-04/AC-02: нечувствительный к регистру поиск плюс категория', tests)
        page.locator('#journal-query').fill('нет-такого-события')
        page.locator('#journal-filters button[type=submit]').click()
        page.wait_for_function('() => document.querySelector("#journal-records")?.innerText.includes("Ничего не найдено")')
        check('Ничего не найдено' in page.locator('#journal-records').inner_text(), 'AC-02: пустой результат поиска', tests)
        page.locator('#journal-filters button[type=reset]').click()
        page.wait_for_function('() => document.querySelectorAll("#journal-records .entry-card").length === 2')

        # US-03: edit same entry via UI, delete other only after confirmation.
        page.locator('#journal-records .entry-card').filter(has_text='Замена масла').get_by_text('Изменить').click()
        page.wait_for_function('() => location.hash.includes("journal/edit")')
        page.locator('#new-entry-amount').fill('3000')
        page.locator('#edit-service-entry-form button[type=submit]').click()
        page.wait_for_function('() => location.hash === "#/journal"')
        check(next(e for e in records(page,'entries') if e['description']=='Замена масла (масло 5W-30)')['amount']==3000,'US-03/AC-01: редактирование обновляет запись, не добавляя новую',tests)
        go(page,'home','Обзор автомобиля')
        check('8\u00a0000' in page.locator('#expenses').inner_text() or '8 000' in page.locator('#expenses').inner_text(), 'US-05: общая сумма двух категорий равна 8 000 ₽',tests)
        page.locator('#expenses .expense-breakdown summary').click()
        breakdown = page.locator('#expenses .expense-breakdown').inner_text()
        check(('3\u00a0000' in breakdown or '3 000' in breakdown) and ('5\u00a0000' in breakdown or '5 000' in breakdown), 'US-05: расходы по категориям 3 000 и 5 000 ₽',tests)
        page.locator('#expense-start-date').fill('2026-10-20')
        page.locator('#expense-end-date').fill('2026-10-20')
        page.locator('.expense-period-form button[type=submit]').click()
        check(('3\u00a0000' in page.locator('#expenses').inner_text() or '3 000' in page.locator('#expenses').inner_text()), 'US-05: отбор по периоду исключает сентябрь',tests)
        go(page,'journal','Журнал обслуживания')
        page.once('dialog',lambda d:d.accept())
        page.locator('#journal-records .entry-card').filter(has_text='Замена тормозных колодок').get_by_text('Удалить').click()
        check(len(records(page,'entries'))==1, 'US-03/AC-01: удаление после подтверждения',tests)

        # US-05: expense total and inclusive period.
        go(page,'home','Обзор автомобиля')
        check('3\u00a0000' in page.locator('#expenses').inner_text() or '3 000' in page.locator('#expenses').inner_text(), 'US-05: сумма пересчитана после удаления и редактирования',tests)
        page.locator('#expense-start-date').fill('2026-10-20')
        page.locator('#expense-end-date').fill('2026-10-20')
        page.locator('.expense-period-form button[type=submit]').click()
        check('3\u00a0000' in page.locator('#expenses').inner_text() or '3 000' in page.locator('#expenses').inner_text(), 'US-05: обе границы периода включены',tests)
        page.locator('#expense-start-date').fill('2026-11-01')
        page.locator('#expense-end-date').fill('2026-11-30')
        page.locator('.expense-period-form button[type=submit]').click()
        check('0 ₽' in page.locator('#expenses').inner_text(), 'US-05: за пустой период расходы равны нулю',tests)
        page.locator('.expense-period-form button[type=button]').click()

        # US-06/AC-03: plan work after an oil replacement, mileage already reached.
        go(page,'maintenance','План ТО')
        page.get_by_role('button',name='Добавить работу').click()
        page.locator('#maintenance-title').fill('Следующая замена масла')
        page.locator('#maintenance-date').fill('2026-12-31')
        page.locator('#maintenance-mileage').fill('119500')
        page.locator('#maintenance-form button[type=submit]').click()
        check(len(records(page,'plans'))==1,'US-06: план ТО сохранён',tests)
        check('Требует внимания' in page.locator('#maintenance-list').inner_text(), 'AC-03: пробег достигнут, ТО требует внимания',tests)
        go(page,'home','Обзор автомобиля')
        check('Следующая замена масла' in page.locator('#maintenance').inner_text(), 'US-06: ближайшее ТО видно на главной',tests)
        check('Требует внимания' in page.locator('#maintenance').inner_text(), 'AC-03: статус внимания виден на главной',tests)
        if screenshots:
            screenshots.mkdir(parents=True, exist_ok=True)
            page.screenshot(path=str(screenshots / f'upcoming-{width}.png'),full_page=True)

        # US-07: mark done; it must not silently add a service event.
        go(page,'maintenance','План ТО')
        page.get_by_role('button',name='Отметить выполненной: Следующая замена масла').click()
        check(records(page,'plans')[0]['status']=='done','US-07: статус сохранён как done',tests)
        check('Следующая замена масла' in page.locator('#maintenance-completed-list').inner_text(),'AC-03: завершённая работа перемещена в выполненные',tests)
        check('Следующая замена масла' not in page.locator('#maintenance-list').inner_text(),'AC-03: выполненная работа отсутствует среди активных',tests)
        check(len(records(page,'entries'))==1,'US-07: отметка done не создаёт журналную запись',tests)

        # US-08: new document instance with same persisted JSON models a full reload.
        snapshot=saved(page)
        page.close()
        page,more_errors=launch_page(context,snapshot)
        errors.extend(more_errors)
        check(all(k in snapshot for k in KEYS),'US-08: все три раздела записаны отдельно',tests)
        go(page,'car','Автомобиль')
        check('Toyota Camry' in page.locator('#car-profile-content').inner_text(),'US-08: карточка доступна после повторного открытия',tests)
        go(page,'journal','Журнал обслуживания')
        check('Замена масла' in page.locator('#journal-records').inner_text(),'US-08: журнал доступен после повторного открытия',tests)
        go(page,'maintenance','План ТО')
        check('Следующая замена масла' in page.locator('#maintenance-completed-list').inner_text(),'US-08/AC-03: выполненный план сохранён после повторного открытия',tests)
        go(page,'home','Обзор автомобиля')
        check('Следующая замена масла' not in page.locator('#maintenance').inner_text(),'US-07: выполненная работа не показывается как ближайшая',tests)
        check('3\u00a0000' in page.locator('#expenses').inner_text() or '3 000' in page.locator('#expenses').inner_text(),'US-05: сумма восстановлена из истории',tests)

        # Responsive sanity check on main pages with full data.
        check(page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'),f'Без горизонтальной прокрутки на {width} px',tests)
        if screenshots:
            screenshots.mkdir(parents=True, exist_ok=True)
            page.screenshot(path=str(screenshots / f'home-{width}.png'),full_page=True)
        check(not errors, 'Нет ошибок JavaScript в браузере',tests)
        return {'viewport': width, 'passed':len(tests), 'checks':tests, 'stories':{f'US-{n:02}':'PASS' for n in range(1,9)},'acceptance':{f'AC-{n:02}':'PASS' for n in range(1,4)}}
    finally:
        context.close()


def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('--report',type=Path,help='Output JSON with per-scenario evidence')
    ap.add_argument('--screenshots',type=Path,help='Save screenshots to directory')
    ap.add_argument('--chromium',default=None,help='Chromium executable path; default Playwright Chromium')
    args=ap.parse_args()
    results=[]
    with sync_playwright() as p:
        opts={'headless':True,'args':['--no-sandbox','--disable-dev-shm-usage']}
        if args.chromium:opts['executable_path']=args.chromium
        browser=p.chromium.launch(**opts)
        try:
            for width in (1200,360):
                results.append(run_workflow(browser,width,args.screenshots))
        finally:
            browser.close()
    report={'FE':'FE-028','status':'PASS','engine':'Chromium + Playwright','storage':'in-memory localStorage shim, page recreated with captured values','server':False,'results':results,'total_assertions':sum(i['passed'] for i in results)}
    if args.report:
        args.report.parent.mkdir(parents=True,exist_ok=True)
        args.report.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    print(f"FE-028: {report['total_assertions']} проверок пройдено (1200 и 360 px), US-01–US-08, AC-01–AC-03: PASS")


if __name__=='__main__':
    main()
