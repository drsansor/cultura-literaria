import { pessoa } from "./avatar.js";
import { aoEnviar, avisar, confirmar, el } from "./dom.js";
import { mensagemDeErro } from "./erros.js";
import { conferir, supabase } from "./supabase.js";

const POR_VEZ = 20;
const AUTOR = "id, nome, usuario, foto_path";
const CAMPOS = `id, texto, livro_titulo, livro_autor, criado_em, autor:perfis!publicacoes_autor_id_fkey(${AUTOR}), comentarios(count)`;
const CAMPOS_COMENTARIO = `id, texto, autor:perfis!comentarios_autor_id_fkey(${AUTOR})`;

const mensagem = (texto = "") => el("p", { className: "mensagem", role: "status" }, texto);
const campo = (rotulo, entrada) => el("label", {}, rotulo, entrada);
const quando = (data) => el("time", { dateTime: data }, new Date(data).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }));

function botaoApagar(texto, pergunta, aviso, apagar) {
  const botao = el("button", { className: "discreto", type: "button" }, texto);
  botao.addEventListener("click", async () => {
    if (!(await confirmar(pergunta))) return;
    botao.disabled = true;
    try {
      await apagar();
    } catch (erro) {
      avisar(aviso, mensagemDeErro(erro), true);
      botao.disabled = false;
    }
  });
  return botao;
}

function comentarios(publicacao, { perfil, podePublicar }) {
  let total = publicacao.comentarios[0].count;
  const resumo = el("summary", { className: "etiqueta" });
  const aviso = mensagem();
  const lista = el("ul", { className: "falas" });
  const quadro = el("div", { className: "quadro" }, aviso, lista);
  const detalhes = el("details", {}, resumo, quadro);
  const contar = (novo) => (resumo.textContent = `Comentários (${(total = novo)})`);
  const vazio = () => avisar(aviso, total ? "" : podePublicar ? "Ainda não há comentários. Escreva o primeiro." : "Ainda não há comentários.");
  contar(total);

  function item({ id, texto, autor }) {
    const linha = el("li", {}, pessoa(autor), el("p", {}, texto));
    if (perfil.admin || autor.id === perfil.id) {
      linha.append(botaoApagar("Apagar", "Apagar este comentário?", aviso, async () => {
        await conferir(supabase.from("comentarios").delete().eq("id", id));
        linha.remove();
        contar(lista.children.length);
        vazio();
      }));
    }
    return linha;
  }

  if (podePublicar) {
    const texto = el("textarea", { name: "texto", maxLength: 1000, rows: 2, required: true });
    const form = el("form", { className: "campos", method: "post", hidden: true }, campo("Seu comentário", texto), el("button", { className: "botao" }, "Comentar"));
    aoEnviar(form, async () => {
      const dados = { publicacao_id: publicacao.id, autor_id: perfil.id, texto: texto.value.trim() };
      lista.append(item(await conferir(supabase.from("comentarios").insert(dados).select(CAMPOS_COMENTARIO).single())));
      contar(lista.children.length);
      form.reset();
      return "";
    }, aviso);
    quadro.append(form);
  }

  // Só busca ao abrir; se falhar, fechar e abrir tenta de novo.
  let buscou = false;
  detalhes.addEventListener("toggle", async () => {
    if (!detalhes.open || buscou) return;
    buscou = true;
    avisar(aviso, "Carregando…");
    try {
      const linhas = await conferir(supabase.from("comentarios").select(CAMPOS_COMENTARIO).eq("publicacao_id", publicacao.id).order("criado_em").order("id"));
      lista.replaceChildren(...linhas.map(item));
      contar(linhas.length);
      vazio();
      for (const form of quadro.querySelectorAll("form")) form.hidden = false;
    } catch (erro) {
      buscou = false;
      avisar(aviso, mensagemDeErro(erro), true);
    }
  });
  return detalhes;
}

function cartao(publicacao, opcoes, aoApagar) {
  const { id, texto, livro_titulo, livro_autor, criado_em, autor } = publicacao;
  const aviso = mensagem();
  const miolo = el("div", { className: "miolo publicacao" }, el("div", { className: "topo" }, pessoa(autor), quando(criado_em)));
  if (livro_titulo) {
    const livro = el("p", { className: "livro" }, el("span", {}, "Recomendação"), el("strong", {}, livro_titulo));
    if (livro_autor) livro.append(el("span", {}, `de ${livro_autor}`));
    miolo.append(livro);
  }
  const item = el("li", { className: "selo" }, miolo);
  miolo.append(el("p", {}, texto), aviso);
  if (opcoes.perfil.admin || autor.id === opcoes.perfil.id) {
    miolo.append(botaoApagar("Apagar publicação", "Apagar esta publicação?", aviso, async () => {
      await conferir(supabase.from("publicacoes").delete().eq("id", id));
      item.remove();
      aoApagar();
    }));
  }
  miolo.append(comentarios(publicacao, opcoes));
  item.dataset.publicacao = id;
  return item;
}

export async function montarFeed(container, { perfil, grupoId = null, podePublicar }) {
  const opcoes = { perfil, podePublicar };
  const aviso = mensagem();
  const lista = el("ul", { className: "selos selos-largos" });
  const mais = el("button", { className: "botao", type: "button", hidden: true }, "Carregar mais");
  const vazio = () => {
    const nada = !lista.children.length && mais.hidden;
    avisar(aviso, nada ? (podePublicar ? "Ainda não há publicações. Escreva a primeira." : "Ainda não há publicações.") : "");
  };
  const novo = (publicacao) => cartao(publicacao, opcoes, vazio);
  container.replaceChildren();

  if (podePublicar) {
    const texto = el("textarea", { name: "texto", maxLength: 2000, rows: 4, required: true });
    const titulo = el("input", { name: "titulo", maxLength: 200, autocomplete: "off" });
    const autor = el("input", { name: "autor", maxLength: 120, autocomplete: "off" });
    const form = el("form", { className: "quadro", method: "post", ariaLabel: "Nova publicação" },
      el("h2", {}, "Nova publicação"),
      campo("Sua publicação", texto),
      campo("Título do livro (se for recomendar)", titulo),
      campo("Autor do livro (se quiser)", autor),
      mensagem(),
      el("button", { className: "botao" }, "Publicar"));
    aoEnviar(form, async () => {
      const livro = { livro_titulo: titulo.value.trim() || null, livro_autor: autor.value.trim() || null };
      if (livro.livro_autor && !livro.livro_titulo) throw { code: "livro_sem_titulo" };
      const dados = { autor_id: perfil.id, grupo_id: grupoId, texto: texto.value.trim(), ...livro };
      lista.prepend(novo(await conferir(supabase.from("publicacoes").insert(dados).select(CAMPOS).single())));
      form.reset();
      vazio();
      return "Publicado.";
    });
    container.append(form);
  }
  container.append(aviso, lista, mais);

  // Paginação por (criado_em, id): datas iguais não repetem nem somem, e publicação nova não desloca a página.
  let ultima = null;
  async function carregar() {
    avisar(aviso, "Carregando…");
    mais.disabled = true;
    try {
      let pedido = supabase.from("publicacoes").select(CAMPOS).order("criado_em", { ascending: false }).order("id", { ascending: false }).limit(POR_VEZ + 1);
      pedido = grupoId ? pedido.eq("grupo_id", grupoId) : pedido.is("grupo_id", null);
      if (ultima) pedido = pedido.or(`criado_em.lt."${ultima.criado_em}",and(criado_em.eq."${ultima.criado_em}",id.lt.${ultima.id})`);
      const linhas = await conferir(pedido);
      const pagina = linhas.slice(0, POR_VEZ);
      // Publicar antes de a primeira página chegar já pôs a publicação na lista.
      const naTela = new Set([...lista.children].map((item) => item.dataset.publicacao));
      lista.append(...pagina.filter(({ id }) => !naTela.has(id)).map(novo));
      ultima = pagina.at(-1) ?? ultima;
      mais.hidden = linhas.length <= POR_VEZ;
      vazio();
    } catch (erro) {
      // Na primeira página não há o que mostrar: o botão serve para tentar de novo.
      mais.hidden = false;
      avisar(aviso, mensagemDeErro(erro), true);
    } finally {
      mais.disabled = false;
    }
  }
  mais.addEventListener("click", carregar);
  await carregar();
}
