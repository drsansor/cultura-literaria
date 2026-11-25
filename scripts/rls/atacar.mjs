import assert from "node:assert/strict";
import { after, describe, test } from "node:test";
import { createClient } from "@supabase/supabase-js";
import { chaves, esperar, sql } from "../supabase-local.mjs";
import { funcoes, tabelas, views } from "./matriz.mjs";

await esperar();
const { url, publicavel, secreta } = chaves();
const opcoes = { auth: { persistSession: false, autoRefreshToken: false } };
const servico = createClient(url, secreta, opcoes);
const criados = [];

async function ator(nome, perfil) {
  const email = `rls-${nome}-${crypto.randomUUID()}@example.com`;
  const password = "senha-boa-123";
  const { data, error } = await servico.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  criados.push(data.user.id);
  if (perfil) {
    const usuario = `${nome.toLowerCase()}_${crypto.randomUUID().slice(0, 8)}`;
    const resposta = await servico.from("perfis").insert({ id: data.user.id, nome, usuario, ...perfil });
    if (resposta.error) throw resposta.error;
  }
  const cliente = createClient(url, publicavel, opcoes);
  const entrada = await cliente.auth.signInWithPassword({ email, password });
  if (entrada.error) throw entrada.error;
  return { id: data.user.id, cliente };
}

const ctx = {
  servico,
  lixo: [], // linhas semeadas, apagadas no fim
  anon: { cliente: createClient(url, publicavel, opcoes) },
  semPerfil: await ator("semPerfil"),
  ana: await ator("ana", {}),
  bia: await ator("bia", {}),
  caio: await ator("caio", {}),
  admin: await ator("admin", { admin: true }),
  excluida: await ator("excluida", {}),
};
// O token da conta excluída continua válido até expirar: não pode servir para nada.
const exclusao = await servico.auth.admin.deleteUser(ctx.excluida.id);
if (exclusao.error) throw exclusao.error;

// Semeia na ordem da matriz (uma tabela usa as linhas da anterior) e antes de registrar qualquer teste:
// um await depois disso deixaria o `after` rodar cedo demais.
const chavesSemeadas = {};
for (const [nome, regra] of Object.entries(tabelas)) {
  chavesSemeadas[nome] = await regra.semear(ctx);
}
// [tabela que aponta, tabela apontada, nome da FK], só entre tabelas de public.
const relacoes = sql(`select conrelid::regclass || '|' || confrelid::regclass || '|' || conname from pg_constraint
  where contype = 'f' and connamespace = 'public'::regnamespace and confrelid in (select oid from pg_class where relnamespace = 'public'::regnamespace)`)
  .map((linha) => linha.split("|").map((texto) => texto.replace(/^public\./, "")));


after(async () => {
  for (const [nome, chave] of ctx.lixo.reverse()) await servico.from(nome).delete().match(chave);
  for (const id of criados) await servico.auth.admin.deleteUser(id);
});

const codigo = ({ error }) => error?.code ?? null;
const negado = (resposta, aviso) => assert.equal(codigo(resposta), "42501", `${aviso}: ${JSON.stringify(resposta.error ?? resposta.data)}`);
const permitido = (resposta, aviso) => assert.equal(resposta.error, null, `${aviso}: ${JSON.stringify(resposta.error)}`);
const colunasDe = (nome) => sql(`select column_name from information_schema.columns where table_schema = 'public' and table_name = '${nome}' order by ordinal_position`);

test("tudo que está exposto em public está na matriz", () => {
  assert.deepEqual(sql("select relname from pg_class where relnamespace = 'public'::regnamespace and relkind in ('r', 'p', 'f') order by 1"), Object.keys(tabelas).sort());
  assert.deepEqual(sql("select relname from pg_class where relnamespace = 'public'::regnamespace and relkind in ('v', 'm') order by 1"), Object.keys(views).sort());
  assert.deepEqual(
    sql("select distinct proname from pg_proc where pronamespace = 'public'::regnamespace and prorettype <> 'trigger'::regtype order by 1"),
    Object.keys(funcoes).sort(),
  );
});

for (const [nome, regra] of Object.entries(tabelas)) {
  describe(nome, () => {
    const colunas = colunasDe(nome);
    const chave = chavesSemeadas[nome];
    const campos = Object.keys(chave.bia);
    const em = (consulta, onde) => consulta.match(onde);
    const de = (quem) => ctx[quem].cliente.from(nome);
    const tudo = (consulta) => consulta.not(campos[0], "is", null);
    const real = async (onde) => (await em(servico.from(nome).select("*"), onde)).data;
    const proibidas = (lista) => colunas.filter((coluna) => !lista.includes(coluna));

    test("a matriz só cita colunas que existem", () => {
      for (const coluna of [...regra.ler, ...regra.inserir, ...regra.alterar]) assert.ok(colunas.includes(coluna), coluna);
    });

    test("anon não faz nada", async () => {
      const antes = await real(chave.bia);
      for (const coluna of colunas) negado(await de("anon").select(coluna), `ler ${coluna}`);
      negado(await de("anon").insert(regra.nova?.(ctx, "ana") ?? {}), "inserir");
      for (const coluna of colunas) negado(await tudo(de("anon").update({ [coluna]: null })), `alterar ${coluna}`);
      negado(await tudo(de("anon").delete()), "apagar");
      assert.deepEqual(await real(chave.bia), antes);
    });

    test("lê só as colunas permitidas", async () => {
      for (const coluna of regra.ler) permitido(await de("ana").select(coluna).limit(1), `ler ${coluna}`);
      for (const coluna of proibidas(regra.ler)) {
        negado(await de("ana").select(coluna).limit(1), `ler ${coluna}`);
        negado(await de("ana").select(campos[0]).not(coluna, "is", null), `filtrar por ${coluna}`);
        negado(await de("ana").select(campos[0]).order(coluna), `ordenar por ${coluna}`);
      }
      const asterisco = await de("ana").select("*").limit(1);
      if (proibidas(regra.ler).length) negado(asterisco, "select *");
      else permitido(asterisco, "select *");
    });

    test("quem lê o quê", async () => {
      const vistas = async (quem, onde) => (await em(de(quem).select(campos.join()), onde)).data?.length;
      assert.equal(await vistas("ana", chave.ana), 1, "ana lê o seu");
      assert.equal(await vistas("ana", chave.bia), regra.alheioVisivel === false ? 0 : 1, "ana e o de bia");
      assert.equal(await vistas("admin", chave.bia), regra.alheioVisivel === false ? 0 : 1, "admin e o de bia");
      for (const quem of ["semPerfil", "excluida"]) {
        const resposta = await de(quem).select(campos.join());
        permitido(resposta, quem);
        assert.deepEqual(resposta.data, [], `${quem} não lê nada`);
      }
    });

    test("relacionamento não mostra o que a leitura direta nega", async () => {
      for (const [de_, para, fk] of relacoes) {
        const outra = de_ === nome ? para : para === nome ? de_ : null;
        if (!outra) continue;
        for (const coluna of colunasDe(outra)) {
          const resposta = await de("ana").select(`${campos[0]}, ${outra}!${fk}(${coluna})`).limit(1);
          if (tabelas[outra].ler.includes(coluna)) permitido(resposta, `${outra}.${coluna}`);
          else negado(resposta, `${outra}.${coluna}`);
        }
        for (const quem of ["semPerfil", "excluida"]) {
          const resposta = await de(quem).select(`${campos[0]}, ${outra}!${fk}(${tabelas[outra].ler[0]})`);
          assert.deepEqual(resposta.data, [], `${quem} lê ${outra}`);
        }
        negado(await de("anon").select(`${campos[0]}, ${outra}!${fk}(${tabelas[outra].ler[0]})`), `anon lê ${outra}`);
      }
    });

    test("não forja coluna ao inserir", async () => {
      const base = regra.nova?.(ctx, regra.semPerfilInsere ? "semPerfil" : "ana") ?? {};
      const quem = regra.semPerfilInsere ? "semPerfil" : "ana";
      for (const coluna of proibidas(regra.inserir)) negado(await de(quem).insert({ ...base, [coluna]: null }), `inserir ${coluna}`);
      if (!regra.inserir.length) negado(await de(quem).insert({}), "inserir vazio");
    });

    test("não insere em nome de outra pessoa", async () => {
      for (const linha of regra.emNomeDeOutro?.(ctx) ?? []) negado(await de("ana").insert(linha), JSON.stringify(linha));
    });

    test("não sobrescreve o alheio com upsert", async () => {
      const antes = await real(chave.bia);
      const alheia = { ...(regra.nova?.(ctx, "ana") ?? {}), ...chave.bia };
      for (const quem of ["ana", "semPerfil", "excluida"]) {
        const resposta = await de(quem).upsert(alheia);
        assert.notEqual(resposta.error, null, `${quem} fez upsert sobre a linha de bia`);
      }
      assert.deepEqual(await real(chave.bia), antes);
    });

    test("não altera coluna proibida, nem na própria linha", async () => {
      const antes = await real(chave.ana);
      for (const coluna of proibidas(regra.alterar)) negado(await em(de("ana").update({ [coluna]: null }), chave.ana), `alterar ${coluna}`);
      assert.deepEqual(await real(chave.ana), antes);
    });

    test("só o dono altera", async () => {
      if (!regra.alterar.length) return;
      // Antes dos ataques: aceitar amizade só vale uma vez, e o ataque em massa também alcança a linha de ana.
      const propria = await em(de("ana").update(regra.mudanca), chave.ana).select(campos.join());
      permitido(propria, "ana altera a sua");
      assert.equal(propria.data.length, 1);
      const antes = await real(chave.bia);
      for (const quem of ["ana", "admin", "semPerfil", "excluida"]) {
        await em(de(quem).update(regra.mudanca), chave.bia);
        await tudo(de(quem).update(regra.mudanca));
        assert.deepEqual(await real(chave.bia), antes, `${quem} alterou a linha de bia`);
      }
    });

    test("quem não tem perfil não insere", async () => {
      if (regra.semPerfilInsere) return;
      for (const quem of ["semPerfil", "excluida"]) {
        const resposta = await de(quem).insert(regra.nova?.(ctx, quem) ?? {});
        assert.notEqual(resposta.error, null, `${quem} inseriu`);
      }
    });

    test("a conta excluída não volta a existir", async () => {
      if (!regra.semPerfilInsere) return;
      const resposta = await de("excluida").insert(regra.nova(ctx, "excluida"));
      assert.equal(codigo(resposta), "23503");
    });

    test("só quem pode insere o seu", async () => {
      if (!regra.inserir.length) return;
      const quem = regra.semPerfilInsere ? "semPerfilDois" : "ana";
      if (regra.semPerfilInsere) ctx.semPerfilDois ??= await ator("semPerfilDois");
      permitido(await de(quem).insert(regra.nova(ctx, quem)), `${quem} insere`);
    });

    for (const [titulo, ataque] of Object.entries(regra.extras ?? {})) test(titulo, () => ataque(ctx, { de, real, chave, negado, permitido }));

    test("apagar", async () => {
      const antes = await real(chave.bia);
      for (const quem of ["ana", "semPerfil", "excluida", ...(regra.apagar === "dono e admin" ? [] : ["admin"])]) {
        const resposta = await em(de(quem).delete(), chave.bia);
        const massa = quem === "ana" && regra.apagar !== "ninguem" ? null : await tudo(de(quem).delete());
        if (regra.apagar === "ninguem") {
          negado(resposta, `${quem} apaga o de bia`);
          negado(massa, `${quem} apaga tudo`);
        }
        assert.deepEqual(await real(chave.bia), antes, `${quem} apagou a linha de bia`);
      }
      if (regra.apagar === "ninguem") {
        negado(await em(de("ana").delete(), chave.ana), "ana apaga a sua");
        assert.equal((await real(chave.ana)).length, 1);
        return;
      }
      // Em massa, ana alcança só o que é dela.
      permitido(await tudo(de("ana").delete()), "ana apaga em massa");
      assert.equal((await real(chave.ana)).length, 0, "ana apagou a sua");
      assert.deepEqual(await real(chave.bia), antes, "ana em massa não alcança bia");
      if (regra.apagar === "dono e admin") {
        permitido(await em(de("admin").delete(), chave.bia), "admin apaga");
        assert.equal((await real(chave.bia)).length, 0, "admin apagou a de bia");
      }
    });
  });
}

for (const [nome, regra] of Object.entries(views)) {
  describe(nome, () => {
    const de = (quem) => ctx[quem].cliente.from(nome);
    test("só leitura, só para quem tem perfil", async () => {
      assert.deepEqual(colunasDe(nome), regra.ler);
      const resposta = await de("ana").select("*");
      permitido(resposta, "ana lê");
      assert.notEqual(resposta.data.length, 0);
      for (const quem of ["semPerfil", "excluida"]) assert.deepEqual((await de(quem).select("*")).data, [], quem);
      for (const coluna of regra.ler) negado(await de("anon").select(coluna), `anon lê ${coluna}`);
      for (const quem of ["anon", "ana", "admin"]) {
        for (const [acao, consulta] of [
          ["inserir", de(quem).insert({ [regra.ler[1]]: "x" })],
          ["alterar", de(quem).update({ [regra.ler[2]]: "x" }).not("id", "is", null)],
          ["apagar", de(quem).delete().not("id", "is", null)],
        ]) {
          assert.notEqual((await consulta).error, null, `${quem} conseguiu ${acao}`);
        }
      }
    });
  });
}

describe("funções", () => {
  for (const [nome, esperado] of Object.entries(funcoes)) {
    for (const [quem, valor] of Object.entries(esperado)) {
      test(`${nome} como ${quem}`, async () => {
        const resposta = await ctx[quem].cliente.rpc(nome);
        if (valor?.erro) return assert.equal(codigo(resposta), valor.erro);
        permitido(resposta, nome);
        assert.deepEqual(resposta.data, valor);
      });
    }
  }

  test("a API só expõe o schema public", async () => {
    for (const schema of ["privado", "auth", "storage", "testes", "graphql_public"]) {
      const resposta = await ctx.ana.cliente.schema(schema).from("users").select("*");
      assert.equal(codigo(resposta), "PGRST106", schema);
    }
    assert.equal(codigo(await ctx.ana.cliente.schema("privado").rpc("eh_admin")), "PGRST106");
  });
});

describe("excluir conta", () => {
  test("apaga só a própria conta, e o token antigo não serve para mais nada", async () => {
    const dora = await ator("dora", {});
    const lista = async (nome, coluna, id) => (await servico.from(nome).select("*").eq(coluna, id)).data.length;
    const { data: grupo } = await dora.cliente.from("grupos").insert({ nome: `Da dora ${dora.id}`, criador_id: dora.id }).select("id").single();
    const { data: publicacao } = await dora.cliente.from("publicacoes").insert({ autor_id: dora.id, grupo_id: grupo.id, texto: "Oi" }).select("id").single();
    permitido(await dora.cliente.from("comentarios").insert({ publicacao_id: publicacao.id, autor_id: dora.id, texto: "Oi" }), "dora comenta");
    permitido(await dora.cliente.from("amizades").insert({ solicitante_id: dora.id, destinatario_id: ctx.bia.id }), "dora pede");
    const bia = async () => (await servico.from("perfis").select("*").eq("id", ctx.bia.id)).data;
    const antes = await bia();

    // Um id por parâmetro não pode existir, nem apagar outra pessoa.
    for (const nome of ["id", "pessoa", "usuario", "perfil_id"]) {
      assert.equal(codigo(await dora.cliente.rpc("excluir_minha_conta", { [nome]: ctx.bia.id })), "PGRST202", nome);
    }
    negado(await ctx.anon.cliente.rpc("excluir_minha_conta"), "anon");
    assert.deepEqual(await bia(), antes);
    assert.equal(await lista("perfis", "id", dora.id), 1);

    permitido(await dora.cliente.rpc("excluir_minha_conta"), "dora apaga a sua");
    for (const [nome, coluna] of [["perfis", "id"], ["grupos", "criador_id"], ["grupo_membros", "perfil_id"], ["publicacoes", "autor_id"],
      ["comentarios", "autor_id"], ["amizades", "solicitante_id"], ["notificacoes", "de_id"]]) {
      assert.equal(await lista(nome, coluna, dora.id), 0, `${nome} de dora`);
    }
    assert.notEqual((await servico.auth.admin.getUserById(dora.id)).error, null, "o usuário sumiu");
    assert.deepEqual(await bia(), antes, "bia continua");

    for (const nome of [...Object.keys(tabelas), ...Object.keys(views)]) {
      const regra = tabelas[nome] ?? views[nome];
      assert.deepEqual((await dora.cliente.from(nome).select(regra.ler.join())).data, [], `token antigo lê ${nome}`);
    }
    for (const [nome, linha] of [["perfis", { id: dora.id, nome: "Volta", usuario: `volta_${dora.id.slice(0, 8)}` }],
      ["publicacoes", { autor_id: dora.id, texto: "Oi" }], ["grupos", { nome: `Volta ${dora.id}`, criador_id: dora.id }],
      ["amizades", { solicitante_id: dora.id, destinatario_id: ctx.bia.id }]]) {
      assert.notEqual((await dora.cliente.from(nome).insert(linha)).error, null, `token antigo grava em ${nome}`);
    }
    permitido(await dora.cliente.rpc("excluir_minha_conta"), "repetir não falha");
    assert.deepEqual(await bia(), antes, "repetir não apaga ninguém");
  });

  test("quem não tem perfil também apaga só a sua", async () => {
    const novato = await ator("novato");
    permitido(await novato.cliente.rpc("excluir_minha_conta"), "novato apaga a sua");
    assert.notEqual((await servico.auth.admin.getUserById(novato.id)).error, null);
    permitido(await servico.auth.admin.getUserById(ctx.semPerfil.id), "outra sem perfil continua");
  });
});

describe("storage avatares", () => {
  const png = new Blob([Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10])], { type: "image/png" });
  const pasta = (quem) => ctx[quem].cliente.storage.from("avatares");
  const existe = async (caminho) => (await servico.storage.from("avatares").download(caminho)).error === null;
  const arquivo = (quem) => `${ctx[quem].id}/foto.png`;
  const recusado = (resposta, aviso) => assert.notEqual(resposta.error, null, `${aviso} foi aceito: ${JSON.stringify(resposta.data)}`);

  after(async () => {
    for (const id of criados) {
      const { data } = await servico.storage.from("avatares").list(id);
      if (data?.length) await servico.storage.from("avatares").remove(data.map(({ name }) => `${id}/${name}`));
    }
  });

  test("cada pessoa envia só na própria pasta", async () => {
    for (const quem of ["ana", "bia"]) permitido(await pasta(quem).upload(arquivo(quem), png), `${quem} envia`);
    for (const caminho of [`${ctx.bia.id}/x.png`, "x.png", `../${ctx.bia.id}/x.png`, `${ctx.ana.id}/../${ctx.bia.id}/x.png`, `/${ctx.bia.id}/x.png`, `${ctx.bia.id}//x.png`]) {
      recusado(await pasta("ana").upload(caminho, png), caminho);
    }
    assert.equal(await existe(`${ctx.bia.id}/x.png`), false);
  });

  test("quem não tem perfil, foi excluído ou é anônimo não envia", async () => {
    for (const quem of ["semPerfil", "excluida"]) recusado(await pasta(quem).upload(arquivo(quem), png), quem);
    recusado(await pasta("anon").upload(`${ctx.ana.id}/anon.png`, png), "anon");
  });

  test("só imagem, até 2 MB e só no bucket certo", async () => {
    const enviar = (tipo, tamanho = 8) => pasta("ana").upload(`${ctx.ana.id}/${crypto.randomUUID()}`, new Blob([new Uint8Array(tamanho)], { type: tipo }));
    for (const tipo of ["text/html", "image/svg+xml", "application/javascript", "image/gif"]) recusado(await enviar(tipo), tipo);
    recusado(await enviar("image/png", 2097153), "acima de 2 MB");
    permitido(await enviar("image/png", 2097152), "exatamente 2 MB");
    recusado(await ctx.ana.cliente.storage.from("outro").upload(arquivo("ana"), png), "outro bucket");
    recusado(await ctx.ana.cliente.storage.createBucket("meu"), "criar bucket");
    assert.deepEqual((await ctx.ana.cliente.storage.listBuckets()).data, []);
  });

  test("ninguém substitui, move ou copia", async () => {
    recusado(await pasta("ana").upload(arquivo("ana"), png, { upsert: true }), "substituir a própria");
    recusado(await pasta("ana").upload(arquivo("bia"), png, { upsert: true }), "substituir a alheia");
    recusado(await pasta("ana").update(arquivo("bia"), png), "atualizar a alheia");
    recusado(await pasta("ana").move(arquivo("ana"), `${ctx.bia.id}/movida.png`), "mover para pasta alheia");
    recusado(await pasta("ana").copy(arquivo("ana"), `${ctx.bia.id}/copia.png`), "copiar para pasta alheia");
    recusado(await pasta("ana").move(arquivo("bia"), `${ctx.ana.id}/roubada.png`), "mover a alheia");
    recusado(await pasta("ana").createSignedUploadUrl(`${ctx.bia.id}/assinada.png`), "assinar envio em pasta alheia");
    assert.equal(await existe(arquivo("bia")), true);
  });

  test("outro bucket não herda as regras do avatares", async () => {
    const outro = `outro-${crypto.randomUUID()}`;
    permitido(await servico.storage.createBucket(outro), "criar bucket vizinho");
    try {
      permitido(await servico.storage.from(outro).upload(arquivo("ana"), png), "semear vizinho");
      const vizinho = ctx.ana.cliente.storage.from(outro);
      assert.deepEqual((await vizinho.list(ctx.ana.id)).data ?? [], []);
      recusado(await vizinho.download(arquivo("ana")), "baixar do vizinho");
      recusado(await vizinho.upload(`${ctx.ana.id}/x.png`, png), "enviar ao vizinho");
      await vizinho.remove([arquivo("ana")]);
      permitido(await servico.storage.from(outro).download(arquivo("ana")), "o vizinho continua");
    } finally {
      await servico.storage.emptyBucket(outro);
      await servico.storage.deleteBucket(outro);
    }
  });

  test("sem perfil não lista nem apaga nem o que está na sua pasta", async () => {
    for (const quem of ["semPerfil", "excluida"]) {
      permitido(await servico.storage.from("avatares").upload(arquivo(quem), png), `semear ${quem}`);
      assert.deepEqual((await pasta(quem).list(ctx[quem].id)).data ?? [], [], `${quem} lista`);
      await pasta(quem).remove([arquivo(quem)]);
      assert.equal(await existe(arquivo(quem)), true, `${quem} apagou`);
    }
  });

  test("cada pessoa lista e apaga só o seu", async () => {
    for (const quem of ["ana", "semPerfil", "excluida", "anon"]) {
      assert.deepEqual((await pasta(quem).list(ctx.bia.id)).data ?? [], [], `${quem} lista bia`);
      await pasta(quem).remove([arquivo("bia")]);
      assert.equal(await existe(arquivo("bia")), true, `${quem} apagou a foto de bia`);
    }
    assert.deepEqual((await pasta("ana").list()).data.map(({ name }) => name), [ctx.ana.id], "a raiz só mostra a própria pasta");
    permitido(await pasta("bia").remove([arquivo("bia")]), "bia apaga a sua");
    assert.equal(await existe(arquivo("bia")), false);
  });
});
