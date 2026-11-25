import { randomUUID } from "node:crypto";
import { admin, conferirPagina, criarUsuario, entrar, expect, pessoasDoTeste, test, vigiar } from "./ajuda.js";

const nova = pessoasDoTeste();
const apelido = (inicio = "am") => `${inicio}${randomUUID().replaceAll("-", "").slice(0, 10)}`;
const semRede = "Não foi possível conectar. Verifique sua internet e tente de novo.";
const secao = (page, nome) => page.getByRole("region", { name: nome, exact: true });
const item = (page, onde, quem) => secao(page, onde).getByRole("listitem").filter({ hasText: `@${quem.usuario}` });
const busca = (page) => secao(page, "Buscar pessoas");
const entre = async (a, b) => (await admin.from("amizades").select("solicitante_id, destinatario_id, status").or(`and(solicitante_id.eq.${a.id},destinatario_id.eq.${b.id}),and(solicitante_id.eq.${b.id},destinatario_id.eq.${a.id})`)).data;

async function pessoa(nome, usuario = apelido()) {
  const criada = await nova(nome);
  await admin.from("perfis").update({ usuario }).eq("id", criada.id);
  return { ...criada, usuario };
}

async function abrir(page, quem) {
  await entrar(page, quem);
  await page.goto("/amigos.html");
  await expect(page.locator("#mensagem")).toBeHidden();
}

async function buscar(page, texto) {
  await busca(page).getByLabel("@usuário").fill(texto);
  await busca(page).getByRole("button", { name: "Buscar" }).click();
}

// Segunda pessoa, em outro contexto, com a mesma vigilância de erros.
async function comOutra(browser, quem, usar) {
  const contexto = await browser.newContext({ baseURL: "http://localhost:4173", locale: "pt-BR" });
  const page = await contexto.newPage();
  const vigia = vigiar(page);
  await abrir(page, quem);
  await usar(page);
  vigia.conferir();
  await contexto.close();
}

test("pedir e aceitar: as duas se veem; desfazer remove das duas", async ({ page, browser }) => {
  const ana = await pessoa("Ana Exemplo");
  const bia = await pessoa("Bia Exemplo");
  await abrir(page, ana);
  await buscar(page, `@${bia.usuario.toUpperCase()}`);
  const achada = item(page, "Buscar pessoas", bia);
  await achada.getByRole("button", { name: "Pedir amizade a Bia Exemplo" }).dblclick();
  await expect(achada).toContainText("Pedido enviado");
  await expect(achada.getByRole("button")).toHaveCount(0);
  await expect(item(page, "Pedidos enviados", bia)).toHaveCount(1);
  expect(await entre(ana, bia)).toEqual([{ solicitante_id: ana.id, destinatario_id: bia.id, status: "pendente" }]);

  await comOutra(browser, bia, async (outra) => {
    await item(outra, "Pedidos recebidos", ana).getByRole("button", { name: "Aceitar o pedido de Ana Exemplo" }).click();
    await expect(item(outra, "Amigos", ana)).toHaveCount(1);
    await expect(item(outra, "Pedidos recebidos", ana)).toHaveCount(0);
    expect((await entre(ana, bia))[0].status).toBe("aceita");
    await page.reload();
    await expect(item(page, "Amigos", bia)).toHaveCount(1);
    await expect(item(page, "Pedidos enviados", bia)).toHaveCount(0);

    const desfazer = item(outra, "Amigos", ana).getByRole("button", { name: "Desfazer a amizade com Ana Exemplo" });
    const dialogo = outra.getByRole("dialog", { name: "Desfazer a amizade com Ana Exemplo?" });
    await desfazer.click();
    await dialogo.getByRole("button", { name: "Cancelar" }).click();
    await expect(item(outra, "Amigos", ana)).toHaveCount(1);
    await desfazer.click();
    await dialogo.getByRole("button", { name: "Desfazer" }).click();
    await expect(item(outra, "Amigos", ana)).toHaveCount(0);
  });
  expect(await entre(ana, bia)).toEqual([]);
  await page.reload();
  await expect(secao(page, "Amigos").getByText("Você ainda não tem amigos aqui. Busque alguém pelo @usuário.")).toBeVisible();
});

test("recusar e cancelar; depois dá para pedir de novo", async ({ page, browser }) => {
  const ana = await pessoa("Ana Exemplo");
  const bia = await pessoa("Bia Exemplo");
  await admin.from("amizades").insert({ solicitante_id: bia.id, destinatario_id: ana.id });
  await abrir(page, ana);
  await buscar(page, bia.usuario);
  await expect(item(page, "Buscar pessoas", bia)).toContainText("Pedido recebido");
  await item(page, "Pedidos recebidos", bia).getByRole("button", { name: "Recusar o pedido de Bia Exemplo" }).click();
  await expect(item(page, "Pedidos recebidos", bia)).toHaveCount(0);
  expect(await entre(ana, bia)).toEqual([]);

  await item(page, "Buscar pessoas", bia).getByRole("button", { name: "Pedir amizade a Bia Exemplo" }).click();
  await expect(item(page, "Pedidos enviados", bia)).toHaveCount(1);
  await item(page, "Pedidos enviados", bia).getByRole("button", { name: "Cancelar o pedido a Bia Exemplo" }).click();
  await expect(item(page, "Pedidos enviados", bia)).toHaveCount(0);
  expect(await entre(ana, bia)).toEqual([]);
  await comOutra(browser, bia, async (outra) => {
    await expect(secao(outra, "Pedidos recebidos").getByText("Nenhum pedido recebido.")).toBeVisible();
    await expect(secao(outra, "Pedidos enviados").getByText("Nenhum pedido enviado.")).toBeVisible();
  });
});

test("busca: só o início, até 10, sem curingas e sem a própria pessoa", async ({ page }) => {
  const inicio = apelido("zz").slice(0, 8);
  const eu = await pessoa("Eu", `${inicio}_eu`);
  const colega = await pessoa("Colega", `${inicio}_colega`);
  await pessoa("Meio", `x${inicio}_meio`);
  await abrir(page, eu);
  const achados = busca(page).getByRole("listitem");
  const nada = busca(page).getByText("Ninguém encontrado. Confira o @usuário.");
  await buscar(page, inicio);
  await expect(achados).toHaveCount(1);
  await expect(item(page, "Buscar pessoas", colega)).toHaveCount(1);
  for (const curinga of ["_", "%", "*", "\\", "%colega", `${inicio}%`, `${inicio}*`, "______", `${inicio.slice(0, 7)}_`, `${inicio},id`, `${inicio})`]) {
    await buscar(page, curinga);
    await expect(nada, curinga).toBeVisible();
    await expect(achados, curinga).toHaveCount(0);
  }
  await buscar(page, `${inicio}_`);
  await expect(achados).toHaveCount(1);
  const muitas = [];
  for (let i = 0; i < 11; i++) muitas.push(await pessoa(`Pessoa ${i}`, `${inicio}.${String(i).padStart(2, "0")}`));
  await buscar(page, `${inicio}.`);
  await expect(achados).toHaveCount(10);
  await expect(item(page, "Buscar pessoas", muitas[10])).toHaveCount(0);
});

test("pedido cruzado avisa e mostra o pedido recebido", async ({ page, erros }) => {
  erros.permitir(/\/rest\/v1\/amizades/, /409/);
  const ana = await pessoa("Ana Exemplo");
  const bia = await pessoa("Bia Exemplo");
  await abrir(page, ana);
  await buscar(page, bia.usuario);
  await expect(item(page, "Buscar pessoas", bia)).toHaveCount(1);
  await admin.from("amizades").insert({ solicitante_id: bia.id, destinatario_id: ana.id });
  await item(page, "Buscar pessoas", bia).getByRole("button", { name: /Pedir/ }).click();
  await expect(busca(page).getByRole("status")).toHaveText("Já existe um pedido ou uma amizade entre vocês.");
  await expect(item(page, "Pedidos recebidos", bia)).toHaveCount(1);
  await expect(item(page, "Buscar pessoas", bia)).toContainText("Pedido recebido");
});

test("aceitar um pedido que foi cancelado avisa", async ({ page }) => {
  const ana = await pessoa("Ana Exemplo");
  const bia = await pessoa("Bia Exemplo");
  await admin.from("amizades").insert({ solicitante_id: bia.id, destinatario_id: ana.id });
  await abrir(page, ana);
  await admin.from("amizades").delete().eq("solicitante_id", bia.id);
  await item(page, "Pedidos recebidos", bia).getByRole("button", { name: /Aceitar/ }).click();
  await expect(secao(page, "Pedidos recebidos").getByRole("status")).toHaveText("Este pedido não existe mais.");
  await expect(item(page, "Pedidos recebidos", bia)).toHaveCount(0);
  await expect(item(page, "Amigos", bia)).toHaveCount(0);
});

test("HTML no nome aparece literal", async ({ page }) => {
  const html = '<img src=x onerror="window.__xss=1">';
  const ana = await pessoa("Ana Exemplo");
  const bia = await pessoa(html);
  await admin.from("amizades").insert({ solicitante_id: bia.id, destinatario_id: ana.id });
  await abrir(page, ana);
  await buscar(page, bia.usuario);
  await expect(item(page, "Pedidos recebidos", bia)).toContainText(html);
  await expect(item(page, "Buscar pessoas", bia)).toContainText(html);
  expect(await page.evaluate(() => window.__xss)).toBeUndefined();
});

test("sem rede ao abrir, buscar e agir", async ({ page, erros }) => {
  erros.permitir(/\/rest\/v1\//, /ERR_FAILED/);
  const ana = await pessoa("Ana Exemplo");
  const bia = await pessoa("Bia Exemplo");
  await admin.from("amizades").insert({ solicitante_id: bia.id, destinatario_id: ana.id });
  await abrir(page, ana);
  await page.route(/\/rest\/v1\//, (rota) => rota.abort());
  await buscar(page, bia.usuario);
  await expect(busca(page).getByRole("status")).toHaveText(semRede);
  await item(page, "Pedidos recebidos", bia).getByRole("button", { name: /Aceitar/ }).click();
  await expect(secao(page, "Pedidos recebidos").getByRole("status")).toHaveText(semRede);
  await expect(item(page, "Pedidos recebidos", bia).getByRole("button", { name: /Aceitar/ })).toBeEnabled();
  await page.unrouteAll();
  await page.route(/\/rest\/v1\/amizades/, (rota) => rota.abort());
  await page.reload();
  await expect(page.locator("#mensagem")).toHaveText(semRede);
});

test("sem login e sem perfil não abrem os amigos", async ({ page }) => {
  await page.goto("/amigos.html");
  await page.waitForURL((endereco) => endereco.pathname === "/");
  await entrar(page, await criarUsuario({ perfil: false }));
  await page.goto("/amigos.html");
  await page.waitForURL("**/configuracao.html");
});

test("visual dos amigos", async ({ page }) => {
  const ana = await pessoa("Ana Exemplo");
  await abrir(page, ana);
  await conferirPagina(page, "amigos-vazio");
  const inicio = apelido("vv").slice(0, 8);
  const pedido = await pessoa("W".repeat(60), `${inicio}${"w".repeat(22)}`);
  const enviado = await pessoa("Bia Exemplo", `${inicio}_bia`);
  const amigos = [await pessoa("Caio Exemplo"), await pessoa("Dora Exemplo"), await pessoa("Eva Exemplo"), await pessoa("Fábio Exemplo")];
  await pessoa("Gil Exemplo", `${inicio}_gil`);
  const { error } = await admin.from("amizades").insert([
    { solicitante_id: pedido.id, destinatario_id: ana.id, status: "pendente" },
    { solicitante_id: ana.id, destinatario_id: enviado.id, status: "pendente" },
    ...amigos.map(({ id }) => ({ solicitante_id: id, destinatario_id: ana.id, status: "aceita" })),
  ]);
  expect(error).toBeNull();
  await page.reload();
  await buscar(page, inicio);
  await expect(busca(page).getByRole("listitem")).toHaveCount(3);
  await expect(secao(page, "Amigos").getByRole("listitem")).toHaveCount(4);
  await conferirPagina(page, "amigos");
});
