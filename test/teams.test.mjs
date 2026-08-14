import { strict as assert } from "node:assert";
import { test } from "node:test";
import { authorOf, chatTitle, inOrder, meetingWhen, toHtml, toRows } from "../out/teams/chats.js";
import { CallTracker, roundedHours } from "../out/teams/call-tracker.js";

test("a conversa de duas pessoas ganha o nome do outro, não o seu", () => {
  const chat = {
    id: "1",
    chatType: "oneOnOne",
    members: [
      { userId: "eu", displayName: "Gabriel Morais" },
      { userId: "ela", displayName: "Maria" },
    ],
  };
  assert.equal(chatTitle(chat, "eu"), "Maria");
});

test("o assunto do grupo vence a lista de participantes", () => {
  const chat = {
    id: "1",
    topic: "Catálogo 2.0",
    chatType: "group",
    members: [{ userId: "a", displayName: "Ana" }],
  };
  assert.equal(chatTitle(chat, "eu"), "Catálogo 2.0");
});

test("grupo grande sem assunto resume os nomes", () => {
  const chat = {
    id: "1",
    chatType: "group",
    members: ["Ana", "Bruno", "Carla", "Davi", "Eu"].map((name, index) => ({
      userId: String(index),
      displayName: name,
    })),
  };
  assert.equal(chatTitle(chat, "4"), "Ana, Bruno e mais 2");
});

test("as conversas fixadas vêm primeiro e o resto pela mais recente", () => {
  const chats = [
    { id: "a", topic: "A", lastUpdatedDateTime: "2026-08-01T10:00:00Z" },
    { id: "b", topic: "B", lastUpdatedDateTime: "2026-08-14T10:00:00Z" },
    { id: "c", topic: "C", lastUpdatedDateTime: "2026-08-10T10:00:00Z" },
  ];
  assert.deepEqual(
    toRows(chats, ["a"]).map((row) => row.id),
    ["a", "b", "c"],
  );
});

test("mensagem apagada, de sistema ou vazia não aparece", () => {
  const messages = [
    { id: "1", body: { content: "oi" }, createdDateTime: "2026-08-14T10:00:00Z" },
    { id: "2", body: { content: "x" }, deletedDateTime: "2026-08-14T11:00:00Z" },
    { id: "3", messageType: "systemEventMessage", body: { content: "entrou" } },
    { id: "4", body: { content: "   " } },
  ];
  assert.deepEqual(
    inOrder(messages).map((message) => message.id),
    ["1"],
  );
});

test("as mensagens são mostradas da mais antiga para a mais nova", () => {
  const messages = [
    { id: "novo", body: { content: "b" }, createdDateTime: "2026-08-14T12:00:00Z" },
    { id: "velho", body: { content: "a" }, createdDateTime: "2026-08-14T09:00:00Z" },
  ];
  assert.deepEqual(
    inOrder(messages).map((message) => message.id),
    ["velho", "novo"],
  );
});

test("mensagem sem autor conhecido não quebra a linha", () => {
  assert.equal(authorOf({ id: "1" }), "Sistema");
  assert.equal(authorOf({ id: "1", from: { user: { displayName: "Ana" } } }), "Ana");
});

test("o rastreador só devolve a call quando ela termina", () => {
  const tracker = new CallTracker();
  const start = 1_000_000;
  assert.equal(tracker.update({ isInMeeting: true }, start), undefined);
  assert.equal(tracker.running, true);
  assert.equal(tracker.update({ isInMeeting: true, isMuted: true }, start + 60_000), undefined);
  const call = tracker.update({ isInMeeting: false }, start + 32 * 60_000);
  assert.equal(call.minutes, 32);
  assert.equal(tracker.running, false);
});

test("call curta demais não vira pergunta de lançamento", () => {
  const tracker = new CallTracker();
  tracker.update({ isInMeeting: true }, 0);
  assert.equal(tracker.update({ isInMeeting: false }, 30_000), undefined);
});

test("o rastreador lembra se você compartilhou tela e se falou", () => {
  const tracker = new CallTracker();
  tracker.update({ isInMeeting: true, isMuted: true }, 0);
  tracker.update({ isInMeeting: true, isSharing: true, isMuted: false }, 60_000);
  const call = tracker.update({ isInMeeting: false }, 10 * 60_000);
  assert.equal(call.sharedScreen, true);
  assert.equal(call.spoke, true);
});

test("sair e entrar de novo conta como duas calls", () => {
  const tracker = new CallTracker();
  tracker.update({ isInMeeting: true }, 0);
  assert.equal(tracker.update({ isInMeeting: false }, 10 * 60_000).minutes, 10);
  tracker.update({ isInMeeting: true }, 20 * 60_000);
  assert.equal(tracker.update({ isInMeeting: false }, 35 * 60_000).minutes, 15);
});

test("o tempo da call é arredondado para cima em blocos", () => {
  assert.equal(roundedHours(32), "0:30");
  assert.equal(roundedHours(33), "0:35");
  assert.equal(roundedHours(1), "0:05");
  assert.equal(roundedHours(125), "2:05");
});

test("o texto digitado vira html seguro com parágrafos", () => {
  assert.equal(toHtml("oi"), "<p>oi</p>");
  assert.equal(toHtml("um\ndois"), "<p>um<br>dois</p>");
  assert.equal(toHtml("um\n\ndois"), "<p>um</p><p>dois</p>");
  assert.ok(toHtml("<script>alert(1)</script>").includes("&lt;script&gt;"));
});

test("a reunião mostra o horário de início e fim", () => {
  assert.equal(
    meetingWhen({
      id: "1",
      start: { dateTime: "2026-08-14T14:00:00.0000000" },
      end: { dateTime: "2026-08-14T15:30:00.0000000" },
    }),
    "14:00 - 15:30",
  );
});
