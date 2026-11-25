import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { admin, conferirPagina, criarUsuario, entrar, expect, preencher, test } from "./ajuda.js";

const FOTO = readFileSync("public/estante.jpg");
const form = (page) => page.getByRole("form", { name: "Excluir conta" });
const campo = (page) => form(page).getByLabel("Para confirmar, digite o seu usuário");
const botao = (page) => form(page).getByRole("button", { name: "Excluir minha conta" });
const aviso = (page) => form(page).getByRole("status");
const arquivos = async ({ id }) => (await admin.storage.from("avatares").list(id)).data.map(({ name }) => `${id}/${name}`);
const existe = async ({ id }) => (await admin.auth.admin.getUserById(id)).error === null;
const semRede = "Não foi possível conectar. Verifique sua internet e tente de novo.";
const algoErrado = "Algo deu errado. Tente de novo em instantes.";

// Pessoa com foto em uso e um arquivo antigo esquecido na pasta.
async function comFoto() {
  const pessoa = await criarUsuario();
  const foto = `${pessoa.id}/${randomUUID()}.jpg`;
  for (const caminho of [foto, `${pessoa.id}/${randomUUID()}.jpg`]) {
    const { error } = await admin.storage.from("avatares").upload(caminho, FOTO, { contentType: "image/jpeg" });
    if (error) throw error;
  }
  await admin.from("perfis").update({ foto_path: foto }).eq("id", pessoa.id);
  return { ...pessoa, foto };
}

async function abrir(page, pessoa) {
  await entrar(page, pessoa);
  await page.goto("/configuracao.html");
  await expect(form(page)).toBeVisible();
}

test("só o próprio @usuário libera o botão", async ({ page }) => {
  const pessoa = await criarUsuario();
  await abrir(page, pessoa);
  await expect(form(page)).toContainText(`@${pessoa.usuario}`);
  await expect(botao(page)).toBeDisabled();
  for (const errado of ["outra_pessoa", pessoa.usuario.slice(0, -1), `${pessoa.usuario}x`, " ", "@"]) {
    await campo(page).fill(errado);
    await expect(botao(page), errado).toBeDisabled();
    await campo(page).press("Enter");
  }
  for (const certo of [pessoa.usuario, `@${pessoa.usuario}`, ` ${pessoa.usuario.toUpperCase()} `]) {
    await campo(page).fill(certo);
    await expect(botao(page), certo).toBeEnabled();
  }
  await campo(page).fill("");
  await expect(botao(page)).toBeDisabled();
  expect(await existe(pessoa)).toBe(true);
});

test("trocar o @usuário depois de digitar invalida a confirmação", async ({ page }) => {
  const pessoa = await criarUsuario();
  await abrir(page, pessoa);
  await campo(page).fill(pessoa.usuario);
  await expect(botao(page)).toBeEnabled();
  await page.getByRole("form", { name: "Perfil" }).getByLabel("@usuário").fill(`n${pessoa.usuario.slice(1)}`);
  await page.getByRole("button", { name: "Salvar perfil" }).click();
  await expect(page.getByRole("form", { name: "Perfil" }).getByRole("status")).toHaveText("Perfil salvo.");
  await expect(botao(page)).toBeDisabled();
});

test("exclui tudo: fotos, conta e sessão", async ({ page, request, erros }) => {
  erros.permitir(/\/auth\/v1\/(logout|token)/, /400|401|403|404/);
  const pessoa = await comFoto();
  const { data } = admin.storage.from("avatares").getPublicUrl(pessoa.foto);
  expect((await request.get(`${data.publicUrl}?antes`)).status()).toBe(200);
  await admin.from("publicacoes").insert({ autor_id: pessoa.id, texto: "Some comigo" });
  await abrir(page, pessoa);
  await campo(page).fill(pessoa.usuario);
  await botao(page).dblclick();
  await page.waitForURL((endereco) => endereco.pathname === "/");
  expect(await existe(pessoa)).toBe(false);
  expect(await arquivos(pessoa)).toEqual([]);
  expect((await request.get(`${data.publicUrl}?depois`)).status()).not.toBe(200);
  expect((await admin.from("perfis").select("id").eq("id", pessoa.id)).data).toEqual([]);
  expect((await admin.from("publicacoes").select("id").eq("autor_id", pessoa.id)).data).toEqual([]);

  await page.goto("/menu.html");
  await page.waitForURL((endereco) => endereco.pathname === "/");
  await preencher(page, pessoa.email, pessoa.senha);
  await page.locator("#enviar").click();
  await expect(page.getByRole("status")).toHaveText("E-mail ou senha incorretos.");
});

for (const [caso, pegar, resposta, texto] of [
  ["listar falha", (r) => r.method() === "POST" && r.url().includes("/object/list/"), { status: 500, json: { statusCode: "500", error: "x", message: "x" } }, algoErrado],
  ["apagar falha", (r) => r.method() === "DELETE", { status: 500, json: { statusCode: "500", error: "x", message: "x" } }, algoErrado],
  ["apagar diz que sim, mas não apaga", (r) => r.method() === "DELETE", { status: 200, json: [] }, algoErrado],
  ["sem rede", () => true, null, semRede],
]) {
  test(`com o Storage em erro (${caso}), a conta continua`, async ({ page, erros }) => {
    erros.permitir(/\/storage\/v1\//, /500|ERR_FAILED/);
    const pessoa = await comFoto();
    await abrir(page, pessoa);
    let chamou = false;
    page.on("request", (pedido) => (chamou ||= pedido.url().includes("excluir_minha_conta")));
    await page.route(/\/storage\/v1\/object\/(list\/)?avatares/, (rota) => {
      if (!pegar(rota.request())) return rota.fallback();
      return resposta ? rota.fulfill(resposta) : rota.abort();
    });
    await campo(page).fill(pessoa.usuario);
    await botao(page).click();
    await expect(aviso(page)).toHaveText(texto);
    expect(chamou).toBe(false);
    expect(await existe(pessoa)).toBe(true);
    expect(await arquivos(pessoa)).toHaveLength(2);
    await expect(botao(page)).toBeEnabled();
    await page.goto("/menu.html");
    await expect(page.getByText(`@${pessoa.usuario}`)).toBeVisible();
  });
}

test("se a exclusão falhar, avisa e a pessoa continua logada", async ({ page, erros }) => {
  erros.permitir(/excluir_minha_conta/, /ERR_FAILED/);
  erros.permitir(/\/auth\/v1\/logout/, /403/);
  erros.permitir(/\/storage\/v1\/object\/public/, /400|404/);
  const pessoa = await comFoto();
  await abrir(page, pessoa);
  await page.route(/excluir_minha_conta/, (rota) => rota.abort());
  await campo(page).fill(pessoa.usuario);
  await botao(page).click();
  await expect(aviso(page)).toHaveText(semRede);
  expect(await existe(pessoa)).toBe(true);
  await page.unrouteAll();
  await botao(page).click();
  await page.waitForURL((endereco) => endereco.pathname === "/");
  expect(await existe(pessoa)).toBe(false);
});

test("mais de 100 arquivos na pasta somem todos", async ({ page, erros }) => {
  erros.permitir(/\/auth\/v1\/logout/, /403/);
  const pessoa = await criarUsuario();
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
  for (let i = 0; i < 105; i += 15) {
    await Promise.all(Array.from({ length: 15 }, () => admin.storage.from("avatares").upload(`${pessoa.id}/${randomUUID()}.png`, png, { contentType: "image/png" })));
  }
  await abrir(page, pessoa);
  await campo(page).fill(pessoa.usuario);
  await botao(page).click();
  await page.waitForURL((endereco) => endereco.pathname === "/");
  expect((await admin.storage.from("avatares").list(pessoa.id, { limit: 200 })).data).toEqual([]);
});

test("outra aba, com a conta já excluída, volta ao login", async ({ page, erros }) => {
  erros.permitir(/\/(rest|auth)\/v1\//, /401|403|404|409/);
  const pessoa = await criarUsuario();
  await entrar(page, pessoa);
  await admin.auth.admin.deleteUser(pessoa.id);
  await page.goto("/menu.html");
  await page.waitForURL("**/configuracao.html");
  await page.getByLabel("Nome").fill("Volta");
  await page.getByLabel("@usuário").fill(`v${randomUUID().slice(0, 8)}`);
  await page.getByRole("button", { name: "Salvar" }).click();
  await page.waitForURL((endereco) => endereco.pathname === "/");
  await expect(page.getByLabel("E-mail")).toBeVisible();
});

test("sem rede no logout, sair ainda encerra a sessão neste aparelho", async ({ page, erros }) => {
  erros.permitir(/\/auth\/v1\/logout/, /ERR_FAILED/);
  await abrir(page, await criarUsuario());
  await page.route(/\/auth\/v1\/logout/, (rota) => rota.abort());
  await page.getByRole("button", { name: "Sair" }).click();
  await page.waitForURL((endereco) => endereco.pathname === "/");
  await expect(page.getByLabel("E-mail")).toBeVisible();
  await page.goto("/menu.html");
  await page.waitForURL((endereco) => endereco.pathname === "/");
  await expect(page.getByLabel("E-mail")).toBeVisible();
});

test("não aparece no primeiro acesso", async ({ page }) => {
  await entrar(page, await criarUsuario({ perfil: false }));
  await expect(page.getByRole("form", { name: "Complete seu perfil" })).toBeVisible();
  await expect(form(page)).toBeHidden();
});

test("visual de excluir conta", async ({ page, erros }) => {
  erros.permitir(/\/storage\/v1\//, /ERR_FAILED/);
  const pessoa = await criarUsuario();
  await abrir(page, pessoa);
  await conferirPagina(page, "excluir-conta");
  await page.route(/\/storage\/v1\//, (rota) => rota.abort());
  await campo(page).fill(pessoa.usuario);
  await botao(page).click();
  await expect(aviso(page)).toHaveText(semRede);
  await conferirPagina(page, "excluir-conta-erro");
});
