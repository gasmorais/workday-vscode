import { strict as assert } from "node:assert";
import { test } from "node:test";
import { escapeHtml, parseHours, renderBody, stripTags, sumHours } from "../out/render.js";

const base = {
  projectTitle: "RDA - PRODUTOS",
  todolistTitle: "Backlog",
  task: { id: "1", title: "Ajustar login" },
  assignees: ["Gabriel"],
  subtasks: [],
  comments: [],
  time: [],
  timerRunning: false,
};

test("a title from ProofHub cannot inject markup into the panel", () => {
  const html = renderBody({ ...base, task: { id: "1", title: "<img src=x onerror=alert(1)>" } });
  assert.ok(!html.includes("<img"));
  assert.ok(html.includes("&lt;img"));
  assert.equal(escapeHtml(`a"b`), "a&quot;b");
});

test("logged hours add up across entries", () => {
  assert.equal(sumHours([{ hours: "1:30" }, { hours: "2:45" }]), "4:15");
  assert.equal(sumHours([]), "0:00");
  assert.equal(parseHours("0.5"), 30);
  assert.equal(parseHours(undefined), 0);
});

test("an open task offers complete and start, a done task offers reopen", () => {
  assert.ok(renderBody(base).includes('data-act="complete"'));
  assert.ok(renderBody(base).includes('data-act="startTimer"'));
  const done = renderBody({ ...base, task: { ...base.task, completed: true }, timerRunning: true });
  assert.ok(done.includes('data-act="reopen"'));
  assert.ok(done.includes('data-act="stopTimer"'));
});

test("subtasks show progress and carry their id to the checkbox", () => {
  const html = renderBody({
    ...base,
    subtasks: [
      { id: "s1", title: "Feito", completed: true },
      { id: "s2", title: "Pendente" },
    ],
  });
  assert.ok(html.includes(">1/2<"));
  assert.ok(html.includes('data-subtask="s2"'));
  assert.ok(html.includes('data-subtask="s1" checked'));
});

test("comment html from ProofHub is flattened to text before display", () => {
  assert.equal(stripTags("<p>Oi<br>tudo bem</p>"), "Oi\ntudo bem");
  const html = renderBody({
    ...base,
    comments: [{ id: "c1", content: "<p>Feito</p>", authorName: "Maria" }],
  });
  assert.ok(html.includes("Maria"));
  assert.ok(html.includes("Feito"));
  assert.ok(!html.includes("<p>Feito"));
});

test("empty sections say so instead of rendering a blank list", () => {
  const html = renderBody(base);
  for (const text of ["No description.", "No subtasks.", "No comments yet."]) {
    assert.ok(html.includes(text), text);
  }
});
