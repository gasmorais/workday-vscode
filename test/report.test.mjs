import { strict as assert } from "node:assert";
import { test } from "node:test";
import { buildReport, compare } from "../out/report.js";
import { monthLabel, weekKey } from "../out/format.js";
import { entryTargets } from "../out/types.js";

const hoje = new Date("2026-08-14T09:00:00Z");
const lancamentos = [
  { id: 1, logged_hours: 2, logged_mins: 30, date: "2026-08-14", projectTitle: "Corteva" },
  { id: 2, logged_hours: 1, logged_mins: 45, date: "2026-08-14", projectTitle: "Produtos" },
  { id: 3, logged_hours: 8, logged_mins: null, date: "2026-08-11", projectTitle: "Corteva" },
  { id: 4, logged_hours: null, logged_mins: 240, date: "2026-07-30", projectTitle: "Produtos" },
];

test("hoje, semana e mês somam faixas diferentes do mesmo conjunto", () => {
  const relatorio = buildReport(lancamentos, { reference: hoje });
  assert.equal(relatorio.today, "4:15");
  assert.equal(relatorio.week, "12:15");
  assert.equal(relatorio.month, "12:15");
  assert.equal(relatorio.total, "16:15");
});

test("a semana começa na segunda, então o dia 11 entra na semana do dia 14", () => {
  assert.equal(weekKey("2026-08-11"), weekKey("2026-08-14"));
  assert.equal(weekKey("2026-08-14"), "2026-08-10");
});

test("os meses vêm do mais recente para o mais antigo, com nome em português", () => {
  const relatorio = buildReport(lancamentos, { reference: hoje });
  assert.deepEqual(
    relatorio.months.map((mes) => mes.key),
    ["2026-08", "2026-07"],
  );
  assert.equal(monthLabel("2026-08"), "agosto de 2026");
});

test("por projeto ordena pelo maior tempo, não pelo nome", () => {
  const relatorio = buildReport(lancamentos, { reference: hoje });
  assert.deepEqual(
    relatorio.projects.map((projeto) => [projeto.label, projeto.hours]),
    [
      ["Corteva", "10:30"],
      ["Produtos", "5:45"],
    ],
  );
});

test("o tempo estimado em aberto vem de fora e é formatado igual", () => {
  const relatorio = buildReport([], { reference: hoje, estimatedOpenMinutes: 555 });
  assert.equal(relatorio.estimatedOpen, "9:15");
  assert.equal(relatorio.today, "0:00");
  assert.deepEqual(relatorio.days, []);
});

test("o tempo vem em horas e minutos separados, e minuto sozinho também conta", () => {
  const relatorio = buildReport(lancamentos, { reference: hoje });
  assert.equal(relatorio.months.find((mes) => mes.key === "2026-07").hours, "4:00");
});

test("os lançamentos saem do mais recente para o mais antigo", () => {
  const relatorio = buildReport(lancamentos, { reference: hoje });
  assert.deepEqual(
    relatorio.entries.map((entrada) => entrada.id),
    [1, 2, 3, 4],
  );
});

test("o lançamento é reconhecido pela tarefa e também pela subtarefa", () => {
  assert.deepEqual(entryTargets({ task: { id: 10 } }), [10]);
  assert.deepEqual(entryTargets({ task: { id: 10 }, subtask: { id: 20 } }), [10, 20]);
  assert.deepEqual(entryTargets({ task: null, task_id: 30 }), [30]);
  assert.deepEqual(entryTargets({}), []);
});

test("a comparação separa uma série por pessoa em cada período", () => {
  const data = compare(
    [
      { id: 1, date: "2026-08-13", logged_hours: 2, authorName: "Ana" },
      { id: 2, date: "2026-08-13", logged_hours: 1, authorName: "Bruno" },
      { id: 3, date: "2026-08-14", logged_hours: 3, authorName: "Ana" },
    ],
    "day",
  );
  assert.deepEqual(data.keys, ["2026-08-13", "2026-08-14"]);
  assert.deepEqual(
    data.series.map((row) => row.label),
    ["Ana", "Bruno"],
  );
  assert.deepEqual(data.series[0].values, [120, 180]);
  assert.deepEqual(data.series[1].values, [60, 0]);
  assert.deepEqual(data.totals, [180, 180]);
});

test("a comparação por semana e por mês agrupa os mesmos lançamentos", () => {
  const entries = [
    { id: 1, date: "2026-08-03", logged_hours: 1, authorName: "Ana" },
    { id: 2, date: "2026-08-05", logged_hours: 1, authorName: "Ana" },
    { id: 3, date: "2026-09-01", logged_hours: 1, authorName: "Ana" },
  ];
  assert.equal(compare(entries, "week").keys.length, 2);
  assert.deepEqual(compare(entries, "month").keys, ["2026-08", "2026-09"]);
  assert.deepEqual(compare(entries, "month").series[0].values, [120, 60]);
});

test("a série mais pesada vem primeiro e o pico é o maior período", () => {
  const data = compare(
    [
      { id: 1, date: "2026-08-14", logged_hours: 1, authorName: "Ana" },
      { id: 2, date: "2026-08-14", logged_hours: 5, authorName: "Bruno" },
    ],
    "day",
  );
  assert.equal(data.series[0].label, "Bruno");
  assert.equal(data.series[0].hours, "5:00");
  assert.equal(data.peak, 360);
});

test("o relatório resume as horas por pessoa da maior para a menor", () => {
  const report = buildReport([
    { id: 1, date: "2026-08-14", logged_hours: 1, authorName: "Ana" },
    { id: 2, date: "2026-08-14", logged_hours: 4, authorName: "Bruno" },
  ]);
  assert.deepEqual(
    report.people.map((bucket) => `${bucket.label} ${bucket.hours}`),
    ["Bruno 4:00", "Ana 1:00"],
  );
});
