import { el } from "./dom.js";
import { supabase } from "./supabase.js";

// Decorativo: o nome da pessoa fica sempre ao lado, por isso alt vazio.
export function avatar({ nome, foto_path }, { tamanho = "p" } = {}) {
  const inicial = el("span", { ariaHidden: "true" }, ([...nome.trim()][0] ?? "?").toUpperCase());
  const estrela = el("span", { className: `estrela estrela-${tamanho}` }, inicial);
  if (foto_path) {
    const { data } = supabase.storage.from("avatares").getPublicUrl(foto_path);
    const img = el("img", { src: data.publicUrl, alt: "" });
    img.addEventListener("error", () => img.replaceWith(inicial));
    inicial.replaceWith(img);
  }
  return estrela;
}
