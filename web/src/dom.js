import { mensagemDeErro } from "./erros.js";

const PROIBIDAS = ["innerHTML", "outerHTML"];

export function el(tag, props = {}, ...filhos) {
  for (const nome of PROIBIDAS) {
    if (nome in props) throw new TypeError(`${nome} não é permitido: use filhos de texto`);
  }
  const elemento = Object.assign(document.createElement(tag), props);
  elemento.append(...filhos);
  return elemento;
}

export function avisar(elemento, texto, erro = false) {
  elemento.textContent = texto;
  elemento.classList.toggle("erro", erro);
}

export function titular(titulo) {
  document.querySelector("h1").textContent = titulo;
  document.title = `${titulo} | A Crise Literária no Brasil`;
}

export function naoEncontrada() {
  titular("Página não encontrada");
  avisar(document.getElementById("mensagem"), "Este endereço não existe. Volte ao menu e escolha uma opção.");
}

// Trava o botão enquanto envia. `enviar` devolve o texto de sucesso ou lança o erro.
export function aoEnviar(form, enviar, mensagem = form.querySelector(".mensagem")) {
  const botao = form.querySelector(".botao");
  form.addEventListener("submit", async (evento) => {
    evento.preventDefault();
    botao.disabled = true;
    avisar(mensagem, "");
    try {
      avisar(mensagem, await enviar(form.elements));
    } catch (erro) {
      avisar(mensagem, mensagemDeErro(erro), true);
    } finally {
      botao.disabled = false;
    }
  });
}

// Verdadeiro só se a pessoa apertar o botão da ação; Esc e Cancelar valem não.
export function confirmar(pergunta, acao = "Apagar") {
  const titulo = el("h2", { id: "titulo-confirmar" }, pergunta);
  const botoes = [el("button", { className: "botao", value: "sim" }, acao), el("button", { className: "discreto", value: "", autofocus: true }, "Cancelar")];
  const dialogo = el("dialog", { className: "quadro dialogo" }, titulo, el("form", { method: "dialog", className: "acoes" }, ...botoes));
  dialogo.setAttribute("aria-labelledby", titulo.id);
  document.body.append(dialogo);
  dialogo.showModal();
  return new Promise((decidir) => {
    dialogo.addEventListener("close", () => {
      dialogo.remove();
      decidir(dialogo.returnValue === "sim");
    });
  });
}
