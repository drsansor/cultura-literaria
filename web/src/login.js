import { avisar } from "./dom.js";
import { mensagemDeErro } from "./erros.js";
import { supabase } from "./supabase.js";

const $ = (id) => document.getElementById(id);
const form = $("form");
const { email, senha } = form.elements;
let criando = false;

const irParaMenu = () => location.replace("/menu.html");

const mostrar = (texto, erro) => avisar($("mensagem"), texto, erro);

$("trocar").addEventListener("click", () => {
  criando = !criando;
  const acao = criando ? "Criar conta" : "Entrar";
  $("titulo-form").textContent = acao;
  $("enviar").textContent = acao;
  $("pergunta").textContent = criando ? "Já tem conta?" : "Ainda não tem conta?";
  $("trocar").textContent = criando ? "Entrar" : "Criar conta";
  $("dica-senha").hidden = !criando;
  senha.autocomplete = criando ? "new-password" : "current-password";
  senha.minLength = criando ? 8 : 0;
  senha.value = "";
  mostrar("");
});

form.addEventListener("submit", async (evento) => {
  evento.preventDefault();
  $("enviar").disabled = $("trocar").disabled = true;
  mostrar("");

  const dados = { email: email.value.trim(), password: senha.value };
  try {
    const { data, error } = criando
      ? await supabase.auth.signUp(dados)
      : await supabase.auth.signInWithPassword(dados);

    if (error) mostrar(mensagemDeErro(error), true);
    else if (data.session) irParaMenu();
    else mostrar("Conta criada. Confirme pelo link que enviamos ao seu e-mail.");
  } catch (erro) {
    mostrar(mensagemDeErro(erro), true);
  } finally {
    $("enviar").disabled = $("trocar").disabled = false;
  }
});

const { data } = await supabase.auth.getSession();
if (data.session) irParaMenu();
