// A matriz da especificação como dados. `atacar.mjs` percorre tudo com logins reais pela API.
//
// ler/inserir/alterar: as ÚNICAS colunas permitidas. O que não está aqui tem de ser negado.
// semear(ctx): cria com a chave secreta as linhas de ana e bia e devolve a chave de cada uma.
// nova(ctx, quem): linha válida para `quem` inserir. emNomeDeOutro(ctx): linhas que ana não pode inserir.
// mudanca: alteração válida para o dono. apagar: quem apaga ("ninguem", "dono", "dono e admin").

const uuid = () => crypto.randomUUID();
const apelido = () => `t_${uuid().replaceAll("-", "").slice(0, 20)}`;

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
};

// Funções públicas: o valor devolvido a cada ator, ou o código do erro em { erro }.
export const funcoes = {
  sou_admin: { anon: { erro: "42501" }, semPerfil: false, ana: false, admin: true },
};

export const views = {};
