import { randomUUID } from "node:crypto";
import { importar, lerDados } from "../../scripts/importar.mjs";
import { admin, comLinhas, conferirPagina, criarUsuario, entrar, expect, test } from "./ajuda.js";

const dados = lerDados();
const selos = (page) => page.getByRole("main").getByRole("listitem");
const selo = (page, nome) => selos(page).filter({ has: page.getByRole("heading", { name: nome, exact: true }) });

async function abrir(page, endereco) {
  await entrar(page, await criarUsuario());
  await page.goto(endereco);
}

test("importar duas vezes não duplica nem apaga o que já existe", async () => {
  const extra = { tipo: "sebo", nome: `Extra ${randomUUID()}`, localizacao: "R" };
  await comLinhas("locais", [extra], async () => {
    const listas = { locais: [...dados.bibliotecas, ...dados.sebos], influenciadores: dados.influenciadores };
    const total = { locais: listas.locais.length, influenciadores: listas.influenciadores.length };
    // Conta aqui, e não no banco: centenas de nomes não cabem no endereço da consulta.
    const contar = async (tabela) => {
      const nomes = new Set(listas[tabela].map(({ nome }) => nome));
      return (await admin.from(tabela).select("nome")).data.filter(({ nome }) => nomes.has(nome)).length;
    };
    for (let vez = 0; vez < 2; vez++) {
      expect(await importar(admin, dados)).toEqual(total);
      for (const tabela of Object.keys(listas)) expect(await contar(tabela)).toBe(total[tabela]);
    }
    expect((await admin.from("locais").select("id").eq("nome", extra.nome)).data).toHaveLength(1);
  });
});

for (const [tipo, titulo, lista, outra] of [
  ["biblioteca", "Lista de Bibliotecas", dados.bibliotecas, dados.sebos],
  ["sebo", "Lista de Sebos", dados.sebos, dados.bibliotecas],
]) {
  test(`${titulo}: só os seus, com mapa e botão`, async ({ page }) => {
    await abrir(page, `/locais.html?tipo=${tipo}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(titulo);
    await expect(page).toHaveTitle(`${titulo} | A Crise Literária no Brasil`);
    await expect(selos(page).first()).toBeVisible();
    const textos = await selos(page).evaluateAll((itens) => itens.map((item) => `${item.querySelector("h2").textContent}|${item.querySelector("a").textContent}`));
    const texto = ({ nome, localizacao }) => `${nome}|${localizacao}`;
    expect(textos).toEqual(expect.arrayContaining(lista.map(texto)));
    expect(outra.map(texto).filter((local) => textos.includes(local))).toEqual([]);
    for (const { nome, localizacao } of lista.slice(0, 3)) {
      const item = selo(page, nome);
      await expect(item).toHaveAttribute("data-local", /^[0-9a-f-]{36}$/);
      const mapa = item.getByRole("link", { name: localizacao });
      await expect(mapa).toHaveAttribute("href", `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(localizacao)}`);
      await expect(mapa).toHaveAttribute("target", "_blank");
      await expect(mapa).toHaveAttribute("rel", "noopener noreferrer");
      await expect(item.getByRole("button", { name: `Comentários de ${nome}` })).toBeVisible();
    }
    await expect(page.getByRole("link", { name: "Mapa das Bibliotecas Públicas" })).toBeVisible({ visible: tipo === "biblioteca" });
    // A lista inteira é alta demais para uma imagem.
    if (tipo === "biblioteca") await page.getByLabel("Município").selectOption("Niterói");
    await conferirPagina(page, `${tipo}s`);
  });
}

test("filtro por município mostra só as bibliotecas dele", async ({ page }) => {
  await abrir(page, "/locais.html?tipo=biblioteca");
  const filtro = page.getByLabel("Município");
  await expect(filtro).toBeVisible();
  const total = await page.locator(".selo:visible").count();
  expect(total).toBeGreaterThanOrEqual(dados.bibliotecas.length);
  const emNiteroi = dados.bibliotecas.filter(({ localizacao }) => localizacao.endsWith(", Niterói - RJ"));
  for (const [municipio, esperados] of [["Niterói", emNiteroi], ["Três Rios", dados.bibliotecas.filter(({ localizacao }) => localizacao.endsWith("Três Rios - RJ"))]]) {
    await filtro.selectOption(municipio);
    const nomes = await page.locator(".selo:visible h2").allTextContents();
    expect(nomes.sort()).toEqual(esperados.map(({ nome }) => nome).sort());
  }
  await filtro.selectOption("");
  await expect(page.locator(".selo:visible")).toHaveCount(total);
  const opcoes = await filtro.locator("option").allTextContents();
  expect(opcoes[0]).toBe("Todos");
  expect(opcoes.slice(1)).toEqual([...opcoes.slice(1)].sort((a, b) => a.localeCompare(b, "pt-BR")));
  await page.goto("/locais.html?tipo=sebo");
  await expect(selos(page).first()).toBeVisible();
  await expect(filtro).toBeHidden();
});

test("nome e localização enormes não estouram o selo", async ({ page }) => {
  const nome = "W".repeat(120);
  const localizacao = "M".repeat(200);
  await comLinhas("locais", [{ tipo: "sebo", nome, localizacao }], async () => {
    await abrir(page, "/locais.html?tipo=sebo");
    await expect(selo(page, nome)).toBeVisible();
    await conferirPagina(page, "sebos-longo");
    for (const largura of [1440, 600, 320]) {
      await page.setViewportSize({ width: largura, height: 800 });
      const fora = await selo(page, nome).evaluate((item) => [...item.querySelectorAll("*")].filter((no) => no.scrollWidth > no.clientWidth + 1 && no.clientWidth).map((no) => no.className || no.tagName));
      expect(fora, `${largura}px`).toEqual([]);
    }
  });
});

test("três, duas e uma coluna", async ({ page }) => {
  await abrir(page, "/locais.html?tipo=biblioteca");
  await expect(selo(page, dados.bibliotecas[0].nome)).toBeVisible();
  for (const [largura, colunas] of [[900, 3], [899, 2], [520, 2], [519, 1]]) {
    await page.setViewportSize({ width: largura, height: 800 });
    const topos = await selos(page).evaluateAll((itens) => itens.slice(0, 3).map((item) => item.getBoundingClientRect().top));
    expect(topos.filter((topo) => topo === topos[0]), `${largura}px`).toHaveLength(colunas);
  }
});

test("endereço desconhecido mostra página não encontrada", async ({ page }) => {
  await entrar(page, await criarUsuario());
  for (const endereco of ["?tipo=xyz", "", "?tipo=", "?tipo=constructor", "?tipo=__proto__"]) {
    await page.goto(`/locais.html${endereco}`);
    await expect(page.getByRole("heading", { level: 1 }), endereco).toHaveText("Página não encontrada");
    await expect(page.getByRole("link", { name: "Voltar ao menu" })).toBeVisible();
    await expect(selos(page)).toHaveCount(0);
  }
  await conferirPagina(page, "nao-encontrada");
});

test("influenciadores com redes, sem foto e com foto", async ({ page }) => {
  const soYoutube = { nome: `Exemplo ${randomUUID().slice(0, 8)}`, foto: "exemplo.jpg", youtube: "canal.exemplo-1" };
  await page.route("**/influenciadores/exemplo.jpg", (rota) => rota.fulfill({ path: "public/estante.jpg" }));
  await comLinhas("influenciadores", [soYoutube], async () => {
    await abrir(page, "/influenciadores.html");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Lista de influenciadores");
    const liv = selo(page, "Liv");
    for (const [rede, endereco] of [
      ["Instagram", "https://www.instagram.com/Livresenhas"],
      ["YouTube", "https://www.youtube.com/@Livresenhas"],
      ["TikTok", "https://www.tiktok.com/@Livresenhas"],
    ]) {
      const link = liv.getByRole("link", { name: `${rede} de Liv: @Livresenhas` });
      await expect(link).toHaveAttribute("href", endereco);
      await expect(link).toHaveAttribute("target", "_blank");
      await expect(link).toHaveAttribute("rel", "noopener noreferrer");
      expect((await link.boundingBox()).height).toBeGreaterThanOrEqual(44);
    }
    await expect(liv.getByText("L", { exact: true })).toBeVisible();
    const outro = selo(page, soYoutube.nome);
    await expect(outro.getByRole("link")).toHaveCount(1);
    await expect(outro.getByRole("link")).toHaveAttribute("href", "https://www.youtube.com/@canal.exemplo-1");
    await expect.poll(() => outro.locator("img").evaluate((img) => img.naturalWidth)).toBeGreaterThan(1);
    await conferirPagina(page, "influenciadores");
    // A maior palavra dos títulos cabe inteira em 320 px.
    await page.setViewportSize({ width: 320, height: 640 });
    expect(await page.getByRole("heading", { level: 1 }).evaluate((h1) => {
      const trecho = document.createRange();
      const inicio = h1.textContent.indexOf("influenciadores");
      trecho.setStart(h1.firstChild, inicio);
      trecho.setEnd(h1.firstChild, inicio + "influenciadores".length);
      return trecho.getClientRects().length;
    })).toBe(1);
  });
});

test("foto que falta dá lugar à inicial", async ({ page, erros }) => {
  erros.permitir(/\/influenciadores\/nao-existe\.png$/, /404/);
  const nome = `Zeca ${randomUUID().slice(0, 8)}`;
  await comLinhas("influenciadores", [{ nome, foto: "nao-existe.png", tiktok: "zeca" }], async () => {
    await abrir(page, "/influenciadores.html");
    await expect(selo(page, nome).getByText("Z", { exact: true })).toBeVisible();
  });
});

test("lista vazia e sem rede dizem o que fazer", async ({ page, erros }) => {
  erros.permitir(/\/rest\/v1\//, /ERR_FAILED/);
  await entrar(page, await criarUsuario());
  for (const [endereco, tabela, vazio, nome] of [
    ["/locais.html?tipo=sebo", "locais_com_nota", "Ainda não há sebos nesta lista. Volte em breve.", "sebos"],
    ["/locais.html?tipo=biblioteca", "locais_com_nota", "Ainda não há bibliotecas nesta lista. Volte em breve.", "bibliotecas"],
    ["/influenciadores.html", "influenciadores", "Ainda não há influenciadores nesta lista. Volte em breve.", "influenciadores"],
  ]) {
    await page.route(new RegExp(`/rest/v1/${tabela}`), (rota) => rota.fulfill({ json: [] }));
    await page.goto(endereco);
    await expect(page.getByRole("status")).toHaveText(vazio);
    await conferirPagina(page, `${nome}-vazio`);
    await page.unrouteAll();
    await page.route(new RegExp(`/rest/v1/${tabela}`), (rota) => rota.abort());
    await page.goto(endereco);
    await expect(page.getByRole("status")).toHaveText("Não foi possível conectar. Verifique sua internet e tente de novo.");
    await page.unrouteAll();
  }
});

test("sem perfil e sem login não abrem as listas", async ({ page }) => {
  for (const endereco of ["/locais.html?tipo=sebo", "/influenciadores.html"]) {
    await page.goto(endereco);
    await page.waitForURL((atual) => atual.pathname === "/");
  }
  await entrar(page, await criarUsuario({ perfil: false }));
  for (const endereco of ["/locais.html?tipo=sebo", "/influenciadores.html"]) {
    await page.goto(endereco);
    await page.waitForURL("**/configuracao.html");
  }
});
