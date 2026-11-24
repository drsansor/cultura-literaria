const PROIBIDAS = ["innerHTML", "outerHTML"];

export function el(tag, props = {}, ...filhos) {
  for (const nome of PROIBIDAS) {
    if (nome in props) throw new TypeError(`${nome} não é permitido: use filhos de texto`);
  }
  const elemento = Object.assign(document.createElement(tag), props);
  elemento.append(...filhos);
  return elemento;
}
