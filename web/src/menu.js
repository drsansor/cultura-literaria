import { avisar } from "./dom.js";
import { exigirPerfil, exigirSessao, sair } from "./sessao.js";

const $ = (id) => document.getElementById(id);
const { user } = await exigirSessao();
await exigirPerfil();

$("email").textContent = user.email;
$("sair").addEventListener("click", sair);
avisar($("mensagem"), "");
$("menu").hidden = false;
