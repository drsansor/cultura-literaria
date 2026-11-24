// A matriz da especificação como dados. `atacar.mjs` percorre tudo com logins reais pela API.
//
// ler/inserir/alterar: as ÚNICAS colunas permitidas. O que não está aqui tem de ser negado.
// semear(ctx): cria com a chave secreta as linhas de ana e bia e devolve a chave de cada uma.
// nova(ctx, quem): linha válida para `quem` inserir. emNomeDeOutro(ctx): linhas que ana não pode inserir.
// mudanca: alteração válida para o dono. apagar: quem apaga ("ninguem", "dono", "dono e admin").

const uuid = () => crypto.randomUUID();
const apelido = () => `t_${uuid().replaceAll("-", "").slice(0, 20)}`;

const local = () => ({ tipo: "sebo", nome: `Local ${uuid()}`, localizacao: "Rua de teste" });
const influenciador = () => ({ nome: `Influenciador ${uuid()}`, instagram: "teste" });
const avaliacao = (local_id, { id }) => ({ local_id, autor_id: id, nota: 4, comentario: "Bom" });

async function criar(ctx, tabela, linhas) {
  const { data, error } = await ctx.servico.from(tabela).insert(linhas).select("*");
  if (error) throw error;
  for (const { id } of data) ctx.lixo.push([tabela, { id }]);
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
};

// Funções públicas: o valor devolvido a cada ator, ou o código do erro em { erro }.
export const funcoes = {
  sou_admin: { anon: { erro: "42501" }, semPerfil: false, ana: false, admin: true },
};

export const views = {
  locais_com_nota: { ler: ["id", "tipo", "nome", "localizacao", "criado_em", "media", "total"] },
};
