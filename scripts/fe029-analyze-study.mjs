/**
 * FE-029. Анализ наблюдений пользовательского тестирования.
 * Никаких придуманных результатов: до заполнения CSV выводит «не проведено».
 * Приёмочные ориентиры: добавить запись <= 60 с, найти запись <= 20 с;
 * для вывода «достигнут» нужны минимум два успеха среди трёх участников.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const TASKS = Object.freeze({
  add: { label: 'Добавить запись о ТО', limit: 60 },
  find: { label: 'Найти прежнюю замену детали', limit: 20 },
});
export const PARTICIPANTS = Object.freeze(['P01', 'P02', 'P03']);
export const COLUMNS = Object.freeze([
  'participant_id', 'task_id', 'completed', 'time_seconds', 'problems', 'notes',
]);

// Полноценный CSV-парсер: запятые, кавычки и переносы строк внутри кавычек.
export function parseCsv(source) {
  const data = String(source).replace(/^\uFEFF/, '');
  const rows = [];
  let current = [];
  let field = '';
  let quoted = false;
  let afterQuote = false;

  for (let i = 0; i < data.length; i += 1) {
    const ch = data[i];
    if (quoted) {
      if (ch === '"' && data[i + 1] === '"') { field += '"'; i += 1; }
      else if (ch === '"') { quoted = false; afterQuote = true; }
      else field += ch;
    } else if (afterQuote) {
      if (ch === ',') { current.push(field); field = ''; afterQuote = false; }
      else if (ch === '\n' || ch === '\r') {
        current.push(field); rows.push(current); current = []; field = ''; afterQuote = false;
        if (ch === '\r' && data[i + 1] === '\n') i += 1;
      } else throw new Error(`Лишний символ после закрывающей кавычки в CSV: ${ch}`);
    } else if (ch === '"') {
      if (field) throw new Error('Неверно экранированная кавычка в CSV');
      quoted = true;
    } else if (ch === ',') {
      current.push(field); field = '';
    } else if (ch === '\n' || ch === '\r') {
      current.push(field); rows.push(current); current = []; field = '';
      if (ch === '\r' && data[i + 1] === '\n') i += 1;
    } else field += ch;
  }
  if (quoted) throw new Error('Незакрытая кавычка в CSV');
  if (field !== '' || current.length || afterQuote) { current.push(field); rows.push(current); }
  return rows.filter(row => !(row.length === 1 && row[0] === ''));
}

export function validateStudyCsv(csv) {
  const records = parseCsv(csv);
  const header = records.shift();
  if (!header || header.length !== COLUMNS.length || header.some((value, i) => value !== COLUMNS[i])) {
    throw new Error(`Заголовок CSV должен быть: ${COLUMNS.join(',')}`);
  }
  const byKey = new Map();
  for (const [index, cells] of records.entries()) {
    const rowNumber = index + 2;
    if (cells.length !== COLUMNS.length) throw new Error(`Строка ${rowNumber}: ожидалось ${COLUMNS.length} столбцов`);
    const [participant_id, task_id, rawDone, rawTime, rawProblems, rawNotes] = cells;
    if (!PARTICIPANTS.includes(participant_id) || !Object.hasOwn(TASKS, task_id)) {
      throw new Error(`Строка ${rowNumber}: неизвестный участник или задача`);
    }
    const key = `${participant_id}:${task_id}`;
    if (byKey.has(key)) throw new Error(`Строка ${rowNumber}: дублируется ${key}`);
    const completed = rawDone.trim().toLowerCase();
    const timeRaw = rawTime.trim();
    const problems = rawProblems.trim();
    const notes = rawNotes.trim();
    if (!['', 'yes', 'no'].includes(completed)) {
      throw new Error(`Строка ${rowNumber}: completed = yes / no / пусто`);
    }
    const time = timeRaw && /^\d+$/.test(timeRaw) ? Number(timeRaw) : null;
    if (timeRaw && (time === null || !Number.isSafeInteger(time) || time <= 0)) {
      throw new Error(`Строка ${rowNumber}: time_seconds должно быть положительным целым числом`);
    }
    if (!completed && (timeRaw || problems || notes)) {
      throw new Error(`Строка ${rowNumber}: не отмечено completed; остальные поля пока оставьте пустыми`);
    }
    if (completed && (time === null || !problems)) {
      throw new Error(`Строка ${rowNumber}: укажите время и проблемы (напишите «нет», если их нет)`);
    }
    byKey.set(key, {
      participant_id, task_id, completed: completed || null,
      time_seconds: time, problems, notes,
    });
  }
  for (const id of PARTICIPANTS) {
    for (const task of Object.keys(TASKS)) {
      if (!byKey.has(`${id}:${task}`)) throw new Error(`Отсутствует строка: ${id} / ${task}`);
    }
  }
  if (byKey.size !== PARTICIPANTS.length * Object.keys(TASKS).length) {
    throw new Error('CSV должен содержать ровно шесть строк результатов');
  }
  return [...byKey.values()];
}

export function summarizeStudy(rows) {
  const byKey = new Map(rows.map(row => [`${row.participant_id}:${row.task_id}`, row]));
  const taskSummaries = Object.fromEntries(Object.entries(TASKS).map(([task, config]) => {
    const entries = PARTICIPANTS.map(id => byKey.get(`${id}:${task}`));
    const observed = entries.filter(entry => entry?.completed === 'yes' || entry?.completed === 'no');
    const passed = observed.filter(entry => entry.completed === 'yes' && entry.time_seconds <= config.limit);
    return [task, {
      task, label: config.label, limit: config.limit,
      observed: observed.length, passed: passed.length,
      // Формулировка AC именно «двое из трёх», не делаем вывод по двум людям.
      reached: observed.length === 3 ? passed.length >= 2 : null,
    }];
  }));
  const fullyObserved = PARTICIPANTS.filter(id =>
    Object.keys(TASKS).every(task => Boolean(byKey.get(`${id}:${task}`)?.completed))
  ).length;
  return { tasks: taskSummaries, fullyObserved };
}

function cell(value) {
  return String(value ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function statusFor(row, limit) {
  if (!row.completed) return 'Не проводилось';
  return row.completed === 'yes' && row.time_seconds <= limit ? 'Цель достигнута' : 'Цель не достигнута';
}
export function renderReport(rows) {
  const { tasks, fullyObserved } = summarizeStudy(rows);
  const byKey = new Map(rows.map(row => [`${row.participant_id}:${row.task_id}`, row]));
  const lines = [
    '# FE-029 — Результаты пользовательского тестирования',
    '',
    '> Этот отчёт формируется из `tests/fe029-session-results.csv`. Пустые ячейки означают, что реальный участник ещё не проходил испытание. Автотесты FE-028 не заменяют тестирование с людьми.',
    '',
    `**Наблюдались обе задачи у ${fullyObserved} из 3 участников.**`,
    '',
    '| Участник | Задание | Выполнено без подсказки | Время, с | Проблемы | Замечания | Достижение цели |',
    '|---|---|---|---:|---|---|---|',
  ];
  for (const id of PARTICIPANTS) {
    for (const task of Object.keys(TASKS)) {
      const row = byKey.get(`${id}:${task}`);
      const config = TASKS[task];
      lines.push(`| ${id} | ${config.label} | ${row.completed === 'yes' ? 'Да' : row.completed === 'no' ? 'Нет' : '—'} | ${row.time_seconds ?? '—'} | ${cell(row.problems || '—')} | ${cell(row.notes || '—')} | ${statusFor(row, config.limit)} |`);
    }
  }
  lines.push('', '## Проверка ориентиров «минимум двое из трёх»', '',
    '| Ориентир | Участников с результатом | Уложились без подсказки | Решение |',
    '|---|---:|---:|---|');
  for (const summary of Object.values(tasks)) {
    const decision = summary.reached === null ? 'Недостаточно данных для вывода (нужны 3 участника)' :
      summary.reached ? 'Достигнут' : 'Не достигнут';
    lines.push(`| ${summary.label}: до ${summary.limit} с | ${summary.observed}/3 | ${summary.passed}/3 | ${decision} |`);
  }
  lines.push('',
    '## Качественные наблюдения', '',
    'После реальных сессий заполните `tests/fe029-observations.md`: этот отдельный файл с заметками ведущего **не перезаписывается** при генерации отчёта.',
    '',
    'Интерпретация: `completed=yes` — задача выполнена **без подсказок**; `completed=no` — не выполнена самостоятельно (включая случаи с подсказками). Даже если пользователь закончил задачу, превышение лимита означает «цель не достигнута». Время измеряется с момента предъявления задания до фактического результата либо завершения попытки.',
    '',
    '**Статус FE-029:** ' + (fullyObserved < 2
      ? 'испытание с нужным числом пользователей ещё не завершено.'
      : fullyObserved < 3
        ? 'протокол по двум участникам возможен, но ориентир «2 из 3» ещё нельзя подтвердить.'
        : 'наблюдения по трём участникам записаны; изучите таблицу ориентиров и замечания.'),
    '');
  return lines.join('\n');
}

async function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const file = resolve(root, 'tests/fe029-session-results.csv');
  const report = resolve(root, 'tests/fe029-results.md');
  const rows = validateStudyCsv(await readFile(file, 'utf8'));
  const text = renderReport(rows);
  await writeFile(report, text, 'utf8');
  const summary = summarizeStudy(rows);
  console.log(`FE-029: заполнено ${summary.fullyObserved}/3 полных протоколов участников.`);
  for (const task of Object.values(summary.tasks)) {
    console.log(`${task.label}: ${task.passed}/3 в пределах ${task.limit} с; ${task.reached === null ? 'данных недостаточно' : task.reached ? 'ориентир достигнут' : 'ориентир не достигнут'}`);
  }
  console.log('Отчёт:', report);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error('FE-029:', error.message); process.exitCode = 1; });
}
