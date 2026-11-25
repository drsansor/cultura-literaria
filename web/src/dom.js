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
