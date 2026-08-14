import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  CALL_LOG_LIMIT,
  add,
  drop,
  idOf,
  mark,
  pending,
  rangeOf,
  since,
  totalMinutes,
} from "../out/teams/call-log.js";

const at = (hour, minute = 0) => new Date(2026, 7, 14, hour, minute).getTime();

const call = (hour, minutes, extra = {}) => ({
  id: idOf(at(hour)),
  startedAt: at(hour),
  endedAt: at(hour) + minutes * 60_000,
  minutes,
  ...extra,
});

test("a call mais recente fica no topo da lista", () => {
  const list = add(add([], call(9, 30)), call(14, 20));
  assert.deepEqual(
    list.map((entry) => entry.startedAt),
    [at(14), at(9)],
  );
});

test("a mesma call nao entra duas vezes", () => {
  const once = add([], call(9, 30));
  assert.equal(add(once, call(9, 30)).length, 1);
});

test("lancar a call guarda as horas e a tarefa", () => {
  const list = mark(add([], call(9, 30)), idOf(at(9)), "0:30", "Catalogo");
  assert.equal(list[0].loggedHours, "0:30");
  assert.equal(list[0].taskTitle, "Catalogo");
  assert.deepEqual(pending(list), []);
});

test("so as calls sem lancamento ficam pendentes", () => {
  const list = [call(9, 30, { loggedHours: "0:30" }), call(14, 20)];
  assert.deepEqual(
    pending(list).map((entry) => entry.startedAt),
    [at(14)],
  );
});

test("descartar remove a call do historico", () => {
  assert.deepEqual(drop(add([], call(9, 30)), idOf(at(9))), []);
});

test("o historico so mostra a janela de dias pedida", () => {
  const old = { ...call(9, 30), endedAt: at(9) - 30 * 24 * 60 * 60 * 1000 };
  const list = since([old, call(14, 20)], 7, at(15));
  assert.equal(list.length, 1);
});

test("o total soma os minutos de todas as calls", () => {
  assert.equal(totalMinutes([call(9, 30), call(14, 20)]), 50);
});

test("o intervalo mostra o inicio e o fim", () => {
  assert.equal(rangeOf(call(9, 30)), "09:00 - 09:30");
});

test("o historico nao cresce sem limite", () => {
  let list = [];
  for (let index = 0; index < CALL_LOG_LIMIT + 20; index += 1) {
    list = add(list, { ...call(9, 5), id: `call-${index}`, startedAt: at(9) + index });
  }
  assert.equal(list.length, CALL_LOG_LIMIT);
});
