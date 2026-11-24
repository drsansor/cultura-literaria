begin;
select plan(62);

create temp table p as select testes.criar_pessoa('ana') as ana, testes.criar_pessoa('bia') as bia,
  testes.criar_pessoa('sem') as sem, testes.criar_pessoa('adm') as adm, gen_random_uuid() as l1, gen_random_uuid() as l2;
grant select on p to anon, authenticated;
insert into public.perfis (id, nome, usuario) select ana, 'Ana', 'ana_teste' from p union all select bia, 'Bia', 'bia_teste' from p;
insert into public.perfis (id, nome, usuario, admin) select adm, 'Adm', 'adm_teste', true from p;
-- Independe do que houver no banco; o rollback devolve tudo.
delete from public.locais;
insert into public.locais (id, tipo, nome, localizacao) select l1, 'sebo', 'Um', 'R' from p union all select l2, 'sebo', 'Dois', 'R' from p;

-- Estrutura e GRANTs
select has_table('public', 'avaliacoes', 'avaliacoes: existe');
select col_not_null('public', 'avaliacoes', c, 'avaliacoes: ' || c || ' obrigatório') from unnest(array['local_id', 'autor_id', 'nota', 'comentario', 'criado_em']) c;
select policies_are('public', 'avaliacoes', array['avaliacoes_ler', 'avaliacoes_inserir', 'avaliacoes_alterar', 'avaliacoes_apagar'], 'avaliacoes: políticas exatas');
select table_privs_are('public', 'avaliacoes', 'anon', array[]::text[], 'avaliacoes: anon sem GRANT');
select table_privs_are('public', 'avaliacoes', 'authenticated', array['DELETE'], 'avaliacoes: só delete é da tabela');
select column_privs_are('public', 'avaliacoes', c, 'authenticated', array['SELECT'], 'avaliacoes: GRANT de ' || c) from unnest(array['id', 'criado_em']) c;
select column_privs_are('public', 'avaliacoes', c, 'authenticated', array['SELECT', 'INSERT'], 'avaliacoes: GRANT de ' || c) from unnest(array['local_id', 'autor_id']) c;
select column_privs_are('public', 'avaliacoes', c, 'authenticated', array['SELECT', 'INSERT', 'UPDATE'], 'avaliacoes: GRANT de ' || c) from unnest(array['nota', 'comentario']) c;
select has_view('public', 'locais_com_nota', 'locais_com_nota: existe');
select table_privs_are('public', 'locais_com_nota', 'anon', array[]::text[], 'locais_com_nota: anon sem GRANT');
select table_privs_are('public', 'locais_com_nota', 'authenticated', array['SELECT'], 'locais_com_nota: só leitura');
select ok((select 'security_invoker=true' = any (reloptions) from pg_class where oid = 'public.locais_com_nota'::regclass), 'locais_com_nota: usa o RLS de quem lê');

-- View sem avaliações
select testes.como((select ana from p));
select results_eq($$ select media, total from public.locais_com_nota where id = (select l1 from p) $$, $$ values (null::numeric, 0) $$, 'locais_com_nota: sem avaliações');

-- Inserir
select lives_ok($$ insert into public.avaliacoes (local_id, autor_id, nota, comentario) select l1, ana, 4, 'Bom' from p $$, 'avaliacoes_inserir: dono avalia');
select results_eq($$ select media, total from public.locais_com_nota where id = (select l1 from p) $$, $$ values (4.0::numeric, 1) $$, 'locais_com_nota: uma avaliação');
select throws_ok($$ insert into public.avaliacoes (local_id, autor_id, nota, comentario) select l1, ana, 5, 'De novo' from p $$, '23505', null, 'avaliacoes_local_id_autor_id_key: uma por pessoa');
select throws_ok($$ insert into public.avaliacoes (local_id, autor_id, nota, comentario) select l2, bia, 5, 'X' from p $$, '42501', null, 'avaliacoes_inserir: em nome de outra pessoa');
select throws_ok($$ insert into public.avaliacoes (id, local_id, autor_id, nota, comentario) select gen_random_uuid(), l2, ana, 5, 'X' from p $$, '42501', null, 'avaliacoes_inserir: id não é forjável');
select throws_ok($$ insert into public.avaliacoes (local_id, autor_id, nota, comentario, criado_em) select l2, ana, 5, 'X', '2099-01-01' from p $$, '42501', null, 'avaliacoes_inserir: data não é forjável');
select throws_ok($$ insert into public.avaliacoes (local_id, autor_id, nota, comentario) select gen_random_uuid(), ana, 5, 'X' from p $$, '23503', null, 'avaliacoes_inserir: local precisa existir');

-- Restrições
select throws_ok(format($$ insert into public.avaliacoes (local_id, autor_id, nota, comentario) select l2, ana, %s, 'X' from p $$, n), '23514', null, 'avaliacoes_nota_check: nota ' || n)
  from unnest(array[0, 6, -1]) n;
select throws_ok(format($$ insert into public.avaliacoes (local_id, autor_id, nota, comentario) select l2, ana, 3, %L from p $$, c), '23514', null, 'avaliacoes_comentario_check: recusa ' || d)
  from (values ('', 'vazio'), ('   ', 'só espaços'), (E' \n\t', 'só quebras'), (repeat('c', 1001), '1001 letras')) as x (c, d);
select lives_ok($$ insert into public.avaliacoes (local_id, autor_id, nota, comentario) select l2, ana, 1, 'c' from p $$, 'avaliacoes_nota_check: nota 1 e comentário de 1 letra');
select lives_ok($$ update public.avaliacoes set nota = 5, comentario = repeat('c', 1000) where local_id = (select l2 from p) $$, 'avaliacoes_comentario_check: 1000 letras e nota 5');

-- Segunda pessoa
select testes.como((select bia from p));
select lives_ok($$ insert into public.avaliacoes (local_id, autor_id, nota, comentario) select l1, bia, 5, 'Ótimo' from p $$, 'avaliacoes_inserir: outra pessoa avalia o mesmo local');
select results_eq($$ select media, total from public.locais_com_nota where id = (select l1 from p) $$, $$ values (4.5::numeric, 2) $$, 'locais_com_nota: notas 4 e 5');
select is((select count(*)::int from public.avaliacoes where autor_id = (select ana from p)), 2, 'avaliacoes_ler: quem tem perfil lê as dos outros');

-- Alterar
select testes.como((select ana from p));
select lives_ok($$ update public.avaliacoes set nota = 3, comentario = 'Mudei' where autor_id = (select ana from p) and local_id = (select l1 from p) $$, 'avaliacoes_alterar: dono edita');
select throws_ok(format('update public.avaliacoes set %I = %I', c, c), '42501', null, 'avaliacoes_alterar: ' || c || ' não muda') from unnest(array['id', 'autor_id', 'local_id', 'criado_em']) c;
update public.avaliacoes set comentario = 'Invadido';
select testes.como((select adm from p));
update public.avaliacoes set comentario = 'Moderado';
select testes.dono_do_banco();
select is((select comentario from public.avaliacoes where autor_id = (select bia from p)), 'Ótimo', 'avaliacoes_alterar: nem outra pessoa nem admin alteram');
select is((select count(*)::int from public.avaliacoes where comentario = 'Invadido'), 2, 'avaliacoes_alterar: em massa só alcança as próprias');
grant update (autor_id) on public.avaliacoes to authenticated;
select testes.como((select ana from p));
select throws_ok($$ update public.avaliacoes set autor_id = (select adm from p) where local_id = (select l2 from p) $$, '42501', null, 'avaliacoes_alterar: with check impede trocar de dono');
select testes.dono_do_banco();
revoke update (autor_id) on public.avaliacoes from authenticated;

-- Sem perfil e anônimo
select testes.como((select sem from p));
select is((select count(*)::int from public.avaliacoes), 0, 'avaliacoes_ler: sem perfil não lê');
select is((select count(*)::int from public.locais_com_nota), 0, 'locais_com_nota: sem perfil não lê');
select throws_ok($$ insert into public.avaliacoes (local_id, autor_id, nota, comentario) select l1, sem, 5, 'X' from p $$, '42501', null, 'avaliacoes_inserir: sem perfil não avalia');
delete from public.avaliacoes;
select testes.anonimo();
select throws_ok($$ select id from public.avaliacoes $$, '42501', null, 'avaliacoes_ler: anon não lê');
select throws_ok($$ select id from public.locais_com_nota $$, '42501', null, 'locais_com_nota: anon não lê');
select throws_ok($$ insert into public.avaliacoes (local_id, autor_id, nota, comentario) select l1, ana, 5, 'X' from p $$, '42501', null, 'avaliacoes_inserir: anon não avalia');
select throws_ok($$ update public.avaliacoes set nota = 1 $$, '42501', null, 'avaliacoes_alterar: anon não altera');
select throws_ok($$ delete from public.avaliacoes $$, '42501', null, 'avaliacoes_apagar: anon não apaga');

-- Apagar
select testes.dono_do_banco();
select is((select count(*)::int from public.avaliacoes), 3, 'avaliacoes_apagar: sem perfil não apagou nada');
select testes.como((select ana from p));
select lives_ok($$ delete from public.avaliacoes $$, 'avaliacoes_apagar: dono apaga em massa');
select testes.dono_do_banco();
select results_eq($$ select autor_id from public.avaliacoes $$, $$ select bia from p $$, 'avaliacoes_apagar: em massa só as próprias');
select testes.como((select adm from p));
select lives_ok($$ delete from public.avaliacoes where autor_id = (select bia from p) $$, 'avaliacoes_apagar: admin apaga a de outra pessoa');
select testes.dono_do_banco();
select is((select count(*)::int from public.avaliacoes), 0, 'avaliacoes_apagar: admin apagou');

-- Cascata
insert into public.avaliacoes (local_id, autor_id, nota, comentario) select l1, ana, 4, 'A' from p union all select l1, bia, 4, 'B' from p union all select l2, bia, 4, 'C' from p;
delete from auth.users where id = (select ana from p);
select results_eq($$ select comentario from public.avaliacoes order by 1 $$, $$ values ('B'::text), ('C') $$, 'avaliacoes: apagar a pessoa apaga só as dela');
delete from public.locais where id = (select l1 from p);
select results_eq($$ select comentario from public.avaliacoes $$, $$ values ('C'::text) $$, 'avaliacoes: apagar o local apaga só as dele');

select * from finish();
rollback;
