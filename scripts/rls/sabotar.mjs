// Auditoria do RLS: quebra uma regra por vez no banco local e exige que `testar:rls` perceba.
// Só o comportamento pela API conta; os testes de catálogo acusariam qualquer mudança.
// Uso: node scripts/rls/sabotar.mjs. Interrompido, retoma de onde parou. Sai com 1 se algo sobreviver.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { chaves, esperar, sql } from "../supabase-local.mjs";

// Mutações que não mudam nada pela API. A prova de cada uma está em docs/rls.md.
const LEITURA = "a API exige where, e a política de ler, com a mesma condição, já nega a linha alheia";
const EQUIVALENTES = {
  "amizades_apagar: qualquer pessoa logada": LEITURA,
  "notificacoes_alterar: qualquer pessoa logada": LEITURA,
  "notificacoes_apagar: qualquer pessoa logada": LEITURA,
  "avatares_apagar: qualquer pessoa logada": LEITURA,
};

const raiz = new URL("../../", import.meta.url);
const pasta = new URL("test-results/", raiz);
const arquivo = new URL("sabotar.json", pasta);
const rodar = (comando, args) => spawnSync(comando, args, { cwd: raiz, encoding: "utf8", timeout: 180_000, stdio: ["ignore", "pipe", "pipe"] });
const linhas = (consulta) => JSON.parse(sql(`select coalesce(json_agg(x), '[]') from (${consulta}) x`).join(""));

if (new URL(chaves().url).hostname !== "127.0.0.1") throw new Error("Só no banco local.");

function reiniciar() {
  const { status, stderr } = rodar("supabase", ["db", "reset", "--local"]);
  if (status !== 0) throw new Error(`reset falhou: ${stderr}`);
}

const POLITICAS = `select schemaname, tablename, policyname, permissive, cmd, roles::text, qual, with_check
  from pg_policies where schemaname in ('public', 'storage') order by 1, 2, 3`;
const FUNCOES = `select p.oid::regprocedure::text as nome, pg_get_functiondef(p.oid) as def, p.proacl::text as acl, p.prorettype::regtype::text as tipo
  from pg_proc p where pronamespace in ('public'::regnamespace, 'privado'::regnamespace) order by 1`;
const GRANTS = `select c.relname, x.privilege_type as priv, array_agg(a.attname::text order by a.attname) as colunas,
    (select count(*) from pg_attribute t where t.attrelid = c.oid and t.attnum > 0 and not t.attisdropped) = count(*) as todas
  from pg_class c join pg_attribute a on a.attrelid = c.oid, aclexplode(a.attacl) x
  where c.relnamespace = 'public'::regnamespace and x.grantee = 'authenticated'::regrole group by c.oid, 1, 2 order by 1, 2`;
const TABELAS = "select relname from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r' order by 1";
const ORDENADO = (acl) => `(select string_agg(x::text, ',' order by x::text) from unnest(${acl}) x)`;

// Tudo o que uma mutação poderia deixar para trás.
const fotografar = () => JSON.stringify([
  linhas(POLITICAS),
  linhas(FUNCOES),
  linhas(`select relname, relrowsecurity, relforcerowsecurity, reloptions, ${ORDENADO("relacl")} as acl from pg_class
    where relnamespace = 'public'::regnamespace and relkind in ('r', 'v') order by 1`),
  linhas(`select attrelid::regclass::text as t, attname, ${ORDENADO("attacl")} as acl from pg_attribute
    where attrelid in (select oid from pg_class where relnamespace = 'public'::regnamespace and relkind in ('r', 'v')) and attnum > 0 order by 1, 2`),
  linhas("select conname, pg_get_constraintdef(oid) as def from pg_constraint where connamespace = 'public'::regnamespace order by 1"),
  linhas("select tgname, tgenabled, pg_get_triggerdef(oid) as def from pg_trigger where not tgisinternal order by 1"),
]);

function mutacoes() {
  const lista = [];
  const por = (nome, quebrar, desfazer) => lista.push({ nome, quebrar, desfazer });
  const frouxa = "(select auth.uid()) is not null";
  for (const p of linhas(POLITICAS)) {
    const alvo = `${p.policyname} on ${p.schemaname}.${p.tablename}`;
    const corpo = (qual, check) => `${p.qual ? ` using (${qual})` : ""}${p.with_check ? ` with check (${check})` : ""}`;
    por(`${p.policyname}: qualquer pessoa logada`, `alter policy ${alvo}${corpo(frouxa, frouxa)}`, `alter policy ${alvo}${corpo(p.qual, p.with_check)}`);
    por(`${p.policyname}: removida`, `drop policy ${alvo}`,
      `create policy ${alvo} as ${p.permissive} for ${p.cmd} to ${p.roles.slice(1, -1)}${corpo(p.qual, p.with_check)}`);
  }
  for (const g of linhas(GRANTS)) {
    // Revogar da tabela também revoga das colunas; por isso o GRANT por coluna é refeito.
    por(`${g.relname}: GRANT de ${g.priv} na tabela inteira`, `grant ${g.priv} on public.${g.relname} to authenticated`,
      `revoke ${g.priv} on public.${g.relname} from authenticated; grant ${g.priv} (${g.colunas.join(", ")}) on public.${g.relname} to authenticated`);
    if (g.todas) EQUIVALENTES[lista.at(-1).nome] = "o GRANT por coluna já cobre todas as colunas";
  }
  for (const { relname } of linhas(TABELAS)) {
    por(`${relname}: RLS desligado`, `alter table public.${relname} disable row level security`, `alter table public.${relname} enable row level security`);
  }
  for (const f of linhas(FUNCOES).filter(({ tipo }) => tipo === "boolean")) {
    por(`${f.nome}: sempre true`, f.def.replace(/\$function\$[\s\S]*\$function\$/, "$$function$$ select true $$function$$"), f.def);
  }
  return lista;
}

// Uma falha que não seja de um teste da suíte (banco fora do ar, suíte que nem começou) não conta como detecção.
function atacar() {
  const { status, stdout, error } = rodar("node", ["--test", "--test-reporter=tap", "scripts/rls/atacar.mjs"]);
  if (error) throw error;
  const falhas = [...stdout.matchAll(/^ +not ok \d+ - (.*)$/gm)].map(([, nome]) => nome);
  if (status !== 0 && !falhas.length) throw new Error(`a suíte quebrou antes de testar:\n${stdout.slice(-2000)}`);
  return falhas;
}

const entrada = createHash("sha256");
const migracoes = new URL("supabase/migrations/", raiz);
for (const nome of readdirSync(migracoes).sort()) entrada.update(readFileSync(new URL(nome, migracoes)));
for (const nome of ["atacar.mjs", "matriz.mjs", "sabotar.mjs"]) entrada.update(readFileSync(new URL(nome, import.meta.url)));
const versao = entrada.digest("hex");

mkdirSync(pasta, { recursive: true });
let estado = existsSync(arquivo) ? JSON.parse(readFileSync(arquivo, "utf8")) : null;
const salvar = () => writeFileSync(arquivo, JSON.stringify(estado));
if (estado?.versao === versao) {
  // A interrupção pode ter caído antes da quebra, e a suíte órfã ainda pode estar segurando travas.
  for (let tentativa = 1; estado.desfazer && fotografar() !== estado.foto; tentativa++) {
    try {
      sql(estado.desfazer);
    } catch (erro) {
      if (tentativa === 10) throw erro;
      await new Promise((pronto) => setTimeout(pronto, 3000));
    }
  }
  console.log(`retomando: ${Object.keys(estado.feitas).length} já feitas`);
} else {
  reiniciar();
  estado = { versao, foto: fotografar(), feitas: {} };
}
estado.desfazer = null;
salvar();
await esperar();
if (fotografar() !== estado.foto) throw new Error("O catálogo não é o do início. Apague test-results/sabotar.json e recomece.");

const lista = mutacoes();
const controle = lista.find(({ nome }) => nome.startsWith("perfis_ler"));
sql(controle.desfazer); // reescreve a política igual: só o DDL, sem mudar a regra
const ruido = atacar();
if (ruido.length) throw new Error(`Sem sabotagem a suíte já falha: ${ruido.join("; ")}`);
console.log(`controle: suíte verde. ${lista.length} mutações.`);

for (const { nome, quebrar, desfazer } of lista) {
  if (nome in estado.feitas) continue;
  estado.desfazer = desfazer;
  salvar();
  sql(quebrar);
  let falhas;
  try {
    falhas = atacar();
  } finally {
    sql(desfazer);
  }
  if (fotografar() !== estado.foto) throw new Error(`O catálogo não voltou depois de: ${nome}`);
  estado.desfazer = null;
  estado.feitas[nome] = falhas;
  salvar();
  console.log(`${falhas.length ? "detectada" : nome in EQUIVALENTES ? "equivalente" : "SOBREVIVEU"} | ${nome} | ${falhas[0] ?? EQUIVALENTES[nome] ?? ""}`);
}

const nomes = lista.map(({ nome }) => nome);
const sobreviventes = nomes.filter((nome) => !estado.feitas[nome].length && !(nome in EQUIVALENTES));
const vencidas = Object.keys(EQUIVALENTES).filter((nome) => estado.feitas[nome]?.length !== 0);
reiniciar();
rmSync(arquivo);
console.log(`${nomes.length} mutações: ${nomes.filter((nome) => estado.feitas[nome].length).length} detectadas, ${Object.keys(EQUIVALENTES).length} equivalentes, ${sobreviventes.length} sobreviventes.`);
for (const nome of sobreviventes) console.error(`sobreviveu: ${nome}`);
for (const nome of vencidas) console.error(`já não é equivalente (ou não existe mais): ${nome}`);
process.exit(sobreviventes.length || vencidas.length ? 1 : 0);
