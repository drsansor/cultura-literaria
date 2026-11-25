import { randomUUID } from "node:crypto";
import { admin, comLinhas, conferirPagina, criarUsuario, entrar, expect, test } from "./ajuda.js";

const form = (page) => page.getByRole("form", { name: "Nova publicação" });
const publicacoes = (page) => page.locator("[data-publicacao]");
const com = (page, texto) => publicacoes(page).filter({ hasText: texto });
const unico = (texto = "Texto") => `${texto} ${randomUUID().slice(0, 8)}`;
const doAutor = async ({ id }) => (await admin.from("publicacoes").select("*").eq("autor_id", id)).data;
const semRede = "Não foi possível conectar. Verifique sua internet e tente de novo.";

// O feed é de todos: cada pessoa criada aqui some no fim, com o que escreveu.
const pessoas = [];
test.afterEach(async () => {
  for (const { id } of pessoas.splice(0)) await admin.auth.admin.deleteUser(id);
});

async function nova(nome) {
  const pessoa = await criarUsuario();
  pessoas.push(pessoa);
  if (nome) await admin.from("perfis").update({ nome }).eq("id", pessoa.id);
  return pessoa;
}

async function abrir(page, pessoa) {
  pessoa ??= await nova();
  await entrar(page, pessoa);
  await page.goto("/comunidade.html");
  await expect(form(page)).toBeVisible();
  return pessoa;
}

async function publicar(page, texto, { titulo = "", autor = "" } = {}) {
  await form(page).getByLabel("Sua publicação").fill(texto);
  await form(page).getByLabel("Título do livro").fill(titulo);
  await form(page).getByLabel("Autor do livro").fill(autor);
  await form(page).getByRole("button", { name: "Publicar" }).click();
}

async function publicarComo(pessoa, linha) {
  const { data, error } = await admin.from("publicacoes").insert({ autor_id: pessoa.id, ...linha }).select("id").single();
  if (error) throw error;
  return data.id;
}

async function abrirComentarios(page, texto) {
  await com(page, texto).locator("summary").click();
  await expect(com(page, texto).getByLabel("Seu comentário")).toBeVisible();
}

async function comentar(page, texto, comentario) {
  await com(page, texto).getByLabel("Seu comentário").fill(comentario);
  await com(page, texto).getByRole("button", { name: "Comentar" }).click();
}

test("publicar e recomendar", async ({ page }) => {
  const pessoa = await abrir(page);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Comunidade");
  const texto = unico();
  await publicar(page, `  ${texto} `);
  await expect(form(page).getByRole("status")).toHaveText("Publicado.");
  await expect(form(page).getByLabel("Sua publicação")).toHaveValue("");
  await expect(com(page, texto)).toContainText(`@${pessoa.usuario}`);
  await expect(com(page, texto)).not.toContainText("Recomendação");

  const indicacao = unico("Leiam");
  await publicar(page, indicacao, { titulo: " Livro Exemplo ", autor: "Autora Exemplo" });
  await expect(com(page, indicacao)).toContainText("Recomendação");
  await expect(com(page, indicacao).getByText("Livro Exemplo", { exact: true })).toBeVisible();
  await expect(com(page, indicacao)).toContainText("de Autora Exemplo");
  await expect(publicacoes(page).first()).toContainText(indicacao);
  await page.reload();
  await expect(publicacoes(page).first()).toContainText(indicacao);
  expect((await doAutor(pessoa)).map(({ texto, livro_titulo, livro_autor, grupo_id }) => ({ texto, livro_titulo, livro_autor, grupo_id }))).toEqual([
    { texto, livro_titulo: null, livro_autor: null, grupo_id: null },
    { texto: indicacao, livro_titulo: "Livro Exemplo", livro_autor: "Autora Exemplo", grupo_id: null },
  ]);
});

test("só espaços ou autor sem título não publica", async ({ page, erros }) => {
  erros.permitir(/\/rest\/v1\/publicacoes/, /400/);
  const pessoa = await abrir(page);
  await publicar(page, "   ");
  await expect(form(page).getByRole("status")).toHaveText("Confira os campos e tente de novo.");
  await publicar(page, "Texto", { autor: "Alguém" });
  await expect(form(page).getByRole("status")).toHaveText("Para informar o autor, escreva também o título do livro.");
  await expect(form(page).getByLabel("Sua publicação")).toHaveValue("Texto");
  expect(await doAutor(pessoa)).toEqual([]);
});

test("clique duplo em Publicar e em Comentar cria um só", async ({ page }) => {
  const pessoa = await abrir(page);
  const texto = unico();
  await form(page).getByLabel("Sua publicação").fill(texto);
  await form(page).getByRole("button", { name: "Publicar" }).dblclick();
  await expect(com(page, texto)).toHaveCount(1);
  await expect(form(page).getByRole("status")).toHaveText("Publicado.");
  expect(await doAutor(pessoa)).toHaveLength(1);
  await abrirComentarios(page, texto);
  await com(page, texto).getByLabel("Seu comentário").fill("Oi");
  await com(page, texto).getByRole("button", { name: "Comentar" }).dblclick();
  await expect(com(page, texto).getByRole("listitem")).toHaveCount(1);
  expect((await admin.from("comentarios").select("id").eq("autor_id", pessoa.id)).data).toHaveLength(1);
});

test("comentar, apagar o comentário e a publicação", async ({ page }) => {
  const pessoa = await abrir(page);
  const texto = unico();
  await publicar(page, texto);
  const item = com(page, texto);
  await expect(item.locator("summary")).toHaveText("Comentários (0)");
  await abrirComentarios(page, texto);
  await expect(item.getByText("Ainda não há comentários. Escreva o primeiro.")).toBeVisible();
  await comentar(page, texto, " Primeiro ");
  await expect(item.getByRole("listitem")).toHaveCount(1);
  await comentar(page, texto, "Segundo");
  await expect(item.getByRole("listitem")).toContainText(["Primeiro", "Segundo"]);
  await expect(item.locator("summary")).toHaveText("Comentários (2)");
  await expect(item.getByLabel("Seu comentário")).toHaveValue("");

  await page.reload();
  await expect(item.locator("summary")).toHaveText("Comentários (2)");
  await abrirComentarios(page, texto);
  const apagar = item.getByRole("listitem").filter({ hasText: "Primeiro" }).getByRole("button", { name: "Apagar" });
  await apagar.click();
  await page.getByRole("dialog", { name: "Apagar este comentário?" }).getByRole("button", { name: "Cancelar" }).click();
  await expect(item.getByRole("listitem")).toHaveCount(2);
  await apagar.click();
  await page.getByRole("dialog", { name: "Apagar este comentário?" }).getByRole("button", { name: "Apagar" }).click();
  await expect(item.getByRole("listitem")).toContainText(["Segundo"]);
  await expect(item.locator("summary")).toHaveText("Comentários (1)");

  await item.getByRole("button", { name: "Apagar publicação" }).click();
  await page.keyboard.press("Escape");
  await expect(item).toHaveCount(1);
  await item.getByRole("button", { name: "Apagar publicação" }).click();
  await page.getByRole("dialog", { name: "Apagar esta publicação?" }).getByRole("button", { name: "Apagar" }).click();
  await expect(item).toHaveCount(0);
  expect(await doAutor(pessoa)).toEqual([]);
});

test("não há Apagar no conteúdo alheio; admin apaga", async ({ page }) => {
  const outra = await nova("Bia Exemplo");
  const texto = unico("Da Bia");
  const id = await publicarComo(outra, { texto });
  await admin.from("comentarios").insert({ publicacao_id: id, autor_id: outra.id, texto: "Meu comentário" });
  const pessoa = await abrir(page);
  await abrirComentarios(page, texto);
  await expect(com(page, texto).getByRole("listitem")).toContainText(["Meu comentário"]);
  await expect(com(page, texto).getByRole("button", { name: /Apagar/ })).toHaveCount(0);

  await admin.from("perfis").update({ admin: true }).eq("id", pessoa.id);
  await page.reload();
  await abrirComentarios(page, texto);
  await com(page, texto).getByRole("listitem").getByRole("button", { name: "Apagar" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Apagar" }).click();
  await expect(com(page, texto).getByRole("listitem")).toHaveCount(0);
  await com(page, texto).getByRole("button", { name: "Apagar publicação" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Apagar" }).click();
  await expect(com(page, texto)).toHaveCount(0);
  expect(await doAutor(outra)).toEqual([]);
});

test("HTML aparece literal nos quatro campos", async ({ page }) => {
  await abrir(page, await nova('<b onclick="window.__xss=1">Nome</b>'));
  const marca = unico("xss");
  const html = (campo) => `<img src=x onerror="window.__xss=1">${campo} ${marca}`;
  await publicar(page, html("texto"), { titulo: html("titulo"), autor: html("autor") });
  const item = com(page, marca);
  await expect(item).toHaveCount(1);
  await abrirComentarios(page, marca);
  await comentar(page, marca, html("comentario"));
  for (const campo of ["texto", "titulo", "autor", "comentario"]) await expect(item.getByText(html(campo)).first()).toBeVisible();
  await page.reload();
  await abrirComentarios(page, marca);
  await expect(item.getByText(html("comentario"))).toBeVisible();
  expect(await page.evaluate(() => window.__xss)).toBeUndefined();
  await expect(item.locator("img")).toHaveCount(0);
});

test("45 publicações com a mesma data: todas, sem repetir", async ({ page }) => {
  const outra = await nova();
  const linhas = Array.from({ length: 45 }, (_, i) => ({ autor_id: outra.id, texto: `Igual ${i}`, criado_em: "2001-01-01T12:00:00.123456+00:00" }));
  await comLinhas("publicacoes", linhas, async (ids) => {
    await abrir(page);
    await expect(publicacoes(page)).toHaveCount(20);
    const mais = page.getByRole("button", { name: "Carregar mais" });
    while (await mais.isVisible()) {
      const antes = await publicacoes(page).count();
      await mais.click();
      await expect.poll(() => publicacoes(page).count()).toBeGreaterThan(antes);
    }
    const vistos = await publicacoes(page).evaluateAll((itens) => itens.map((item) => item.dataset.publicacao));
    expect(new Set(vistos).size).toBe(vistos.length);
    expect(vistos.filter((id) => ids.includes(id))).toHaveLength(45);
  });
});

test("publicar no meio da paginação não repete nem pula", async ({ page }) => {
  const outra = await nova();
  const linhas = Array.from({ length: 25 }, (_, i) => ({ autor_id: outra.id, texto: `Base ${i}`, criado_em: new Date(Date.UTC(2001, 0, 1, 0, i)).toISOString() }));
  await comLinhas("publicacoes", linhas, async (ids) => {
    const pessoa = await abrir(page);
    await expect(publicacoes(page)).toHaveCount(20);
    await publicar(page, unico("No meio"));
    await expect(form(page).getByRole("status")).toHaveText("Publicado.");
    await publicarComo(pessoa, { texto: unico("Por fora") });
    const mais = page.getByRole("button", { name: "Carregar mais" });
    while (await mais.isVisible()) {
      const antes = await publicacoes(page).count();
      await mais.click();
      await expect.poll(() => publicacoes(page).count()).toBeGreaterThan(antes);
    }
    const vistos = await publicacoes(page).evaluateAll((itens) => itens.map((item) => item.dataset.publicacao));
    expect(new Set(vistos).size).toBe(vistos.length);
    expect(vistos.filter((id) => ids.includes(id))).toHaveLength(25);
  });
});

test("publicação de grupo não aparece no feed geral", async ({ page }) => {
  const outra = await nova();
  const { data: grupo } = await admin.from("grupos").insert({ nome: unico("Grupo"), criador_id: outra.id }).select("id").single();
  const [noGrupo, geral] = [unico("No grupo"), unico("No geral")];
  await publicarComo(outra, { texto: noGrupo, grupo_id: grupo.id });
  await publicarComo(outra, { texto: geral });
  await abrir(page);
  await expect(com(page, geral)).toHaveCount(1);
  await expect(com(page, noGrupo)).toHaveCount(0);
});

test("feed vazio e sem rede dizem o que fazer", async ({ page, erros }) => {
  erros.permitir(/\/rest\/v1\//, /ERR_FAILED/);
  await entrar(page, await nova());
  await page.route(/\/rest\/v1\/publicacoes/, (rota) => rota.fulfill({ json: [] }));
  await page.goto("/comunidade.html");
  await expect(page.getByText("Ainda não há publicações. Escreva a primeira.")).toBeVisible();
  await conferirPagina(page, "comunidade-vazio");
  await page.unrouteAll();
  await page.route(/\/rest\/v1\/publicacoes/, (rota) => rota.abort());
  await page.goto("/comunidade.html");
  await expect(page.getByText(semRede)).toBeVisible();
  await publicar(page, "Não perca isto");
  await expect(form(page).getByRole("status")).toHaveText(semRede);
  await expect(form(page).getByLabel("Sua publicação")).toHaveValue("Não perca isto");
});

test("publicar depois de a primeira carga falhar não duplica", async ({ page, erros }) => {
  erros.permitir(/\/rest\/v1\//, /ERR_FAILED/);
  const pessoa = await nova();
  await entrar(page, pessoa);
  await page.route(/\/rest\/v1\/publicacoes/, (rota) => (rota.request().method() === "GET" ? rota.abort() : rota.continue()));
  await page.goto("/comunidade.html");
  await expect(page.getByText(semRede)).toBeVisible();
  const texto = unico();
  await publicar(page, texto);
  await expect(com(page, texto)).toHaveCount(1);
  await page.unrouteAll();
  await page.getByRole("button", { name: "Carregar mais" }).click();
  await expect(page.getByRole("button", { name: "Carregar mais" })).toBeHidden();
  await expect(com(page, texto)).toHaveCount(1);
  expect(await doAutor(pessoa)).toHaveLength(1);
});

test("sem rede ao abrir comentários, comentar e apagar", async ({ page, erros }) => {
  erros.permitir(/\/rest\/v1\//, /ERR_FAILED/);
  await abrir(page);
  const texto = unico();
  await publicar(page, texto);
  const item = com(page, texto);
  await page.route(/\/rest\/v1\//, (rota) => rota.abort());
  await item.locator("summary").click();
  await expect(item.getByText(semRede)).toBeVisible();
  await page.unrouteAll();
  await item.locator("summary").click();
  await abrirComentarios(page, texto);
  await page.route(/\/rest\/v1\//, (rota) => rota.abort());
  await comentar(page, texto, "Não perca isto");
  await expect(item.getByText(semRede)).toBeVisible();
  await expect(item.getByLabel("Seu comentário")).toHaveValue("Não perca isto");
  await item.getByRole("button", { name: "Apagar publicação" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Apagar" }).click();
  await expect(item).toHaveCount(1);
  await expect(item.getByText(semRede).first()).toBeVisible();
});

test("sem login e sem perfil não abrem a comunidade", async ({ page }) => {
  await page.goto("/comunidade.html");
  await page.waitForURL((endereco) => endereco.pathname === "/");
  await entrar(page, await criarUsuario({ perfil: false }));
  await page.goto("/comunidade.html");
  await page.waitForURL("**/configuracao.html");
});

test("visual da comunidade", async ({ page }) => {
  const outra = await nova("W".repeat(60));
  const marca = unico("Visual");
  await publicarComo(outra, { texto: "M".repeat(600), livro_titulo: "L".repeat(200), livro_autor: "A".repeat(120) });
  const id = await publicarComo(outra, { texto: `${marca}\n\nUm romance curto, para ler numa tarde.`, livro_titulo: "Livro Exemplo", livro_autor: "Autora Exemplo" });
  await admin.from("comentarios").insert([{ publicacao_id: id, autor_id: outra.id, texto: "C".repeat(300) }]);
  await abrir(page);
  await abrirComentarios(page, marca);
  await comentar(page, marca, "Vou ler!");
  await expect(com(page, marca).getByRole("listitem")).toHaveCount(2);
  await publicar(page, "Alguém mais vai à feira do livro?");
  await expect(form(page).getByRole("status")).toHaveText("Publicado.");
  await conferirPagina(page, "comunidade");
});
