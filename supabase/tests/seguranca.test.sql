begin;
select plan(13);

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

-- Auditoria: o catálogo inteiro é exatamente o que a especificação lista.
select set_eq($$ select p.oid::regprocedure::text from pg_proc p where pronamespace in ('public'::regnamespace, 'privado'::regnamespace) and prosecdef $$,
  array['privado.tem_perfil()', 'privado.eh_admin()', 'privado.eh_membro(uuid)', 'privado.criou_grupo(uuid)', 'privado.pode_comentar(uuid)',
    'privado.grupos_incluir_criador()', 'privado.amizades_notificar_pedido()', 'privado.amizades_notificar_aceite()', 'privado.comentarios_notificar()',
    'excluir_minha_conta()'], 'security definer só o que está na lista');
select is_empty($$ select relname from pg_class where relnamespace = 'public'::regnamespace and relkind in ('v', 'm')
  and not coalesce('security_invoker=true' = any (reloptions), false) $$, 'toda view usa o RLS de quem lê');
select set_eq($$ select table_name::text, privilege_type::text from information_schema.role_table_grants
  where table_schema = 'public' and grantee = 'authenticated' $$,
  $$ values ('avaliacoes', 'DELETE'), ('grupos', 'DELETE'), ('grupo_membros', 'DELETE'), ('publicacoes', 'DELETE'), ('comentarios', 'DELETE'),
    ('amizades', 'DELETE'), ('notificacoes', 'DELETE'), ('locais_com_nota', 'SELECT') $$, 'GRANT de tabela só o que a matriz lista');
select set_eq($$ select c.relname::text, x.privilege_type::text, string_agg(a.attname, ',' order by a.attname) from pg_class c
    join pg_attribute a on a.attrelid = c.oid, aclexplode(a.attacl) x
  where c.relnamespace = 'public'::regnamespace and x.grantee in (0, 'anon'::regrole, 'authenticated'::regrole) group by 1, 2 $$,
  $$ values ('perfis', 'SELECT', 'criado_em,foto_path,id,nome,usuario'), ('perfis', 'INSERT', 'id,nome,usuario'), ('perfis', 'UPDATE', 'foto_path,nome,usuario'),
    ('locais', 'SELECT', 'criado_em,id,localizacao,nome,tipo'),
    ('influenciadores', 'SELECT', 'criado_em,foto,id,instagram,nome,tiktok,youtube'),
    ('avaliacoes', 'SELECT', 'autor_id,comentario,criado_em,id,local_id,nota'), ('avaliacoes', 'INSERT', 'autor_id,comentario,local_id,nota'),
    ('avaliacoes', 'UPDATE', 'comentario,nota'),
    ('grupos', 'SELECT', 'criado_em,criador_id,descricao,id,nome'), ('grupos', 'INSERT', 'criador_id,descricao,nome'),
    ('grupo_membros', 'SELECT', 'criado_em,grupo_id,perfil_id'), ('grupo_membros', 'INSERT', 'grupo_id,perfil_id'),
    ('publicacoes', 'SELECT', 'autor_id,criado_em,grupo_id,id,livro_autor,livro_titulo,texto'),
    ('publicacoes', 'INSERT', 'autor_id,grupo_id,livro_autor,livro_titulo,texto'),
    ('comentarios', 'SELECT', 'autor_id,criado_em,id,publicacao_id,texto'), ('comentarios', 'INSERT', 'autor_id,publicacao_id,texto'),
    ('amizades', 'SELECT', 'criado_em,destinatario_id,id,solicitante_id,status'), ('amizades', 'INSERT', 'destinatario_id,solicitante_id'),
    ('amizades', 'UPDATE', 'status'),
    ('notificacoes', 'SELECT', 'criado_em,de_id,id,lida,para_id,publicacao_id,tipo'), ('notificacoes', 'UPDATE', 'lida') $$,
  'GRANT de coluna exatamente o da matriz');

select * from finish();
rollback;
