const NAMED: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  hellip: "…",
  mdash: "—",
  ndash: "–",
  laquo: "«",
  raquo: "»",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
  bull: "•",
  middot: "·",
  deg: "°",
  ordm: "º",
  ordf: "ª",
  euro: "€",
  pound: "£",
  cent: "¢",
  copy: "©",
  reg: "®",
  trade: "™",
  times: "×",
  divide: "÷",
  szlig: "ß",
  ccedil: "ç",
  Ccedil: "Ç",
  ntilde: "ñ",
  Ntilde: "Ñ",
};

const ACCENTS: Record<string, string> = {
  acute: "áéíóúýÁÉÍÓÚÝ",
  grave: "àèìòù.ÀÈÌÒÙ.",
  circ: "âêîôû.ÂÊÎÔÛ.",
  tilde: "ã..õ..Ã..Õ..",
  uml: "äëïöüÿÄËÏÖÜ.",
  ring: "å.....Å.....",
  slash: "...ø....Ø...",
};

const VOWELS = "aeiouy";
for (const [accent, glyphs] of Object.entries(ACCENTS)) {
  for (let index = 0; index < glyphs.length; index++) {
    const glyph = glyphs[index];
    if (glyph === ".") {
      continue;
    }
    const letter = VOWELS[index % VOWELS.length];
    NAMED[`${index < VOWELS.length ? letter : letter.toUpperCase()}${accent}`] = glyph;
  }
}

export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function decodeEntities(value: unknown): string {
  return String(value ?? "").replace(/&(#x?[0-9a-f]+|[a-z][a-z0-9]*);/gi, (whole, body: string) => {
    if (body.startsWith("#")) {
      const code =
        body[1] === "x" || body[1] === "X" ? parseInt(body.slice(2), 16) : Number(body.slice(1));
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : whole;
    }
    return NAMED[body] ?? NAMED[body.toLowerCase()] ?? whole;
  });
}

export function unescapeSource(input: unknown): string {
  const value = String(input ?? "");
  const looksLikeMarkup = /<[a-z!/]/i.test(value);
  return !looksLikeMarkup && /&(lt|#0*60|#x0*3c);/i.test(value) ? decodeEntities(value) : value;
}

const INLINE = new Set(["b", "strong", "i", "em", "u", "s", "code", "br", "a", "span"]);
const BLOCK = new Set(["p", "div", "ul", "ol", "li", "blockquote", "pre", "h1", "h2", "h3", "h4"]);
const VOID = new Set(["br", "img", "hr", "input", "meta", "link"]);
const KEEP_AS = new Map([
  ["div", "p"],
  ["span", ""],
  ["h1", "h4"],
  ["h2", "h4"],
  ["h3", "h4"],
]);

export function richText(source: unknown): string {
  const markup = unescapeSource(source).replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, "");
  const tag = /<(\/?)([a-z0-9]+)((?:"[^"]*"|'[^']*'|[^>])*)>/gi;
  const stack: string[] = [];
  const out: string[] = [];
  let cursor = 0;

  const text = (raw: string) => {
    const value = escapeHtml(decodeEntities(raw));
    if (value.trim() || out.length > 0) {
      out.push(value);
    }
  };

  for (let match = tag.exec(markup); match; match = tag.exec(markup)) {
    text(markup.slice(cursor, match.index));
    cursor = match.index + match[0].length;

    const closing = match[1] === "/";
    const name = match[2].toLowerCase();
    if (!INLINE.has(name) && !BLOCK.has(name)) {
      continue;
    }
    const mapped = KEEP_AS.has(name) ? KEEP_AS.get(name)! : name;

    if (VOID.has(name)) {
      if (!closing && mapped) {
        out.push(`<${mapped}>`);
      }
      continue;
    }
    if (closing) {
      const depth = stack.lastIndexOf(name);
      if (depth === -1) {
        continue;
      }
      while (stack.length > depth) {
        const open = stack.pop()!;
        const closeAs = KEEP_AS.has(open) ? KEEP_AS.get(open)! : open;
        if (closeAs) {
          out.push(`</${closeAs}>`);
        }
      }
      continue;
    }
    stack.push(name);
    if (!mapped) {
      continue;
    }
    out.push(name === "a" ? openLink(match[3]) : `<${mapped}>`);
  }

  text(markup.slice(cursor));
  while (stack.length > 0) {
    const open = stack.pop()!;
    const closeAs = KEEP_AS.has(open) ? KEEP_AS.get(open)! : open;
    if (closeAs) {
      out.push(`</${closeAs}>`);
    }
  }
  return out
    .join("")
    .replace(/(<p>\s*<\/p>)+/g, "")
    .trim();
}

function openLink(attributes: string): string {
  const href = /href\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(attributes);
  const value = decodeEntities(href?.[2] ?? href?.[3] ?? href?.[4] ?? "").trim();
  return /^https?:\/\//i.test(value)
    ? `<a href="${escapeHtml(value)}" title="${escapeHtml(value)}">`
    : "<a>";
}

export function plainText(source: unknown): string {
  return decodeEntities(
    unescapeSource(source)
      .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
      .replace(/<\/?(br|p|div|li|tr|h[1-6])\b[^>]*>/gi, "\n")
      .replace(/<[^>]*>/g, ""),
  )
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function firstLine(source: unknown, limit = 120): string {
  const text = plainText(source).split("\n")[0] ?? "";
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}
