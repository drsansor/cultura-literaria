begin;
select plan(255);

create temp table p as select testes.criar_pessoa('ana') as ana, testes.criar_pessoa('bia') as bia, testes.criar_pessoa('caio') as caio,
  testes.criar_pessoa('sem') as sem, testes.criar_pessoa('adm') as adm, gen_random_uuid() as g1, gen_random_uuid() as g2,
  gen_random_uuid() as geral, gen_random_uuid() as do_g1;
grant select on p to anon, authenticated;
insert into public.perfis (id, nome, usuario) select ana, 'Ana', 'ana_teste' from p union all select bia, 'Bia', 'bia_teste' from p
  union all select caio, 'Caio', 'caio_teste' from p;
insert into public.perfis (id, nome, usuario, admin) select adm, 'Adm', 'adm_teste', true from p;
-- Independe do que houver no banco; o rollback devolve tudo.
delete from public.grupos;

-- GRUPOS: estrutura e GRANTs
select has_table('public', 'grupos', 'grupos: existe');
select col_not_null('public', 'grupos', c, 'grupos: ' || c || ' obrigatório') from unnest(array['nome', 'descricao', 'criador_id', 'criado_em']) c;
select policies_are('public', 'grupos', array['grupos_ler', 'grupos_inserir', 'grupos_apagar'], 'grupos: políticas exatas');
select table_privs_are('public', 'grupos', 'anon', array[]::text[], 'grupos: anon sem GRANT');
select table_privs_are('public', 'grupos', 'authenticated', array['DELETE'], 'grupos: só delete é da tabela');
select column_privs_are('public', 'grupos', c, 'authenticated', array['SELECT'], 'grupos: GRANT de ' || c) from unnest(array['id', 'criado_em']) c;
select column_privs_are('public', 'grupos', c, 'authenticated', array['SELECT', 'INSERT'], 'grupos: GRANT de ' || c) from unnest(array['nome', 'descricao', 'criador_id']) c;

-- Inserir
select testes.como((select ana from p));
select lives_ok($$ insert into public.grupos (nome, descricao, criador_id) select 'Clube', 'Lemos', ana from p $$, 'grupos_inserir: dono cria');
select throws_ok($$ insert into public.grupos (nome, criador_id) select 'De bia', bia from p $$, '42501', null, 'grupos_inserir: em nome de outra pessoa');
select throws_ok($$ insert into public.grupos (id, nome, criador_id) select gen_random_uuid(), 'X', ana from p $$, '42501', null, 'grupos_inserir: id não é forjável');
select throws_ok($$ insert into public.grupos (nome, criador_id, criado_em) select 'X', ana, '2099-01-01' from p $$, '42501', null, 'grupos_inserir: data não é forjável');
select throws_ok($$ insert into public.grupos (nome, criador_id) select 'Clube', ana from p $$, '23505', null, 'grupos_nome_key: nome repetido');

-- Restrições
select throws_ok(format($$ insert into public.grupos (nome, criador_id) select %L, ana from p $$, c), '23514', null, 'grupos_nome_check: recusa ' || d)
  from (values ('', 'vazio'), ('   ', 'só espaços'), (E' \n\t', 'só quebras'), (repeat('n', 61), '61 letras')) as x (c, d);
select lives_ok(format($$ insert into public.grupos (nome, criador_id) select %L, ana from p $$, c), 'grupos_nome_check: aceita ' || d)
  from (values ('n', '1 letra'), (repeat('n', 60), '60 letras')) as x (c, d);
select throws_ok($$ insert into public.grupos (nome, descricao, criador_id) select 'Longa', repeat('d', 301), ana from p $$, '23514', null, 'grupos_descricao_check: recusa 301 letras');
select lives_ok($$ insert into public.grupos (nome, descricao, criador_id) select 'Longa', repeat('d', 300), ana from p $$, 'grupos_descricao_check: aceita 300 letras');
select lives_ok($$ insert into public.grupos (nome, descricao, criador_id) select 'Curta', '', ana from p $$, 'grupos_descricao_check: aceita vazia');

-- Alterar
select testes.como((select bia from p));
select lives_ok($$ insert into public.grupos (nome, criador_id) select 'Da bia', bia from p $$, 'grupos_inserir: outra pessoa também cria');
select testes.como((select ana from p));
select throws_ok(format('update public.grupos set %I = %I', c, c), '42501', null, 'grupos: criador não altera ' || c) from unnest(array['id', 'nome', 'descricao', 'criador_id', 'criado_em']) c;
select testes.como((select adm from p));
select throws_ok(format('update public.grupos set %I = %I', c, c), '42501', null, 'grupos: admin não altera ' || c) from unnest(array['id', 'nome', 'descricao', 'criador_id', 'criado_em']) c;

-- Ler
select is((select count(*)::int from public.grupos), 6, 'grupos_ler: admin lê todos');
select testes.como((select caio from p));
select is((select count(*)::int from public.grupos), 6, 'grupos_ler: quem tem perfil lê todos');
delete from public.grupos;
select testes.como((select sem from p));
select is((select count(*)::int from public.grupos), 0, 'grupos_ler: sem perfil não lê');
select throws_ok($$ insert into public.grupos (nome, criador_id) select 'X', sem from p $$, '42501', null, 'grupos_inserir: sem perfil não cria');
delete from public.grupos;
select testes.anonimo();
select throws_ok($$ select id from public.grupos $$, '42501', null, 'grupos_ler: anon não lê');
select throws_ok($$ insert into public.grupos (nome, criador_id) select 'X', ana from p $$, '42501', null, 'grupos_inserir: anon não cria');
select throws_ok($$ update public.grupos set nome = 'X' $$, '42501', null, 'grupos: anon não altera');
select throws_ok($$ delete from public.grupos $$, '42501', null, 'grupos_apagar: anon não apaga');

-- Apagar
select testes.dono_do_banco();
select is((select count(*)::int from public.grupos), 6, 'grupos_apagar: outra pessoa e sem perfil não apagam');
select testes.como((select ana from p));
delete from public.grupos;
select testes.dono_do_banco();
select results_eq($$ select nome from public.grupos $$, $$ values ('Da bia'::text) $$, 'grupos_apagar: criador em massa só apaga os seus');
select testes.como((select adm from p));
delete from public.grupos where nome = 'Da bia';
select testes.dono_do_banco();
select is((select count(*)::int from public.grupos), 0, 'grupos_apagar: admin apaga o de outra pessoa');

-- GRUPO_MEMBROS: estrutura e GRANTs
select has_table('public', 'grupo_membros', 'grupo_membros: existe');
select col_is_pk('public', 'grupo_membros', array['grupo_id', 'perfil_id'], 'grupo_membros: chave é grupo e pessoa');
select col_not_null('public', 'grupo_membros', c, 'grupo_membros: ' || c || ' obrigatório') from unnest(array['grupo_id', 'perfil_id', 'criado_em']) c;
select policies_are('public', 'grupo_membros', array['grupo_membros_ler', 'grupo_membros_inserir', 'grupo_membros_apagar'], 'grupo_membros: políticas exatas');
select table_privs_are('public', 'grupo_membros', 'anon', array[]::text[], 'grupo_membros: anon sem GRANT');
select table_privs_are('public', 'grupo_membros', 'authenticated', array['DELETE'], 'grupo_membros: só delete é da tabela');
select column_privs_are('public', 'grupo_membros', 'criado_em', 'authenticated', array['SELECT'], 'grupo_membros: GRANT de criado_em');
select column_privs_are('public', 'grupo_membros', c, 'authenticated', array['SELECT', 'INSERT'], 'grupo_membros: GRANT de ' || c) from unnest(array['grupo_id', 'perfil_id']) c;

-- Trigger: o criador entra sozinho
insert into public.grupos (id, nome, criador_id) select g1, 'G1', ana from p union all select g2, 'G2', bia from p;
select results_eq($$ select perfil_id from public.grupo_membros where grupo_id = (select g1 from p) $$, $$ select ana from p $$, 'grupos_incluir_criador: só o criador entra em G1');
select results_eq($$ select perfil_id from public.grupo_membros where grupo_id = (select g2 from p) $$, $$ select bia from p $$, 'grupos_incluir_criador: só a criadora entra em G2');
update public.grupos set criador_id = (select caio from p), nome = 'G2 novo' where id = (select g2 from p);
select is((select count(*)::int from public.grupo_membros), 2, 'grupos_incluir_criador: alterar o grupo não dispara');
update public.grupos set criador_id = (select bia from p) where id = (select g2 from p);
select testes.como((select caio from p));
select lives_ok($$ insert into public.grupos (nome, criador_id) select 'G3', caio from p $$, 'grupos_incluir_criador: funciona pelo cliente');
select is((select count(*)::int from public.grupo_membros m join public.grupos g on g.id = m.grupo_id where g.nome = 'G3' and m.perfil_id = (select caio from p)), 1, 'grupos_incluir_criador: criador pelo cliente é membro');
delete from public.grupos where nome = 'G3';
select testes.dono_do_banco();
select is((select count(*)::int from public.grupo_membros), 2, 'grupo_membros: apagar o grupo apaga só os seus');
select function_privs_are('privado', 'grupos_incluir_criador', array[]::text[], quem, array[]::text[], 'grupos_incluir_criador: ' || quem || ' não executa') from unnest(array['anon', 'authenticated']) quem;
select function_privs_are('privado', f, array['uuid'], 'authenticated', array['EXECUTE'], f || ': authenticated executa') from unnest(array['eh_membro', 'criou_grupo']) f;
select function_privs_are('privado', f, array['uuid'], 'anon', array[]::text[], f || ': anon não executa') from unnest(array['eh_membro', 'criou_grupo']) f;

-- Entrar
select testes.como((select caio from p));
select is(privado.eh_membro((select g1 from p)), false, 'eh_membro: antes de entrar');
select lives_ok($$ insert into public.grupo_membros (grupo_id, perfil_id) select g1, caio from p $$, 'grupo_membros_inserir: a pessoa entra');
select is(privado.eh_membro((select g1 from p)), true, 'eh_membro: depois de entrar');
select is(privado.eh_membro((select g2 from p)), false, 'eh_membro: não vale para outro grupo');
select is(privado.eh_membro(null), false, 'eh_membro: grupo nulo');
select is(privado.criou_grupo((select g1 from p)), false, 'criou_grupo: membro não é criador');
select throws_ok($$ insert into public.grupo_membros (grupo_id, perfil_id) select g1, caio from p $$, '23505', null, 'grupo_membros: entrar duas vezes');
select throws_ok($$ insert into public.grupo_membros (grupo_id, perfil_id) select g1, bia from p $$, '42501', null, 'grupo_membros_inserir: membro não põe outra pessoa');
select throws_ok($$ insert into public.grupo_membros (grupo_id, perfil_id, criado_em) select g2, caio, '2099-01-01' from p $$, '42501', null, 'grupo_membros_inserir: data não é forjável');
select throws_ok($$ insert into public.grupo_membros (grupo_id, perfil_id) select gen_random_uuid(), caio from p $$, '23503', null, 'grupo_membros_inserir: grupo precisa existir');
select testes.como((select ana from p));
select is(privado.criou_grupo((select g1 from p)), true, 'criou_grupo: criador');
select is(privado.criou_grupo((select g2 from p)), false, 'criou_grupo: não vale para outro grupo');
select is(privado.criou_grupo(null), false, 'criou_grupo: grupo nulo');
select throws_ok($$ insert into public.grupo_membros (grupo_id, perfil_id) select g1, bia from p $$, '42501', null, 'grupo_membros_inserir: criador não põe outra pessoa');
select testes.como((select adm from p));
select is(privado.eh_membro((select g1 from p)), false, 'eh_membro: admin não é membro por ser admin');
select is(privado.criou_grupo((select g1 from p)), false, 'criou_grupo: admin não é criador por ser admin');
select throws_ok($$ insert into public.grupo_membros (grupo_id, perfil_id) select g1, bia from p $$, '42501', null, 'grupo_membros_inserir: admin não põe outra pessoa');

-- Alterar
select throws_ok(format('update public.grupo_membros set %I = %I', c, c), '42501', null, 'grupo_membros: admin não altera ' || c) from unnest(array['grupo_id', 'perfil_id', 'criado_em']) c;
select testes.como((select ana from p));
select throws_ok(format('update public.grupo_membros set %I = %I', c, c), '42501', null, 'grupo_membros: criador não altera ' || c) from unnest(array['grupo_id', 'perfil_id', 'criado_em']) c;

-- Ler
select is((select count(*)::int from public.grupo_membros), 3, 'grupo_membros_ler: membro lê todos');
select testes.como((select bia from p));
select is((select count(*)::int from public.grupo_membros where grupo_id = (select g1 from p)), 2, 'grupo_membros_ler: não membro lê');
select testes.como((select adm from p));
select is((select count(*)::int from public.grupo_membros), 3, 'grupo_membros_ler: admin lê');
delete from public.grupo_membros;
select testes.como((select sem from p));
select is((select count(*)::int from public.grupo_membros), 0, 'grupo_membros_ler: sem perfil não lê');
select throws_ok($$ insert into public.grupo_membros (grupo_id, perfil_id) select g1, sem from p $$, '42501', null, 'grupo_membros_inserir: sem perfil não entra');
select is(privado.eh_membro((select g1 from p)), false, 'eh_membro: sem perfil');
delete from public.grupo_membros;
select testes.anonimo();
select throws_ok($$ select grupo_id from public.grupo_membros $$, '42501', null, 'grupo_membros_ler: anon não lê');
select throws_ok($$ insert into public.grupo_membros (grupo_id, perfil_id) select g2, ana from p $$, '42501', null, 'grupo_membros_inserir: anon não entra');
select throws_ok($$ update public.grupo_membros set perfil_id = perfil_id $$, '42501', null, 'grupo_membros: anon não altera');
select throws_ok($$ delete from public.grupo_membros $$, '42501', null, 'grupo_membros_apagar: anon não apaga');

-- Sair
select testes.como((select bia from p));
delete from public.grupo_membros;
select testes.como((select ana from p));
delete from public.grupo_membros;
select testes.dono_do_banco();
select is((select count(*)::int from public.grupo_membros), 3, 'grupo_membros_apagar: criador não sai nem expulsa; admin e sem perfil não expulsam');
select testes.como((select ana from p));
select lives_ok($$ insert into public.grupo_membros (grupo_id, perfil_id) select g2, ana from p $$, 'grupo_membros_inserir: criador de um grupo entra em outro');
delete from public.grupo_membros;
select testes.dono_do_banco();
select is((select count(*)::int from public.grupo_membros where perfil_id = (select ana from p)), 1, 'grupo_membros_apagar: criador sai de grupo alheio e fica no seu');
select testes.como((select caio from p));
delete from public.grupo_membros;
select is(privado.eh_membro((select g1 from p)), false, 'eh_membro: depois de sair');
select testes.dono_do_banco();
select results_eq($$ select perfil_id from public.grupo_membros order by grupo_id = (select g1 from p) desc $$, $$ select unnest(array[ana, bia]) from p $$, 'grupo_membros_apagar: membro sai em massa só de si');
insert into public.grupo_membros (grupo_id, perfil_id) select g1, caio from p;

-- PUBLICACOES: estrutura e GRANTs
delete from public.publicacoes;
select has_table('public', 'publicacoes', 'publicacoes: existe');
select col_not_null('public', 'publicacoes', c, 'publicacoes: ' || c || ' obrigatório') from unnest(array['autor_id', 'texto', 'criado_em']) c;
select policies_are('public', 'publicacoes', array['publicacoes_ler', 'publicacoes_inserir', 'publicacoes_apagar'], 'publicacoes: políticas exatas');
select table_privs_are('public', 'publicacoes', 'anon', array[]::text[], 'publicacoes: anon sem GRANT');
select table_privs_are('public', 'publicacoes', 'authenticated', array['DELETE'], 'publicacoes: só delete é da tabela');
select column_privs_are('public', 'publicacoes', c, 'authenticated', array['SELECT'], 'publicacoes: GRANT de ' || c) from unnest(array['id', 'criado_em']) c;
select column_privs_are('public', 'publicacoes', c, 'authenticated', array['SELECT', 'INSERT'], 'publicacoes: GRANT de ' || c) from unnest(array['autor_id', 'grupo_id', 'texto', 'livro_titulo', 'livro_autor']) c;

-- Inserir
select testes.como((select caio from p));
select lives_ok($$ insert into public.publicacoes (autor_id, texto) select caio, 'No geral' from p $$, 'publicacoes_inserir: publica no feed geral');
select lives_ok($$ insert into public.publicacoes (autor_id, grupo_id, texto) select caio, g1, 'No grupo' from p $$, 'publicacoes_inserir: membro publica no grupo');
select throws_ok($$ insert into public.publicacoes (autor_id, grupo_id, texto) select caio, g2, 'X' from p $$, '42501', null, 'publicacoes_inserir: não membro não publica no grupo');
select throws_ok($$ insert into public.publicacoes (autor_id, grupo_id, texto) select caio, gen_random_uuid(), 'X' from p $$, '42501', null, 'publicacoes_inserir: grupo inexistente');
select throws_ok($$ insert into public.publicacoes (autor_id, texto) select bia, 'X' from p $$, '42501', null, 'publicacoes_inserir: em nome de outra pessoa');
select throws_ok($$ insert into public.publicacoes (autor_id, grupo_id, texto) select ana, g1, 'X' from p $$, '42501', null, 'publicacoes_inserir: em nome de outro membro');
select throws_ok($$ insert into public.publicacoes (id, autor_id, texto) select gen_random_uuid(), caio, 'X' from p $$, '42501', null, 'publicacoes_inserir: id não é forjável');
select throws_ok($$ insert into public.publicacoes (autor_id, texto, criado_em) select caio, 'X', '2099-01-01' from p $$, '42501', null, 'publicacoes_inserir: data não é forjável');
select testes.como((select adm from p));
select throws_ok($$ insert into public.publicacoes (autor_id, grupo_id, texto) select adm, g1, 'X' from p $$, '42501', null, 'publicacoes_inserir: admin que não é membro não publica no grupo');

-- Restrições
select testes.como((select caio from p));
select throws_ok(format($$ insert into public.publicacoes (autor_id, texto) select caio, %L from p $$, c), '23514', null, 'publicacoes_texto_check: recusa ' || d)
  from (values ('', 'vazio'), ('   ', 'só espaços'), (E' \n\t', 'só quebras'), (repeat('t', 2001), '2001 letras')) as x (c, d);
select lives_ok(format($$ insert into public.publicacoes (autor_id, texto) select caio, %L from p $$, c), 'publicacoes_texto_check: aceita ' || d)
  from (values ('t', '1 letra'), (repeat('t', 2000), '2000 letras')) as x (c, d);
select throws_ok(format($$ insert into public.publicacoes (autor_id, texto, livro_titulo) select caio, 't', %L from p $$, c), '23514', null, 'publicacoes_livro_titulo_check: recusa ' || d)
  from (values ('', 'vazio'), ('   ', 'só espaços'), (E' \n\t', 'só quebras'), (repeat('l', 201), '201 letras')) as x (c, d);
select lives_ok(format($$ insert into public.publicacoes (autor_id, texto, livro_titulo) select caio, 't', %L from p $$, c), 'publicacoes_livro_titulo_check: aceita ' || d)
  from (values ('l', '1 letra'), (repeat('l', 200), '200 letras')) as x (c, d);
select throws_ok($$ insert into public.publicacoes (autor_id, texto, livro_autor) select caio, 't', 'Autor' from p $$, '23514', null, 'publicacoes_livro_autor_check: recusa autor sem título');
select throws_ok($$ insert into public.publicacoes (autor_id, texto, livro_titulo, livro_autor) select caio, 't', 'l', repeat('a', 121) from p $$, '23514', null, 'publicacoes_livro_autor_check: recusa 121 letras');
select lives_ok(format($$ insert into public.publicacoes (autor_id, texto, livro_titulo, livro_autor) select caio, 't', 'l', %L from p $$, c), 'publicacoes_livro_autor_check: aceita ' || d)
  from (values ('a', '1 letra'), (repeat('a', 120), '120 letras')) as x (c, d);
delete from public.publicacoes where texto not like 'No %';

-- Alterar
select throws_ok(format('update public.publicacoes set %I = %I', c, c), '42501', null, 'publicacoes: autor não altera ' || c) from unnest(array['id', 'autor_id', 'grupo_id', 'texto', 'livro_titulo', 'livro_autor', 'criado_em']) c;
select testes.como((select adm from p));
select throws_ok(format('update public.publicacoes set %I = %I', c, c), '42501', null, 'publicacoes: admin não altera ' || c) from unnest(array['id', 'autor_id', 'grupo_id', 'texto', 'livro_titulo', 'livro_autor', 'criado_em']) c;

-- Ler
select is((select count(*)::int from public.publicacoes), 2, 'publicacoes_ler: admin lê');
select testes.como((select bia from p));
select is((select count(*)::int from public.publicacoes where grupo_id = (select g1 from p)), 1, 'publicacoes_ler: não membro lê o grupo');
delete from public.publicacoes;
select testes.como((select sem from p));
select is((select count(*)::int from public.publicacoes), 0, 'publicacoes_ler: sem perfil não lê');
select throws_ok($$ insert into public.publicacoes (autor_id, texto) select sem, 'X' from p $$, '42501', null, 'publicacoes_inserir: sem perfil não publica');
delete from public.publicacoes;
select testes.anonimo();
select throws_ok($$ select id from public.publicacoes $$, '42501', null, 'publicacoes_ler: anon não lê');
select throws_ok($$ insert into public.publicacoes (autor_id, texto) select ana, 'X' from p $$, '42501', null, 'publicacoes_inserir: anon não publica');
select throws_ok($$ update public.publicacoes set texto = 'X' $$, '42501', null, 'publicacoes: anon não altera');
select throws_ok($$ delete from public.publicacoes $$, '42501', null, 'publicacoes_apagar: anon não apaga');

-- Apagar
select testes.como((select ana from p));
insert into public.publicacoes (autor_id, texto) select ana, 'Da ana' from p;
delete from public.publicacoes;
select testes.dono_do_banco();
select results_eq($$ select texto from public.publicacoes order by 1 $$, $$ values ('No geral'::text), ('No grupo') $$, 'publicacoes_apagar: dono do grupo em massa só apaga as próprias');
delete from public.grupo_membros where perfil_id = (select caio from p);
select testes.como((select caio from p));
select throws_ok($$ insert into public.publicacoes (autor_id, grupo_id, texto) select caio, g1, 'X' from p $$, '42501', null, 'publicacoes_inserir: quem saiu perde o direito na hora');
delete from public.publicacoes where grupo_id = (select g1 from p);
select testes.dono_do_banco();
select results_eq($$ select texto from public.publicacoes $$, $$ values ('No geral'::text) $$, 'publicacoes_apagar: quem saiu ainda apaga a sua');
select testes.como((select adm from p));
delete from public.publicacoes where autor_id = (select caio from p);
select testes.dono_do_banco();
select is((select count(*)::int from public.publicacoes), 0, 'publicacoes_apagar: admin apaga a de outra pessoa');
insert into public.grupo_membros (grupo_id, perfil_id) select g1, caio from p;

-- COMENTARIOS: estrutura e GRANTs
select has_table('public', 'comentarios', 'comentarios: existe');
select col_not_null('public', 'comentarios', c, 'comentarios: ' || c || ' obrigatório') from unnest(array['publicacao_id', 'autor_id', 'texto', 'criado_em']) c;
select policies_are('public', 'comentarios', array['comentarios_ler', 'comentarios_inserir', 'comentarios_apagar'], 'comentarios: políticas exatas');
select table_privs_are('public', 'comentarios', 'anon', array[]::text[], 'comentarios: anon sem GRANT');
select table_privs_are('public', 'comentarios', 'authenticated', array['DELETE'], 'comentarios: só delete é da tabela');
select column_privs_are('public', 'comentarios', c, 'authenticated', array['SELECT'], 'comentarios: GRANT de ' || c) from unnest(array['id', 'criado_em']) c;
select column_privs_are('public', 'comentarios', c, 'authenticated', array['SELECT', 'INSERT'], 'comentarios: GRANT de ' || c) from unnest(array['publicacao_id', 'autor_id', 'texto']) c;
select function_privs_are('privado', 'pode_comentar', array['uuid'], 'authenticated', array['EXECUTE'], 'pode_comentar: authenticated executa');
select function_privs_are('privado', 'pode_comentar', array['uuid'], 'anon', array[]::text[], 'pode_comentar: anon não executa');

-- Quem pode comentar
insert into public.publicacoes (id, autor_id, grupo_id, texto) select geral, ana, null, 'Geral' from p union all select do_g1, ana, g1, 'Do G1' from p;
select testes.como((select caio from p));
select is(privado.pode_comentar((select geral from p)), true, 'pode_comentar: publicação geral');
select is(privado.pode_comentar((select do_g1 from p)), true, 'pode_comentar: membro');
select is(privado.pode_comentar(gen_random_uuid()), false, 'pode_comentar: publicação inexistente');
select is(privado.pode_comentar(null), false, 'pode_comentar: publicação nula');
select testes.como((select bia from p));
select is(privado.pode_comentar((select geral from p)), true, 'pode_comentar: não membro na geral');
select is(privado.pode_comentar((select do_g1 from p)), false, 'pode_comentar: não membro no grupo');
select testes.como((select adm from p));
select is(privado.pode_comentar((select do_g1 from p)), false, 'pode_comentar: admin que não é membro');

-- Inserir
select throws_ok($$ insert into public.comentarios (publicacao_id, autor_id, texto) select do_g1, adm, 'X' from p $$, '42501', null, 'comentarios_inserir: admin que não é membro não comenta no grupo');
select testes.como((select bia from p));
select lives_ok($$ insert into public.comentarios (publicacao_id, autor_id, texto) select geral, bia, 'Bia geral' from p $$, 'comentarios_inserir: comenta na geral');
select throws_ok($$ insert into public.comentarios (publicacao_id, autor_id, texto) select do_g1, bia, 'X' from p $$, '42501', null, 'comentarios_inserir: não membro não comenta no grupo');
select testes.como((select caio from p));
select lives_ok($$ insert into public.comentarios (publicacao_id, autor_id, texto) select do_g1, caio, 'Caio grupo' from p $$, 'comentarios_inserir: membro comenta no grupo');
select lives_ok($$ insert into public.comentarios (publicacao_id, autor_id, texto) select geral, caio, 'Caio geral' from p $$, 'comentarios_inserir: outra pessoa comenta na geral');
select throws_ok($$ insert into public.comentarios (publicacao_id, autor_id, texto) select geral, bia, 'X' from p $$, '42501', null, 'comentarios_inserir: em nome de outra pessoa');
select throws_ok($$ insert into public.comentarios (publicacao_id, autor_id, texto) select do_g1, ana, 'X' from p $$, '42501', null, 'comentarios_inserir: em nome de outro membro');
select throws_ok($$ insert into public.comentarios (publicacao_id, autor_id, texto) select gen_random_uuid(), caio, 'X' from p $$, '42501', null, 'comentarios_inserir: publicação inexistente');
select throws_ok($$ insert into public.comentarios (id, publicacao_id, autor_id, texto) select gen_random_uuid(), geral, caio, 'X' from p $$, '42501', null, 'comentarios_inserir: id não é forjável');
select throws_ok($$ insert into public.comentarios (publicacao_id, autor_id, texto, criado_em) select geral, caio, 'X', '2099-01-01' from p $$, '42501', null, 'comentarios_inserir: data não é forjável');

-- Restrições
select throws_ok(format($$ insert into public.comentarios (publicacao_id, autor_id, texto) select geral, caio, %L from p $$, c), '23514', null, 'comentarios_texto_check: recusa ' || d)
  from (values ('', 'vazio'), ('   ', 'só espaços'), (E' \n\t', 'só quebras'), (repeat('t', 1001), '1001 letras')) as x (c, d);
select lives_ok(format($$ insert into public.comentarios (publicacao_id, autor_id, texto) select geral, caio, %L from p $$, c), 'comentarios_texto_check: aceita ' || d)
  from (values ('t', '1 letra'), (repeat('t', 1000), '1000 letras')) as x (c, d);
delete from public.comentarios where texto like 't%';

-- Alterar
select throws_ok(format('update public.comentarios set %I = %I', c, c), '42501', null, 'comentarios: autor não altera ' || c) from unnest(array['id', 'publicacao_id', 'autor_id', 'texto', 'criado_em']) c;
select testes.como((select adm from p));
select throws_ok(format('update public.comentarios set %I = %I', c, c), '42501', null, 'comentarios: admin não altera ' || c) from unnest(array['id', 'publicacao_id', 'autor_id', 'texto', 'criado_em']) c;

-- Ler
select is((select count(*)::int from public.comentarios), 3, 'comentarios_ler: admin lê');
select testes.como((select bia from p));
select is((select count(*)::int from public.comentarios where publicacao_id = (select do_g1 from p)), 1, 'comentarios_ler: não membro lê os do grupo');
select testes.como((select sem from p));
select is((select count(*)::int from public.comentarios), 0, 'comentarios_ler: sem perfil não lê');
select throws_ok($$ insert into public.comentarios (publicacao_id, autor_id, texto) select geral, sem, 'X' from p $$, '42501', null, 'comentarios_inserir: sem perfil não comenta');
delete from public.comentarios;
select testes.anonimo();
select throws_ok($$ select id from public.comentarios $$, '42501', null, 'comentarios_ler: anon não lê');
select throws_ok($$ insert into public.comentarios (publicacao_id, autor_id, texto) select geral, ana, 'X' from p $$, '42501', null, 'comentarios_inserir: anon não comenta');
select throws_ok($$ update public.comentarios set texto = 'X' $$, '42501', null, 'comentarios: anon não altera');
select throws_ok($$ delete from public.comentarios $$, '42501', null, 'comentarios_apagar: anon não apaga');

-- Recursão: as quatro tabelas respondem a membro, não membro e admin
select testes.como((select caio from p));
select lives_ok(format('select %I from public.%I', c, t), t || ': sem recursão para membro')
  from (values ('grupos', 'id'), ('grupo_membros', 'grupo_id'), ('publicacoes', 'id'), ('comentarios', 'id')) as x (t, c);
select testes.como((select bia from p));
select lives_ok(format('select %I from public.%I', c, t), t || ': sem recursão para não membro')
  from (values ('grupos', 'id'), ('grupo_membros', 'grupo_id'), ('publicacoes', 'id'), ('comentarios', 'id')) as x (t, c);
select testes.como((select adm from p));
select lives_ok(format('select %I from public.%I', c, t), t || ': sem recursão para admin')
  from (values ('grupos', 'id'), ('grupo_membros', 'grupo_id'), ('publicacoes', 'id'), ('comentarios', 'id')) as x (t, c);

-- Apagar
select testes.como((select ana from p));
delete from public.comentarios;
select testes.dono_do_banco();
select is((select count(*)::int from public.comentarios), 3, 'comentarios_apagar: autor da publicação, dono do grupo e sem perfil não apagam');
delete from public.grupo_membros where perfil_id = (select caio from p);
select testes.como((select caio from p));
select is(privado.pode_comentar((select do_g1 from p)), false, 'pode_comentar: quem saiu');
select throws_ok($$ insert into public.comentarios (publicacao_id, autor_id, texto) select do_g1, caio, 'X' from p $$, '42501', null, 'comentarios_inserir: quem saiu perde o direito na hora');
delete from public.comentarios;
select testes.dono_do_banco();
select results_eq($$ select texto from public.comentarios $$, $$ values ('Bia geral'::text) $$, 'comentarios_apagar: quem saiu ainda apaga os seus, e só eles');
select testes.como((select adm from p));
delete from public.comentarios where autor_id = (select bia from p);
select testes.dono_do_banco();
select is((select count(*)::int from public.comentarios), 0, 'comentarios_apagar: admin apaga o de outra pessoa');

-- Cascatas
insert into public.grupo_membros (grupo_id, perfil_id) select g1, caio from p union all select g2, ana from p union all select g2, caio from p;
insert into public.publicacoes (autor_id, grupo_id, texto) select bia, g2, 'Bia em G2' from p union all select ana, g2, 'Ana em G2' from p;
insert into public.comentarios (publicacao_id, autor_id, texto) select pub.id, caio, 'Caio em ' || pub.texto from public.publicacoes pub, p;
insert into public.comentarios (publicacao_id, autor_id, texto) select pub.id, ana, 'Ana comenta Bia' from public.publicacoes pub, p where pub.texto = 'Bia em G2';
delete from public.publicacoes where id = (select geral from p);
select results_eq($$ select texto from public.comentarios order by 1 $$, $$ values ('Ana comenta Bia'::text), ('Caio em Ana em G2'), ('Caio em Bia em G2'), ('Caio em Do G1') $$, 'comentarios: apagar a publicação apaga só os dela');
delete from public.grupos where id = (select g1 from p);
select results_eq($$ select texto from public.publicacoes order by 1 $$, $$ values ('Ana em G2'::text), ('Bia em G2') $$, 'publicacoes: apagar o grupo apaga só as dele');
select is((select count(*)::int from public.grupo_membros), 3, 'grupo_membros: apagar G1 preserva os de G2');
insert into public.grupos (nome, criador_id) select 'Outro da ana', ana from p;
delete from auth.users where id = (select ana from p);
select results_eq($$ select nome from public.grupos $$, $$ values ('G2 novo'::text) $$, 'grupos: apagar a pessoa apaga só os que ela criou');
select is((select count(*)::int from public.grupo_membros), 2, 'grupo_membros: apagar a pessoa apaga só as participações dela');
select results_eq($$ select texto from public.publicacoes $$, $$ values ('Bia em G2'::text) $$, 'publicacoes: apagar a pessoa apaga só as dela');
select results_eq($$ select texto from public.comentarios $$, $$ values ('Caio em Bia em G2'::text) $$, 'comentarios: apagar a pessoa apaga só os dela');

select * from finish();
rollback;
