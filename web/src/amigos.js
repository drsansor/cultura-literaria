import { pessoa } from "./avatar.js";
import { aoEnviar, avisar, confirmar, el } from "./dom.js";
import { mensagemDeErro } from "./erros.js";
import { exigirPerfil } from "./sessao.js";
import { conferir, supabase } from "./supabase.js";

const PESSOA = "id, nome, usuario, foto_path";
const SITUACAO = { recebidos: "Pedido recebido", enviados: "Pedido enviado", amigos: "Vocês são amigos" };
const VAZIO = {
  recebidos: "Nenhum pedido recebido.",
  enviados: "Nenhum pedido enviado.",
  amigos: "Você ainda não tem amigos aqui. Busque alguém pelo @usuário.",
};

const $ = (id) => document.getElementById(id);
const perfil = await exigirPerfil();
const tabela = () => supabase.from("amizades");
let vinculos = [];
let achados = [];

// Cada vínculo com a outra pessoa e o lugar dele na tela.
async function carregar() {
  const linhas = await conferir(tabela().select(`id, status, solicitante:perfis!amizades_solicitante_id_fkey(${PESSOA}), destinatario:perfis!amizades_destinatario_id_fkey(${PESSOA})`).order("criado_em", { ascending: false }));
  vinculos = linhas.map(({ id, status, solicitante, destinatario }) => {
    const pedi = solicitante.id === perfil.id;
    return { id, outra: pedi ? destinatario : solicitante, onde: status === "aceita" ? "amigos" : pedi ? "enviados" : "recebidos" };
  });
  exibir();
}

function exibir() {
  for (const onde of Object.keys(VAZIO)) {
    const aqui = vinculos.filter((vinculo) => vinculo.onde === onde);
    $(onde).replaceChildren(...aqui.map((vinculo) => selo(vinculo.outra, ACOES[onde](vinculo))));
    avisar($(`aviso-${onde}`), aqui.length ? "" : VAZIO[onde]);
  }
  $("achados").replaceChildren(...achados.map((outra) => {
    const vinculo = vinculos.find((atual) => atual.outra.id === outra.id);
    return selo(outra, vinculo ? [el("strong", {}, SITUACAO[vinculo.onde])] : [acao("achados", "Pedir amizade", `Pedir amizade a ${outra.nome}`, () => pedir(outra))]);
  }));
}

const selo = (outra, filhos) => el("li", { className: "selo" }, el("div", { className: "miolo" }, pessoa(outra), el("div", { className: "acoes" }, ...filhos)));

// Depois de agir, dando certo ou não, a lista volta a ser a do banco; o erro fica na seção do botão.
function acao(onde, texto, rotulo, fazer, className = "etiqueta") {
  const botao = el("button", { className, type: "button", ariaLabel: rotulo }, texto);
  botao.addEventListener("click", async () => {
    botao.disabled = true;
    let falha = null;
    try {
      await fazer();
    } catch (erro) {
      falha = erro;
    }
    try {
      await carregar();
    } catch (erro) {
      falha ??= erro;
      botao.disabled = false;
    }
    if (falha) avisar($(`aviso-${onde}`), mensagemDeErro(falha), true);
    else if (onde === "achados") avisar($("aviso-achados"), "");
  });
  return botao;
}

const pedir = ({ id }) => conferir(tabela().insert({ solicitante_id: perfil.id, destinatario_id: id }));
const apagar = ({ id }) => conferir(tabela().delete().eq("id", id));

async function aceitar({ id }) {
  const aceitas = await conferir(tabela().update({ status: "aceita" }).eq("id", id).select("id"));
  if (!aceitas.length) throw { code: "pedido_sumiu" };
}

async function desfazer(vinculo) {
  if (await confirmar(`Desfazer a amizade com ${vinculo.outra.nome}?`, "Desfazer")) await apagar(vinculo);
}

const ACOES = {
  recebidos: (vinculo) => [
    acao("recebidos", "Aceitar", `Aceitar o pedido de ${vinculo.outra.nome}`, () => aceitar(vinculo)),
    acao("recebidos", "Recusar", `Recusar o pedido de ${vinculo.outra.nome}`, () => apagar(vinculo), "discreto"),
  ],
  enviados: (vinculo) => [acao("enviados", "Cancelar", `Cancelar o pedido a ${vinculo.outra.nome}`, () => apagar(vinculo), "discreto")],
  amigos: (vinculo) => [acao("amigos", "Desfazer", `Desfazer a amizade com ${vinculo.outra.nome}`, () => desfazer(vinculo), "discreto")],
};

aoEnviar($("form-busca"), async ({ usuario }) => {
  const inicio = usuario.value.trim().toLowerCase().replace(/^@/, "");
  achados = [];
  // Fora destes caracteres não existe @usuário; e o `_` é curinga do banco, por isso a barra.
  if (/^[a-z0-9_.]+$/.test(inicio)) {
    achados = await conferir(supabase.from("perfis").select(PESSOA).like("usuario", `${inicio.replaceAll("_", "\\_")}%`).neq("id", perfil.id).order("usuario").limit(10));
  }
  exibir();
  return achados.length ? "" : "Ninguém encontrado. Confira o @usuário.";
}, $("aviso-achados"));

try {
  await carregar();
  avisar($("mensagem"), "");
} catch (erro) {
  avisar($("mensagem"), mensagemDeErro(erro), true);
}
