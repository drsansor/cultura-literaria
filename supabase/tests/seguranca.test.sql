begin;
select plan(3);

select is_empty($$ select relname from pg_class where relnamespace = 'public'::regnamespace
  and relkind in ('r','p') and not relrowsecurity $$, 'toda tabela tem RLS');
select is_empty($$ select table_name, privilege_type from information_schema.role_table_grants
  where table_schema = 'public' and grantee = 'anon' $$, 'anon não tem privilégio');
select is_empty($$ select table_name from information_schema.role_table_grants where table_schema = 'public'
  and grantee = 'authenticated' and privilege_type in ('TRUNCATE','REFERENCES','TRIGGER') $$, 'authenticated sem privilégio perigoso');

select * from finish();
rollback;
