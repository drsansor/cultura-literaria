import assert from "node:assert/strict";
import { test } from "node:test";
import { semTeste } from "./cobertura-banco.mjs";

test("nome na descrição conta como testado", () => {
  assert.deepEqual(semTeste(["grupos_ler"], "select ok(true, 'grupos_ler: membro lê');"), []);
});

test("nome só em comentário não conta", () => {
  const sql = "-- 'grupos_ler: x'\n/* 'grupos_ler: x' */ select ok(true, 'outro: x');";
  assert.deepEqual(semTeste(["grupos_ler"], sql), ["grupos_ler"]);
});

test("nome só no comando SQL não conta", () => {
  const sql = "select policies_are('public', 'grupos', array['grupos_ler']); select lives_ok($$ select 'grupos_ler: x' $$);";
  assert.deepEqual(semTeste(["grupos_ler"], sql), ["grupos_ler"]);
});

test("nome contido em outro nome não conta", () => {
  assert.deepEqual(semTeste(["grupos_ler"], "select ok(true, 'meus_grupos_ler: x');"), ["grupos_ler"]);
});

test("aspas escapadas não confundem a leitura", () => {
  assert.deepEqual(semTeste(["b"], "select ok(true, 'a: copo d''água'); select ok(true, 'b: x');"), []);
});
