import { supabase } from "./supabase.js";

const irParaLogin = () => location.replace("/");

// Só controla a interface: quem protege os dados são as políticas RLS no Supabase.
const { data } = await supabase.auth.getSession();
if (!data.session) {
  irParaLogin();
} else {
  document.getElementById("email").textContent = data.session.user.email;
  document.getElementById("menu").hidden = false;
}

document.getElementById("sair").addEventListener("click", async () => {
  await supabase.auth.signOut({ scope: "local" });
  irParaLogin();
});
