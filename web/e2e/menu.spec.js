import { creditos } from "../src/creditos.js";
import { admin, conferirPagina, criarUsuario, entrar, expect, test } from "./ajuda.js";

const BOTOES = {
  "Lista de bibliotecas": "/locais.html?tipo=biblioteca",
  "Lista de Sebos": "/locais.html?tipo=sebo",
  "Lista de Influenciadores Literários": "/influenciadores.html",
  Comunidade: "/comunidade.html",
};
const SETAS = { Amigos: "/amigos.html", Configuração: "/configuracao.html", Notificação: "/notificacoes.html" };
const perfil = (page) => page.getByRole("region", { name: "Perfil" });

async function abrir(page) {
  const pessoa = await criarUsuario();
  await entrar(page, pessoa);
  await expect(perfil(page).getByText(`@${pessoa.usuario}`)).toBeVisible();
  return pessoa;
}

test("visual do menu", async ({ page }) => {
  const pessoa = await criarUsuario();
  await entrar(page, pessoa);
  await expect(perfil(page).getByText("P", { exact: true })).toBeVisible();
  await conferirPagina(page, "menu");
  // Pior caso: nome e @usuário no tamanho máximo, sem espaço.
  await admin.from("perfis").update({ nome: "W".repeat(60), usuario: "w".repeat(13) + pessoa.usuario.slice(-17) }).eq("id", pessoa.id);
  await page.reload();
  await expect(perfil(page).getByText("W".repeat(60))).toBeVisible();
  await conferirPagina(page, "menu-longo");
});

test("cada botão e seta leva à sua página", async ({ page }) => {
  await abrir(page);
  await expect(page.getByRole("main").getByRole("link")).toHaveCount(7);
  for (const [nome, destino] of Object.entries({ ...BOTOES, ...SETAS })) {
    await expect(page.getByRole("link", { name: nome, exact: true })).toHaveAttribute("href", destino);
  }
  await page.getByRole("link", { name: "Configuração", exact: true }).click();
  await page.waitForURL("**/configuracao.html");
  await page.getByRole("link", { name: "Voltar ao menu" }).click();
  await page.waitForURL("**/menu.html");
});

test("perfil mostra nome, @usuário e estrela", async ({ page }) => {
  await abrir(page);
  await expect(perfil(page).getByText("Pessoa Teste")).toBeVisible();
  await expect(perfil(page).getByText("P", { exact: true })).toBeVisible();
  await expect(page.locator("#mensagem")).toBeEmpty();
});

test("feito por lista os créditos", async ({ page }) => {
  await abrir(page);
  await expect(page.getByRole("region", { name: "Feito por:" }).getByRole("listitem")).toHaveText(creditos);
  expect(creditos.length).toBeGreaterThan(0);
});

test("no celular o perfil vem depois dos botões; no computador, ao lado", async ({ page }) => {
  await abrir(page);
  const caixa = (alvo) => alvo.boundingBox();
  const ultimo = page.getByRole("link", { name: "Comunidade" });
  await page.setViewportSize({ width: 390, height: 844 });
  let [botao, lado] = [await caixa(ultimo), await caixa(perfil(page))];
  expect(lado.y).toBeGreaterThanOrEqual(botao.y + botao.height);
  await page.setViewportSize({ width: 1440, height: 900 });
  [botao, lado] = [await caixa(ultimo), await caixa(perfil(page))];
  expect(lado.x).toBeGreaterThanOrEqual(botao.x + botao.width);
  expect(lado.y).toBeLessThan(botao.y);
});

test("toque de 44 px e foco visível em todos os links", async ({ page }) => {
  await abrir(page);
  await page.setViewportSize({ width: 320, height: 640 });
  for (const link of await page.getByRole("main").getByRole("link").all()) {
    expect((await link.boundingBox()).height).toBeGreaterThanOrEqual(44);
    await link.focus();
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Tab");
    await expect(link).toBeFocused();
    expect(await link.evaluate((no) => getComputedStyle(no).outlineStyle)).toBe("solid");
  }
});

test("sem rede o aviso aparece e os botões continuam", async ({ page, erros }) => {
  erros.permitir(/\/rest\/v1\//, /ERR_FAILED/);
  await abrir(page);
  await page.route(/\/rest\/v1\//, (rota) => rota.abort());
  await page.reload();
  await expect(page.getByRole("status")).toHaveText("Não foi possível conectar. Verifique sua internet e tente de novo.");
  await expect(page.getByRole("link", { name: "Comunidade" })).toBeVisible();
  await conferirPagina(page, "menu-erro");
});
