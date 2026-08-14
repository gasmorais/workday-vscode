import { strict as assert } from "node:assert";
import { test } from "node:test";
import { alertsOf } from "../out/components/alerts.js";

const now = new Date("2026-08-14T12:00:00Z");

const base = {
  projectTitle: "RDA",
  todolistTitle: "Backlog",
  task: { id: 1, title: "Ajustar login", assigned: [7] },
  assignees: ["Gabriel Morais"],
  subtasks: [],
  comments: [],
  time: [],
  timerRunning: false,
};

const titles = (view) => alertsOf(view, now).map((alert) => alert.title);

test("tarefa sem hora lançada avisa e oferece o cronômetro", () => {
  const found = alertsOf(base, now);
  const alert = found.find((item) => item.title === "Nenhuma hora atribuída");
  assert.ok(alert);
  assert.ok(alert.actions.includes('data-act="startTimer"'));
  assert.ok(alert.actions.includes('data-act="focusTime"'));
});

test("hora lançada tira o aviso de tempo não atribuído", () => {
  const found = titles({ ...base, time: [{ id: 1, logged_hours: 1, logged_mins: 0 }] });
  assert.ok(!found.includes("Nenhuma hora atribuída"));
});

test("cronômetro rodando também conta como tempo em andamento", () => {
  const found = titles({ ...base, timerRunning: true, timerSince: now.getTime() - 60000 });
  assert.ok(!found.includes("Nenhuma hora atribuída"));
  assert.ok(found.includes("Cronômetro em andamento"));
});

test("cronômetro esquecido por muitas horas vira alerta laranja", () => {
  const [alert] = alertsOf(
    {
      ...base,
      timerRunning: true,
      timerSince: now.getTime() - 9 * 60 * 60 * 1000,
    },
    now,
  );
  assert.equal(alert.level, "warn");
  assert.ok(alert.text.includes("9:00"));
});

test("prazo estourado vira alerta vermelho com o número de dias", () => {
  const [alert] = alertsOf({ ...base, task: { ...base.task, due_date: "2026-08-10" } }, now);
  assert.equal(alert.level, "danger");
  assert.equal(alert.title, "Prazo estourado");
  assert.ok(alert.text.includes("4 dias"));
  assert.ok(alert.actions.includes('data-act="complete"'));
});

test("prazo de hoje e de amanhã são avisos, não erros", () => {
  const hoje = alertsOf({ ...base, task: { ...base.task, due_date: "2026-08-14" } }, now)[0];
  assert.equal(hoje.title, "Vence hoje");
  assert.equal(hoje.level, "warn");
  const amanha = alertsOf({ ...base, task: { ...base.task, due_date: "2026-08-15" } }, now)[0];
  assert.equal(amanha.title, "Vence amanhã");
});

test("tarefa concluída não reclama de prazo antigo", () => {
  const found = titles({
    ...base,
    task: { ...base.task, due_date: "2026-08-10", completed: true },
    time: [{ id: 1, logged_hours: 1 }],
  });
  assert.deepEqual(found, []);
});

test("concluída sem nenhuma hora vira aviso de esforço não registrado", () => {
  const [alert] = alertsOf({ ...base, task: { ...base.task, completed: true } }, now);
  assert.equal(alert.level, "warn");
  assert.ok(alert.text.includes("concluída sem nenhuma hora"));
});

test("estimativa estourada mostra o quanto passou", () => {
  const [alert] = alertsOf(
    {
      ...base,
      task: { ...base.task, estimated_hours: 2, estimated_mins: 0 },
      time: [{ id: 1, logged_hours: 3, logged_mins: 30 }],
    },
    now,
  );
  assert.equal(alert.title, "Estimativa estourada");
  assert.ok(alert.text.includes("2:00"));
  assert.ok(alert.text.includes("1:30"));
});

test("perto do limite avisa com a porcentagem usada", () => {
  const [alert] = alertsOf(
    {
      ...base,
      task: { ...base.task, estimated_hours: 10 },
      time: [{ id: 1, logged_hours: 9 }],
    },
    now,
  );
  assert.equal(alert.title, "Perto do limite estimado");
  assert.ok(alert.text.includes("90%"));
});

test("trabalho sem estimativa é apontado como informação", () => {
  const found = titles({ ...base, time: [{ id: 1, logged_hours: 4 }] });
  assert.ok(found.includes("Sem estimativa"));
});

test("tarefa sem responsável é sinalizada", () => {
  const found = titles({ ...base, assignees: [] });
  assert.ok(found.includes("Sem responsável"));
});

test("o texto da subtarefa fala em subtarefa", () => {
  const [alert] = alertsOf({ ...base, isSubtask: true }, now);
  assert.ok(alert.text.includes("esta subtarefa"));
});
