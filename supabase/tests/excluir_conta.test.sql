begin;
select plan(45);

create temp table p as select testes.criar_pessoa('ana') as ana, testes.criar_pessoa('bia') as bia, testes.criar_pessoa('caio') as caio,
  testes.criar_pessoa('sem') as sem, testes.criar_pessoa('adm') as adm, gen_random_uuid() as l1, gen_random_uuid() as ga, gen_random_uuid() as gb,
  gen_random_uuid() as pa, gen_random_uuid() as pb;
grant select on p to anon, authenticated;
insert into public.perfis (id, nome, usuario) select ana, 'Ana', 'ana_teste' from p union all select bia, 'Bia', 'bia_teste' from p
  union all select caio, 'Caio', 'caio_teste' from p;
insert into public.perfis (id, nome, usuario, admin) select adm, 'Adm', 'adm_teste', true from p;
insert into public.locais (id, tipo, nome, localizacao) select l1, 'sebo', 'Local da exclusão', 'R' from p;
insert into public.avaliacoes (local_id, autor_id, nota, comentario) select l1, ana, 4, 'A' from p union all select l1, bia, 5, 'B' from p;
insert into public.grupos (id, nome, criador_id) select ga, 'Da ana (exclusão)', ana from p union all select gb, 'Da bia (exclusão)', bia from p;
insert into public.grupo_membros (grupo_id, perfil_id) select gb, ana from p union all select ga, bia from p;
insert into public.publicacoes (id, autor_id, texto) select pa, ana, 'PA' from p union all select pb, bia, 'PB' from p;
insert into public.comentarios (publicacao_id, autor_id, texto) select pb, ana, 'Ana' from p union all select pb, caio, 'Caio' from p union all select pa, bia, 'Bia' from p;
insert into public.amizades (solicitante_id, destinatario_id) select ana, bia from p union all select caio, ana from p union all select bia, caio from p;
-- Toda coluna que aponta para perfis. Uma FK nova muda a contagem do plano e obriga a rever este teste.
create temp table fks as select c.conrelid::regclass as tabela, a.attname as coluna
  from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
  where c.contype = 'f' and c.confrelid = 'public.perfis'::regclass;

-- A função
select is((select count(*)::int from pg_proc where proname = 'excluir_minha_conta'), 1, 'excluir_minha_conta: uma só versão');
select is((select pronargs::int from pg_proc where proname = 'excluir_minha_conta'), 0, 'excluir_minha_conta: não aceita parâmetro');
select is_definer('public', 'excluir_minha_conta', array[]::name[], 'excluir_minha_conta: security definer');
select function_privs_are('public', 'excluir_minha_conta', array[]::text[], 'authenticated', array['EXECUTE'], 'excluir_minha_conta: authenticated executa');
select function_privs_are('public', 'excluir_minha_conta', array[]::text[], 'anon', array[]::text[], 'excluir_minha_conta: anon sem GRANT');
select testes.anonimo();
select throws_ok('select public.excluir_minha_conta()', '42501', null, 'excluir_minha_conta: anon não executa');

-- Sem identidade, não apaga ninguém
select testes.dono_do_banco();
create temp table antes as select count(*) as total from auth.users;
select set_config('request.jwt.claims', '{"role":"authenticated"}', true), set_config('role', 'authenticated', true);
select lives_ok('select public.excluir_minha_conta()', 'excluir_minha_conta: sem identidade não falha');
select testes.dono_do_banco();
select is((select count(*) from auth.users), (select total from antes), 'excluir_minha_conta: sem identidade não apaga ninguém');

-- Antes, ana tem linha em toda tabela que aponta para perfis
select isnt_empty(format('select 1 from %s where %I = %L', tabela, coluna, (select ana from p)), 'excluir_minha_conta: antes há linha em ' || tabela || '.' || coluna) from fks;

select testes.como((select ana from p));
select lives_ok('select public.excluir_minha_conta()', 'excluir_minha_conta: a pessoa apaga a sua');
select testes.dono_do_banco();
select is((select count(*)::int from auth.users where id = (select ana from p)), 0, 'excluir_minha_conta: o usuário some');
select is((select count(*)::int from public.perfis where id = (select ana from p)), 0, 'excluir_minha_conta: o perfil some');
select is_empty(format('select 1 from %s where %I = %L', tabela, coluna, (select ana from p)), 'excluir_minha_conta: nada resta em ' || tabela || '.' || coluna) from fks;
select is((select count(*) from auth.users), (select total - 1 from antes), 'excluir_minha_conta: só uma conta some');

-- O que é dos outros continua
select results_eq($$ select usuario from public.perfis where usuario like '%\_teste' order by 1 $$, $$ values ('adm_teste'::text), ('bia_teste'), ('caio_teste') $$, 'excluir_minha_conta: os outros perfis continuam');
select is((select count(*)::int from public.avaliacoes where autor_id = (select bia from p)), 1, 'excluir_minha_conta: avaliação alheia continua');
select is((select count(*)::int from public.locais where id = (select l1 from p)), 1, 'excluir_minha_conta: o local continua');
select results_eq($$ select perfil_id from public.grupo_membros where grupo_id = (select gb from p) $$, $$ select bia from p $$, 'excluir_minha_conta: o grupo alheio continua, sem ela');
select is((select count(*)::int from public.grupos where id = (select ga from p)), 0, 'excluir_minha_conta: o grupo criado por ela some');
select results_eq($$ select texto from public.publicacoes where id in (select pa from p union select pb from p) $$, $$ values ('PB'::text) $$, 'excluir_minha_conta: publicação alheia continua');
select results_eq($$ select texto from public.comentarios where publicacao_id in (select pa from p union select pb from p) $$, $$ values ('Caio'::text) $$, 'excluir_minha_conta: comentário alheio continua');
select results_eq($$ select solicitante_id, destinatario_id from public.amizades where solicitante_id = (select bia from p) $$, $$ select bia, caio from p $$, 'excluir_minha_conta: amizade alheia continua');
select is((select count(*)::int from public.notificacoes where para_id = (select caio from p) and de_id = (select bia from p)), 1, 'excluir_minha_conta: notificação alheia continua');

-- O token continua válido até expirar, mas não serve para nada
select testes.como((select ana from p));
select lives_ok('select public.excluir_minha_conta()', 'excluir_minha_conta: repetir não falha');
select throws_ok($$ insert into public.perfis (id, nome, usuario) select ana, 'Volta', 'ana_volta' from p $$, '23503', null, 'excluir_minha_conta: o perfil não volta com o token antigo');
select testes.dono_do_banco();
select is((select count(*) from auth.users), (select total - 1 from antes), 'excluir_minha_conta: repetir não apaga mais ninguém');

-- Quem ainda não tem perfil e quem é admin também só apagam a própria
select testes.como((select sem from p));
select lives_ok('select public.excluir_minha_conta()', 'excluir_minha_conta: sem perfil apaga a sua');
select testes.como((select adm from p));
select lives_ok('select public.excluir_minha_conta()', 'excluir_minha_conta: admin apaga a sua');
select testes.dono_do_banco();
select results_eq($$ select id from auth.users where id in (select unnest(array[ana, bia, caio, sem, adm]) from p) order by 1 $$, $$ select unnest(array[bia, caio]) from p order by 1 $$, 'excluir_minha_conta: só as próprias contas sumiram');

select * from finish();
rollback;
