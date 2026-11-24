import { execFileSync } from "node:child_process";

const raiz = new URL("..", import.meta.url);
let cache;

export function chaves() {
  if (cache) return cache;
  const saida = execFileSync("supabase", ["status", "-o", "env"], { cwd: raiz, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  const valor = (nome) => saida.match(new RegExp(`^${nome}="(.*)"$`, "m"))?.[1];
  cache = { url: valor("API_URL"), publicavel: valor("PUBLISHABLE_KEY"), secreta: valor("SECRET_KEY") };
  if (new URL(cache.url).hostname !== "127.0.0.1") throw new Error(`Supabase não é local: ${cache.url}`);
  return cache;
}

export async function esperar() {
  const { url, publicavel } = chaves();
  const limite = Date.now() + 30_000;
  for (const caminho of ["/auth/v1/health", "/rest/v1/"]) {
    while (true) {
      const resposta = await fetch(url + caminho, { headers: { apikey: publicavel } }).catch(() => null);
      if (resposta?.ok) break;
      if (Date.now() > limite) throw new Error(`Supabase local não respondeu em ${caminho}`);
      await new Promise((pronto) => setTimeout(pronto, 500));
    }
  }
}
