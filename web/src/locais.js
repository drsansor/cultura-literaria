import { pessoa } from "./avatar.js";
import { aoEnviar, avisar, confirmar, el, naoEncontrada, titular } from "./dom.js";
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
const form = $("form-avaliacao");
const perfil = await exigirPerfil();
// O local aberto no diálogo e a avaliação da própria pessoa nele, se houver.
let aberto = null;
let minha = null;

function resumir({ media, total }) {
  if (!total) return "Ainda sem avaliações";
  const nota = media.toLocaleString("pt-BR", { minimumFractionDigits: 1 });
  return `Média ${nota} de 5, com ${total} ${total === 1 ? "avaliação" : "avaliações"}`;
}

function selo(local) {
  const mapa = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(local.localizacao)}`;
  const resumo = el("p", { className: "resumo" }, resumir(local));
  const botao = el("button", { className: "etiqueta", type: "button", ariaLabel: `Comentários de ${local.nome}` }, "Comentários");
  botao.addEventListener("click", () => abrir(local, resumo));
  const item = el("li", { className: "selo" },
    el("div", { className: "miolo" },
      el("h2", {}, local.nome),
      resumo,
      el("a", { className: "ligacao", href: mapa, target: "_blank", rel: "noopener noreferrer" }, local.localizacao),
      botao));
  item.dataset.local = local.id;
  return item;
}

function fala(avaliacao) {
  const { autor, nota, comentario } = avaliacao;
  const item = el("li", {}, pessoa(autor), el("strong", {}, `Nota ${nota} de 5`), el("p", {}, comentario));
  if (perfil.admin && autor.id !== perfil.id) {
    const botao = el("button", { className: "discreto", type: "button", ariaLabel: `Apagar a avaliação de ${autor.nome}` }, "Apagar");
    botao.addEventListener("click", () => apagar(avaliacao));
    item.append(botao);
  }
  return item;
}

async function carregar(atual) {
  const [local, avaliacoes] = await Promise.all([
    conferir(supabase.from("locais_com_nota").select("media, total").eq("id", atual.id).single()),
    conferir(supabase.from("avaliacoes").select("id, nota, comentario, autor:perfis!avaliacoes_autor_id_fkey(id, nome, usuario, foto_path)").eq("local_id", atual.id).order("criado_em", { ascending: false })),
  ]);
  atual.resumo.textContent = resumir(local);
  // A pessoa pode ter aberto outro local enquanto a resposta vinha.
  if (atual !== aberto) return;
  $("resumo").textContent = resumir(local);
  $("avaliacoes").replaceChildren(...avaliacoes.map(fala));
  minha = avaliacoes.find(({ autor }) => autor.id === perfil.id) ?? null;
  form.elements.nota.value = minha?.nota ?? "";
  form.elements.comentario.value = minha?.comentario ?? "";
  $("apagar").hidden = !minha;
  form.hidden = false;
}

// Faz e mostra o resultado só se o diálogo ainda for o mesmo.
async function noDialogo(fazer) {
  const atual = aberto;
  avisar($("aviso"), "Carregando…");
  try {
    await fazer(atual);
    if (atual === aberto) avisar($("aviso"), "");
  } catch (erro) {
    if (atual === aberto) avisar($("aviso"), mensagemDeErro(erro), true);
  }
}

function abrir({ id, nome }, resumo) {
  aberto = { id, resumo };
  $("titulo-dialogo").textContent = nome;
  $("resumo").textContent = resumo.textContent;
  $("avaliacoes").replaceChildren();
  form.hidden = true;
  $("dialogo").showModal();
  noDialogo(carregar);
}

async function apagar({ id }) {
  if (!(await confirmar("Apagar esta avaliação?"))) return;
  await noDialogo(async (atual) => {
    await conferir(supabase.from("avaliacoes").delete().eq("id", id));
    await carregar(atual);
  });
}

aoEnviar(form, async ({ nota, comentario }) => {
  const dados = { nota: Number(nota.value), comentario: comentario.value.trim() };
  const tabela = supabase.from("avaliacoes");
  const atual = aberto;
  await conferir(minha ? tabela.update(dados).eq("id", minha.id) : tabela.insert({ ...dados, local_id: atual.id, autor_id: perfil.id }));
  await carregar(atual);
  return atual === aberto ? "Avaliação salva." : $("aviso").textContent;
}, $("aviso"));

$("apagar").addEventListener("click", () => apagar(minha));

async function mostrar() {
  titular(lista.titulo);
  try {
    const locais = await conferir(supabase.from("locais_com_nota").select("id, nome, localizacao, media, total").eq("tipo", tipo).order("nome"));
    $("selos").replaceChildren(...locais.map(selo));
    avisar($("mensagem"), locais.length ? "" : lista.vazio);
  } catch (erro) {
    avisar($("mensagem"), mensagemDeErro(erro), true);
  }
}

if (lista) await mostrar();
else naoEncontrada();
