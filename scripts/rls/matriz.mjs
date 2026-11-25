// A matriz da especificação como dados. `atacar.mjs` percorre tudo com logins reais pela API.
//
// ler/inserir/alterar: as ÚNICAS colunas permitidas. O que não está aqui tem de ser negado.
// semear(ctx): cria com a chave secreta as linhas de ana e bia e devolve a chave de cada uma.
// nova(ctx, quem): linha válida para `quem` inserir. emNomeDeOutro(ctx): linhas que ana não pode inserir.
// mudanca: alteração válida para o dono. apagar: quem apaga ("ninguem", "dono", "dono e admin").

import assert from "node:assert/strict";

const uuid = () => crypto.randomUUID();
const apelido = () => `t_${uuid().replaceAll("-", "").slice(0, 20)}`;

const local = () => ({ tipo: "sebo", nome: `Local ${uuid()}`, localizacao: "Rua de teste" });
const influenciador = () => ({ nome: `Influenciador ${uuid()}`, instagram: "teste" });
const avaliacao = (local_id, { id }) => ({ local_id, autor_id: id, nota: 4, comentario: "Bom" });
const grupo = ({ id }) => ({ nome: `Grupo ${uuid()}`, descricao: "Teste", criador_id: id });
const membro = (grupo_id, { id }) => ({ grupo_id, perfil_id: id });
const publicacao = ({ id }, grupo_id = null) => ({ autor_id: id, grupo_id, texto: "Olá", livro_titulo: "Livro", livro_autor: "Autora" });
const comentario = (publicacao_id, { id }) => ({ publicacao_id, autor_id: id, texto: "Oi" });

async function criar(ctx, tabela, linhas) {
  const { data, error } = await ctx.servico.from(tabela).insert(linhas).select("*");
  if (error) throw error;
  // Sem id (grupo_membros), a linha some junto com o grupo.
  for (const { id } of data) if (id) ctx.lixo.push([tabela, { id }]);
  return data;
}

export const tabelas = {
  perfis: {
    ler: ["id", "nome", "usuario", "foto_path", "criado_em"],
    inserir: ["id", "nome", "usuario"],
    alterar: ["nome", "usuario", "foto_path"],
    apagar: "ninguem",
    semear: async (ctx) => ({ ana: { id: ctx.ana.id }, bia: { id: ctx.bia.id } }),
    nova: (ctx, quem) => ({ id: ctx[quem].id, nome: "Nova", usuario: apelido() }),
    emNomeDeOutro: (ctx) => [
      { id: ctx.semPerfil.id, nome: "Intruso", usuario: apelido() },
      { id: uuid(), nome: "Fantasma", usuario: apelido() },
    ],
    mudanca: { nome: "Mudado" },
    // Criar o próprio perfil é o único caso em que quem não tem perfil escreve.
    semPerfilInsere: true,
  },

  locais: {
    ler: ["id", "tipo", "nome", "localizacao", "criado_em"],
    inserir: [],
    alterar: [],
    apagar: "ninguem",
    semear: async (ctx) => {
      const [ana, bia, livre] = await criar(ctx, "locais", [local(), local(), local()]);
      ctx.local = ana.id;
      ctx.localLivre = livre.id;
      return { ana: { id: ana.id }, bia: { id: bia.id } };
    },
    nova: () => local(),
  },

  influenciadores: {
    ler: ["id", "nome", "foto", "instagram", "youtube", "tiktok", "criado_em"],
    inserir: [],
    alterar: [],
    apagar: "ninguem",
    semear: async (ctx) => {
      const [ana, bia] = await criar(ctx, "influenciadores", [influenciador(), influenciador()]);
      return { ana: { id: ana.id }, bia: { id: bia.id } };
    },
    nova: () => influenciador(),
  },

  avaliacoes: {
    ler: ["id", "local_id", "autor_id", "nota", "comentario", "criado_em"],
    inserir: ["local_id", "autor_id", "nota", "comentario"],
    alterar: ["nota", "comentario"],
    apagar: "dono e admin",
    semear: async (ctx) => {
      const [ana, bia] = await criar(ctx, "avaliacoes", [avaliacao(ctx.local, ctx.ana), avaliacao(ctx.local, ctx.bia)]);
      return { ana: { id: ana.id }, bia: { id: bia.id } };
    },
    nova: (ctx, quem) => avaliacao(ctx.localLivre, ctx[quem]),
    emNomeDeOutro: (ctx) => [avaliacao(ctx.localLivre, ctx.bia), avaliacao(ctx.localLivre, ctx.admin)],
    mudanca: { nota: 1, comentario: "Mudado" },
    extras: {
      "upsert pela chave única não troca de dono nem sobrescreve": async (ctx, { de, real, chave }) => {
        const antes = await real(chave.bia);
        for (const quem of ["ana", "admin"]) {
          const resposta = await de(quem).upsert(avaliacao(ctx.local, ctx.bia), { onConflict: "local_id,autor_id" });
          if (resposta.error === null) throw new Error(`${quem} sobrescreveu a avaliação de bia`);
        }
        if (JSON.stringify(await real(chave.bia)) !== JSON.stringify(antes)) throw new Error("a avaliação de bia mudou");
      },
    },
  },

  grupos: {
    ler: ["id", "nome", "descricao", "criador_id", "criado_em"],
    inserir: ["nome", "descricao", "criador_id"],
    alterar: [],
    apagar: "dono e admin",
    // `aberto`, `alheio` e `livre` são do admin: o teste de apagar leva só os de ana e bia.
    semear: async (ctx) => {
      const [ana, bia, aberto, alheio, livre] = await criar(ctx, "grupos", [ctx.ana, ctx.bia, ctx.admin, ctx.admin, ctx.admin].map(grupo));
      Object.assign(ctx, { aberto: aberto.id, alheio: alheio.id, livre: livre.id });
      return { ana: { id: ana.id }, bia: { id: bia.id } };
    },
    nova: (ctx, quem) => grupo(ctx[quem]),
    emNomeDeOutro: (ctx) => [grupo(ctx.bia), grupo(ctx.admin)],
  },

  grupo_membros: {
    ler: ["grupo_id", "perfil_id", "criado_em"],
    inserir: ["grupo_id", "perfil_id"],
    alterar: [],
    apagar: "dono",
    semear: async (ctx) => {
      const [ana, bia] = [membro(ctx.aberto, ctx.ana), membro(ctx.aberto, ctx.bia)];
      await criar(ctx, "grupo_membros", [ana, bia, membro(ctx.alheio, ctx.bia)]);
      return { ana, bia };
    },
    nova: (ctx, quem) => membro(ctx.livre, ctx[quem]),
    emNomeDeOutro: (ctx) => [membro(ctx.livre, ctx.bia), membro(ctx.livre, ctx.admin)],
    extras: {
      "quem cria o grupo vira membro, não sai, não põe nem tira ninguém": async (ctx, { de, real, negado, permitido }) => {
        const { data, error } = await ctx.bia.cliente.from("grupos").insert(grupo(ctx.bia)).select("id").single();
        if (error) throw error;
        const dona = membro(data.id, ctx.bia);
        assert.equal((await real(dona)).length, 1, "bia virou membro");
        await de("bia").delete().match(dona);
        assert.equal((await real(dona)).length, 1, "bia saiu do próprio grupo");
        negado(await de("bia").insert(membro(data.id, ctx.ana)), "bia põe ana");
        permitido(await de("ana").insert(membro(data.id, ctx.ana)), "ana entra");
        await de("bia").delete().match(membro(data.id, ctx.ana));
        assert.equal((await real(membro(data.id, ctx.ana))).length, 1, "bia expulsou ana");
        permitido(await ctx.bia.cliente.from("grupos").delete().match(data), "bia apaga o grupo");
        assert.deepEqual(await real({ grupo_id: data.id }), [], "os membros foram junto");
      },
    },
  },

  publicacoes: {
    ler: ["id", "autor_id", "grupo_id", "texto", "livro_titulo", "livro_autor", "criado_em"],
    inserir: ["autor_id", "grupo_id", "texto", "livro_titulo", "livro_autor"],
    alterar: [],
    apagar: "dono e admin",
    semear: async (ctx) => {
      const [ana, bia, geral, alheia] = await criar(ctx, "publicacoes", [
        publicacao(ctx.ana), publicacao(ctx.bia), publicacao(ctx.admin), publicacao(ctx.admin, ctx.alheio),
      ]);
      Object.assign(ctx, { publicacaoGeral: geral.id, publicacaoAlheia: alheia.id });
      return { ana: { id: ana.id }, bia: { id: bia.id } };
    },
    nova: (ctx, quem) => publicacao(ctx[quem]),
    emNomeDeOutro: (ctx) => [publicacao(ctx.bia), publicacao(ctx.ana, ctx.alheio), publicacao(ctx.bia, ctx.alheio), publicacao(ctx.ana, uuid())],
    extras: {
      "só membro publica; quem sai perde o direito e apaga o seu": async (ctx, { de, real, negado, permitido }) => {
        const dela = { autor_id: ctx.ana.id, grupo_id: ctx.livre };
        await ctx.ana.cliente.from("grupo_membros").delete().match(membro(ctx.livre, ctx.ana));
        negado(await de("ana").insert(publicacao(ctx.ana, ctx.livre)), "antes de entrar");
        permitido(await ctx.ana.cliente.from("grupo_membros").insert(membro(ctx.livre, ctx.ana)), "ana entra");
        permitido(await de("ana").insert(publicacao(ctx.ana, ctx.livre)), "membro publica");
        negado(await de("ana").insert(publicacao(ctx.ana, ctx.alheio)), "ser membro de um grupo não vale em outro");
        permitido(await ctx.ana.cliente.from("grupo_membros").delete().match(membro(ctx.livre, ctx.ana)), "ana sai");
        negado(await de("ana").insert(publicacao(ctx.ana, ctx.livre)), "depois de sair");
        assert.equal((await real(dela)).length, 1);
        permitido(await de("ana").delete().match(dela), "ana apaga a sua");
        assert.deepEqual(await real(dela), []);
      },
      "dona do grupo não apaga publicação de outro membro": async (ctx, { de, real, permitido }) => {
        const { data, error } = await ctx.bia.cliente.from("grupos").insert(grupo(ctx.bia)).select("id").single();
        if (error) throw error;
        permitido(await ctx.ana.cliente.from("grupo_membros").insert(membro(data.id, ctx.ana)), "ana entra");
        permitido(await de("ana").insert(publicacao(ctx.ana, data.id)), "ana publica");
        await de("bia").delete().match({ grupo_id: data.id });
        assert.equal((await real({ grupo_id: data.id })).length, 1, "bia apagou a de ana");
        permitido(await ctx.bia.cliente.from("grupos").delete().match(data), "bia apaga o grupo");
        assert.deepEqual(await real({ grupo_id: data.id }), [], "a publicação foi junto");
      },
    },
  },

  comentarios: {
    ler: ["id", "publicacao_id", "autor_id", "texto", "criado_em"],
    inserir: ["publicacao_id", "autor_id", "texto"],
    alterar: [],
    apagar: "dono e admin",
    semear: async (ctx) => {
      const [ana, bia] = await criar(ctx, "comentarios", [comentario(ctx.publicacaoGeral, ctx.ana), comentario(ctx.publicacaoGeral, ctx.bia)]);
      return { ana: { id: ana.id }, bia: { id: bia.id } };
    },
    nova: (ctx, quem) => comentario(ctx.publicacaoGeral, ctx[quem]),
    emNomeDeOutro: (ctx) => [
      comentario(ctx.publicacaoGeral, ctx.bia), comentario(ctx.publicacaoAlheia, ctx.ana),
      comentario(ctx.publicacaoAlheia, ctx.bia), comentario(uuid(), ctx.ana),
    ],
    extras: {
      "em grupo só membro comenta; quem sai perde o direito e apaga o seu": async (ctx, { de, real, negado, permitido }) => {
        const dela = { autor_id: ctx.ana.id, publicacao_id: ctx.publicacaoAlheia };
        permitido(await ctx.ana.cliente.from("grupo_membros").insert(membro(ctx.alheio, ctx.ana)), "ana entra");
        permitido(await de("ana").insert(comentario(ctx.publicacaoAlheia, ctx.ana)), "membro comenta");
        permitido(await ctx.ana.cliente.from("grupo_membros").delete().match(membro(ctx.alheio, ctx.ana)), "ana sai");
        negado(await de("ana").insert(comentario(ctx.publicacaoAlheia, ctx.ana)), "depois de sair");
        assert.equal((await real(dela)).length, 1);
        permitido(await de("ana").delete().match(dela), "ana apaga o seu");
        assert.deepEqual(await real(dela), []);
      },
      "autora da publicação não apaga comentário alheio": async (ctx, { de, real, permitido }) => {
        const { data, error } = await ctx.bia.cliente.from("publicacoes").insert(publicacao(ctx.bia)).select("id").single();
        if (error) throw error;
        permitido(await de("ana").insert(comentario(data.id, ctx.ana)), "ana comenta");
        await de("bia").delete().match({ publicacao_id: data.id });
        assert.equal((await real({ publicacao_id: data.id })).length, 1, "bia apagou o de ana");
        permitido(await ctx.bia.cliente.from("publicacoes").delete().match(data), "bia apaga a publicação");
        assert.deepEqual(await real({ publicacao_id: data.id }), [], "o comentário foi junto");
      },
    },
  },
};

// Funções públicas: o valor devolvido a cada ator, ou o código do erro em { erro }.
export const funcoes = {
  sou_admin: { anon: { erro: "42501" }, semPerfil: false, ana: false, admin: true },
};

export const views = {
  locais_com_nota: { ler: ["id", "tipo", "nome", "localizacao", "criado_em", "media", "total"] },
};
