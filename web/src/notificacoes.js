import { pessoa } from "./avatar.js";
import { avisar, el } from "./dom.js";
import { mensagemDeErro } from "./erros.js";
import { quando } from "./publicacoes.js";
import { exigirPerfil } from "./sessao.js";
import { conferir, supabase } from "./supabase.js";

const RECENTES = 50;
const $ = (id) => document.getElementById(id);

// O que houve e onde ver.
function resumir({ tipo, publicacao }) {
  if (tipo === "pedido_amizade") return ["pediu sua amizade.", "/amigos.html"];
  if (tipo === "amizade_aceita") return ["aceitou seu pedido de amizade.", "/amigos.html"];
  if (publicacao?.grupo_id) return ["comentou na sua publicação em um grupo.", `/grupo.html?id=${publicacao.grupo_id}`];
  return ["comentou na sua publicação.", "/comunidade.html"];
}

function selo(notificacao) {
  const [texto, destino] = resumir(notificacao);
  const miolo = el("div", { className: "miolo publicacao" },
    el("div", { className: "topo" }, pessoa(notificacao.de), quando(notificacao.criado_em)),
    el("p", {}, texto));
  if (!notificacao.lida) miolo.append(el("strong", {}, "Nova"));
  miolo.append(el("a", { className: "etiqueta", href: destino, ariaLabel: `Ver: ${notificacao.de.nome} ${texto}` }, "Ver"));
  return el("li", { className: "selo" }, miolo);
}

const perfil = await exigirPerfil();
try {
  const linhas = await conferir(supabase.from("notificacoes")
    .select("id, tipo, lida, criado_em, de:perfis!notificacoes_de_id_fkey(id, nome, usuario, foto_path), publicacao:publicacoes(grupo_id)")
    .order("criado_em", { ascending: false }).order("id", { ascending: false }).limit(RECENTES));
  $("selos").replaceChildren(...linhas.map(selo));
  avisar($("mensagem"), linhas.length ? "" : "Nenhuma notificação por enquanto. Quando alguém pedir amizade ou comentar, aparece aqui.");
  // Até a mais nova que está na tela: o que chegou depois continua como não lido.
  if (linhas.length) await conferir(supabase.from("notificacoes").update({ lida: true }).eq("para_id", perfil.id).eq("lida", false).lte("criado_em", linhas[0].criado_em));
} catch (erro) {
  avisar($("mensagem"), mensagemDeErro(erro), true);
}
