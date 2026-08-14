import { strict as assert } from "node:assert";
import { test } from "node:test";
import { EMPTY_FILTER, applyFilter, isActive, sortTasks } from "../out/filter.js";

const hoje = new Date("2026-08-14T12:00:00Z");
const tarefas = [
  { id: 1, title: "Corrigir login", assigned: [10], due_date: "2026-08-10" },
  { id: 2, title: "Revisar contrato", assigned: [20], due_date: "2026-08-20" },
  { id: 3, title: "Publicar release", assigned: [10], completed: true, due_date: null },
  { id: 4, title: "Ajustar layout", description: "<p>tela de <b>login</b></p>" },
];

test("sem filtro nenhuma tarefa é escondida", () => {
  assert.equal(isActive(EMPTY_FILTER), false);
  assert.equal(applyFilter(tarefas, EMPTY_FILTER, hoje).length, 4);
});

test("somente as minhas casa o identificador mesmo vindo como número", () => {
  const minhas = applyFilter(tarefas, { ...EMPTY_FILTER, mine: true, meId: "10" }, hoje);
  assert.deepEqual(minhas.map((tarefa) => tarefa.id), [1, 3]);
});

test("esconder concluídas remove só o que já terminou", () => {
  const abertas = applyFilter(tarefas, { ...EMPTY_FILTER, hideCompleted: true }, hoje);
  assert.deepEqual(abertas.map((tarefa) => tarefa.id), [1, 2, 4]);
});

test("atrasadas ignora prazo futuro, ausente e tarefa concluída", () => {
  const atrasadas = applyFilter(tarefas, { ...EMPTY_FILTER, overdueOnly: true }, hoje);
  assert.deepEqual(atrasadas.map((tarefa) => tarefa.id), [1]);
});

test("a busca alcança a descrição em html e exige todas as palavras", () => {
  const encontradas = applyFilter(tarefas, { ...EMPTY_FILTER, text: "login" }, hoje);
  assert.deepEqual(encontradas.map((tarefa) => tarefa.id), [1, 4]);
  assert.equal(applyFilter(tarefas, { ...EMPTY_FILTER, text: "tela login" }, hoje).length, 1);
  assert.equal(applyFilter(tarefas, { ...EMPTY_FILTER, text: "CORRIGIR" }, hoje).length, 1);
});

test("ordenar por prazo joga quem não tem prazo para o fim, em ordem de título", () => {
  const ordenadas = sortTasks(tarefas, "due");
  assert.deepEqual(ordenadas.map((tarefa) => tarefa.id), [1, 2, 4, 3]);
});

test("a ordem da lista é preservada e não muda o array original", () => {
  const original = [...tarefas];
  assert.deepEqual(sortTasks(tarefas, "list"), tarefas);
  sortTasks(tarefas, "title");
  assert.deepEqual(tarefas, original);
});

test("ordenar por título respeita acento do português", () => {
  const ordenadas = sortTasks(
    [{ id: "a", title: "Índice" }, { id: "b", title: "Alocar" }, { id: "c", title: "Zerar" }],
    "title",
  );
  assert.deepEqual(ordenadas.map((tarefa) => tarefa.title), ["Alocar", "Índice", "Zerar"]);
});
