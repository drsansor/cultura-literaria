import assert from "node:assert/strict";
import { test } from "node:test";
import { mensagemDeErro } from "./erros.js";

test("traduz erro conhecido", () => {
  assert.equal(mensagemDeErro({ code: "invalid_credentials" }), "E-mail ou senha incorretos.");
});

test("falha de rede tem mensagem própria", () => {
  assert.match(mensagemDeErro({ name: "AuthRetryableFetchError" }), /internet/);
});

test("erro desconhecido não vaza texto técnico", () => {
  assert.match(mensagemDeErro({ code: "xyz", message: "internal" }), /Algo deu errado/);
});

test("erros do banco", () => {
  const repetido = (nome) => ({ code: "23505", message: `duplicate key value violates unique constraint "${nome}"` });
  assert.equal(mensagemDeErro(repetido("perfis_usuario_key")), "Este @usuário já está em uso.");
  assert.match(mensagemDeErro(repetido("outra_key")), /Algo deu errado/);
  assert.equal(mensagemDeErro({ code: "23514" }), "Confira os campos e tente de novo.");
  assert.equal(mensagemDeErro({ code: "42501" }), "Você não tem permissão para fazer isso.");
});

test("falha de rede do banco e do Storage também tem mensagem própria", () => {
  assert.match(mensagemDeErro({ code: "", message: "TypeError: Failed to fetch" }), /internet/);
  assert.match(mensagemDeErro({ name: "StorageUnknownError", message: "Failed to fetch" }), /internet/);
});
