import { pessoa } from "./avatar.js";
import { avisar, confirmar, contar, naoEncontrada, titular } from "./dom.js";
import { mensagemDeErro } from "./erros.js";
import { montarFeed } from "./publicacoes.js";
import { exigirPerfil } from "./sessao.js";
import { conferir, supabase } from "./supabase.js";

const $ = (id) => document.getElementById(id);
const id = new URLSearchParams(location.search).get("id");
const valido = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id);
const perfil = await exigirPerfil();

async function carregar() {
  const [grupo, participa] = await Promise.all([
    conferir(supabase.from("grupos").select("nome, descricao, criador:perfis!grupos_criador_id_fkey(id, nome, usuario, foto_path), grupo_membros(count)").eq("id", id).maybeSingle()),
    conferir(supabase.from("grupo_membros").select("perfil_id").eq("grupo_id", id).eq("perfil_id", perfil.id).maybeSingle()),
  ]);
  $("dados").hidden = !grupo;
  if (!grupo) {
    $("feed").replaceChildren();
    return naoEncontrada();
  }
  const criou = grupo.criador.id === perfil.id;
  titular(grupo.nome);
  $("descricao").textContent = grupo.descricao;
  $("criador").replaceChildren("Criado por", pessoa(grupo.criador));
  $("participantes").textContent = contar(grupo.grupo_membros[0].count, "participante", "participantes");
  $("convite").hidden = Boolean(participa);
  $("entrar").hidden = Boolean(participa);
  $("sair").hidden = !participa || criou;
  $("apagar").hidden = !criou && !perfil.admin;
  avisar($("mensagem"), "");
  await montarFeed($("feed"), { perfil, grupoId: id, podePublicar: Boolean(participa) });
}

// Faz a ação e atualiza a tela; na falha, avisa e deixa tentar de novo.
function aoClicar(botao, fazer) {
  botao.addEventListener("click", async () => {
    botao.disabled = true;
    avisar($("aviso"), "");
    try {
      await fazer();
    } catch (erro) {
      avisar($("aviso"), mensagemDeErro(erro), true);
    } finally {
      botao.disabled = false;
    }
  });
}

const participacao = { grupo_id: id, perfil_id: perfil.id };

aoClicar($("entrar"), async () => {
  // Quem já entrou em outra aba não recebe erro.
  await conferir(supabase.from("grupo_membros").upsert(participacao, { ignoreDuplicates: true }));
  await carregar();
});

aoClicar($("sair"), async () => {
  await conferir(supabase.from("grupo_membros").delete().match(participacao));
  await carregar();
});

aoClicar($("apagar"), async () => {
  if (!(await confirmar("Apagar este grupo e tudo o que há nele?"))) return;
  await conferir(supabase.from("grupos").delete().eq("id", id));
  location.replace("/comunidade.html");
});

if (!valido) naoEncontrada();
else {
  try {
    await carregar();
  } catch (erro) {
    avisar($("mensagem"), mensagemDeErro(erro), true);
  }
}
