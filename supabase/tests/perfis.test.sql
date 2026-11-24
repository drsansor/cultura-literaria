begin;
select plan(76);

create temp table p as select testes.criar_pessoa('ana') as ana, testes.criar_pessoa('bia') as bia,
  testes.criar_pessoa('sem') as sem, testes.criar_pessoa('adm') as adm, testes.criar_pessoa('nova') as nova;
grant select on p to anon, authenticated;
insert into public.perfis (id, nome, usuario) select bia, 'Bia', 'bia_teste' from p;
insert into public.perfis (id, nome, usuario, admin) select adm, 'Adm', 'adm_teste', true from p;

-- Estrutura
select has_table('public', 'perfis', 'perfis: existe');
select col_is_pk('public', 'perfis', 'id', 'perfis: id é a chave');
select col_not_null('public', 'perfis', 'nome', 'perfis: nome obrigatório');
select col_not_null('public', 'perfis', 'usuario', 'perfis: usuario obrigatório');
select col_not_null('public', 'perfis', 'admin', 'perfis: admin obrigatório');
select col_not_null('public', 'perfis', 'criado_em', 'perfis: criado_em obrigatório');
select col_default_is('public', 'perfis', 'admin', 'false', 'perfis: admin nasce falso');
select policies_are('public', 'perfis', array['perfis_ler', 'perfis_inserir', 'perfis_alterar'], 'perfis: políticas exatas');

-- GRANTs
select table_privs_are('public', 'perfis', 'anon', array[]::text[], 'perfis: anon sem GRANT');
select table_privs_are('public', 'perfis', 'authenticated', array[]::text[], 'perfis: authenticated só por coluna');
select column_privs_are('public', 'perfis', 'id', 'authenticated', array['SELECT', 'INSERT'], 'perfis: GRANT de id');
select column_privs_are('public', 'perfis', 'nome', 'authenticated', array['SELECT', 'INSERT', 'UPDATE'], 'perfis: GRANT de nome');
select column_privs_are('public', 'perfis', 'usuario', 'authenticated', array['SELECT', 'INSERT', 'UPDATE'], 'perfis: GRANT de usuario');
select column_privs_are('public', 'perfis', 'foto_path', 'authenticated', array['SELECT', 'UPDATE'], 'perfis: GRANT de foto_path');
select column_privs_are('public', 'perfis', 'criado_em', 'authenticated', array['SELECT'], 'perfis: GRANT de criado_em');
select column_privs_are('public', 'perfis', 'admin', 'authenticated', array[]::text[], 'perfis: nenhum GRANT de admin');
select column_privs_are('public', 'perfis', 'nome', 'anon', array[]::text[], 'perfis: anon sem GRANT de coluna');

-- Funções
select function_privs_are('privado', 'tem_perfil', array[]::text[], 'authenticated', array['EXECUTE'], 'tem_perfil: authenticated executa');
select function_privs_are('privado', 'tem_perfil', array[]::text[], 'anon', array[]::text[], 'tem_perfil: anon não executa');
select function_privs_are('privado', 'eh_admin', array[]::text[], 'authenticated', array['EXECUTE'], 'eh_admin: authenticated executa');
select function_privs_are('privado', 'eh_admin', array[]::text[], 'anon', array[]::text[], 'eh_admin: anon não executa');
select function_privs_are('public', 'sou_admin', array[]::text[], 'authenticated', array['EXECUTE'], 'sou_admin: authenticated executa');
select function_privs_are('public', 'sou_admin', array[]::text[], 'anon', array[]::text[], 'sou_admin: anon não executa');
select is_empty($$ select proname from pg_proc where pronamespace = 'privado'::regnamespace
  and (not prosecdef or proconfig is distinct from array['search_path=""']) $$, 'tem_perfil: search_path vazio');
select isnt_definer('public', 'sou_admin', 'sou_admin: roda com o privilégio de quem chama');
select schema_privs_are('privado', 'authenticated', array['USAGE'], 'eh_admin: schema privado só com USAGE');
select schema_privs_are('privado', 'anon', array[]::text[], 'eh_admin: anon fora do schema privado');

-- Inserir
select testes.como((select ana from p));
select lives_ok($$ insert into public.perfis (id, nome, usuario) select ana, 'Ana', 'ana_teste' from p $$, 'perfis_inserir: dono cria o seu');
select results_eq($$ select nome, usuario from public.perfis where id = (select ana from p) $$, $$ values ('Ana'::text, 'ana_teste'::text) $$, 'perfis_ler: dono lê o seu');
select throws_ok($$ insert into public.perfis (id, nome, usuario) select sem, 'X', 'intruso' from p $$, '42501', null, 'perfis_inserir: ninguém cria o de outra pessoa');
select testes.como((select nova from p));
select throws_ok($$ insert into public.perfis (id, nome, usuario, admin) select nova, 'N', 'nova_teste', true from p $$, '42501', null, 'perfis_inserir: admin não é forjável');
select throws_ok($$ insert into public.perfis (id, nome, usuario, criado_em) select nova, 'N', 'nova_teste', '2099-01-01' from p $$, '42501', null, 'perfis_inserir: criado_em não é forjável');
select throws_ok($$ insert into public.perfis (id, nome, usuario, foto_path) select nova, 'N', 'nova_teste', 'x' from p $$, '42501', null, 'perfis_inserir: foto não entra na criação');
select throws_ok($$ insert into public.perfis (id, nome, usuario) select nova, 'N', 'ana_teste' from p $$, '23505', null, 'perfis_usuario_key: usuário repetido');

-- Restrições
select throws_ok($$ insert into public.perfis (id, nome, usuario) select nova, 'N', 'ab' from p $$, '23514', null, 'perfis_usuario_check: 2 caracteres');
select throws_ok($$ insert into public.perfis (id, nome, usuario) select nova, 'N', repeat('a', 31) from p $$, '23514', null, 'perfis_usuario_check: 31 caracteres');
select throws_ok($$ insert into public.perfis (id, nome, usuario) select nova, 'N', 'Ab' from p $$, '23514', null, 'perfis_usuario_check: maiúscula curta');
select throws_ok($$ insert into public.perfis (id, nome, usuario) select nova, 'N', 'Abc' from p $$, '23514', null, 'perfis_usuario_check: maiúscula');
select throws_ok($$ insert into public.perfis (id, nome, usuario) select nova, 'N', 'joão' from p $$, '23514', null, 'perfis_usuario_check: acento');
select throws_ok($$ insert into public.perfis (id, nome, usuario) select nova, 'N', E'abc\n' from p $$, '23514', null, 'perfis_usuario_check: quebra de linha');
select throws_ok($$ insert into public.perfis (id, nome, usuario) select nova, '', 'nova_teste' from p $$, '23514', null, 'perfis_nome_check: vazio');
select throws_ok($$ insert into public.perfis (id, nome, usuario) select nova, '   ', 'nova_teste' from p $$, '23514', null, 'perfis_nome_check: só espaços');
select throws_ok($$ insert into public.perfis (id, nome, usuario) select nova, E' \n\t ', 'nova_teste' from p $$, '23514', null, 'perfis_nome_check: só quebras');
select throws_ok($$ insert into public.perfis (id, nome, usuario) select nova, repeat('n', 61), 'nova_teste' from p $$, '23514', null, 'perfis_nome_check: 61 caracteres');
select lives_ok($$ insert into public.perfis (id, nome, usuario) select nova, repeat('n', 60), repeat('a', 30) from p $$, 'perfis_nome_check: 60 caracteres e usuário de 30');
select lives_ok($$ update public.perfis set nome = 'N', usuario = 'a.b' where id = (select nova from p) $$, 'perfis_usuario_check: 3 caracteres');

-- Alterar
select testes.como((select ana from p));
select lives_ok($$ update public.perfis set nome = 'Ana 2' where id = (select ana from p) $$, 'perfis_alterar: dono altera o seu');
select lives_ok($$ update public.perfis set foto_path = id::text || '/0b7f0a3e-1111-4222-8333-444455556666.png' where id = (select ana from p) $$, 'perfis_foto_path_check: arquivo na própria pasta');
select throws_ok($$ update public.perfis set foto_path = (select bia from p)::text || '/0b7f0a3e-1111-4222-8333-444455556666.png' where id = (select ana from p) $$, '23514', null, 'perfis_foto_path_check: pasta alheia');
select throws_ok($$ update public.perfis set foto_path = 'https://exemplo.com/x.png' where id = (select ana from p) $$, '23514', null, 'perfis_foto_path_check: endereço externo');
select throws_ok($$ update public.perfis set foto_path = id::text || '/../x.png' where id = (select ana from p) $$, '23514', null, 'perfis_foto_path_check: volta de pasta');
select throws_ok($$ update public.perfis set foto_path = id::text || '/0b7f0a3e-1111-4222-8333-444455556666.svg' where id = (select ana from p) $$, '23514', null, 'perfis_foto_path_check: extensão proibida');
select lives_ok($$ update public.perfis set foto_path = null where id = (select ana from p) $$, 'perfis_foto_path_check: sem foto');
select throws_ok($$ update public.perfis set admin = true where id = (select ana from p) $$, '42501', null, 'perfis_alterar: admin não é alterável');
select throws_ok($$ update public.perfis set criado_em = now() where id = (select ana from p) $$, '42501', null, 'perfis_alterar: criado_em não é alterável');
select throws_ok($$ update public.perfis set id = (select sem from p) where id = (select ana from p) $$, '42501', null, 'perfis_alterar: id não é alterável');
update public.perfis set nome = 'Invadido';
select throws_ok($$ delete from public.perfis where id = (select ana from p) $$, '42501', null, 'perfis: ninguém apaga direto');
select throws_ok($$ select admin from public.perfis $$, '42501', null, 'perfis: admin não é legível');
select throws_ok($$ select id from public.perfis where admin $$, '42501', null, 'perfis: admin não serve de filtro');
select is((select count(*)::int from public.perfis where id in (select bia from p)), 1, 'perfis_ler: quem tem perfil lê os outros');
select is(public.sou_admin(), false, 'sou_admin: falso para pessoa comum');
select testes.dono_do_banco();
select is((select nome from public.perfis where id = (select bia from p)), 'Bia', 'perfis_alterar: alterar todos não muda o alheio');
select is((select nome from public.perfis where id = (select ana from p)), 'Invadido', 'perfis_alterar: alterar todos muda só o próprio');

-- Segunda trava: mesmo com GRANT em id, a política não deixa virar outra pessoa.
grant update (id) on public.perfis to authenticated;
select testes.como((select ana from p));
select throws_ok($$ update public.perfis set id = (select sem from p) where id = (select ana from p) $$, '42501', null, 'perfis_alterar: with check impede trocar de dono');
select testes.dono_do_banco();
revoke update (id) on public.perfis from authenticated;

-- Sem perfil, administrador e anônimo
select testes.como((select sem from p));
select is((select count(*)::int from public.perfis), 0, 'perfis_ler: sem perfil não lê ninguém');
select is(privado.tem_perfil(), false, 'tem_perfil: falso sem perfil');
select testes.como((select adm from p));
select is(public.sou_admin(), true, 'sou_admin: verdadeiro para admin');
select is(privado.eh_admin(), true, 'eh_admin: verdadeiro para admin');
select is(privado.tem_perfil(), true, 'tem_perfil: verdadeiro com perfil');
update public.perfis set nome = 'Moderado' where id = (select bia from p);
select throws_ok($$ delete from public.perfis where id = (select bia from p) $$, '42501', null, 'perfis: nem admin apaga direto');
select is((select nome from public.perfis where id = (select bia from p)), 'Bia', 'perfis_alterar: admin não altera o alheio');
select testes.anonimo();
select throws_ok($$ select id from public.perfis $$, '42501', null, 'perfis: anon não lê');
select throws_ok($$ select public.sou_admin() $$, '42501', null, 'sou_admin: anon não chama');
select throws_ok($$ insert into public.perfis (id, nome, usuario) select sem, 'X', 'anon_teste' from p $$, '42501', null, 'perfis_inserir: anon não insere');
select throws_ok($$ update public.perfis set nome = 'X' $$, '42501', null, 'perfis_alterar: anon não altera');

-- Cascata
select testes.dono_do_banco();
delete from auth.users where id = (select ana from p);
select results_eq($$ select (select count(*)::int from public.perfis where id = (select ana from p)), (select count(*)::int from public.perfis where id = (select bia from p)) $$,
  $$ values (0, 1) $$, 'perfis: apagar a conta apaga só o próprio perfil');

select * from finish();
rollback;
