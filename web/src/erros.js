const MENSAGENS = {
  invalid_credentials: "E-mail ou senha incorretos.",
  email_not_confirmed: "Confirme seu e-mail pelo link que enviamos antes de entrar.",
  user_already_exists: "Este e-mail já tem conta. Use a opção Entrar.",
  email_exists: "Este e-mail já tem conta. Use a opção Entrar.",
  weak_password: "Senha fraca. Use pelo menos 8 caracteres.",
  email_address_invalid: "Este e-mail não é válido. Confira o endereço.",
  validation_failed: "Este e-mail não é válido. Confira o endereço.",
  same_password: "A nova senha precisa ser diferente da atual.",
  foto_tipo: "Escolha uma imagem JPG, PNG ou WebP.",
  foto_tamanho: "A foto precisa ter até 2 MB.",
  perfis_usuario_key: "Este @usuário já está em uso.",
  23514: "Confira os campos e tente de novo.",
  42501: "Você não tem permissão para fazer isso.",
  over_request_rate_limit: "Muitas tentativas. Espere alguns minutos e tente de novo.",
};

const SEM_REDE = ["AuthRetryableFetchError", "StorageUnknownError"];

export function mensagemDeErro(erro) {
  // O banco não dá nome à falha de rede: só a mensagem do fetch, sem código.
  if (SEM_REDE.includes(erro.name) || /^(TypeError|FetchError): /.test(erro.message)) {
    return "Não foi possível conectar. Verifique sua internet e tente de novo.";
  }
  // Valor repetido: quem diz o que repetiu é o nome da restrição.
  const chave = erro.code === "23505" ? erro.message?.match(/constraint "(\w+)"/)?.[1] : erro.code;
  return MENSAGENS[chave] ?? "Algo deu errado. Tente de novo em instantes.";
}
