import { strict as assert } from "node:assert";
import { test } from "node:test";
import { renderBody } from "../out/components/sections.js";

const base = {
  projectTitle: "RDA",
  todolistTitle: "Backlog",
  task: { id: 985356917305, title: "Ajustar login" },
  assignees: ["Gabriel Morais"],
  subtasks: [],
  comments: [],
  time: [],
  timerRunning: false,
};

test("identificador numérico da API não quebra a renderização", () => {
  const html = renderBody({
    ...base,
    subtasks: [{ id: 13966722, title: "Subir o build", completed: false }],
    time: [{ id: 80870831, logged_hours: 2, logged_mins: 30, date: "2026-08-14" }],
    comments: [{ id: 30438075, description: "<p>ok</p>", authorName: "Maria" }],
  });
  assert.ok(html.includes('data-subtask="13966722"'));
  assert.ok(html.includes("2:30"));
  assert.ok(html.includes("Maria"));
});

test("o comentário vem no campo description, não em content", () => {
  const html = renderBody({
    ...base,
    comments: [{ id: 1, description: "Reunião confirmada", authorName: "Ana" }],
  });
  assert.ok(html.includes("Reunião confirmada"));
});

test("horas somam logged_hours e logged_mins, inclusive quando um deles é nulo", () => {
  const html = renderBody({
    ...base,
    time: [
      { id: 1, logged_hours: 2, logged_mins: null, date: "2026-08-14" },
      { id: 2, logged_hours: null, logged_mins: 45, date: "2026-08-14" },
    ],
  });
  assert.ok(html.includes(">2:45<"));
});

test("a subtarefa é clicável e leva o próprio identificador", () => {
  const html = renderBody({
    ...base,
    subtasks: [
      { id: 13966722, title: "Subir o build", assigned: [1, 2], due_date: "2026-08-20" },
      { id: 13966723, title: "Feito", completed: true },
    ],
  });
  assert.ok(html.includes('data-act="openSubtask" data-id="13966722"'));
  assert.ok(html.includes("2 responsáveis"));
  assert.ok(html.includes("as-link done"));
});

test("dentro da subtarefa some a lista de subtarefas e aparece o voltar", () => {
  const html = renderBody({
    ...base,
    isSubtask: true,
    parentTitle: "Ajustar login",
    task: { id: 13966722, title: "Subir o build" },
  });
  assert.ok(html.includes('data-act="back"'));
  assert.ok(html.includes("Ajustar login"));
  assert.ok(!html.includes("Nova subtarefa"));
  assert.ok(html.includes("Comentários"));
});

test("o tempo já lançado aparece como etiqueta no cabeçalho", () => {
  const html = renderBody({ ...base, task: { ...base.task, logged_hours: 3, logged_mins: 20 } });
  assert.ok(html.includes("lançado 3:20"));
});

test("o lançamento mostra quem foi, o que fez e em qual subtarefa", () => {
  const html = renderBody({
    ...base,
    time: [
      {
        id: 80870831,
        logged_hours: 0,
        logged_mins: 20,
        date: "2026-08-14",
        status: "billable",
        description: "Testando",
        authorName: "Gabriel Morais",
        targetTitle: "Entrada e Vigência da Loja",
      },
    ],
  });
  assert.ok(html.includes("Gabriel Morais"));
  assert.ok(html.includes("Testando"));
  assert.ok(html.includes("em Entrada e Vigência da Loja"));
  assert.ok(html.includes("faturável"));
  assert.ok(html.includes("0:20"));
});

test("lançamento sem descrição não vira linha vazia", () => {
  const html = renderBody({ ...base, time: [{ id: 1, logged_mins: 30, description: null }] });
  assert.ok(html.includes("sem descrição"));
});

test("seção que falhou explica o motivo em vez de fingir que está vazia", () => {
  const html = renderBody({ ...base, problems: { subtasks: "Erro 403 do ProofHub: sem acesso" } });
  assert.ok(html.includes("Não deu para carregar esta parte"));
  assert.ok(html.includes("sem acesso"));
  assert.ok(html.includes("Nenhum comentário ainda."));
});
