begin;
select plan(9);

select is_empty($$ select relname from pg_class where relnamespace = 'public'::regnamespace
  and relkind in ('r','p') and not relrowsecurity $$, 'toda tabela tem RLS');
select is_empty($$ select table_name, privilege_type from information_schema.role_table_grants
  where table_schema = 'public' and grantee = 'anon' $$, 'anon não tem privilégio');
select is_empty($$ select table_name from information_schema.role_table_grants where table_schema = 'public'
  and grantee = 'authenticated' and privilege_type in ('TRUNCATE','REFERENCES','TRIGGER') $$, 'authenticated sem privilégio perigoso');
select is_empty($$ select policyname from pg_policies where schemaname in ('public', 'storage')
  and (qual = 'true' or with_check = 'true') $$, 'nenhuma política libera tudo');
select is_empty($$ select policyname from pg_policies where schemaname in ('public', 'storage')
  and roles <> '{authenticated}' $$, 'toda política é só para authenticated');
select is_empty($$ select policyname from pg_policies where schemaname in ('public', 'storage') and cmd = 'ALL' $$, 'uma política por operação');
select is_empty($$ select policyname from pg_policies where schemaname in ('public', 'storage')
  and cmd = 'UPDATE' and (qual is null or with_check is null) $$, 'update tem using e with check');
select is_empty($$ select p.oid::regprocedure from pg_proc p where pronamespace in ('public'::regnamespace, 'privado'::regnamespace)
  and has_function_privilege('anon', p.oid, 'execute') $$, 'anon não executa função nenhuma');
select is_empty($$ select p.oid::regprocedure from pg_proc p where pronamespace in ('public'::regnamespace, 'privado'::regnamespace)
  and prosecdef and proconfig is distinct from array['search_path=""'] $$, 'security definer tem search_path vazio');

select * from finish();
rollback;
