import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";

const ler = (caminho) => readFileSync(new URL(caminho, import.meta.url), "utf8");
const paginas = readdirSync(new URL("..", import.meta.url)).filter((nome) => nome.endsWith(".html"));
const modulos = readdirSync(new URL(".", import.meta.url)).filter((nome) => /(?<!\.test)\.js$/.test(nome));

const css = ler("style.css")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/:root\s*\{[^}]*\}/, "");
const declaracoes = [...css.matchAll(/([\w-]+)\s*:\s*([^;{}]+);/g)].map(([, nome, valor]) => ({ nome, valor }));

test("cores só como token em :root", () => {
  const cor = /#[0-9a-f]{3,8}\b|\b(rgb|hsl|hwb|lab|lch|oklab|oklch)a?\(|\b(white|black)\b/i;
  assert.deepEqual(declaracoes.filter(({ valor }) => cor.test(valor)), []);
});

test("fontes só como token em :root", () => {
  const fontes = declaracoes.filter(({ nome }) => nome === "font" || nome === "font-family");
  assert.deepEqual(fontes.filter(({ valor }) => !/^inherit$|var\(--fonte-[\w-]+\)$/.test(valor.trim())), []);
});

test("páginas usam o estilo único, sem CSS próprio", () => {
  assert.ok(paginas.length >= 2);
  for (const pagina of paginas) {
    const html = ler(`../${pagina}`);
    assert.match(html, /href="\/src\/style\.css"/, pagina);
    assert.doesNotMatch(html, /<style|\sstyle\s*=/i, pagina);
  }
});

test("JavaScript não escreve estilo", () => {
  assert.ok(modulos.length >= 4);
  for (const modulo of modulos) assert.doesNotMatch(ler(modulo), /\.style\b|["']style["']/, modulo);
});
