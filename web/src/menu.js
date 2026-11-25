import { pessoa } from "./avatar.js";
import { creditos, desenvolvedor } from "./creditos.js";
import { avisar, el } from "./dom.js";
import { exigirPerfil } from "./sessao.js";
import { supabase } from "./supabase.js";

const $ = (id) => document.getElementById(id);
$("creditos").append(...creditos.map((nome) => el("li", {}, nome)));
$("desenvolvedor").append("Desenvolvido por ", el("a", { href: desenvolvedor.endereco, target: "_blank", rel: "noopener noreferrer" }, desenvolvedor.nome));

const perfil = await exigirPerfil();
avisar($("mensagem"), "");
$("pessoa").replaceWith(pessoa(perfil, { tamanho: "g" }));

// Sem a contagem o menu continua servindo; por isso a falha não vira aviso.
async function contarNovas() {
  const { count } = await supabase.from("notificacoes").select("id", { count: "exact", head: true }).eq("lida", false);
  const seta = $("notificacoes");
  seta.replaceChildren("Notificação");
  if (count) {
    seta.append(" ", el("span", { className: "contador" }, count > 99 ? "99+" : `${count}`), " ", el("span", { className: "oculto" }, count === 1 ? "não lida" : "não lidas"));
  }
}

await contarNovas();
// Voltar pelo navegador pode devolver a página guardada, com a contagem antiga.
addEventListener("pageshow", ({ persisted }) => persisted && contarNovas());
