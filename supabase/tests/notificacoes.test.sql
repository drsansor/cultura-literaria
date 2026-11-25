begin;
select plan(70);

create temp table p as select testes.criar_pessoa('ana') as ana, testes.criar_pessoa('bia') as bia, testes.criar_pessoa('caio') as caio,
  testes.criar_pessoa('sem') as sem, testes.criar_pessoa('adm') as adm, gen_random_uuid() as pub, gen_random_uuid() as outra;
grant select on p to anon, authenticated;
insert into public.perfis (id, nome, usuario) select ana, 'Ana', 'ana_teste' from p union all select bia, 'Bia', 'bia_teste' from p
  union all select caio, 'Caio', 'caio_teste' from p;
insert into public.perfis (id, nome, usuario, admin) select adm, 'Adm', 'adm_teste', true from p;
-- Independe do que houver no banco; o rollback devolve tudo.
delete from public.notificacoes;
-- Quem recebe, de quem, o quê e sobre qual publicação ('-' se nenhuma).
create function pg_temp.avisos() returns table (para text, de text, tipo text, sobre text) language sql as $$
  select a.usuario, b.usuario, n.tipo, case n.publicacao_id when p.pub then 'pub' when p.outra then 'outra' else coalesce(n.publicacao_id::text, '-') end
  from public.notificacoes n join public.perfis a on a.id = n.para_id join public.perfis b on b.id = n.de_id, p order by 1, 2, 3, 4;
$$;

-- Estrutura e GRANTs
select has_table('public', 'notificacoes', 'notificacoes: existe');
select col_not_null('public', 'notificacoes', c, 'notificacoes: ' || c || ' obrigatório') from unnest(array['para_id', 'de_id', 'tipo', 'lida', 'criado_em']) c;
select policies_are('public', 'notificacoes', array['notificacoes_ler', 'notificacoes_alterar', 'notificacoes_apagar'], 'notificacoes: políticas exatas');
select table_privs_are('public', 'notificacoes', 'anon', array[]::text[], 'notificacoes: anon sem GRANT');
select table_privs_are('public', 'notificacoes', 'authenticated', array['DELETE'], 'notificacoes: só delete é da tabela');
select column_privs_are('public', 'notificacoes', c, 'authenticated', array['SELECT'], 'notificacoes: GRANT de ' || c) from unnest(array['id', 'para_id', 'de_id', 'tipo', 'publicacao_id', 'criado_em']) c;
select column_privs_are('public', 'notificacoes', 'lida', 'authenticated', array['SELECT', 'UPDATE'], 'notificacoes: GRANT de lida');
select function_privs_are('privado', f, array[]::text[], quem, array[]::text[], f || ': ' || quem || ' não executa')
  from unnest(array['amizades_notificar_pedido', 'amizades_notificar_aceite', 'comentarios_notificar']) f, unnest(array['anon', 'authenticated']) quem;

-- Restrição
select throws_ok(format($$ insert into public.notificacoes (para_id, de_id, tipo) select ana, bia, %L from p $$, t), '23514', null, 'notificacoes_tipo_check: recusa ' || t) from unnest(array['curtida', 'x']) t;
select lives_ok(format($$ insert into public.notificacoes (para_id, de_id, tipo) select ana, bia, %L from p $$, t), 'notificacoes_tipo_check: aceita ' || t) from unnest(array['pedido_amizade', 'amizade_aceita', 'comentario']) t;
select is((select bool_or(lida) from public.notificacoes), false, 'notificacoes: nasce não lida');
delete from public.notificacoes;

-- Pedido
select testes.como((select ana from p));
insert into public.amizades (solicitante_id, destinatario_id) select ana, bia from p;
select testes.dono_do_banco();
select results_eq('select * from pg_temp.avisos()', $$ values ('bia_teste'::text, 'ana_teste'::text, 'pedido_amizade'::text, '-'::text) $$, 'amizades_notificar_pedido: só a destinatária recebe');
select testes.como((select ana from p));
select throws_ok($$ insert into public.amizades (solicitante_id, destinatario_id) select ana, bia from p $$, '23505', null, 'amizades_notificar_pedido: pedido recusado pelo banco');
select testes.dono_do_banco();
select is((select count(*)::int from public.notificacoes), 1, 'amizades_notificar_pedido: pedido recusado não avisa');
delete from public.notificacoes;

-- Aceite
update public.amizades set criado_em = now() where true;
update public.amizades set status = 'pendente' where true;
select is((select count(*)::int from public.notificacoes), 0, 'amizades_notificar_aceite: alterar sem aceitar não avisa');
select testes.como((select ana from p));
update public.amizades set status = 'aceita';
select testes.dono_do_banco();
select is((select count(*)::int from public.notificacoes), 0, 'amizades_notificar_aceite: tentativa do solicitante não avisa');
select testes.como((select bia from p));
update public.amizades set status = 'aceita';
select testes.dono_do_banco();
select results_eq('select * from pg_temp.avisos()', $$ values ('ana_teste'::text, 'bia_teste'::text, 'amizade_aceita'::text, '-'::text) $$, 'amizades_notificar_aceite: só o solicitante recebe');
update public.amizades set status = 'aceita';
select is((select count(*)::int from public.notificacoes), 1, 'amizades_notificar_aceite: aceita de novo não repete');
select testes.como((select bia from p));
delete from public.amizades;
select testes.dono_do_banco();
select is((select count(*)::int from public.notificacoes), 1, 'amizades_notificar_aceite: desfazer não avisa');
delete from public.notificacoes;

-- Comentário
insert into public.publicacoes (id, autor_id, texto) select pub, ana, 'Pub' from p union all select outra, caio, 'Outra' from p;
select testes.como((select bia from p));
insert into public.comentarios (publicacao_id, autor_id, texto) select pub, bia, 'Oi' from p;
select testes.dono_do_banco();
select results_eq('select * from pg_temp.avisos()', $$ values ('ana_teste'::text, 'bia_teste'::text, 'comentario'::text, 'pub'::text) $$, 'comentarios_notificar: só a autora da publicação recebe');
select testes.como((select ana from p));
insert into public.comentarios (publicacao_id, autor_id, texto) select pub, ana, 'Eu mesma' from p;
select testes.dono_do_banco();
select is((select count(*)::int from public.notificacoes), 1, 'comentarios_notificar: comentar na própria publicação não avisa');
update public.comentarios set texto = 'Mudei';
select is((select count(*)::int from public.notificacoes), 1, 'comentarios_notificar: alterar não avisa');
delete from public.comentarios;
select is((select count(*)::int from public.notificacoes), 1, 'comentarios_notificar: apagar o comentário mantém o aviso');

-- Ninguém insere
select testes.como((select ana from p));
select throws_ok($$ insert into public.notificacoes (para_id, de_id, tipo) select bia, ana, 'comentario' from p $$, '42501', null, 'notificacoes: pessoa não insere para outra');
select throws_ok($$ insert into public.notificacoes (para_id, de_id, tipo) select ana, bia, 'comentario' from p $$, '42501', null, 'notificacoes: pessoa não insere para si');
select testes.como((select adm from p));
select throws_ok($$ insert into public.notificacoes (para_id, de_id, tipo) select ana, adm, 'comentario' from p $$, '42501', null, 'notificacoes: admin não insere');
select testes.como((select sem from p));
select throws_ok($$ insert into public.notificacoes (para_id, de_id, tipo) select ana, bia, 'comentario' from p $$, '42501', null, 'notificacoes: sem perfil não insere');
select testes.dono_do_banco();
grant insert on public.notificacoes to authenticated;
select testes.como((select ana from p));
select throws_ok($$ insert into public.notificacoes (para_id, de_id, tipo) select bia, ana, 'comentario' from p $$, '42501', null, 'notificacoes: mesmo com GRANT, não há política de inserir');
select testes.dono_do_banco();
revoke insert on public.notificacoes from authenticated;

-- Ler, alterar e apagar o alheio
select is((select count(*)::int from public.notificacoes), 1, 'notificacoes: base com uma, para ana');
select testes.como((select bia from p));
select is((select count(*)::int from public.notificacoes), 0, 'notificacoes_ler: quem causou não lê');
update public.notificacoes set lida = true;
delete from public.notificacoes;
select testes.como((select caio from p));
select is((select count(*)::int from public.notificacoes), 0, 'notificacoes_ler: outra pessoa não lê');
update public.notificacoes set lida = true;
delete from public.notificacoes;
select testes.como((select adm from p));
select is((select count(*)::int from public.notificacoes), 0, 'notificacoes_ler: admin não lê');
update public.notificacoes set lida = true;
delete from public.notificacoes;
select testes.como((select sem from p));
select is((select count(*)::int from public.notificacoes), 0, 'notificacoes_ler: sem perfil não lê');
update public.notificacoes set lida = true;
delete from public.notificacoes;
select testes.anonimo();
select throws_ok($$ select id from public.notificacoes $$, '42501', null, 'notificacoes_ler: anon não lê');
select throws_ok($$ insert into public.notificacoes (para_id, de_id, tipo) select ana, bia, 'comentario' from p $$, '42501', null, 'notificacoes: anon não insere');
select throws_ok($$ update public.notificacoes set lida = true $$, '42501', null, 'notificacoes_alterar: anon não altera');
select throws_ok($$ delete from public.notificacoes $$, '42501', null, 'notificacoes_apagar: anon não apaga');
select testes.dono_do_banco();
select results_eq($$ select lida from public.notificacoes $$, $$ values (false) $$, 'notificacoes_alterar: ninguém marcou a de ana');
select is((select count(*)::int from public.notificacoes), 1, 'notificacoes_apagar: ninguém apagou a de ana');

-- A dona
insert into public.notificacoes (para_id, de_id, tipo) select caio, ana, 'pedido_amizade' from p;
select testes.como((select ana from p));
select is((select count(*)::int from public.notificacoes), 1, 'notificacoes_ler: dona lê só a sua');
select throws_ok(format('update public.notificacoes set %I = %I', c, c), '42501', null, 'notificacoes_alterar: dona não altera ' || c) from unnest(array['id', 'para_id', 'de_id', 'tipo', 'publicacao_id', 'criado_em']) c;
select lives_ok($$ update public.notificacoes set lida = true $$, 'notificacoes_alterar: dona marca como lida');
select testes.dono_do_banco();
select results_eq($$ select para_id, lida from public.notificacoes order by lida $$, $$ select caio, false from p union all select ana, true from p $$, 'notificacoes_alterar: em massa só a própria');
grant update (para_id) on public.notificacoes to authenticated;
select testes.como((select ana from p));
select throws_ok($$ update public.notificacoes set para_id = (select bia from p) $$, '42501', null, 'notificacoes_alterar: with check impede passar para outra pessoa');
select testes.dono_do_banco();
revoke update (para_id) on public.notificacoes from authenticated;
select testes.como((select ana from p));
delete from public.notificacoes;
select testes.dono_do_banco();
select results_eq($$ select para_id from public.notificacoes $$, $$ select caio from p $$, 'notificacoes_apagar: dona em massa só apaga as suas');

-- Cascatas
delete from public.notificacoes;
insert into public.notificacoes (para_id, de_id, tipo, publicacao_id) select ana, bia, 'comentario', pub from p union all select caio, bia, 'comentario', outra from p
  union all select bia, ana, 'pedido_amizade', null from p;
delete from public.publicacoes where id = (select pub from p);
select results_eq('select * from pg_temp.avisos()', $$ values ('bia_teste'::text, 'ana_teste'::text, 'pedido_amizade'::text, '-'::text), ('caio_teste', 'bia_teste', 'comentario', 'outra') $$, 'notificacoes: apagar a publicação apaga só as dela');
insert into public.notificacoes (para_id, de_id, tipo) select ana, caio, 'pedido_amizade' from p;
delete from auth.users where id = (select ana from p);
select results_eq('select * from pg_temp.avisos()', $$ values ('caio_teste'::text, 'bia_teste'::text, 'comentario'::text, 'outra'::text) $$, 'notificacoes: apagar a pessoa apaga as que recebeu e as que causou');

-- A FK já impede aviso a quem não tem perfil; sem ela, a política ainda nega.
alter table public.notificacoes drop constraint notificacoes_para_id_fkey;
insert into public.notificacoes (para_id, de_id, tipo) select sem, bia, 'comentario' from p;
select testes.como((select sem from p));
select is((select count(*)::int from public.notificacoes), 0, 'notificacoes_ler: sem perfil não lê nem a própria');

select * from finish();
rollback;
