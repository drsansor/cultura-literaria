begin;
select plan(23);
set local storage.allow_delete_query = 'true';

create temp table p as select testes.criar_pessoa('ana') as ana, testes.criar_pessoa('bia') as bia, testes.criar_pessoa('sem') as sem;
grant select on p to anon, authenticated;
insert into public.perfis (id, nome, usuario) select ana, 'Ana', 'ana_teste' from p union all select bia, 'Bia', 'bia_teste' from p;
insert into storage.buckets (id, name) values ('outro', 'outro');
insert into storage.objects (bucket_id, name) select 'avatares', bia || '/b.png' from p;
insert into storage.objects (bucket_id, name) select 'outro', ana || '/vizinho.png' from p;

select results_eq($$ select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'avatares' $$,
  $$ values (true, 2097152::bigint, array['image/jpeg', 'image/png', 'image/webp']) $$, 'avatares: público, 2 MB e só imagens');
select policies_are('storage', 'objects', array['avatares_ler', 'avatares_inserir', 'avatares_apagar'], 'avatares: políticas exatas');
select policies_are('storage', 'buckets', array[]::text[], 'avatares: ninguém enxerga nem cria buckets');

select testes.como((select ana from p));
select lives_ok($$ insert into storage.objects (bucket_id, name) select 'avatares', ana || '/a.png' from p $$, 'avatares_inserir: na própria pasta');
select throws_ok($$ insert into storage.objects (bucket_id, name) select 'avatares', bia || '/x.png' from p $$, '42501', null, 'avatares_inserir: pasta alheia');
select throws_ok($$ insert into storage.objects (bucket_id, name) values ('avatares', 'x.png') $$, '42501', null, 'avatares_inserir: sem pasta');
select throws_ok($$ insert into storage.objects (bucket_id, name) select 'avatares', '../' || ana || '/x.png' from p $$, '42501', null, 'avatares_inserir: volta de pasta');
select throws_ok($$ insert into storage.objects (bucket_id, name) select 'outro', ana || '/x.png' from p $$, '42501', null, 'avatares_inserir: outro bucket');
select is((select count(*)::int from storage.objects), 1, 'avatares_ler: só a própria pasta, e só neste bucket');
update storage.objects set name = (select bia from p) || '/roubado.png';
select lives_ok($$ delete from storage.objects where name = (select bia from p) || '/b.png' $$, 'avatares_apagar: apagar alheio não dá erro, mas não alcança');
select testes.dono_do_banco();
select is((select count(*)::int from storage.objects where name = (select bia from p) || '/b.png'), 1, 'avatares_apagar: o arquivo alheio continua');
select is((select count(*)::int from storage.objects where name like '%roubado%'), 0, 'avatares: ninguém altera nem move');

-- Sem where nem returning a política de leitura não participa: aqui só a de apagar protege.
insert into storage.objects (bucket_id, name) select 'avatares', sem || '/s.png' from p;
select testes.como((select ana from p));
select lives_ok($$ delete from storage.objects $$, 'avatares_apagar: dono apaga em massa');
select testes.dono_do_banco();
select is((select count(*)::int from storage.objects where name = (select ana from p) || '/a.png'), 0, 'avatares_apagar: o arquivo do dono sumiu');
select is((select count(*)::int from storage.objects where name = (select bia from p) || '/b.png'), 1, 'avatares_apagar: em massa não alcança a pasta alheia');
select is((select count(*)::int from storage.objects where bucket_id = 'outro'), 1, 'avatares_apagar: em massa não alcança outro bucket');

-- Segunda identidade: quem não tem perfil não usa o Storage, nem na própria pasta.
select testes.como((select sem from p));
select throws_ok($$ insert into storage.objects (bucket_id, name) select 'avatares', sem || '/x.png' from p $$, '42501', null, 'avatares_inserir: sem perfil não envia');
select is((select count(*)::int from storage.objects), 0, 'avatares_ler: sem perfil não lista');
delete from storage.objects;
select testes.dono_do_banco();
select is((select count(*)::int from storage.objects where name = (select sem from p) || '/s.png'), 1, 'avatares_apagar: sem perfil não apaga nem o que está na sua pasta');
select testes.anonimo();
select throws_ok($$ insert into storage.objects (bucket_id, name) select 'avatares', ana || '/x.png' from p $$, '42501', null, 'avatares_inserir: anon não envia');
select is((select count(*)::int from storage.objects), 0, 'avatares_ler: anon não lista');
delete from storage.objects;
select testes.dono_do_banco();
select is((select count(*)::int from storage.objects where bucket_id = 'outro'), 1, 'avatares_apagar: o vizinho continua até o fim');
select is((select count(*)::int from storage.objects where name = (select bia from p) || '/b.png'), 1, 'avatares_apagar: anon não apaga');

select * from finish();
rollback;
