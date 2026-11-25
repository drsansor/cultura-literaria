import { avisar, el, naoEncontrada, titular } from "./dom.js";
import { mensagemDeErro } from "./erros.js";
import { exigirPerfil } from "./sessao.js";
import { conferir, supabase } from "./supabase.js";

const TIPOS = new Map([
  ["biblioteca", { titulo: "Lista de Bibliotecas", vazio: "Ainda não há bibliotecas nesta lista. Volte em breve." }],
  ["sebo", { titulo: "Lista de Sebos", vazio: "Ainda não há sebos nesta lista. Volte em breve." }],
]);

const $ = (id) => document.getElementById(id);
const tipo = new URLSearchParams(location.search).get("tipo");
const lista = TIPOS.get(tipo);

function selo({ id, nome, localizacao }) {
  const mapa = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(localizacao)}`;
  const item = el("li", { className: "selo" },
    el("div", { className: "miolo" },
      el("h2", {}, nome),
      el("a", { className: "ligacao", href: mapa, target: "_blank", rel: "noopener noreferrer" }, localizacao),
      el("button", { className: "etiqueta", type: "button", ariaLabel: `Comentários de ${nome}` }, "Comentários")));
  item.dataset.local = id;
  return item;
}

async function mostrar() {
  titular(lista.titulo);
  try {
    const locais = await conferir(supabase.from("locais").select("id, nome, localizacao").eq("tipo", tipo).order("nome"));
    $("selos").replaceChildren(...locais.map(selo));
    avisar($("mensagem"), locais.length ? "" : lista.vazio);
  } catch (erro) {
    avisar($("mensagem"), mensagemDeErro(erro), true);
  }
}

await exigirPerfil();
if (lista) await mostrar();
else naoEncontrada();
