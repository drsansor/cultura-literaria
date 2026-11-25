import { randomUUID } from "node:crypto";
import { expect, preencher, test, vigiar } from "./ajuda.js";

const unico = (texto) => `${texto} ${randomUUID().slice(0, 8)}`;
const senha = "senha-boa-123";
const menu = (page) => page.waitForURL("**/menu.html");

// Só a primeira página é aberta pelo endereço; daqui em diante, cliques.
async function cadastrar(page, nome) {
  const usuario = `j${randomUUID().replaceAll("-", "").slice(0, 12)}`;
  const email = `teste-${randomUUID()}@example.com`;
  await page.goto("/");
  await page.getByRole("button", { name: "Criar conta" }).click();
  await preencher(page, email, senha);
  await page.locator("#enviar").click();
  await page.waitForURL("**/configuracao.html");
  await page.getByLabel("Nome").fill(nome);
  await page.getByLabel("@usuário").fill(usuario);
  await page.getByRole("button", { name: "Salvar" }).click();
  await menu(page);
  await expect(page.getByText(`@${usuario}`)).toBeVisible();
  return { nome, usuario, email };
}

async function ir(page, nome, titulo) {
  await page.getByRole("link", { name: nome }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(titulo);
  await expect(page.getByRole("link", { name: "Voltar ao menu" })).toBeVisible();
  await expect(page.locator("#mensagem")).not.toHaveText("Carregando…");
}

async function voltar(page) {
  await page.getByRole("link", { name: "Voltar ao menu" }).click();
  await menu(page);
}

const confirmar = (page, acao) => page.getByRole("dialog").last().getByRole("button", { name: acao, exact: true }).click();
const post = (page, texto) => page.locator("[data-publicacao]").filter({ hasText: texto });

async function publicar(page, texto) {
  await page.getByRole("form", { name: "Nova publicação" }).getByLabel("Sua publicação").fill(texto);
  await page.getByRole("button", { name: "Publicar" }).click();
  await expect(post(page, texto)).toHaveCount(1);
}

async function comentar(page, texto, comentario) {
  await post(page, texto).locator("summary").click();
  await post(page, texto).getByLabel("Seu comentário").fill(comentario);
  await post(page, texto).getByRole("button", { name: "Comentar" }).click();
  await expect(post(page, texto).getByRole("listitem").filter({ hasText: comentario })).toHaveCount(1);
}

async function excluir(page, { usuario }) {
  await ir(page, "Configuração", "Configuração");
  await page.getByLabel("Para confirmar, digite o seu usuário").fill(usuario);
  await page.getByRole("button", { name: "Excluir minha conta" }).click();
  await page.waitForURL((endereco) => endereco.pathname === "/");
}

test("duas pessoas, do cadastro à exclusão, só por cliques", async ({ page, browser, erros }) => {
  erros.permitir(/\/auth\/v1\/(logout|token)/, /400|403/);
  const contexto = await browser.newContext({ baseURL: "http://localhost:4173", locale: "pt-BR" });
  const outra = await contexto.newPage();
  const vigia = vigiar(outra);
  vigia.permitir(/\/auth\/v1\/logout/, /403/);
  const [ana, bia] = [await cadastrar(page, "Ana Exemplo"), await cadastrar(outra, "Bia Exemplo")];
  const [texto, noGrupo, nomeGrupo] = [unico("Olá a todos"), unico("Só do grupo"), unico("Clube")];

  // Ana: listas e avaliação
  await ir(page, "Lista de bibliotecas", "Lista de Bibliotecas");
  await page.getByRole("button", { name: "Comentários de Biblioteca Exemplo 1" }).click();
  const avaliacao = page.getByRole("dialog");
  await avaliacao.getByRole("radio", { name: "5", exact: true }).check();
  await avaliacao.getByLabel("Comentário").fill(unico("Gostei"));
  await avaliacao.getByRole("button", { name: "Salvar" }).click();
  await expect(avaliacao.getByRole("status")).toHaveText("Avaliação salva.");
  await avaliacao.getByRole("button", { name: "Fechar" }).click();
  await voltar(page);
  await ir(page, "Lista de Sebos", "Lista de Sebos");
  await voltar(page);
  await ir(page, "Lista de Influenciadores Literários", "Lista de influenciadores");
  await voltar(page);

  // Ana: comunidade e grupo
  await ir(page, "Comunidade", "Comunidade");
  await publicar(page, texto);
  await page.locator("summary", { hasText: "Criar grupo" }).click();
  await page.getByLabel("Nome do grupo").fill(nomeGrupo);
  await page.getByRole("button", { name: "Criar", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(nomeGrupo);
  await publicar(page, noGrupo);
  await page.getByRole("link", { name: "Ver todos os grupos" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Comunidade");
  await expect(post(page, noGrupo)).toHaveCount(0);
  await voltar(page);

  // Bia: comenta, entra no grupo e pede amizade
  await ir(outra, "Comunidade", "Comunidade");
  await comentar(outra, texto, "Oi, Ana");
  await outra.getByRole("link", { name: `Abrir o grupo ${nomeGrupo}` }).click();
  await outra.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(outra.getByRole("button", { name: "Sair", exact: true })).toBeVisible();
  await comentar(outra, noGrupo, "Cheguei");
  await voltar(outra);
  await ir(outra, "Amigos", "Amigos");
  await outra.getByLabel("@usuário").fill(ana.usuario);
  await outra.getByRole("button", { name: "Buscar" }).click();
  await outra.getByRole("button", { name: "Pedir amizade a Ana Exemplo" }).click();
  await expect(outra.getByText("Pedido enviado", { exact: true })).toBeVisible();
  await voltar(outra);

  // Ana: vê as notificações, aceita e desfaz
  await ir(page, "Configuração", "Configuração");
  await voltar(page);
  await ir(page, /^Notificação 3 não lidas$/, "Notificação");
  await expect(page.getByRole("main").getByRole("listitem")).toHaveCount(3);
  await page.getByRole("link", { name: "Ver: Bia Exemplo pediu sua amizade." }).click();
  await page.getByRole("button", { name: "Aceitar o pedido de Bia Exemplo" }).click();
  await expect(page.getByRole("button", { name: "Desfazer a amizade com Bia Exemplo" })).toBeVisible();
  await voltar(page);
  await expect(page.locator(".contador")).toHaveCount(0);
  // Não há tempo real: Bia vê o aviso ao voltar ao menu.
  await ir(outra, "Lista de Sebos", "Lista de Sebos");
  await voltar(outra);
  await ir(outra, /^Notificação 1 não lida$/, "Notificação");
  await outra.getByRole("link", { name: "Ver: Ana Exemplo aceitou seu pedido de amizade." }).click();
  await outra.getByRole("button", { name: "Desfazer a amizade com Ana Exemplo" }).click();
  await confirmar(outra, "Desfazer");
  await expect(outra.getByText("Você ainda não tem amigos aqui.", { exact: false })).toBeVisible();
  await voltar(outra);

  // Ana sai e entra de novo; depois as duas excluem a conta
  await ir(page, "Configuração", "Configuração");
  await page.getByRole("button", { name: "Sair" }).click();
  await page.waitForURL((endereco) => endereco.pathname === "/");
  await preencher(page, ana.email, senha);
  await page.locator("#enviar").click();
  await menu(page);
  await excluir(page, ana);
  await ir(outra, "Comunidade", "Comunidade");
  await expect(outra.getByRole("link", { name: `Abrir o grupo ${nomeGrupo}` })).toHaveCount(0);
  await expect(post(outra, texto)).toHaveCount(0);
  await voltar(outra);
  await excluir(outra, bia);
  await preencher(page, ana.email, senha);
  await page.locator("#enviar").click();
  await expect(page.getByRole("status")).toHaveText("E-mail ou senha incorretos.");
  vigia.conferir();
  await contexto.close();
});
