import { randomUUID } from "node:crypto";
import { admin, conferirPagina, criarUsuario, entrar, expect, preencher, test } from "./ajuda.js";

const FOTO = "public/estante.jpg";
const png = (nome = "foto.png") => ({
  name: nome,
  mimeType: "image/png",
  buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64"),
});
const apelido = () => `p_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
const formulario = (page, nome) => page.getByRole("form", { name: nome });
const aviso = (page, nome) => formulario(page, nome).getByRole("status");
const foto = (page) => formulario(page, "Foto").locator("img");
const perfilDe = async ({ id }) => (await admin.from("perfis").select("nome, usuario, foto_path").eq("id", id).maybeSingle()).data;
const arquivosDe = async ({ id }) => (await admin.storage.from("avatares").list(id)).data.map(({ name }) => `${id}/${name}`);

async function abrir(page, usuario) {
  await entrar(page, usuario);
  await page.goto("/configuracao.html");
  await expect(formulario(page, "Perfil")).toBeVisible();
}

async function enviarFoto(page, arquivo) {
  await page.getByLabel("Escolher foto").setInputFiles(arquivo);
  await page.getByRole("button", { name: "Salvar foto" }).click();
}

test("visual do primeiro acesso", async ({ page }) => {
  await entrar(page, await criarUsuario({ perfil: false }));
  await expect(formulario(page, "Complete seu perfil")).toBeVisible();
  for (const nome of ["Foto", "Senha"]) await expect(formulario(page, nome)).toBeHidden();
  await expect(page.getByRole("button", { name: "Sair" })).toBeHidden();
  await expect(page.getByRole("link", { name: "Voltar ao menu" })).toBeHidden();
  await conferirPagina(page, "primeiro-acesso");
});

test("visual da configuração", async ({ page }) => {
  await abrir(page, await criarUsuario());
  await enviarFoto(page, FOTO);
  await expect(foto(page)).toBeVisible();
  await expect(aviso(page, "Foto")).toHaveText("Foto salva.");
  await expect(page.getByRole("link", { name: "Voltar ao menu" })).toHaveAttribute("href", "/menu.html");
  await conferirPagina(page, "configuracao");
});

test("sem perfil, toda página leva à configuração e salvar leva ao menu", async ({ page }) => {
  const pessoa = await criarUsuario({ perfil: false });
  await entrar(page, pessoa);
  await page.waitForURL("**/configuracao.html");
  await page.goto("/menu.html");
  await page.waitForURL("**/configuracao.html");
  const usuario = apelido();
  await page.getByLabel("Nome").fill("  Ana Exemplo ");
  await page.getByLabel("@usuário").fill(`@${usuario.toUpperCase()}`);
  await expect(page.getByLabel("@usuário")).toHaveValue(usuario);
  await page.getByRole("button", { name: "Salvar" }).click();
  await page.waitForURL("**/menu.html");
  await expect(page.getByText(`@${usuario}`)).toBeVisible();
  expect(await perfilDe(pessoa)).toEqual({ nome: "Ana Exemplo", usuario, foto_path: null });
});

test("sem login volta ao início", async ({ page }) => {
  await page.goto("/configuracao.html");
  await page.waitForURL((endereco) => endereco.pathname === "/");
});

test("@usuário repetido, no primeiro acesso e depois", async ({ page, erros }) => {
  erros.permitir(/\/rest\/v1\/perfis/, /409/);
  const dona = await criarUsuario();
  const pessoa = await criarUsuario({ perfil: false });
  await entrar(page, pessoa);
  await page.getByLabel("Nome").fill("Ana");
  await page.getByLabel("@usuário").fill(dona.usuario);
  await page.getByRole("button", { name: "Salvar" }).click();
  await expect(aviso(page, "Complete seu perfil")).toHaveText("Este @usuário já está em uso.");
  await expect(page.getByRole("button", { name: "Salvar" })).toBeEnabled();
  expect(await perfilDe(pessoa)).toBeNull();

  await page.getByLabel("@usuário").fill(apelido());
  await page.getByRole("button", { name: "Salvar" }).click();
  await page.waitForURL("**/menu.html");
  await page.goto("/configuracao.html");
  await page.getByLabel("@usuário").fill(dona.usuario);
  await page.getByRole("button", { name: "Salvar perfil" }).click();
  await expect(aviso(page, "Perfil")).toHaveText("Este @usuário já está em uso.");
});

test("editar o perfil", async ({ page }) => {
  const pessoa = await criarUsuario();
  await abrir(page, pessoa);
  await expect(page.getByLabel("@usuário")).toHaveValue(pessoa.usuario);
  const usuario = apelido();
  await page.getByLabel("Nome").fill("Zélia <b>Nova</b>");
  await page.getByLabel("@usuário").fill(usuario);
  await page.getByRole("button", { name: "Salvar perfil" }).click();
  await expect(aviso(page, "Perfil")).toHaveText("Perfil salvo.");
  await expect(formulario(page, "Foto").getByText("Z", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Nome")).toHaveValue("Zélia <b>Nova</b>");
  await expect(page.getByLabel("@usuário")).toHaveValue(usuario);
});

test("nome vazio e @usuário inválido não são enviados", async ({ page }) => {
  const pessoa = await criarUsuario();
  await abrir(page, pessoa);
  const antes = await perfilDe(pessoa);
  for (const [campo, valor] of [["Nome", "   "], ["@usuário", "ab"], ["@usuário", "joão"], ["@usuário", "com espaço"]]) {
    await page.reload();
    await page.getByLabel(campo).fill(valor);
    await page.getByRole("button", { name: "Salvar perfil" }).click();
    expect(await page.getByLabel(campo).evaluate((entrada) => entrada.validity.patternMismatch), `${campo}: ${valor}`).toBe(true);
  }
  expect(await perfilDe(pessoa)).toEqual(antes);
});

test("trocar a foto aparece após recarregar e apaga a antiga", async ({ page }) => {
  const pessoa = await criarUsuario();
  await abrir(page, pessoa);
  await expect(formulario(page, "Foto").getByText("P", { exact: true })).toBeVisible();
  await enviarFoto(page, FOTO);
  await expect(aviso(page, "Foto")).toHaveText("Foto salva.");
  const primeira = (await perfilDe(pessoa)).foto_path;
  expect(primeira).toMatch(new RegExp(`^${pessoa.id}/[0-9a-f-]{36}\\.jpg$`));

  await enviarFoto(page, png());
  await expect.poll(async () => (await perfilDe(pessoa)).foto_path).not.toBe(primeira);
  const segunda = (await perfilDe(pessoa)).foto_path;
  await expect.poll(() => arquivosDe(pessoa)).toEqual([segunda]);
  await page.reload();
  await expect(foto(page)).toHaveAttribute("src", new RegExp(segunda));
  await expect.poll(() => foto(page).evaluate((img) => img.naturalWidth)).toBe(1);
  await expect(foto(page)).toHaveAttribute("alt", "");
});

test("salvar a foto não descarta o que ainda não foi salvo no perfil", async ({ page }) => {
  const pessoa = await criarUsuario();
  await abrir(page, pessoa);
  await page.getByLabel("Nome").fill("Ainda não salvo");
  await enviarFoto(page, png());
  await expect(aviso(page, "Foto")).toHaveText("Foto salva.");
  await expect(page.getByLabel("Nome")).toHaveValue("Ainda não salvo");
});

test("nome sem letra visível não quebra a estrela", async ({ page }) => {
  const pessoa = await criarUsuario();
  const { error } = await admin.from("perfis").update({ nome: "\ufeff" }).eq("id", pessoa.id);
  expect(error).toBeNull();
  await abrir(page, pessoa);
  await expect(formulario(page, "Foto").getByText("?", { exact: true })).toBeVisible();
});

test("arquivo que não é imagem ou passa de 2 MB é recusado sem enviar", async ({ page }) => {
  const pessoa = await criarUsuario();
  await abrir(page, pessoa);
  for (const [arquivo, texto] of [
    [{ name: "foto.txt", mimeType: "text/plain", buffer: Buffer.from("oi") }, "Escolha uma imagem JPG, PNG ou WebP."],
    [{ name: "foto.svg", mimeType: "image/svg+xml", buffer: Buffer.from("<svg/>") }, "Escolha uma imagem JPG, PNG ou WebP."],
    [{ name: "foto.png", mimeType: "image/png", buffer: Buffer.alloc(2097153) }, "A foto precisa ter até 2 MB."],
  ]) {
    await enviarFoto(page, arquivo);
    await expect(aviso(page, "Foto")).toHaveText(texto);
  }
  expect(await arquivosDe(pessoa)).toEqual([]);
  expect((await perfilDe(pessoa)).foto_path).toBeNull();
});

test("se o perfil não salvar, a foto antiga fica e a nova não sobra", async ({ page, erros }) => {
  erros.permitir(/\/rest\/v1\/perfis/, /500/);
  const pessoa = await criarUsuario();
  await abrir(page, pessoa);
  await enviarFoto(page, FOTO);
  await expect(aviso(page, "Foto")).toHaveText("Foto salva.");
  const antiga = (await perfilDe(pessoa)).foto_path;
  await page.route(/\/rest\/v1\/perfis/, (rota) => (rota.request().method() === "PATCH" ? rota.fulfill({ status: 500, json: { code: "XX000", message: "x" } }) : rota.fallback()));
  await enviarFoto(page, png());
  await expect(aviso(page, "Foto")).toHaveText("Algo deu errado. Tente de novo em instantes.");
  expect((await perfilDe(pessoa)).foto_path).toBe(antiga);
  expect(await arquivosDe(pessoa)).toEqual([antiga]);
});

test("foto que sumiu dá lugar à inicial", async ({ page, erros }) => {
  erros.permitir(/\/storage\/v1\/object\/public/, /400|404/);
  const pessoa = await criarUsuario();
  await admin.from("perfis").update({ foto_path: `${pessoa.id}/${randomUUID()}.png` }).eq("id", pessoa.id);
  await abrir(page, pessoa);
  await expect(formulario(page, "Foto").getByText("P", { exact: true })).toBeVisible();
});

test("a senha nova entra e a antiga não", async ({ page, erros }) => {
  erros.permitir(/\/auth\/v1\/token/, /400/);
  const pessoa = await criarUsuario();
  await abrir(page, pessoa);
  await page.getByLabel("Nova senha").fill("curta");
  await page.getByRole("button", { name: "Trocar senha" }).click();
  expect(await page.getByLabel("Nova senha").evaluate((campo) => campo.validity.tooShort)).toBe(true);
  await page.getByLabel("Nova senha").fill("outra-senha-456");
  await page.getByRole("button", { name: "Trocar senha" }).click();
  await expect(aviso(page, "Senha")).toHaveText("Senha trocada.");
  await expect(page.getByLabel("Nova senha")).toHaveValue("");
  await page.getByRole("button", { name: "Sair" }).click();
  await page.waitForURL((endereco) => endereco.pathname === "/");
  await preencher(page, pessoa.email, pessoa.senha);
  await page.locator("#enviar").click();
  await expect(page.getByRole("status")).toHaveText("E-mail ou senha incorretos.");
  await preencher(page, pessoa.email, "outra-senha-456");
  await page.locator("#enviar").click();
  await page.waitForURL("**/menu.html");
});

test("repetir a senha atual avisa", async ({ page, erros }) => {
  erros.permitir(/\/auth\/v1\/user/, /422/);
  const pessoa = await criarUsuario();
  await abrir(page, pessoa);
  await page.getByLabel("Nova senha").fill(pessoa.senha);
  await page.getByRole("button", { name: "Trocar senha" }).click();
  await expect(aviso(page, "Senha")).toHaveText("A nova senha precisa ser diferente da atual.");
});

test("sem rede ao abrir e ao salvar", async ({ page, erros }) => {
  erros.permitir(/\/(rest|storage)\/v1\//, /ERR_FAILED/);
  const pessoa = await criarUsuario();
  await abrir(page, pessoa);
  const semRede = "Não foi possível conectar. Verifique sua internet e tente de novo.";
  await page.route(/\/(rest|storage)\/v1\//, (rota) => rota.abort());
  await page.getByRole("button", { name: "Salvar perfil" }).click();
  await expect(aviso(page, "Perfil")).toHaveText(semRede);
  await enviarFoto(page, png());
  await expect(aviso(page, "Foto")).toHaveText(semRede);
  for (const pagina of ["/configuracao.html", "/menu.html"]) {
    await page.goto(pagina);
    await expect(page.getByRole("status")).toHaveText(semRede);
    if (pagina === "/configuracao.html") await expect(page.getByRole("link", { name: "Voltar ao menu" })).toBeVisible();
    if (pagina === "/configuracao.html") await conferirPagina(page, "configuracao-erro");
  }
});
