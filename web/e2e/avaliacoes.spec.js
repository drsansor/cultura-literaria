import { randomUUID } from "node:crypto";
import { admin, comLinhas, conferirPagina, criarUsuario, entrar, expect, test } from "./ajuda.js";

const dialogo = (page) => page.getByRole("dialog", { name: /^Local / });
const lista = (page) => dialogo(page).getByRole("listitem");
const aviso = (page) => dialogo(page).getByRole("status");
const selo = (page, nome) => page.getByRole("listitem").filter({ has: page.getByRole("heading", { name: nome, exact: true }) });
const botao = (page, nome) => page.getByRole("button", { name: `Comentários de ${nome}` });
const noBanco = async (local) => (await admin.from("avaliacoes").select("autor_id, nota, comentario").eq("local_id", local)).data;
const confirmacao = (page) => page.getByRole("dialog", { name: "Apagar esta avaliação?" });

// Um local só deste teste, aberto por uma pessoa nova.
async function comLocal(page, usar, { total = 1 } = {}) {
  const nomes = Array.from({ length: total }, () => `Local ${randomUUID().slice(0, 8)}`);
  await comLinhas("locais", nomes.map((nome) => ({ tipo: "sebo", nome, localizacao: "Rua Exemplo" })), async (ids) => {
    const pessoa = await criarUsuario();
    await entrar(page, pessoa);
    await page.goto("/locais.html?tipo=sebo");
    await usar({ nomes, ids, nome: nomes[0], id: ids[0], pessoa });
  });
}

async function avaliar(page, nota, texto) {
  await dialogo(page).getByRole("radio", { name: `${nota}`, exact: true }).check();
  await dialogo(page).getByLabel("Comentário").fill(texto);
  await dialogo(page).getByRole("button", { name: "Salvar" }).click();
}

async function avaliarComo(local, nota, comentario, nome = "Pessoa Teste") {
  const autor = await criarUsuario();
  await admin.from("perfis").update({ nome }).eq("id", autor.id);
  const { error } = await admin.from("avaliacoes").insert({ local_id: local, autor_id: autor.id, nota, comentario });
  if (error) throw error;
  return autor;
}

test("avaliar, editar e apagar atualizam média, lista e selo", async ({ page }) => {
  await comLocal(page, async ({ nome, id, pessoa }) => {
    await expect(selo(page, nome).getByText("Ainda sem avaliações")).toBeVisible();
    await botao(page, nome).click();
    await expect(dialogo(page).getByText("Ainda sem avaliações")).toBeVisible();
    await expect(dialogo(page).getByRole("button", { name: "Apagar" })).toBeHidden();

    await avaliar(page, 4, "  Acervo ótimo ");
    await expect(aviso(page)).toHaveText("Avaliação salva.");
    await expect(dialogo(page).getByText("Média 4,0 de 5, com 1 avaliação")).toBeVisible();
    await expect(lista(page)).toHaveCount(1);
    await expect(lista(page)).toContainText(["Acervo ótimo"]);
    await expect(lista(page)).toContainText([`@${pessoa.usuario}`]);
    await expect(lista(page)).toContainText(["Nota 4 de 5"]);
    await expect(selo(page, nome).getByText("Média 4,0 de 5, com 1 avaliação")).toBeVisible();

    await avaliar(page, 2, "Mudei de ideia");
    await expect(dialogo(page).getByText("Média 2,0 de 5, com 1 avaliação")).toBeVisible();
    await expect(lista(page)).toHaveCount(1);
    expect(await noBanco(id)).toEqual([{ autor_id: pessoa.id, nota: 2, comentario: "Mudei de ideia" }]);

    await page.reload();
    await botao(page, nome).click();
    await expect(dialogo(page).getByRole("radio", { name: "2", exact: true })).toBeChecked();
    await expect(dialogo(page).getByLabel("Comentário")).toHaveValue("Mudei de ideia");
    await dialogo(page).getByRole("button", { name: "Apagar" }).click();
    await confirmacao(page).getByRole("button", { name: "Cancelar" }).click();
    await expect(lista(page)).toHaveCount(1);
    await dialogo(page).getByRole("button", { name: "Apagar" }).click();
    await confirmacao(page).getByRole("button", { name: "Apagar" }).click();
    await expect(dialogo(page).getByText("Ainda sem avaliações")).toBeVisible();
    await expect(lista(page)).toHaveCount(0);
    await expect(dialogo(page).getByLabel("Comentário")).toHaveValue("");
    await expect(selo(page, nome).getByText("Ainda sem avaliações")).toBeVisible();
    expect(await noBanco(id)).toEqual([]);
    await avaliar(page, 5, "De novo");
    await expect(lista(page)).toHaveCount(1);
  });
});

test("média de várias pessoas; ninguém apaga a alheia", async ({ page }) => {
  await comLocal(page, async ({ nome, id }) => {
    await avaliarComo(id, 5, "Excelente", "Bia Exemplo");
    await page.reload();
    await expect(selo(page, nome).getByText("Média 5,0 de 5, com 1 avaliação")).toBeVisible();
    await botao(page, nome).click();
    await expect(lista(page).filter({ hasText: "Bia Exemplo" })).toContainText("Excelente");
    await expect(dialogo(page).getByRole("button", { name: "Apagar" })).toBeHidden();
    await expect(dialogo(page).getByLabel("Comentário")).toHaveValue("");
    await avaliar(page, 4, "Bom");
    await expect(dialogo(page).getByText("Média 4,5 de 5, com 2 avaliações")).toBeVisible();
    await expect(lista(page)).toHaveCount(2);
    await expect(lista(page).getByRole("button")).toHaveCount(0);
    await expect(dialogo(page).getByRole("button", { name: "Apagar" })).toHaveCount(1);
  });
});

test("admin apaga a avaliação de outra pessoa, com confirmação", async ({ page }) => {
  await comLocal(page, async ({ nome, id, pessoa }) => {
    await admin.from("perfis").update({ admin: true }).eq("id", pessoa.id);
    await avaliarComo(id, 1, "Conteúdo impróprio", "Bia Exemplo");
    await page.reload();
    await botao(page, nome).click();
    const apagar = lista(page).getByRole("button", { name: "Apagar a avaliação de Bia Exemplo" });
    await apagar.click();
    await page.keyboard.press("Escape");
    await expect(confirmacao(page)).toBeHidden();
    await expect(dialogo(page)).toBeVisible();
    expect(await noBanco(id)).toHaveLength(1);
    await apagar.click();
    await confirmacao(page).getByRole("button", { name: "Apagar" }).click();
    await expect(dialogo(page).getByText("Ainda sem avaliações")).toBeVisible();
    expect(await noBanco(id)).toEqual([]);
  });
});

test("texto com HTML aparece literal e não executa", async ({ page }) => {
  const html = '<img src=x onerror="window.__xss=1">';
  await comLocal(page, async ({ nome, id }) => {
    await avaliarComo(id, 3, html, html);
    await page.reload();
    await botao(page, nome).click();
    await expect(lista(page).getByText(html)).toHaveCount(2);
    await avaliar(page, 3, html);
    await expect(lista(page)).toHaveCount(2);
    await expect(lista(page).getByText(html)).toHaveCount(3);
    expect(await page.evaluate(() => window.__xss)).toBeUndefined();
    await expect(dialogo(page).locator("img")).toHaveCount(0);
  });
});

test("Esc e Fechar devolvem o foco ao botão", async ({ page }) => {
  await comLocal(page, async ({ nome }) => {
    for (const fechar of [() => page.keyboard.press("Escape"), () => dialogo(page).getByRole("button", { name: "Fechar" }).click()]) {
      await botao(page, nome).click();
      await expect(dialogo(page).getByLabel("Comentário")).toBeVisible();
      await fechar();
      await expect(dialogo(page)).toBeHidden();
      await expect(botao(page, nome)).toBeFocused();
    }
    await botao(page, nome).click();
    await avaliar(page, 5, "Bom");
    await expect(lista(page)).toHaveCount(1);
    await page.keyboard.press("Escape");
    await expect(botao(page, nome)).toBeFocused();
  });
});

test("sem nota ou só com espaços não salva; clique duplo salva uma vez", async ({ page, erros }) => {
  erros.permitir(/\/rest\/v1\/avaliacoes/, /400/);
  await comLocal(page, async ({ nome, id }) => {
    await botao(page, nome).click();
    await dialogo(page).getByLabel("Comentário").fill("Sem nota");
    await dialogo(page).getByRole("button", { name: "Salvar" }).click();
    expect(await dialogo(page).getByRole("radio").first().evaluate((radio) => radio.validity.valueMissing)).toBe(true);
    await avaliar(page, 3, "   ");
    await expect(aviso(page)).toHaveText("Confira os campos e tente de novo.");
    expect(await noBanco(id)).toEqual([]);
    await dialogo(page).getByLabel("Comentário").fill("Agora sim");
    await dialogo(page).getByRole("button", { name: "Salvar" }).dblclick();
    await expect(lista(page)).toHaveCount(1);
    await expect(aviso(page)).toHaveText("Avaliação salva.");
    expect(await noBanco(id)).toHaveLength(1);
  });
});

test("avaliada em outra aba, avisa em vez de duplicar", async ({ page, erros }) => {
  erros.permitir(/\/rest\/v1\/avaliacoes/, /409/);
  await comLocal(page, async ({ nome, id, pessoa }) => {
    await botao(page, nome).click();
    await expect(dialogo(page).getByLabel("Comentário")).toBeVisible();
    await admin.from("avaliacoes").insert({ local_id: id, autor_id: pessoa.id, nota: 1, comentario: "Outra aba" });
    await avaliar(page, 5, "Esta aba");
    await expect(aviso(page)).toHaveText("Você já avaliou este lugar. Feche e abra de novo para editar.");
    expect(await noBanco(id)).toEqual([{ autor_id: pessoa.id, nota: 1, comentario: "Outra aba" }]);
  });
});

test("resposta atrasada de um local não aparece em outro", async ({ page }) => {
  await comLocal(page, async ({ nomes, ids }) => {
    await avaliarComo(ids[0], 1, "Do primeiro");
    await avaliarComo(ids[1], 5, "Do segundo");
    await page.reload();
    let soltar;
    const espera = new Promise((pronto) => (soltar = pronto));
    await page.route(new RegExp(`/rest/v1/avaliacoes.*${ids[0]}`), async (rota) => {
      await espera;
      await rota.continue();
    });
    await botao(page, nomes[0]).click();
    await expect(aviso(page)).toHaveText("Carregando…");
    await page.keyboard.press("Escape");
    await botao(page, nomes[1]).click();
    await expect(lista(page)).toContainText(["Do segundo"]);
    const atrasada = page.waitForResponse((resposta) => resposta.url().includes(ids[0]) && resposta.url().includes("avaliacoes"));
    soltar();
    await atrasada;
    await page.waitForTimeout(200);
    await expect(lista(page)).toHaveCount(1);
    await expect(lista(page)).toContainText(["Do segundo"]);
    await expect(dialogo(page).getByRole("heading", { level: 2 })).toHaveText(nomes[1]);
  }, { total: 2 });
});

test("salvar devagar em um local não apaga o que se digita em outro", async ({ page }) => {
  await comLocal(page, async ({ nomes, ids }) => {
    let soltar;
    const espera = new Promise((pronto) => (soltar = pronto));
    await page.route(/\/rest\/v1\/avaliacoes/, async (rota) => {
      if (rota.request().method() === "POST") await espera;
      await rota.continue();
    });
    await botao(page, nomes[0]).click();
    await avaliar(page, 5, "Do primeiro");
    await page.keyboard.press("Escape");
    await botao(page, nomes[1]).click();
    await dialogo(page).getByLabel("Comentário").fill("Rascunho do segundo");
    soltar();
    await expect.poll(() => noBanco(ids[0])).toHaveLength(1);
    await expect(page.locator(`[data-local="${ids[0]}"] .resumo`)).toHaveText("Média 5,0 de 5, com 1 avaliação");
    await expect(dialogo(page).getByLabel("Comentário")).toHaveValue("Rascunho do segundo");
    await expect(aviso(page)).toBeHidden();
  }, { total: 2 });
});

test("sem rede ao abrir e ao salvar", async ({ page, erros }) => {
  erros.permitir(/\/rest\/v1\//, /ERR_FAILED/);
  const semRede = "Não foi possível conectar. Verifique sua internet e tente de novo.";
  await comLocal(page, async ({ nome, id }) => {
    await page.route(/\/rest\/v1\/avaliacoes/, (rota) => rota.abort());
    await botao(page, nome).click();
    await expect(aviso(page)).toHaveText(semRede);
    await expect(dialogo(page).getByLabel("Comentário")).toBeHidden();
    await page.keyboard.press("Escape");
    await page.unrouteAll();
    await botao(page, nome).click();
    await expect(dialogo(page).getByLabel("Comentário")).toBeVisible();
    await page.route(/\/rest\/v1\//, (rota) => rota.abort());
    await avaliar(page, 4, "Não perca isto");
    await expect(aviso(page)).toHaveText(semRede);
    await expect(dialogo(page).getByLabel("Comentário")).toHaveValue("Não perca isto");
    await page.unrouteAll();
    expect(await noBanco(id)).toEqual([]);
  });
});

test("visual das avaliações", async ({ page }) => {
  await comLocal(page, async ({ nome, id }) => {
    await botao(page, nome).click();
    await expect(dialogo(page).getByText("Ainda sem avaliações")).toBeVisible();
    await conferirPagina(page, "avaliacoes-vazio");
    await page.keyboard.press("Escape");
    await avaliarComo(id, 5, "Acervo enorme e gente atenciosa.", "Bia Exemplo");
    await avaliarComo(id, 1, "M".repeat(1000), "W".repeat(60));
    await botao(page, nome).click();
    await avaliar(page, 4, "Gostei muito do espaço de leitura.");
    await expect(lista(page)).toHaveCount(3);
    await conferirPagina(page, "avaliacoes");
    await dialogo(page).getByRole("button", { name: "Apagar" }).click();
    await conferirPagina(page, "avaliacoes-apagar");
  });
});
