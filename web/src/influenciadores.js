import { avatar } from "./avatar.js";
import { avisar, el } from "./dom.js";
import { mensagemDeErro } from "./erros.js";
import { exigirPerfil } from "./sessao.js";
import { conferir, supabase } from "./supabase.js";

const REDES = [
  ["instagram", "Instagram", "https://www.instagram.com/"],
  ["youtube", "YouTube", "https://www.youtube.com/@"],
  ["tiktok", "TikTok", "https://www.tiktok.com/@"],
];

const $ = (id) => document.getElementById(id);

function retrato({ nome, foto }) {
  const inicial = avatar({ nome }, { tamanho: "g" });
  if (!foto) return inicial;
  const img = el("img", { className: "retrato", src: `/influenciadores/${foto}`, alt: "" });
  img.addEventListener("error", () => img.replaceWith(inicial));
  return img;
}

function ligacoes(pessoa) {
  return REDES.filter(([campo]) => pessoa[campo]).map(([campo, rede, endereco]) => {
    const arroba = `@${pessoa[campo]}`;
    const icone = el("span", { className: `icone icone-${campo}`, ariaHidden: "true" });
    return el("a", { href: endereco + pessoa[campo], target: "_blank", rel: "noopener noreferrer", ariaLabel: `${rede} de ${pessoa.nome}: ${arroba}` }, icone, arroba);
  });
}

const selo = (pessoa) =>
  el("li", { className: "selo" },
    el("div", { className: "miolo" }, retrato(pessoa), el("h2", {}, pessoa.nome), el("div", { className: "etiqueta redes" }, ...ligacoes(pessoa))));

await exigirPerfil();
try {
  const pessoas = await conferir(supabase.from("influenciadores").select("id, nome, foto, instagram, youtube, tiktok").order("nome"));
  $("selos").replaceChildren(...pessoas.map(selo));
  avisar($("mensagem"), pessoas.length ? "" : "Ainda não há influenciadores nesta lista. Volte em breve.");
} catch (erro) {
  avisar($("mensagem"), mensagemDeErro(erro), true);
}
