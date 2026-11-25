import { randomUUID } from "node:crypto";
import { conferirPagina, criarUsuario, entrar, expect, preencher, test } from "./ajuda.js";

const mensagem = (page) => page.getByRole("status");

test("visual do login e do cadastro", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("img", { name: "A Crise Literária no Brasil" })).toBeVisible();
  await conferirPagina(page, "login");
  await page.getByRole("button", { name: "Criar conta" }).click();
  await expect(page.getByText("Use pelo menos 8 caracteres.")).toBeVisible();
  await conferirPagina(page, "cadastro");
});

test("cadastro leva ao primeiro acesso", async ({ page }) => {
  const email = `teste-${randomUUID()}@example.com`;
  await page.goto("/");
  await page.getByRole("button", { name: "Criar conta" }).click();
  await preencher(page, email, "senha-boa-123");
  await page.locator("#enviar").click();
  await page.waitForURL("**/configuracao.html");
  await expect(page.getByRole("form", { name: "Complete seu perfil" })).toBeVisible();
});

test("login, sessão ao recarregar e sair", async ({ page }) => {
  const usuario = await criarUsuario();
  await entrar(page, usuario);
  await expect(page).toHaveURL(/menu\.html$/);
  await page.reload();
  await expect(page.getByText(usuario.email)).toBeVisible();
  await page.goto("/");
  await page.waitForURL("**/menu.html");
  await page.getByRole("button", { name: "Sair" }).click();
  await page.waitForURL((endereco) => endereco.pathname === "/");
  await page.goto("/menu.html");
  await page.waitForURL((endereco) => endereco.pathname === "/");
});

test("menu sem login volta ao início", async ({ page }) => {
  await page.goto("/menu.html");
  await page.waitForURL((endereco) => endereco.pathname === "/");
});

test("senha errada", async ({ page, erros }) => {
  erros.permitir(/\/auth\/v1\/token/, /400/);
  const usuario = await criarUsuario();
  await page.goto("/");
  await preencher(page, usuario.email, "senha-errada");
  await page.locator("#enviar").click();
  await expect(mensagem(page)).toHaveText("E-mail ou senha incorretos.");
  await expect(page.locator("#enviar")).toBeEnabled();
});

test("senha curta não é enviada", async ({ page }) => {
  let enviou = false;
  page.on("request", (pedido) => (enviou ||= pedido.url().includes("/signup")));
  await page.goto("/");
  await page.getByRole("button", { name: "Criar conta" }).click();
  await preencher(page, `teste-${randomUUID()}@example.com`, "curta");
  await page.locator("#enviar").click();
  expect(await page.getByLabel("Senha").evaluate((campo) => campo.validity.tooShort)).toBe(true);
  expect(enviou).toBe(false);
});

test("e-mail repetido", async ({ page, erros }) => {
  erros.permitir(/\/auth\/v1\/signup/, /422/);
  const usuario = await criarUsuario();
  await page.goto("/");
  await page.getByRole("button", { name: "Criar conta" }).click();
  await preencher(page, usuario.email, usuario.senha);
  await page.locator("#enviar").click();
  await expect(mensagem(page)).toHaveText("Este e-mail já tem conta. Use a opção Entrar.");
});

test("sem rede", async ({ page, erros }) => {
  erros.permitir(/\/auth\/v1\/token/, /ERR_FAILED/);
  await page.goto("/");
  await page.route(/\/auth\/v1\//, (rota) => rota.abort());
  await preencher(page, "alguem@example.com", "senha-boa-123");
  await page.locator("#enviar").click();
  await expect(mensagem(page)).toHaveText("Não foi possível conectar. Verifique sua internet e tente de novo.");
});
