import { pessoa } from "./avatar.js";
import { avisar } from "./dom.js";
import { mensagemDeErro } from "./erros.js";
import { buscarPerfil, exigirSessao, sair } from "./sessao.js";
import { supabase } from "./supabase.js";

const TIPOS = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const TAMANHO_MAXIMO = 2 * 1024 * 1024;

const $ = (id) => document.getElementById(id);
const fotos = supabase.storage.from("avatares");
const { nome, usuario } = $("form-perfil").elements;
const sessao = await exigirSessao();
let perfil = await buscarPerfil(sessao);

function preencher() {
  nome.value = perfil.nome;
  usuario.value = perfil.usuario;
}

function exibir() {
  $("foto").replaceChildren(pessoa(perfil, { tamanho: "g" }));
}

// Trava o botão enquanto envia. `enviar` devolve o texto de sucesso ou lança o erro.
function aoEnviar(form, enviar) {
  const mensagem = form.querySelector(".mensagem");
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

async function conferir(pedido) {
  const { data, error } = await pedido;
  if (error) throw error;
  return data;
}

const alterar = (dados) =>
  conferir(supabase.from("perfis").update(dados).eq("id", perfil.id).select("id, nome, usuario, foto_path").single());

usuario.addEventListener("input", () => {
  const limpo = usuario.value.toLowerCase().replaceAll("@", "");
  if (limpo !== usuario.value) usuario.value = limpo;
});

aoEnviar($("form-perfil"), async () => {
  const dados = { nome: nome.value.trim(), usuario: usuario.value };
  if (!perfil) {
    await conferir(supabase.from("perfis").insert({ id: sessao.user.id, ...dados }));
    location.replace("/menu.html");
    return "Perfil salvo.";
  }
  perfil = await alterar(dados);
  preencher();
  exibir();
  return "Perfil salvo.";
});

aoEnviar($("form-foto"), async ({ foto }) => {
  const [arquivo] = foto.files;
  const extensao = TIPOS[arquivo.type];
  if (!extensao) throw { code: "foto_tipo" };
  if (arquivo.size > TAMANHO_MAXIMO) throw { code: "foto_tamanho" };

  const antiga = perfil.foto_path;
  const nova = `${perfil.id}/${crypto.randomUUID()}.${extensao}`;
  await conferir(fotos.upload(nova, arquivo));
  try {
    perfil = await alterar({ foto_path: nova });
  } catch (erro) {
    await fotos.remove([nova]);
    throw erro;
  }
  if (antiga) await fotos.remove([antiga]);
  foto.value = "";
  exibir();
  return "Foto salva.";
});

aoEnviar($("form-senha"), async ({ senha }) => {
  await conferir(supabase.auth.updateUser({ password: senha.value }));
  senha.value = "";
  return "Senha trocada.";
});

$("sair").addEventListener("click", sair);

if (perfil) {
  $("titulo-perfil").textContent = "Perfil";
  $("form-perfil").querySelector(".botao").textContent = "Salvar perfil";
  for (const id of ["form-foto", "form-senha", "sair"]) $(id).hidden = false;
  preencher();
  exibir();
}
$("voltar").hidden = !perfil;
avisar($("mensagem"), "");
$("quadros").hidden = false;
