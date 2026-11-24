-- Ajuda dos testes. Existe só no banco local; não faz parte das migrações.
create extension if not exists pgtap with schema extensions;
create schema if not exists testes;

create or replace function testes.criar_pessoa(apelido text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare novo uuid := gen_random_uuid();
begin
  insert into auth.users (id, email) values (novo, apelido || '-' || novo || '@example.com');
  return novo;
end $$;

-- As três abaixo trocam de role e por isso não podem ser security definer.
create or replace function testes.como(pessoa uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', pessoa, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

create or replace function testes.anonimo() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  perform set_config('role', 'anon', true);
end $$;

create or replace function testes.dono_do_banco() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
end $$;

grant usage on schema testes to anon, authenticated;
grant execute on all functions in schema testes to anon, authenticated;

begin;
select plan(5);
create temp table p as select testes.criar_pessoa('ana') as ana;
grant select on p to anon, authenticated;

select testes.como((select ana from p));
select is(current_user::text, 'authenticated', 'ajuda: como troca a role');
select is(auth.uid(), (select ana from p), 'ajuda: auth.uid segue a pessoa');

select testes.anonimo();
select is(current_user::text, 'anon', 'ajuda: anonimo troca a role');
select is(auth.uid(), null, 'ajuda: auth.uid fica nulo sem login');

select testes.dono_do_banco();
select is(current_user::text, 'postgres', 'ajuda: dono_do_banco volta a role');
select * from finish();
rollback;
