import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { test as base, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { chaves } from "../../scripts/supabase-local.mjs";

mkdirSync("e2e/telas", { recursive: true });

const { url, secreta } = chaves();
export const admin = createClient(url, secreta, { auth: { persistSession: false } });

const SEMPRE_PERMITIDO = [{ url: /\/(logo\.png|favicon\.ico)$/, erro: /404/ }];

// Junta os erros da página; `permitir` declara os que o teste provoca de propósito.
export function vigiar(page) {
  const erros = [];
  const permitidos = [...SEMPRE_PERMITIDO];
  page.on("pageerror", (erro) => erros.push({ url: page.url(), texto: erro.message }));
  page.on("console", (msg) => {
    if (msg.type() === "error") erros.push({ url: msg.location().url, texto: msg.text() });
  });
  return {
    permitir: (url, erro) => permitidos.push({ url, erro }),
    conferir: () =>
      expect(erros.filter((e) => !permitidos.some((p) => p.url.test(e.url) && p.erro.test(e.texto)))).toEqual([]),
  };
}

export const test = base.extend({
  erros: [
    async ({ page }, use) => {
      const vigia = vigiar(page);
      await use(vigia);
      vigia.conferir();
    },
    { auto: true },
  ],
});

export { expect };

export async function criarUsuario() {
  const email = `teste-${randomUUID()}@example.com`;
  const senha = "senha-boa-123";
  const { data, error } = await admin.auth.admin.createUser({ email, password: senha, email_confirm: true });
  if (error) throw error;
  return { id: data.user.id, email, senha };
}

export async function preencher(page, email, senha) {
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill(senha);
}

export async function entrar(page, usuario) {
  await page.goto("/");
  await preencher(page, usuario.email, usuario.senha);
  await page.locator("#enviar").click();
  await page.waitForURL((endereco) => endereco.pathname !== "/");
}

// O Chrome pode entregar um quadro antigo logo após mudar o tamanho: só vale a imagem que se repete.
async function capturar(page, caminho) {
  await page.evaluate(() => document.fonts.ready);
  let anterior = null;
  for (let tentativa = 0; tentativa < 10; tentativa++) {
    await page.waitForTimeout(200);
    const atual = await page.screenshot({ fullPage: true });
    if (anterior?.equals(atual)) return writeFileSync(caminho, atual);
    anterior = atual;
  }
  throw new Error(`A tela não estabilizou: ${caminho}`);
}

export async function conferirPagina(page, nome) {
  for (const [width, height] of [[1440, 900], [390, 844], [320, 640]]) {
    await page.setViewportSize({ width, height });
    await capturar(page, `e2e/telas/${nome}-${width}.png`);
    expect(await page.evaluate(() => document.documentElement.scrollWidth), `rolagem lateral em ${width}px`).toBeLessThanOrEqual(width);
    const { violations } = await new AxeBuilder({ page }).analyze();
    const graves = violations.filter(({ impact }) => impact === "serious" || impact === "critical");
    expect(graves.map(({ id, nodes }) => ({ id, alvos: nodes.map((n) => n.target) })), `axe em ${width}px`).toEqual([]);
  }
}
