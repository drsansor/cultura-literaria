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

test("HTML de texto só aparece na recusa de dom.js", () => {
  for (const modulo of modulos) {
    if (modulo !== "dom.js") assert.doesNotMatch(ler(modulo), /innerHTML|outerHTML|insertAdjacentHTML/, modulo);
  }
  assert.doesNotMatch(ler("dom.js").replace('["innerHTML", "outerHTML"]', ""), /innerHTML|outerHTML|insertAdjacentHTML/);
});

test("todo link externo abre em outra aba sem acesso à página", () => {
  for (const modulo of modulos) {
    const texto = ler(modulo);
    if (!texto.includes('"_blank"')) continue;
    assert.equal(texto.split('target: "_blank"').length, texto.split('target: "_blank", rel: "noopener noreferrer"').length, modulo);
  }
});

test("tokens têm os valores da especificação", () => {
  const raiz = ler("style.css").match(/:root\s*\{([\s\S]*?)\n\}/)[1];
  const token = (nome) => raiz.match(new RegExp(`--${nome}:\\s*([^;]+);`))?.[1];
  for (const [nome, valor] of Object.entries({
    rosa: "#ee7bbe", marrom: "#5a3b36", "marrom-escuro": "#3a211d", creme: "#fff6ed", vinho: "#8e3146",
    listra: "#dad0c6", sombra: "#716a60", papel: "#f2e5d5", "papel-borda": "#ecc1ca", moldura: "#dedfd1",
    "fonte-titulo": '"Rammetto One", serif', "fonte-texto": "Montserrat, sans-serif",
    estrela: "polygon(50% 0, 70.3% 19.7%, 100% 24.9%, 90.7% 50%, 100% 75.1%, 70.3% 80.3%, 50% 100%, 29.7% 80.3%, 0 75.1%, 9.6% 50%, 0 24.9%, 29.7% 19.7%)",
  })) assert.equal(token(nome), valor, nome);
  assert.match(css, /\.seta\s*\{[^}]*clip-path: polygon\(0 0, 75% 0, 100% 50%, 75% 100%, 0 100%\)/);
});
