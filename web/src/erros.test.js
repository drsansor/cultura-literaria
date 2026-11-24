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
