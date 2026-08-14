import { strict as assert } from "node:assert";
import { test } from "node:test";
import { buildReport } from "../out/report.js";
import { monthLabel, weekKey } from "../out/format.js";

const hoje = new Date("2026-08-14T09:00:00Z");
const lancamentos = [
  { id: "1", hours: "2:30", logged_date: "2026-08-14", projectTitle: "Corteva" },
  { id: "2", hours: "1:45", logged_date: "2026-08-14", projectTitle: "Produtos" },
  { id: "3", hours: "8:00", logged_date: "2026-08-11", projectTitle: "Corteva" },
  { id: "4", hours: "4:00", logged_date: "2026-07-30", projectTitle: "Produtos" },
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
  assert.deepEqual(relatorio.months.map((mes) => mes.key), ["2026-08", "2026-07"]);
  assert.equal(monthLabel("2026-08"), "agosto de 2026");
});

test("por projeto ordena pelo maior tempo, não pelo nome", () => {
  const relatorio = buildReport(lancamentos, { reference: hoje });
  assert.deepEqual(relatorio.projects.map((projeto) => [projeto.label, projeto.hours]), [
    ["Corteva", "10:30"],
    ["Produtos", "5:45"],
  ]);
});

test("o tempo estimado em aberto vem de fora e é formatado igual", () => {
  const relatorio = buildReport([], { reference: hoje, estimatedOpenMinutes: 555 });
  assert.equal(relatorio.estimatedOpen, "9:15");
  assert.equal(relatorio.today, "0:00");
  assert.deepEqual(relatorio.days, []);
});

test("os lançamentos saem do mais recente para o mais antigo", () => {
  const relatorio = buildReport(lancamentos, { reference: hoje });
  assert.deepEqual(relatorio.entries.map((entrada) => entrada.id), ["1", "2", "3", "4"]);
});
