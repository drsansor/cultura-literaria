import { pessoa } from "./avatar.js";
import { aoEnviar, avisar } from "./dom.js";
import { buscarPerfil, exigirSessao, sair } from "./sessao.js";
import { conferir, supabase } from "./supabase.js";

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
  $("dica-excluir").textContent = `@${perfil.usuario}`;
  liberarExclusao();
  $("foto").replaceChildren(pessoa(perfil, { tamanho: "g" }));
}

const alterar = (dados) =>
  conferir(supabase.from("perfis").update(dados).eq("id", perfil.id).select("id, nome, usuario, foto_path").single());

const { confirmacao } = $("form-excluir").elements;
const confirmou = () => confirmacao.value.trim().toLowerCase().replace(/^@/, "") === perfil.usuario;

function liberarExclusao() {
  $("form-excluir").querySelector(".botao").disabled = !confirmou();
}

// Só termina com a pasta vazia. shortcut: o site não cria subpastas; se houver uma, para com erro e a conta continua.
async function apagarFotos() {
  for (;;) {
    const arquivos = await conferir(fotos.list(perfil.id));
    if (!arquivos.length) return;
    const apagados = await conferir(fotos.remove(arquivos.map(({ name }) => `${perfil.id}/${name}`)));
    if (!apagados.length) throw { code: "foto_nao_apagada" };
  }
}

usuario.addEventListener("input", () => {
  const limpo = usuario.value.toLowerCase().replaceAll("@", "");
  if (limpo !== usuario.value) usuario.value = limpo;
});

aoEnviar($("form-perfil"), async () => {
  const dados = { nome: nome.value.trim(), usuario: usuario.value };
  if (!perfil) {
    const { error } = await supabase.from("perfis").insert({ id: sessao.user.id, ...dados });
    // A conta foi excluída em outra aba: este login não serve mais.
    if (error?.code === "23503") return sair();
    if (error) throw error;
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

confirmacao.addEventListener("input", liberarExclusao);

// Primeiro as fotos: sem a conta, ninguém mais teria permissão para apagá-las.
aoEnviar($("form-excluir"), async () => {
  if (!confirmou()) return "";
  await apagarFotos();
  await conferir(supabase.rpc("excluir_minha_conta"));
  return sair();
});

$("sair").addEventListener("click", sair);

if (perfil) {
  $("titulo-perfil").textContent = "Perfil";
  $("form-perfil").querySelector(".botao").textContent = "Salvar perfil";
  for (const id of ["form-foto", "form-senha", "form-excluir", "sair"]) $(id).hidden = false;
  preencher();
  exibir();
}
$("voltar").hidden = !perfil;
avisar($("mensagem"), "");
$("quadros").hidden = false;
