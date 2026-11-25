import { avisar } from "./dom.js";
import { mensagemDeErro } from "./erros.js";
import { supabase } from "./supabase.js";

const nunca = new Promise(() => {});

// A página já está saindo: quem chamou não deve continuar.
function irPara(endereco) {
  location.replace(endereco);
  return nunca;
}

// Só controla a interface: quem protege os dados são as políticas RLS no Supabase.
export async function exigirSessao() {
  const { data } = await supabase.auth.getSession();
  return data.session ?? irPara("/");
}

// Nulo se a pessoa ainda não tem perfil. Na falha, avisa em #mensagem e não resolve.
export async function buscarPerfil({ user }) {
  const [perfil, admin] = await Promise.all([
    supabase.from("perfis").select("id, nome, usuario, foto_path").eq("id", user.id).maybeSingle(),
    supabase.rpc("sou_admin"),
  ]);
  const erro = perfil.error ?? admin.error;
  if (erro) {
    avisar(document.getElementById("mensagem"), mensagemDeErro(erro), true);
    return nunca;
  }
  return perfil.data && { ...perfil.data, admin: admin.data };
}

export async function exigirPerfil() {
  return (await buscarPerfil(await exigirSessao())) ?? irPara("/configuracao.html");
}

export async function sair() {
  await supabase.auth.signOut({ scope: "local" });
  return irPara("/");
}
