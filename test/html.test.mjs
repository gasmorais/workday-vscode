import { strict as assert } from "node:assert";
import { test } from "node:test";
import { decodeEntities, firstLine, plainText, richText } from "../out/html.js";

const REAL = `&lt;div&gt;Seguem links necess&amp;aacute;rios para o pagamento ao fornecedor:&lt;/div&gt;
&lt;ul&gt;
&lt;li&gt;formul&amp;aacute;rio de solicita&amp;ccedil;&amp;atilde;o --&amp;gt; &lt;a href="https://example.sharepoint.com/:x:/g/personal/x/Ev?e=Xaib8m"&gt;Modelo_Solicita&amp;ccedil;&amp;atilde;odePagamento.xlsx&lt;/a&gt;&lt;/li&gt;
&lt;li&gt;NF do fornecedor --&amp;gt;&amp;nbsp;&lt;/li&gt;
&lt;/ul&gt;
&lt;div&gt;att,&lt;/div&gt;
&lt;div&gt;Fulano&lt;/div&gt;`;

test("o comentário do ProofHub vem escapado duas vezes e ainda assim é lido", () => {
  const html = richText(REAL);
  assert.ok(html.includes("necessários"));
  assert.ok(html.includes("formulário de solicitação"));
  assert.ok(!html.includes("&lt;div&gt;"));
  assert.ok(!html.includes("&amp;aacute;"));
});

test("a estrutura vira lista e parágrafos de verdade", () => {
  const html = richText(REAL);
  assert.ok(html.includes("<ul>"));
  assert.equal((html.match(/<li>/g) ?? []).length, 2);
  assert.ok(html.includes("<p>att,</p>"));
});

test("o link externo continua clicável", () => {
  const html = richText(REAL);
  assert.ok(html.includes('<a href="https://example.sharepoint.com/:x:/g/personal/x/Ev?e=Xaib8m"'));
  assert.ok(html.includes("Modelo_Solicitação"));
});

test("script, evento e link javascript não sobrevivem", () => {
  const html = richText(
    `<div onclick="roubar()">oi<script>alert(1)</script><a href="javascript:alert(2)">clique</a><img src=x onerror=alert(3)></div>`,
  );
  assert.ok(!html.includes("script"));
  assert.ok(!html.includes("onclick"));
  assert.ok(!html.includes("javascript:"));
  assert.ok(!html.includes("onerror"));
  assert.ok(html.includes("clique"));
});

test("tag desconhecida some mas o texto dela fica", () => {
  assert.equal(richText("<marquee>importante</marquee>"), "importante");
  assert.equal(richText("<b>negrito</b>"), "<b>negrito</b>");
});

test("tag aberta e nunca fechada não vaza para o resto da página", () => {
  const html = richText("<div><b>sem fim");
  assert.equal(html, "<p><b>sem fim</b></p>");
});

test("acento nomeado e numérico decodificam igual", () => {
  assert.equal(decodeEntities("solicita&ccedil;&atilde;o"), "solicitação");
  assert.equal(decodeEntities("&#231;&#227;o"), "ção");
  assert.equal(decodeEntities("&#xe7;&#xe3;o"), "ção");
  assert.equal(decodeEntities("caf&eacute; &agrave; &ocirc;nibus &uuml;"), "café à ônibus ü");
});

test("texto puro serve para tooltip e busca", () => {
  const text = plainText(REAL);
  assert.ok(text.startsWith("Seguem links necessários"));
  assert.ok(!text.includes("<"));
  assert.equal(firstLine(REAL, 30), "Seguem links necessários para…");
});
