import { readdirSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { sql } from "./supabase-local.mjs";

const CATALOGO = `
  select policyname from pg_policies where schemaname in ('public', 'storage')
  union select conname from pg_constraint where connamespace = 'public'::regnamespace and contype in ('c', 'u')
  union select c.relname from pg_index i join pg_class c on c.oid = i.indexrelid
    where c.relnamespace = 'public'::regnamespace and i.indisunique and not i.indisprimary
      and not exists (select 1 from pg_constraint k where k.conindid = i.indexrelid)
  union select t.tgname from pg_trigger t join pg_class c on c.oid = t.tgrelid
    where not t.tgisinternal and c.relnamespace = 'public'::regnamespace
  union select relname from pg_class where relnamespace = 'public'::regnamespace and relkind in ('v', 'm')
  union select proname from pg_proc where pronamespace in (select oid from pg_namespace where nspname in ('public', 'privado'))
  order by 1`;

// Descrição é um texto entre aspas simples no formato 'nome_do_objeto: o que prova'.
// Comentários e blocos $$...$$ são consumidos antes, para não contarem.
const PEDACOS = /--[^\n]*|\/\*[\s\S]*?\*\/|\$(\w*)\$[\s\S]*?\$\1\$|'((?:[^']|'')*)'/g;

export function semTeste(objetos, sql) {
  const testados = new Set();
  for (const [, , texto] of sql.matchAll(PEDACOS)) {
    const nome = texto?.match(/^(\w+):\s/)?.[1];
    if (nome) testados.add(nome);
  }
  return objetos.filter((objeto) => !testados.has(objeto));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const objetos = sql(CATALOGO);
  const pasta = new URL("../supabase/tests/", import.meta.url);
  const testes = readdirSync(pasta)
    .filter((nome) => nome.endsWith(".test.sql"))
    .map((nome) => readFileSync(new URL(nome, pasta), "utf8"))
    .join("\n");
  const faltam = semTeste(objetos, testes);
  if (faltam.length) {
    console.error(`Objetos do banco sem teste:\n${faltam.join("\n")}`);
    process.exit(1);
  }
  console.log(`Cobertura do banco: ${objetos.length} objetos, todos com teste.`);
}
