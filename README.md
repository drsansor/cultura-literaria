# A Crise Literária no Brasil

Site para aproximar as pessoas da leitura: achar bibliotecas e sebos, avaliá-los, seguir influenciadores literários e trocar recomendações de livros.

São páginas HTML com módulos JS (Vite) que falam direto com o Supabase. Não há servidor próprio: quem decide o que cada pessoa pode fazer é o banco, com RLS e GRANTs. O Node só faz build, testes e importação de listas.

## Como rodar

Precisa de Node 22, Docker aberto, [Supabase CLI](https://supabase.com/docs/guides/local-development) e Google Chrome (para os testes).

```
npm install
npm run banco                      # Supabase local, portas 5632x
cp web/.env.example web/.env.local # preencha a chave publicável: supabase status
npm run importar                   # listas de dados/*.json
npm run dev                        # http://localhost:5173
```

Crie a conta pela própria tela; no local não há e-mail de confirmação. Para virar admin, só por SQL: `update public.perfis set admin = true where usuario = '...';`

## Testes

`npm run verificar` roda tudo: unitários, banco recriado do zero, pgTAP, cobertura do banco, ataques ao RLS pela API, build e navegador. **Ele apaga o banco local**, inclusive contas criadas à mão. As imagens das telas ficam em `web/e2e/telas/`.

Para auditar o RLS, `node scripts/rls/sabotar.mjs` quebra uma regra por vez e exige que os ataques percebam (cerca de 8 minutos; também recria o banco local).

Não rode `supabase link` enquanto desenvolve: ele fixa versões do projeto remoto e quebra o banco local. Se já rodou: `supabase unlink`, `supabase stop` e `npm run banco`.

## Conteúdo

| O quê | Onde |
|---|---|
| Bibliotecas, sebos e influenciadores | `dados/*.json` |
| Fotos dos influenciadores, com autorização de uso | `web/public/influenciadores/` |
| Nomes do "Feito por:" | `web/src/creditos.js` |
| Logo do grupo | `web/public/logo.png` |

Locais têm `nome` e `localizacao`. A `localizacao` que termina em `, Município - UF` entra no filtro da tela. As bibliotecas vêm do [Mapa das Bibliotecas Públicas](https://dados.cultura.gov.br/dataset/7d493fc6-e9b0-42d2-862b-161a9a0dd78d) (Ministério da Cultura, Creative Commons Atribuição), limpas e com municípios corrigidos pelo CEP. Influenciadores têm `nome`, `foto` (nome do arquivo ou `null`) e `instagram`, `youtube` e `tiktok` sem `@`, ao menos um.

`npm run importar` confere os arquivos, cria o que falta e atualiza o que mudou. **Nunca apaga**: corrigir o nome ou o endereço de um local cria outro, e o antigo sai à mão. Sem variáveis, usa o banco local. Para outro banco, defina `SUPABASE_URL` e `SUPABASE_SECRET_KEY` e use `npm run importar -- --producao`.

## Publicação (manual)

1. Conferir que as migrações ainda são as aprovadas: `cat supabase/config.toml supabase/migrations/*.sql | shasum -a 256`.
2. Criar o projeto Supabase e confirmar o custo. Em API settings, só o schema `public` exposto.
3. Em `config.toml`, `[remotes.production.auth.rate_limit] sign_in_sign_ups = 30` e o `site_url` de produção. O valor local, 1000, é só para os testes.
4. Configurar SMTP, ligar a confirmação de e-mail e criar a tela "esqueci a senha".
5. `supabase link`, `supabase db push`, conferir `supabase db advisors --linked` e importar com `--producao`.
6. Na hospedagem, definir `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`. A chave secreta nunca vai para o site.
7. Publicar a política de privacidade.
