import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  CALL_WINDOW_PATTERN,
  WINDOW_SEPARATOR,
  parseWindowList,
  readWindows,
  titleOf,
} from "../out/teams/mac-windows.js";

const inCall = "Meeting compact view | Matheus Sudati - Roda | Microsoft Teams";
const idle = "Chat | Settings | Microsoft Teams";

test("a janela da call em curso e reconhecida", () => {
  const read = readWindows([idle, inCall], CALL_WINDOW_PATTERN);
  assert.equal(read.inCall, true);
  assert.equal(read.title, "Matheus Sudati - Roda");
});

test("so as janelas normais nao contam como call", () => {
  assert.deepEqual(readWindows([idle], CALL_WINDOW_PATTERN), { inCall: false });
});

test("a palavra reuniao no meio de um assunto nao dispara a call", () => {
  const chat = "Chat | Pauta da reuniao de segunda | Microsoft Teams";
  assert.equal(readWindows([chat], CALL_WINDOW_PATTERN).inCall, false);
});

test("a call em portugues tambem e reconhecida", () => {
  const pt = "Reuniao | Time de Produtos | Microsoft Teams";
  assert.equal(readWindows([pt], CALL_WINDOW_PATTERN).inCall, true);
});

test("o titulo ignora o nome do aplicativo e a vista compacta", () => {
  assert.equal(titleOf(inCall), "Matheus Sudati - Roda");
  assert.equal(titleOf("Microsoft Teams"), undefined);
});

test("a lista de janelas sobrevive a titulos com virgula", () => {
  const output = ["Chat, notas | Microsoft Teams", inCall].join(WINDOW_SEPARATOR);
  const names = parseWindowList(output);
  assert.equal(names.length, 2);
  assert.equal(readWindows(names, CALL_WINDOW_PATTERN).inCall, true);
});

test("sem o Teams aberto a saida vazia nao vira janela", () => {
  assert.deepEqual(parseWindowList(""), []);
});
