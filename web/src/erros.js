const MENSAGENS = {
  invalid_credentials: "E-mail ou senha incorretos.",
  email_not_confirmed: "Confirme seu e-mail pelo link que enviamos antes de entrar.",
  user_already_exists: "Este e-mail já tem conta. Use a opção Entrar.",
  email_exists: "Este e-mail já tem conta. Use a opção Entrar.",
  weak_password: "Senha fraca. Use pelo menos 8 caracteres.",
  email_address_invalid: "Este e-mail não é válido. Confira o endereço.",
  validation_failed: "Este e-mail não é válido. Confira o endereço.",
  over_request_rate_limit: "Muitas tentativas. Espere alguns minutos e tente de novo.",
};

export function mensagemDeErro(erro) {
  if (erro.name === "AuthRetryableFetchError") {
    return "Não foi possível conectar. Verifique sua internet e tente de novo.";
  }
  return MENSAGENS[erro.code] ?? "Algo deu errado. Tente de novo em instantes.";
}
