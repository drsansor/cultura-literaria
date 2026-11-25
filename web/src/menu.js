import { pessoa } from "./avatar.js";
import { creditos } from "./creditos.js";
import { avisar, el } from "./dom.js";
import { exigirPerfil } from "./sessao.js";

const $ = (id) => document.getElementById(id);
$("creditos").append(...creditos.map((nome) => el("li", {}, nome)));

const perfil = await exigirPerfil();
avisar($("mensagem"), "");
$("pessoa").replaceWith(pessoa(perfil, { tamanho: "g" }));
