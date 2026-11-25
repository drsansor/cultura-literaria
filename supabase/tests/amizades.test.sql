begin;
select plan(62);

create temp table p as select testes.criar_pessoa('ana') as ana, testes.criar_pessoa('bia') as bia, testes.criar_pessoa('caio') as caio,
  testes.criar_pessoa('sem') as sem, testes.criar_pessoa('adm') as adm;
grant select on p to anon, authenticated;
insert into public.perfis (id, nome, usuario) select ana, 'Ana', 'ana_teste' from p union all select bia, 'Bia', 'bia_teste' from p
  union all select caio, 'Caio', 'caio_teste' from p;
insert into public.perfis (id, nome, usuario, admin) select adm, 'Adm', 'adm_teste', true from p;
-- Independe do que houver no banco; o rollback devolve tudo.
delete from public.amizades;

-- Estrutura e GRANTs
select has_table('public', 'amizades', 'amizades: existe');
select col_not_null('public', 'amizades', c, 'amizades: ' || c || ' obrigatório') from unnest(array['solicitante_id', 'destinatario_id', 'status', 'criado_em']) c;
select policies_are('public', 'amizades', array['amizades_ler', 'amizades_inserir', 'amizades_alterar', 'amizades_apagar'], 'amizades: políticas exatas');
select table_privs_are('public', 'amizades', 'anon', array[]::text[], 'amizades: anon sem GRANT');
select table_privs_are('public', 'amizades', 'authenticated', array['DELETE'], 'amizades: só delete é da tabela');
select column_privs_are('public', 'amizades', c, 'authenticated', array['SELECT'], 'amizades: GRANT de ' || c) from unnest(array['id', 'criado_em']) c;
select column_privs_are('public', 'amizades', c, 'authenticated', array['SELECT', 'INSERT'], 'amizades: GRANT de ' || c) from unnest(array['solicitante_id', 'destinatario_id']) c;
select column_privs_are('public', 'amizades', 'status', 'authenticated', array['SELECT', 'UPDATE'], 'amizades: GRANT de status');

-- Pedir
select testes.como((select ana from p));
select lives_ok($$ insert into public.amizades (solicitante_id, destinatario_id) select ana, bia from p $$, 'amizades_inserir: pede amizade');
select results_eq($$ select status from public.amizades $$, $$ values ('pendente'::text) $$, 'amizades: o pedido nasce pendente');
select throws_ok(format($$ insert into public.amizades (solicitante_id, destinatario_id, status) select ana, caio, %L from p $$, s), '42501', null, 'amizades_inserir: status ' || s || ' não é forjável') from unnest(array['pendente', 'aceita']) s;
select throws_ok($$ insert into public.amizades (id, solicitante_id, destinatario_id) select gen_random_uuid(), ana, caio from p $$, '42501', null, 'amizades_inserir: id não é forjável');
select throws_ok($$ insert into public.amizades (solicitante_id, destinatario_id, criado_em) select ana, caio, '2099-01-01' from p $$, '42501', null, 'amizades_inserir: data não é forjável');
select throws_ok($$ insert into public.amizades (solicitante_id, destinatario_id) select caio, bia from p $$, '42501', null, 'amizades_inserir: em nome de outra pessoa');
select throws_ok($$ insert into public.amizades (solicitante_id, destinatario_id) select caio, ana from p $$, '42501', null, 'amizades_inserir: não inventa pedido para si');
select throws_ok($$ insert into public.amizades (solicitante_id, destinatario_id) select ana, ana from p $$, '23514', null, 'amizades_destinatario_id_check: pedir a si mesmo');
select throws_ok($$ insert into public.amizades (solicitante_id, destinatario_id) select ana, bia from p $$, '23505', null, 'amizades_par_key: pedido repetido');
select throws_ok($$ insert into public.amizades (solicitante_id, destinatario_id) select ana, gen_random_uuid() from p $$, '23503', null, 'amizades_inserir: destinatário precisa existir');
select throws_ok($$ insert into public.amizades (solicitante_id, destinatario_id) select ana, sem from p $$, '23503', null, 'amizades_inserir: destinatário precisa ter perfil');
select testes.como((select bia from p));
select throws_ok($$ insert into public.amizades (solicitante_id, destinatario_id) select bia, ana from p $$, '23505', null, 'amizades_par_key: pedido inverso');

-- Solicitante, terceiro e admin não aceitam
select testes.como((select ana from p));
update public.amizades set status = 'aceita';
select testes.como((select caio from p));
update public.amizades set status = 'aceita';
select testes.como((select adm from p));
update public.amizades set status = 'aceita';
select testes.como((select sem from p));
update public.amizades set status = 'aceita';
select testes.dono_do_banco();
select results_eq($$ select status from public.amizades $$, $$ values ('pendente'::text) $$, 'amizades_alterar: solicitante, terceiro, admin e sem perfil não aceitam');

-- Ler e apagar como terceiro
select testes.como((select caio from p));
select is((select count(*)::int from public.amizades), 0, 'amizades_ler: terceiro não lê');
delete from public.amizades;
select testes.como((select adm from p));
select is((select count(*)::int from public.amizades), 0, 'amizades_ler: admin não lê a dos outros');
delete from public.amizades;
select testes.como((select sem from p));
select is((select count(*)::int from public.amizades), 0, 'amizades_ler: sem perfil não lê');
select throws_ok($$ insert into public.amizades (solicitante_id, destinatario_id) select sem, bia from p $$, '42501', null, 'amizades_inserir: sem perfil não pede');
delete from public.amizades;
select testes.anonimo();
select throws_ok($$ select id from public.amizades $$, '42501', null, 'amizades_ler: anon não lê');
select throws_ok($$ insert into public.amizades (solicitante_id, destinatario_id) select ana, caio from p $$, '42501', null, 'amizades_inserir: anon não pede');
select throws_ok($$ update public.amizades set status = 'aceita' $$, '42501', null, 'amizades_alterar: anon não altera');
select throws_ok($$ delete from public.amizades $$, '42501', null, 'amizades_apagar: anon não apaga');
select testes.dono_do_banco();
select is((select count(*)::int from public.amizades), 1, 'amizades_apagar: terceiro, admin e sem perfil não apagam');

-- Participantes leem; só a destinatária aceita, e só uma vez
select testes.como((select ana from p));
select is((select count(*)::int from public.amizades), 1, 'amizades_ler: solicitante lê');
select throws_ok(format('update public.amizades set %I = %I', c, c), '42501', null, 'amizades_alterar: solicitante não altera ' || c) from unnest(array['id', 'solicitante_id', 'destinatario_id', 'criado_em']) c;
select testes.como((select bia from p));
select is((select count(*)::int from public.amizades), 1, 'amizades_ler: destinatária lê');
select throws_ok(format('update public.amizades set %I = %I', c, c), '42501', null, 'amizades_alterar: destinatária não altera ' || c) from unnest(array['id', 'solicitante_id', 'destinatario_id', 'criado_em']) c;
select throws_ok($$ update public.amizades set status = 'pendente' $$, '42501', null, 'amizades_alterar: pendente só pode virar aceita');
select throws_ok($$ update public.amizades set status = 'recusada' $$, '42501', null, 'amizades_alterar: status inventado');
select lives_ok($$ update public.amizades set status = 'aceita' $$, 'amizades_alterar: destinatária aceita');
select results_eq($$ select status from public.amizades $$, $$ values ('aceita'::text) $$, 'amizades_alterar: ficou aceita');
update public.amizades set status = 'pendente';
select testes.como((select ana from p));
update public.amizades set status = 'pendente';
select testes.dono_do_banco();
select results_eq($$ select status from public.amizades $$, $$ values ('aceita'::text) $$, 'amizades_alterar: aceita não volta para pendente');
grant update (destinatario_id) on public.amizades to authenticated;
update public.amizades set status = 'pendente';
select testes.como((select bia from p));
select throws_ok($$ update public.amizades set status = 'aceita', destinatario_id = (select caio from p) $$, '42501', null, 'amizades_alterar: with check impede trocar de destinatária');
select testes.dono_do_banco();
revoke update (destinatario_id) on public.amizades from authenticated;

-- Restrições, como dono do banco
select throws_ok($$ update public.amizades set status = 'recusada' $$, '23514', null, 'amizades_status_check: recusa outro valor');
select throws_ok($$ update public.amizades set status = '' $$, '23514', null, 'amizades_status_check: recusa vazio');
select lives_ok(format('update public.amizades set status = %L', s), 'amizades_status_check: aceita ' || s) from unnest(array['pendente', 'aceita']) s;
select throws_ok($$ update public.amizades set solicitante_id = destinatario_id $$, '23514', null, 'amizades_destinatario_id_check: vale também ao alterar');

-- Apagar: cada participante
insert into public.amizades (solicitante_id, destinatario_id) select bia, caio from p union all select ana, caio from p;
select testes.como((select ana from p));
delete from public.amizades;
select testes.dono_do_banco();
select results_eq($$ select solicitante_id from public.amizades $$, $$ select bia from p $$, 'amizades_apagar: solicitante em massa só apaga as suas');
select testes.como((select caio from p));
delete from public.amizades;
select testes.dono_do_banco();
select is((select count(*)::int from public.amizades), 0, 'amizades_apagar: destinatário apaga (recusa)');
select testes.como((select caio from p));
select lives_ok($$ insert into public.amizades (solicitante_id, destinatario_id) select caio, bia from p $$, 'amizades_par_key: depois de apagado, pode pedir de novo');

-- Cascata
select testes.dono_do_banco();
insert into public.amizades (solicitante_id, destinatario_id) select ana, bia from p union all select adm, ana from p;
delete from auth.users where id = (select ana from p);
select results_eq($$ select solicitante_id from public.amizades $$, $$ select caio from p $$, 'amizades: apagar a pessoa apaga só as dela, dos dois lados');

-- A FK já impede vínculo de quem não tem perfil; sem ela, a política ainda nega.
alter table public.amizades drop constraint amizades_solicitante_id_fkey;
alter table public.amizades disable trigger amizades_notificar_pedido;
insert into public.amizades (solicitante_id, destinatario_id) select sem, bia from p;
select testes.como((select sem from p));
select is((select count(*)::int from public.amizades), 0, 'amizades_ler: sem perfil não lê nem o próprio vínculo');

select * from finish();
rollback;
