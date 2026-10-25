import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  COLUMNS, PARTICIPANTS, TASKS, parseCsv, validateStudyCsv,
  summarizeStudy, renderReport,
} from '../scripts/fe029-analyze-study.mjs';

function serializeCsv(rows) {
  const escape = value => {
    const text = String(value ?? '');
    return /[,"\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return [COLUMNS, ...rows.map(r => COLUMNS.map(k => r[k] ?? ''))].map(r => r.map(escape).join(',')).join('\n') + '\n';
}
function createRows() {
  return PARTICIPANTS.flatMap(participant_id => Object.keys(TASKS).map(task_id => ({
    participant_id, task_id, completed: '', time_seconds: '', problems: '', notes: '',
  })));
}
function setRow(rows, id, task, change) {
  return rows.map(r => r.participant_id === id && r.task_id === task ? { ...r, ...change } : r);
}
function observed(duration, completed = 'yes', problems = 'нет') {
  return { time_seconds: String(duration), completed, problems };
}

test('FE-029: CSV-шаблон проекта валиден (не подменяем реальные наблюдения)', () => {
  const csv = readFileSync(new URL('./fe029-session-results.csv', import.meta.url), 'utf8');
  const rows = validateStudyCsv(csv);
  assert.equal(rows.length, 6);
  assert.equal(new Set(rows.map(r => `${r.participant_id}:${r.task_id}`)).size, 6);
});

test('FE-029: все три участника и оба задания присутствуют в шаблоне', () => {
  const records = validateStudyCsv(serializeCsv(createRows()));
  assert.equal(records.length, 3 * 2);
  assert.deepEqual(Object.keys(TASKS), ['add', 'find']);
  assert.equal(TASKS.add.limit, 60);
  assert.equal(TASKS.find.limit, 20);
});

test('FE-029: пустой шаблон не объявляется успешным пользовательским тестированием', () => {
  const summary = summarizeStudy(validateStudyCsv(serializeCsv(createRows())));
  assert.equal(summary.fullyObserved, 0);
  assert.equal(summary.tasks.add.reached, null);
  assert.equal(summary.tasks.find.reached, null);
});

test('FE-029: CSV поддерживает заметки с запятыми и кавычками', () => {
  const rows = setRow(createRows(), 'P01', 'add', { ...observed(45), notes: 'Нажал "Готово", потом увидел запись, отлично' });
  const parsed = validateStudyCsv(serializeCsv(rows));
  assert.equal(parsed.find(r => r.participant_id === 'P01' && r.task_id === 'add').notes, 'Нажал "Готово", потом увидел запись, отлично');
});

test('FE-029: CSV допускает CRLF, переносы и BOM', () => {
  const rows = setRow(createRows(), 'P03', 'find', { ...observed(19), problems: 'два\nразных шага' });
  const parsed = validateStudyCsv('\uFEFF' + serializeCsv(rows).replace(/\n/g, '\r\n'));
  assert.equal(parsed.length, 6);
});

test('FE-029: неполное заполнение наблюдения отклоняется', () => {
  const rows = setRow(createRows(), 'P01', 'add', { completed: 'yes', time_seconds: '', problems: 'нет' });
  assert.throws(() => validateStudyCsv(serializeCsv(rows)), /укажите время/i);
});

test('FE-029: время 0, дробь и отрицательное число не принимаются', () => {
  for (const time of ['0', '12.5', '-3']) {
    const rows = setRow(createRows(), 'P01', 'add', { ...observed(time) });
    assert.throws(() => validateStudyCsv(serializeCsv(rows)), /time_seconds/i);
  }
});

test('FE-029: неправильное значение completed не принимается', () => {
  const rows = setRow(createRows(), 'P01', 'add', { ...observed(50, 'maybe') });
  assert.throws(() => validateStudyCsv(serializeCsv(rows)), /yes \/ no/i);
});

test('FE-029: дубли участника и задания не принимаются', () => {
  const rows = createRows();
  rows[1] = { ...rows[0] };
  assert.throws(() => validateStudyCsv(serializeCsv(rows)), /дублируется/);
});

test('FE-029: посторонний участник не подменяет проверку 2 из 3', () => {
  const rows = createRows();
  rows[0].participant_id = 'P04';
  assert.throws(() => validateStudyCsv(serializeCsv(rows)), /неизвестный участник/);
});

test('FE-029: отсутствие строки участника обнаруживается', () => {
  assert.throws(() => validateStudyCsv(serializeCsv(createRows().slice(1))), /Отсутствует строка/);
});

test('FE-029: успешный самостоятельный результат на пороге учитывается', () => {
  let rows = createRows();
  rows = setRow(rows, 'P01', 'add', observed(60));
  rows = setRow(rows, 'P01', 'find', observed(20));
  const result = summarizeStudy(validateStudyCsv(serializeCsv(rows)));
  assert.equal(result.tasks.add.passed, 1);
  assert.equal(result.tasks.find.passed, 1);
});

test('FE-029: самостоятельный результат на секунду позже порога не учитывается', () => {
  let rows = createRows();
  rows = setRow(rows, 'P01', 'add', observed(61));
  rows = setRow(rows, 'P01', 'find', observed(21));
  const result = summarizeStudy(validateStudyCsv(serializeCsv(rows)));
  assert.equal(result.tasks.add.passed, 0);
  assert.equal(result.tasks.find.passed, 0);
});

test('FE-029: результат с подсказкой никогда не проходит порог', () => {
  const rows = setRow(createRows(), 'P01', 'add', observed(10, 'no', 'модератор подсказал кнопку'));
  assert.equal(summarizeStudy(validateStudyCsv(serializeCsv(rows))).tasks.add.passed, 0);
});

test('FE-029: два результата без третьего не дают заключения «2 из 3»', () => {
  let rows = createRows();
  for (const id of ['P01', 'P02']) {
    rows = setRow(rows, id, 'add', observed(40));
    rows = setRow(rows, id, 'find', observed(15));
  }
  const result = summarizeStudy(validateStudyCsv(serializeCsv(rows)));
  assert.equal(result.fullyObserved, 2);
  assert.equal(result.tasks.add.reached, null);
  assert.equal(result.tasks.find.reached, null);
});

test('FE-029: минимум два из трёх для обоих ориентиров дают успех', () => {
  let rows = createRows();
  for (const id of ['P01', 'P02', 'P03']) {
    rows = setRow(rows, id, 'add', observed(id === 'P03' ? 80 : 50));
    rows = setRow(rows, id, 'find', observed(id === 'P03' ? 40 : 15));
  }
  const summary = summarizeStudy(validateStudyCsv(serializeCsv(rows)));
  assert.equal(summary.fullyObserved, 3);
  assert.equal(summary.tasks.add.reached, true);
  assert.equal(summary.tasks.find.reached, true);
});

test('FE-029: один из трёх в лимите означает невыполнение ориентира', () => {
  let rows = createRows();
  for (const id of PARTICIPANTS) {
    rows = setRow(rows, id, 'add', observed(id === 'P01' ? 40 : 80));
    rows = setRow(rows, id, 'find', observed(id === 'P01' ? 15 : 40));
  }
  const summary = summarizeStudy(validateStudyCsv(serializeCsv(rows)));
  assert.equal(summary.tasks.add.reached, false);
  assert.equal(summary.tasks.find.reached, false);
});

test('FE-029: пороги оцениваются отдельно, нельзя смешивать результаты заданий', () => {
  let rows = createRows();
  for (const id of PARTICIPANTS) {
    rows = setRow(rows, id, 'add', observed(id === 'P01' ? 70 : 45));
    rows = setRow(rows, id, 'find', observed(id === 'P01' ? 18 : 25));
  }
  const summary = summarizeStudy(validateStudyCsv(serializeCsv(rows)));
  assert.equal(summary.tasks.add.reached, true);
  assert.equal(summary.tasks.find.reached, false);
});

test('FE-029: отчёт показывает реальные затруднения и защищает Markdown-таблицу', () => {
  const rows = setRow(createRows(), 'P01', 'add', { ...observed(50), problems: 'не видно | кнопка', notes: '<script>test</script>' });
  const text = renderReport(validateStudyCsv(serializeCsv(rows)));
  assert.match(text, /не видно \\\| кнопка/);
  assert.match(text, /&lt;script&gt;/);
  assert.match(text, /Недостаточно данных/);
  assert.doesNotMatch(text, /<script>/);
});

test('FE-029: неверный заголовок и кавычки отклоняются', () => {
  assert.throws(() => validateStudyCsv('abc\n'), /Заголовок/);
  assert.throws(() => parseCsv('"abc'), /Незакрытая/);
  assert.throws(() => parseCsv('"a"b'), /Лишний символ/);
});
