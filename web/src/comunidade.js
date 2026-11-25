import { aoEnviar, avisar, contar, el } from "./dom.js";
import { mensagemDeErro } from "./erros.js";
import { montarFeed } from "./publicacoes.js";
import { exigirPerfil } from "./sessao.js";
import { conferir, supabase } from "./supabase.js";

const $ = (id) => document.getElementById(id);
const enderecoDe = (id) => `/grupo.html?id=${id}`;

const selo = ({ id, nome, descricao, grupo_membros: [{ count }] }) =>
  el("li", { className: "selo" },
    el("div", { className: "miolo" },
      el("h3", {}, nome),
      el("p", { className: "resumo" }, contar(count, "participante", "participantes")),
      el("p", { className: "resumo" }, descricao),
      el("a", { className: "etiqueta", href: enderecoDe(id), ariaLabel: `Abrir o grupo ${nome}` }, "Abrir")));

async function listarGrupos() {
  try {
    const grupos = await conferir(supabase.from("grupos").select("id, nome, descricao, grupo_membros(count)").order("nome"));
    $("grupos").replaceChildren(...grupos.map(selo));
    avisar($("aviso-grupos"), grupos.length ? "" : "Ainda não há grupos. Crie o primeiro.");
  } catch (erro) {
    avisar($("aviso-grupos"), mensagemDeErro(erro), true);
  }
}

const perfil = await exigirPerfil();
avisar($("mensagem"), "");

aoEnviar($("form-grupo"), async ({ nome, descricao }) => {
  const dados = { nome: nome.value.trim(), descricao: descricao.value.trim(), criador_id: perfil.id };
  const { id } = await conferir(supabase.from("grupos").insert(dados).select("id").single());
  location.assign(enderecoDe(id));
  return "Grupo criado.";
});

await Promise.all([listarGrupos(), montarFeed($("feed"), { perfil, podePublicar: true })]);
