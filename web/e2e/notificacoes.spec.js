import { randomUUID } from "node:crypto";
import { admin, conferirPagina, criarUsuario, entrar, expect, pessoasDoTeste, test } from "./ajuda.js";

const nova = pessoasDoTeste();
const unico = (texto = "Texto") => `${texto} ${randomUUID().slice(0, 8)}`;
const itens = (page) => page.getByRole("main").getByRole("listitem");
const de = (page, quem) => itens(page).filter({ hasText: `@${quem.usuario}` });
const seta = (page, nome) => page.getByRole("link", { name: nome, exact: true });
const lidas = async ({ id }) => (await admin.from("notificacoes").select("lida").eq("para_id", id)).data.map(({ lida }) => lida);
const semRede = "Não foi possível conectar. Verifique sua internet e tente de novo.";

async function inserir(tabela, linha) {
  const { data, error } = await admin.from(tabela).insert(linha).select("*").single();
  if (error) throw error;
  return data;
}

const publicar = (autor, grupo_id = null) => inserir("publicacoes", { autor_id: autor.id, texto: unico(), grupo_id });
const comentar = (autor, publicacao) => inserir("comentarios", { autor_id: autor.id, publicacao_id: publicacao.id, texto: unico() });

async function abrir(page) {
  await page.goto("/notificacoes.html");
  await expect(page.locator("#mensagem")).not.toHaveText("Carregando…");
}

test("comentário mostra 1 no menu; abrir zera; apagar o comentário não quebra", async ({ page }) => {
  const ana = await nova("Ana Exemplo");
  const bia = await nova("Bia Exemplo");
  const publicacao = await publicar(ana);
  await entrar(page, ana);
  await expect(page.getByText(`@${ana.usuario}`)).toBeVisible();
  await expect(seta(page, "Notificação")).toBeVisible();
  await expect(page.locator(".contador")).toHaveCount(0);

  const comentario = await comentar(bia, publicacao);
  await comentar(ana, publicacao);
  await page.reload();
  await expect(seta(page, "Notificação 1 não lida").locator(".contador")).toHaveText("1");
  await seta(page, "Notificação 1 não lida").click();
  await page.waitForURL("**/notificacoes.html");
  await expect(itens(page)).toHaveCount(1);
  await expect(de(page, bia)).toContainText("comentou na sua publicação");
  await expect(de(page, bia)).toContainText("Nova");
  await expect.poll(() => lidas(ana)).toEqual([true]);
  await page.getByRole("link", { name: "Voltar ao menu" }).click();
  await expect(page.getByText(`@${ana.usuario}`)).toBeVisible();
  await expect(seta(page, "Notificação")).toBeVisible();
  await expect(page.locator(".contador")).toHaveCount(0);

  await admin.from("comentarios").delete().eq("id", comentario.id);
  await abrir(page);
  await expect(de(page, bia)).toContainText("comentou na sua publicação");
  await expect(de(page, bia)).not.toContainText("Nova");
  await admin.from("publicacoes").delete().eq("id", publicacao.id);
  await abrir(page);
  await expect(page.getByRole("status")).toHaveText("Nenhuma notificação por enquanto. Quando alguém pedir amizade ou comentar, aparece aqui.");
});

test("cada tipo diz o que houve e leva ao lugar certo", async ({ page }) => {
  const ana = await nova("Ana Exemplo");
  const [pediu, aceitou, comentou, noGrupo] = [await nova("Pediu Exemplo"), await nova("Aceitou Exemplo"), await nova("Comentou Exemplo"), await nova("Grupo Exemplo")];
  await inserir("amizades", { solicitante_id: pediu.id, destinatario_id: ana.id });
  const pedido = await inserir("amizades", { solicitante_id: ana.id, destinatario_id: aceitou.id });
  await admin.from("amizades").update({ status: "aceita" }).eq("id", pedido.id);
  await comentar(comentou, await publicar(ana));
  const grupo = await inserir("grupos", { nome: unico("Grupo"), criador_id: ana.id });
  await comentar(noGrupo, await publicar(ana, grupo.id));
  await entrar(page, ana);
  await expect(seta(page, "Notificação 4 não lidas")).toBeVisible();
  await abrir(page);
  await expect(itens(page)).toHaveCount(4);
  for (const [quem, texto, destino] of [
    [pediu, "pediu sua amizade", "/amigos.html"],
    [aceitou, "aceitou seu pedido de amizade", "/amigos.html"],
    [comentou, "comentou na sua publicação", "/comunidade.html"],
    [noGrupo, "comentou na sua publicação em um grupo", `/grupo.html?id=${grupo.id}`],
  ]) {
    await expect(de(page, quem)).toContainText(texto);
    await expect(de(page, quem).getByRole("link")).toHaveAttribute("href", destino);
  }
  await expect(itens(page).first()).toContainText("Grupo Exemplo");
  await de(page, noGrupo).getByRole("link").click();
  await page.waitForURL("**/grupo.html?id=*");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(grupo.nome);
});

test("ninguém vê nem marca a notificação de outra pessoa", async ({ page }) => {
  const ana = await nova("Ana Exemplo");
  const bia = await nova("Bia Exemplo");
  await comentar(bia, await publicar(ana));
  await entrar(page, bia);
  await expect(page.locator(".contador")).toHaveCount(0);
  await abrir(page);
  await expect(itens(page)).toHaveCount(0);
  expect(await lidas(ana)).toEqual([false]);
});

test("o que chega depois de abrir não é marcado sem ser visto", async ({ page }) => {
  const ana = await nova("Ana Exemplo");
  const bia = await nova("Bia Exemplo");
  const publicacao = await publicar(ana);
  await comentar(bia, publicacao);
  await entrar(page, ana);
  await page.route(/\/rest\/v1\/notificacoes/, async (rota) => {
    if (rota.request().method() === "PATCH") await comentar(bia, publicacao);
    await rota.continue();
  });
  await abrir(page);
  await expect(itens(page)).toHaveCount(1);
  await expect.poll(async () => (await lidas(ana)).sort()).toEqual([false, true]);
});

test("mais de 50: mostra as recentes, e abrir zera todas", async ({ page }) => {
  const ana = await nova("Ana Exemplo");
  const bia = await nova("Bia Exemplo");
  const { error } = await admin.from("notificacoes").insert(Array.from({ length: 101 }, () => ({ para_id: ana.id, de_id: bia.id, tipo: "comentario" })));
  expect(error).toBeNull();
  await entrar(page, ana);
  await expect(seta(page, "Notificação 99+ não lidas").locator(".contador")).toHaveText("99+");
  await abrir(page);
  await expect(itens(page)).toHaveCount(50);
  await expect.poll(async () => (await lidas(ana)).every(Boolean)).toBe(true);
});

test("HTML no nome aparece literal", async ({ page }) => {
  const html = '<img src=x onerror="window.__xss=1">';
  const ana = await nova("Ana Exemplo");
  await comentar(await nova(html), await publicar(ana));
  await entrar(page, ana);
  await abrir(page);
  await expect(itens(page).getByText(html)).toBeVisible();
  expect(await page.evaluate(() => window.__xss)).toBeUndefined();
});

test("sem rede ao abrir e ao marcar; o menu segue sem contador", async ({ page, erros }) => {
  erros.permitir(/\/rest\/v1\/notificacoes/, /ERR_FAILED/);
  const ana = await nova("Ana Exemplo");
  const bia = await nova("Bia Exemplo");
  await comentar(bia, await publicar(ana));
  await entrar(page, ana);
  await page.route(/\/rest\/v1\/notificacoes/, (rota) => rota.abort());
  await page.reload();
  await expect(page.getByText(`@${ana.usuario}`)).toBeVisible();
  await expect(seta(page, "Notificação")).toBeVisible();
  await page.goto("/notificacoes.html");
  await expect(page.getByRole("status")).toHaveText(semRede);
  await page.unrouteAll();
  await page.route(/\/rest\/v1\/notificacoes/, (rota) => (rota.request().method() === "PATCH" ? rota.abort() : rota.continue()));
  await page.goto("/notificacoes.html");
  await expect(de(page, bia)).toHaveCount(1);
  await expect(page.getByRole("status")).toHaveText(semRede);
  expect(await lidas(ana)).toEqual([false]);
});

test("sem login e sem perfil não abrem as notificações", async ({ page }) => {
  await page.goto("/notificacoes.html");
  await page.waitForURL((endereco) => endereco.pathname === "/");
  await entrar(page, await criarUsuario({ perfil: false }));
  await page.goto("/notificacoes.html");
  await page.waitForURL("**/configuracao.html");
});

test("visual das notificações e do contador", async ({ page }) => {
  const ana = await nova("Ana Exemplo");
  await entrar(page, ana);
  await abrir(page);
  await conferirPagina(page, "notificacoes-vazio");
  const publicacao = await publicar(ana);
  await comentar(await nova("W".repeat(60)), publicacao);
  await inserir("amizades", { solicitante_id: (await nova("Bia Exemplo")).id, destinatario_id: ana.id });
  await page.goto("/menu.html");
  await expect(seta(page, "Notificação 2 não lidas")).toBeVisible();
  await conferirPagina(page, "menu-contador");
  await abrir(page);
  await expect.poll(() => lidas(ana)).toEqual([true, true]);
  await comentar(await nova("Caio Exemplo"), publicacao);
  await abrir(page);
  await expect(itens(page)).toHaveCount(3);
  await conferirPagina(page, "notificacoes");
});
