// Envia as listas de dados/*.json ao banco. Cria o que falta e atualiza o que mudou; nunca apaga.
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { chaves } from "./supabase-local.mjs";

const REDE = /^[A-Za-z0-9_.-]{1,50}$/;
const rede = (valor) => valor == null || (typeof valor === "string" && REDE.test(valor));
const texto = (maximo) => (valor) => typeof valor === "string" && /\S/.test(valor) && [...valor].length <= maximo;

const LOCAL = { nome: texto(120), localizacao: texto(200) };
// Os mesmos limites do banco. A chave diz o que torna o item único na lista.
const LISTAS = {
  bibliotecas: { campos: LOCAL, chave: ({ nome, localizacao }) => JSON.stringify([nome, localizacao]) },
  sebos: { campos: LOCAL, chave: ({ nome, localizacao }) => JSON.stringify([nome, localizacao]) },
  influenciadores: {
    campos: { nome: texto(80), foto: (valor) => valor == null || /^[A-Za-z0-9_-]{1,80}\.(jpg|png|webp)$/.test(valor), instagram: rede, youtube: rede, tiktok: rede },
    chave: ({ nome }) => nome,
    umaDe: ["instagram", "youtube", "tiktok"],
  },
};

export function lerDados() {
  return Object.fromEntries(Object.keys(LISTAS).map((nome) => [nome, JSON.parse(readFileSync(new URL(`../dados/${nome}.json`, import.meta.url), "utf8"))]));
}

export function validar(dados) {
  const erros = [];
  for (const [lista, { campos, chave, umaDe }] of Object.entries(LISTAS)) {
    if (!Array.isArray(dados[lista])) {
      erros.push(`${lista}.json: precisa ser uma lista`);
      continue;
    }
    const vistos = new Set();
    dados[lista].forEach((item, i) => {
      const acusar = (problema) => erros.push(`${lista}.json, item ${i + 1}: ${problema}`);
      if (item === null || typeof item !== "object") return acusar("precisa ser um objeto");
      for (const [campo, aceita] of Object.entries(campos)) if (!aceita(item[campo])) acusar(`${campo} inválido`);
      for (const campo of Object.keys(item)) if (!Object.hasOwn(campos, campo)) acusar(`campo desconhecido: ${campo}`);
      if (umaDe?.every((campo) => item[campo] == null)) acusar("precisa de ao menos uma rede");
      if (vistos.has(chave(item))) acusar("repetido");
      vistos.add(chave(item));
    });
  }
  return erros;
}

export async function importar(cliente, dados) {
  const erros = validar(dados);
  if (erros.length) throw new Error(erros.join("\n"));

  const local = (tipo) => ({ nome, localizacao }) => ({ tipo, nome, localizacao });
  const influenciador = ({ nome, foto = null, instagram = null, youtube = null, tiktok = null }) => ({ nome, foto, instagram, youtube, tiktok });
  const locais = [...dados.bibliotecas.map(local("biblioteca")), ...dados.sebos.map(local("sebo"))];
  const influenciadores = dados.influenciadores.map(influenciador);

  for (const [tabela, linhas, onConflict] of [["locais", locais, "tipo,nome,localizacao"], ["influenciadores", influenciadores, "nome"]]) {
    const { error } = await cliente.from(tabela).upsert(linhas, { onConflict });
    if (error) throw new Error(`${tabela}: ${error.message}`);
  }
  return { locais: locais.length, influenciadores: influenciadores.length };
}

export function destino(argumentos, { SUPABASE_URL: url, SUPABASE_SECRET_KEY: secreta }, local = chaves) {
  const producao = argumentos.includes("--producao");
  if (!url && !secreta && !producao) {
    const padrao = local();
    return { url: padrao.url, secreta: padrao.secreta };
  }
  if (!url) throw new Error("Defina SUPABASE_URL.");
  if (!secreta) throw new Error("Defina SUPABASE_SECRET_KEY.");
  if (!["127.0.0.1", "localhost"].includes(new URL(url).hostname) && !producao) {
    throw new Error(`${new URL(url).hostname} não é local. Para importar lá, use --producao.`);
  }
  return { url, secreta };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const { url, secreta } = destino(process.argv.slice(2), process.env);
    const total = await importar(createClient(url, secreta, { auth: { persistSession: false } }), lerDados());
    console.log(`Importados em ${new URL(url).hostname}: ${total.locais} locais e ${total.influenciadores} influenciadores.`);
  } catch (erro) {
    console.error(erro.message);
    process.exit(1);
  }
}
