import { strict as assert } from "node:assert";
import { test } from "node:test";
import { stringsFor } from "../out/locales/index.js";
import { ptBR } from "../out/locales/pt-br.js";
import { en } from "../out/locales/en.js";

test("o idioma do VS Code escolhe o catálogo", () => {
  assert.equal(stringsFor("pt-br"), ptBR);
  assert.equal(stringsFor("pt"), ptBR);
  assert.equal(stringsFor("en"), en);
  assert.equal(stringsFor("en-us"), en);
});

test("idioma desconhecido ou ausente cai no inglês", () => {
  assert.equal(stringsFor("ja"), en);
  assert.equal(stringsFor(undefined), en);
});

test("os dois catálogos têm exatamente as mesmas chaves", () => {
  const shape = (value, path = "") =>
    value && typeof value === "object" && !Array.isArray(value)
      ? Object.keys(value)
          .sort()
          .flatMap((key) => shape(value[key], `${path}.${key}`))
      : [`${path}:${typeof value}`];
  assert.deepEqual(shape(en), shape(ptBR));
});

test("nenhum texto visível usa travessão", () => {
  const walk = (value) =>
    typeof value === "string"
      ? [value]
      : typeof value === "function"
        ? []
        : Object.values(value ?? {}).flatMap(walk);
  for (const text of walk(ptBR)) {
    assert.ok(!text.includes("—"), `travessão em "${text}"`);
    assert.ok(!text.includes("–"), `traço em "${text}"`);
  }
});
