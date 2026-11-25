import { randomUUID } from "node:crypto";
import { admin, conferirPagina, criarUsuario, entrar, expect, pessoasDoTeste, test } from "./ajuda.js";

const nova = pessoasDoTeste();
const unico = (texto = "Grupo") => `${texto} ${randomUUID().slice(0, 8)}`;
const semRede = "Não foi possível conectar. Verifique sua internet e tente de novo.";
const secao = (page) => page.getByRole("region", { name: "Grupos" });
const cartao = (page, nome) => secao(page).getByRole("listitem").filter({ has: page.getByRole("heading", { name: nome, exact: true }) });
const criar = (page) => page.getByRole("form", { name: "Criar grupo" });
const dados = (page) => page.getByRole("region", { name: "Sobre o grupo" });
const publicar = (page) => page.getByRole("form", { name: "Nova publicação" });
const acao = (page, nome) => dados(page).getByRole("button", { name: nome, exact: true });

async function grupoDe({ id }, nome = unico(), descricao = "Lemos juntos") {
  const { data, error } = await admin.from("grupos").insert({ nome, descricao, criador_id: id }).select("id, nome").single();
  if (error) throw error;
  return data;
}

async function abrirGrupo(page, grupo, pessoa) {
  pessoa ??= await nova();
  await entrar(page, pessoa);
  await page.goto(`/grupo.html?id=${grupo.id}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(grupo.nome);
  return pessoa;
}

async function abrirCriar(page) {
  await page.goto("/comunidade.html");
  await page.locator("summary", { hasText: "Criar grupo" }).click();
  await expect(criar(page)).toBeVisible();
}

test("criar leva ao grupo, e o criador já participa", async ({ page }) => {
  const pessoa = await nova();
  await entrar(page, pessoa);
  await abrirCriar(page);
  const nome = unico("Clube");
  await criar(page).getByLabel("Nome do grupo").fill(`  ${nome} `);
  await criar(page).getByLabel("Descrição").fill("Um livro por mês");
  await criar(page).getByRole("button", { name: "Criar" }).click();
  await page.waitForURL(/\/grupo\.html\?id=[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(nome);
  await expect(page).toHaveTitle(`${nome} | A Crise Literária no Brasil`);
  await expect(dados(page)).toContainText("Um livro por mês");
  await expect(dados(page)).toContainText("1 participante");
  await expect(dados(page)).toContainText(`@${pessoa.usuario}`);
  await expect(acao(page, "Apagar grupo")).toBeVisible();
  for (const botao of ["Entrar", "Sair"]) await expect(acao(page, botao)).toBeHidden();
  await expect(publicar(page)).toBeVisible();
  await page.goto("/comunidade.html");
  await expect(cartao(page, nome)).toContainText("Um livro por mês");
  await expect(cartao(page, nome)).toContainText("1 participante");
  await cartao(page, nome).getByRole("link", { name: `Abrir o grupo ${nome}` }).click();
  await page.waitForURL("**/grupo.html?id=*");
});

test("nome repetido ou só com espaços não cria; descrição é opcional", async ({ page, erros }) => {
  erros.permitir(/\/rest\/v1\/grupos/, /409|400/);
  const { nome } = await grupoDe(await nova());
  const pessoa = await nova();
  await entrar(page, pessoa);
  await abrirCriar(page);
  await criar(page).getByLabel("Nome do grupo").fill(nome);
  await criar(page).getByRole("button", { name: "Criar" }).click();
  await expect(criar(page).getByRole("status")).toHaveText("Já existe um grupo com este nome.");
  await expect(criar(page).getByLabel("Nome do grupo")).toHaveValue(nome);
  await criar(page).getByLabel("Nome do grupo").fill("   ");
  await criar(page).getByRole("button", { name: "Criar" }).click();
  expect(await criar(page).getByLabel("Nome do grupo").evaluate((campo) => campo.validity.patternMismatch)).toBe(true);
  expect((await admin.from("grupos").select("id").eq("criador_id", pessoa.id)).data).toEqual([]);
  await criar(page).getByLabel("Nome do grupo").fill(unico());
  await criar(page).getByRole("button", { name: "Criar" }).dblclick();
  await page.waitForURL("**/grupo.html?id=*");
  expect((await admin.from("grupos").select("descricao").eq("criador_id", pessoa.id)).data).toEqual([{ descricao: "" }]);
});

test("não membro lê sem publicar; entrar libera; sair remove", async ({ page }) => {
  const dona = await nova("Bia Exemplo");
  const grupo = await grupoDe(dona);
  const texto = unico("Da dona");
  await admin.from("publicacoes").insert({ autor_id: dona.id, grupo_id: grupo.id, texto });
  await abrirGrupo(page, grupo);
  const post = page.locator("[data-publicacao]").filter({ hasText: texto });
  await expect(post).toHaveCount(1);
  await expect(dados(page).getByText("Entre no grupo para publicar e comentar.")).toBeVisible();
  await expect(publicar(page)).toHaveCount(0);
  await post.locator("summary").click();
  await expect(post.getByText("Ainda não há comentários.")).toBeVisible();
  await expect(post.getByLabel("Seu comentário")).toHaveCount(0);
  await expect(acao(page, "Apagar grupo")).toBeHidden();

  await acao(page, "Entrar").click();
  await expect(acao(page, "Sair")).toBeVisible();
  await expect(acao(page, "Entrar")).toBeHidden();
  await expect(dados(page)).toContainText("2 participantes");
  await expect(dados(page).getByText("Entre no grupo para publicar e comentar.")).toBeHidden();
  const minha = unico("Minha");
  await publicar(page).getByLabel("Sua publicação").fill(minha);
  await publicar(page).getByRole("button", { name: "Publicar" }).click();
  await expect(page.locator("[data-publicacao]").first()).toContainText(minha);
  await post.locator("summary").click();
  await post.getByLabel("Seu comentário").fill("Oi, grupo");
  await post.getByRole("button", { name: "Comentar" }).click();
  await expect(post.getByRole("listitem")).toContainText(["Oi, grupo"]);

  await acao(page, "Sair").click();
  await expect(acao(page, "Entrar")).toBeVisible();
  await expect(dados(page)).toContainText("1 participante");
  await expect(publicar(page)).toHaveCount(0);
  const minhas = page.locator("[data-publicacao]").filter({ hasText: minha });
  await minhas.getByRole("button", { name: "Apagar publicação" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Apagar" }).click();
  await expect(minhas).toHaveCount(0);

  await page.goto("/comunidade.html");
  await expect(cartao(page, grupo.nome)).toBeVisible();
  await expect(page.getByText(texto)).toHaveCount(0);
});

test("quem já entrou em outra aba entra sem erro", async ({ page }) => {
  const grupo = await grupoDe(await nova());
  const pessoa = await abrirGrupo(page, grupo);
  await admin.from("grupo_membros").insert({ grupo_id: grupo.id, perfil_id: pessoa.id });
  await acao(page, "Entrar").click();
  await expect(acao(page, "Sair")).toBeVisible();
  await expect(dados(page)).toContainText("2 participantes");
  await expect(dados(page).getByRole("status")).toBeHidden();
});

test("endereço inválido ou grupo inexistente mostra página não encontrada", async ({ page }) => {
  await entrar(page, await nova());
  for (const endereco of ["?id=invalido", `?id=${randomUUID()}`, "", "?id=", `?id=${randomUUID()},x`]) {
    await page.goto(`/grupo.html${endereco}`);
    await expect(page.getByRole("heading", { level: 1 }), endereco).toHaveText("Página não encontrada");
    await expect(page.getByRole("link", { name: "Voltar ao menu" })).toBeVisible();
    await expect(dados(page)).toBeHidden();
    await expect(publicar(page)).toHaveCount(0);
  }
});

test("criador apaga o grupo, com confirmação, e volta à Comunidade", async ({ page }) => {
  const pessoa = await nova();
  const grupo = await grupoDe(pessoa);
  await abrirGrupo(page, grupo, pessoa);
  const dialogo = page.getByRole("dialog", { name: "Apagar este grupo e tudo o que há nele?" });
  await acao(page, "Apagar grupo").click();
  await dialogo.getByRole("button", { name: "Cancelar" }).click();
  expect((await admin.from("grupos").select("id").eq("id", grupo.id)).data).toHaveLength(1);
  await acao(page, "Apagar grupo").click();
  await dialogo.getByRole("button", { name: "Apagar" }).click();
  await page.waitForURL("**/comunidade.html");
  await expect(cartao(page, grupo.nome)).toHaveCount(0);
  expect((await admin.from("grupos").select("id").eq("id", grupo.id)).data).toEqual([]);
});

test("admin apaga grupo alheio e também pode entrar", async ({ page }) => {
  const grupo = await grupoDe(await nova());
  const pessoa = await nova();
  await admin.from("perfis").update({ admin: true }).eq("id", pessoa.id);
  await abrirGrupo(page, grupo, pessoa);
  await expect(acao(page, "Entrar")).toBeVisible();
  await expect(publicar(page)).toHaveCount(0);
  await acao(page, "Apagar grupo").click();
  await page.getByRole("dialog").getByRole("button", { name: "Apagar" }).click();
  await page.waitForURL("**/comunidade.html");
  expect((await admin.from("grupos").select("id").eq("id", grupo.id)).data).toEqual([]);
});

test("HTML no nome e na descrição aparece literal", async ({ page }) => {
  const html = '<img src=x onerror="window.__xss=1">';
  const grupo = await grupoDe(await nova(), `${html} ${randomUUID().slice(0, 8)}`, html);
  await abrirGrupo(page, grupo);
  await expect(dados(page).getByText(html)).toBeVisible();
  await page.goto("/comunidade.html");
  await expect(cartao(page, grupo.nome).getByText(html).last()).toBeVisible();
  expect(await page.evaluate(() => window.__xss)).toBeUndefined();
});

test("sem grupos e sem rede dizem o que fazer, e o feed continua", async ({ page, erros }) => {
  erros.permitir(/\/rest\/v1\//, /ERR_FAILED/);
  const grupo = await grupoDe(await nova());
  await entrar(page, await nova());
  await page.route(/\/rest\/v1\/grupos/, (rota) => rota.fulfill({ json: [] }));
  await page.goto("/comunidade.html");
  await expect(secao(page).getByRole("status").first()).toHaveText("Ainda não há grupos. Crie o primeiro.");
  await page.unrouteAll();
  await page.route(/\/rest\/v1\/grupos/, (rota) => rota.abort());
  await page.goto("/comunidade.html");
  await expect(secao(page).getByRole("status").first()).toHaveText(semRede);
  await expect(publicar(page)).toBeVisible();
  await page.goto(`/grupo.html?id=${grupo.id}`);
  await expect(page.getByRole("status").first()).toHaveText(semRede);
  await page.unrouteAll();
  await page.reload();
  await expect(acao(page, "Entrar")).toBeVisible();
  await page.route(/\/rest\/v1\/grupo_membros/, (rota) => rota.abort());
  await acao(page, "Entrar").click();
  await expect(dados(page).getByRole("status")).toHaveText(semRede);
  await expect(acao(page, "Entrar")).toBeEnabled();
});

test("sem login e sem perfil não abrem o grupo", async ({ page }) => {
  const endereco = `/grupo.html?id=${(await grupoDe(await nova())).id}`;
  await page.goto(endereco);
  await page.waitForURL((atual) => atual.pathname === "/");
  await entrar(page, await criarUsuario({ perfil: false }));
  await page.goto(endereco);
  await page.waitForURL("**/configuracao.html");
});

test("visual dos grupos", async ({ page }) => {
  const dona = await nova("Bia Exemplo");
  const grupo = await grupoDe(dona, unico("Clube"), "Um livro por mês, com conversa aos sábados.");
  const longo = await grupoDe(dona, "W".repeat(60), "M".repeat(300));
  await admin.from("publicacoes").insert({ autor_id: dona.id, grupo_id: grupo.id, texto: "Qual vai ser o livro de dezembro?", livro_titulo: "Livro Exemplo" });
  await abrirGrupo(page, grupo);
  await expect(page.locator("[data-publicacao]")).toHaveCount(1);
  await conferirPagina(page, "grupo");
  await page.goto(`/grupo.html?id=${longo.id}`);
  await expect(page.getByText("Ainda não há publicações.")).toBeVisible();
  await conferirPagina(page, "grupo-longo");
  await abrirCriar(page);
  await expect(cartao(page, longo.nome)).toBeVisible();
  await conferirPagina(page, "grupos");
});
