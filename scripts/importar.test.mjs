import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { destino, importar, lerDados, validar } from "./importar.mjs";

const local = { nome: "Biblioteca", localizacao: "Rua A" };
const liv = { nome: "Liv", foto: null, instagram: "liv", youtube: null, tiktok: null };
const base = (troca = {}) => ({ bibliotecas: [local], sebos: [local], influenciadores: [liv], ...troca });

test("dados válidos, inclusive os do projeto", () => {
  assert.deepEqual(validar(base()), []);
  assert.deepEqual(validar(lerDados()), []);
});

for (const [nome, troca, esperado] of [
  ["nome vazio", { sebos: [local, { ...local, nome: "  " }] }, /sebos\.json, item 2: nome/],
  ["nome longo", { bibliotecas: [{ ...local, nome: "x".repeat(121) }] }, /bibliotecas\.json, item 1: nome/],
  ["localização ausente", { bibliotecas: [{ nome: "B" }] }, /localizacao/],
  ["localização longa", { bibliotecas: [{ ...local, localizacao: "x".repeat(201) }] }, /localizacao/],
  ["texto que não é texto", { bibliotecas: [{ ...local, nome: 5 }] }, /nome/],
  ["rede com @", { influenciadores: [{ ...liv, instagram: "@liv" }] }, /influenciadores\.json, item 1: instagram/],
  ["rede com endereço", { influenciadores: [{ ...liv, youtube: "https://youtube.com/x" }] }, /youtube/],
  ["sem rede", { influenciadores: [{ ...liv, instagram: null }] }, /rede/],
  ["foto com pasta", { influenciadores: [{ ...liv, foto: "../x.png" }] }, /foto/],
  ["campo com nome errado", { influenciadores: [{ ...liv, instgram: "x" }] }, /instgram/],
  ["item repetido", { sebos: [local, local] }, /sebos\.json, item 2: repetido/],
  ["não é lista", { sebos: {} }, /sebos\.json/],
  ["item nulo", { sebos: [null] }, /sebos\.json, item 1/],
]) {
  test(`acusa ${nome}`, () => {
    const erros = validar(base(troca));
    assert.equal(erros.length, 1, erros.join("; "));
    assert.match(erros[0], esperado);
  });
}

test("mesmo local pode ser biblioteca e sebo", () => assert.deepEqual(validar(base()), []));

test("importar não envia nada se houver erro", async () => {
  const cliente = { from: () => assert.fail("não devia consultar") };
  await assert.rejects(importar(cliente, base({ sebos: [{ ...local, nome: "" }] })), /sebos\.json, item 1/);
});

test("destino: local por padrão; remoto só com --producao", () => {
  const padrao = () => ({ url: "http://127.0.0.1:56321", secreta: "local" });
  const remoto = { SUPABASE_URL: "https://exemplo.invalid", SUPABASE_SECRET_KEY: "x" };
  assert.deepEqual(destino([], {}, padrao), { url: "http://127.0.0.1:56321", secreta: "local" });
  assert.throws(() => destino([], remoto, padrao), /--producao/);
  assert.deepEqual(destino(["--producao"], remoto, padrao), { url: remoto.SUPABASE_URL, secreta: "x" });
  assert.equal(destino([], { ...remoto, SUPABASE_URL: "http://localhost:56321" }, padrao).secreta, "x");
  for (const url of ["https://127.0.0.1.exemplo.invalid", "https://localhost.exemplo.invalid", "http://127.0.0.1@exemplo.invalid"]) {
    assert.throws(() => destino([], { ...remoto, SUPABASE_URL: url }, padrao), /--producao/, url);
  }
});

test("destino: variável pela metade e --producao sem endereço são erro", () => {
  const padrao = () => assert.fail("não devia usar o local");
  assert.throws(() => destino([], { SUPABASE_URL: "https://exemplo.invalid" }, padrao), /SUPABASE_SECRET_KEY/);
  assert.throws(() => destino([], { SUPABASE_SECRET_KEY: "x" }, padrao), /SUPABASE_URL/);
  assert.throws(() => destino(["--producao"], {}, padrao), /SUPABASE_URL/);
});

test("linha de comando recusa endereço remoto antes de qualquer requisição", () => {
  const { status, stderr } = spawnSync("node", [new URL("importar.mjs", import.meta.url).pathname], {
    encoding: "utf8",
    env: { ...process.env, SUPABASE_URL: "https://exemplo.invalid", SUPABASE_SECRET_KEY: "x" },
  });
  assert.equal(status, 1);
  assert.match(stderr, /--producao/);
  assert.doesNotMatch(stderr, /fetch/);
});
