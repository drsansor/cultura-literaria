import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { chaves } from "../../scripts/supabase-local.mjs";
import { admin, entrar, expect, pessoasDoTeste, test } from "./ajuda.js";

const nova = pessoasDoTeste();
const PROPRIEDADES = ["font-family", "color", "background-color", "border-radius"];

// A tabela "Unidade visual" da especificação, com as variantes sobre rosa à parte.
const PECAS = {
  "ação principal": ".quadro .botao, .menu .botao",
  "ação principal sobre rosa": ".conteudo main > .botao, .feed > .botao, .criar > .botao",
  "navegação do perfil": ".seta",
  selo: ".selo",
  "ação dentro do selo": ".selo .etiqueta:not(.redes)",
  estrela: ".estrela:not(.miolo .estrela), .miolo .quadro .estrela",
  "estrela sobre rosa": ".miolo .estrela:not(.quadro .estrela)",
  "formulário e diálogo": ".quadro",
  campo: ".quadro input:not([type=radio], [type=file]), .quadro textarea",
  "título da tela": ".cabecalho h1, .listrado h1",
  "título do quadro": ".quadro h2",
  "vazio, carregando e erro": ".conteudo main > .mensagem:not(.erro), .feed > .mensagem:not(.erro), .secao > .mensagem:not(.erro)",
  "voltar ao menu": ".voltar",
  "ação discreta": ".discreto:not(.miolo .discreto), .troca button",
};

const medir = (page) =>
  page.evaluate(({ pecas, propriedades }) => {
    const medidas = [];
    for (const [peca, seletor] of Object.entries(pecas)) {
      for (const no of document.querySelectorAll(seletor)) {
        if (!no.checkVisibility() || no.matches(":disabled")) continue;
        const estilo = getComputedStyle(no);
        medidas.push([peca, propriedades.map((nome) => estilo.getPropertyValue(nome)).join(" | ")]);
      }
    }
    return medidas;
  }, { pecas: PECAS, propriedades: PROPRIEDADES });

test("cada peça é igual em todas as telas, e nenhum link interno dá 404", async ({ page, request }) => {
  const ana = await nova("Ana Exemplo");
  const bia = await nova("Bia Exemplo");
  const inserir = async (tabela, linha) => {
    const { data, error } = await admin.from(tabela).insert(linha).select("*").single();
    if (error) throw error;
    return data;
  };
  const grupo = await inserir("grupos", { nome: `Clube ${randomUUID().slice(0, 4)}`, criador_id: ana.id });
  const publicacao = await inserir("publicacoes", { autor_id: ana.id, texto: "Texto", livro_titulo: "Livro Exemplo" });
  await inserir("publicacoes", { autor_id: ana.id, texto: "No grupo", grupo_id: grupo.id });
  await inserir("comentarios", { publicacao_id: publicacao.id, autor_id: bia.id, texto: "Oi" });
  await inserir("amizades", { solicitante_id: bia.id, destinatario_id: ana.id });

  const primeira = {};
  const diferencas = [];
  const vistas = new Set();
  const links = new Set();
  const cabecalhos = {};
  const pequenos = [];

  async function conferir(tela) {
    await page.mouse.move(0, 0);
    for (const [peca, medida] of await medir(page)) {
      vistas.add(peca);
      primeira[peca] ??= { tela, medida };
      if (primeira[peca].medida !== medida) diferencas.push(`${peca}: ${tela} tem ${medida}; ${primeira[peca].tela} tem ${primeira[peca].medida}`);
    }
    await page.setViewportSize({ width: 320, height: 640 });
    pequenos.push(...(await page.evaluate(() => [...document.querySelectorAll("a[href], button, summary, textarea, input:not([type=radio]), label:has([type=radio])")]
      .filter((no) => no.checkVisibility() && no.getBoundingClientRect().height < 44)
      .map((no) => `${no.tagName} ${no.className} ${no.textContent.trim().slice(0, 20)}`))).map((alvo) => `${tela}: ${alvo}`));
    await page.setViewportSize({ width: 1440, height: 900 });
    for (const href of await page.locator('a[href^="/"]').evaluateAll((nos) => nos.map((no) => no.getAttribute("href")))) links.add(href);
    if (!(await page.locator("body.conteudo").count())) return;
    for (const [largura, altura] of [[1440, 900], [390, 844], [320, 640]]) {
      await page.setViewportSize({ width: largura, height: altura });
      const medida = await page.evaluate(() => {
        scrollTo(0, 0);
        const caixa = (no) => { const { x, y, width, height } = no.getBoundingClientRect(); return [x, y, width, height].map(Math.round); };
        const cabecalho = document.querySelector(".cabecalho");
        return { fundo: getComputedStyle(document.body).backgroundColor, cor: getComputedStyle(cabecalho).backgroundColor, cabecalho: caixa(cabecalho), voltar: caixa(document.querySelector(".voltar")) };
      });
      cabecalhos[largura] ??= { tela, medida };
      expect(medida, `${tela} em ${largura}px, comparada com ${cabecalhos[largura].tela}`).toEqual(cabecalhos[largura].medida);
    }
    await page.setViewportSize({ width: 1440, height: 900 });
  }

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await conferir("login");
  await page.getByRole("button", { name: "Criar conta" }).click();
  await conferir("cadastro");
  await entrar(page, ana);
  await expect(page.getByText(`@${ana.usuario}`)).toBeVisible();
  await conferir("menu");

  for (const [tela, endereco, pronto] of [
    ["bibliotecas", "/locais.html?tipo=biblioteca", ".selo"],
    ["sebos", "/locais.html?tipo=sebo", ".selo"],
    ["influenciadores", "/influenciadores.html", ".selo"],
    ["não encontrada", "/locais.html?tipo=xyz", "#mensagem:not(:empty)"],
    ["comunidade", "/comunidade.html", "[data-publicacao]"],
    ["grupo", `/grupo.html?id=${grupo.id}`, "[data-publicacao]"],
    ["amigos", "/amigos.html", ".pessoas .selo"],
    ["notificações", "/notificacoes.html", ".selo"],
    ["configuração", "/configuracao.html", "#form-senha"],
  ]) {
    await page.goto(endereco);
    await expect(page.locator(pronto).first()).toBeVisible();
    await expect(page.getByText("Carregando…")).toHaveCount(0);
    for (const resumo of await page.locator("summary").all()) await resumo.click();
    if (tela === "comunidade") await expect(page.locator(".falas li").first()).toBeVisible();
    await conferir(tela);
  }

  await page.goto("/locais.html?tipo=sebo");
  await page.locator(".selo .etiqueta").first().click();
  await expect(page.locator("#form-avaliacao")).toBeVisible();
  await conferir("diálogo de avaliações");
  await page.goto(`/grupo.html?id=${grupo.id}`);
  await page.getByRole("button", { name: "Apagar grupo" }).click();
  await conferir("diálogo de confirmação");

  expect(diferencas).toEqual([]);
  expect(pequenos, "alvos de toque menores que 44 px").toEqual([]);
  expect([...vistas].sort(), "toda peça apareceu").toEqual(Object.keys(PECAS).sort());
  for (const link of links) expect((await request.get(link)).status(), link).toBe(200);
});

test("nenhuma chave secreta no site nem no repositório", async () => {
  // A biblioteca traz o texto "sb_secret_" solto; uma chave tem o resto colado nele.
  const chave = /sb_secret_[A-Za-z0-9_-]{6,}/;
  const { secreta } = chaves();
  const arquivos = readdirSync("dist", { recursive: true, withFileTypes: true }).filter((item) => item.isFile()).map((item) => `${item.parentPath}/${item.name}`);
  const versionados = execFileSync("git", ["ls-files", "-z"], { cwd: "..", encoding: "utf8" }).split("\0").filter(Boolean).map((nome) => `../${nome}`);
  expect(arquivos.length).toBeGreaterThan(8);
  expect(versionados.length).toBeGreaterThan(20);
  for (const arquivo of [...arquivos, ...versionados]) {
    const texto = readFileSync(arquivo, "latin1");
    expect(chave.test(texto) || texto.includes(secreta), arquivo).toBe(false);
  }
});
