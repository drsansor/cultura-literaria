import { avisar } from "./dom.js";
import { montarFeed } from "./publicacoes.js";
import { exigirPerfil } from "./sessao.js";

const $ = (id) => document.getElementById(id);
const perfil = await exigirPerfil();
avisar($("mensagem"), "");
await montarFeed($("feed"), { perfil, podePublicar: true });
