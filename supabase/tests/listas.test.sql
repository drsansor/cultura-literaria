begin;
select plan(77);

create temp table p as select testes.criar_pessoa('ana') as ana, testes.criar_pessoa('sem') as sem, testes.criar_pessoa('adm') as adm;
grant select on p to anon, authenticated;
insert into public.perfis (id, nome, usuario) select ana, 'Ana', 'ana_teste' from p;
insert into public.perfis (id, nome, usuario, admin) select adm, 'Adm', 'adm_teste', true from p;

-- Independe do que houver no banco; o rollback devolve tudo.
delete from public.locais;
delete from public.influenciadores;

-- Estrutura
select has_table('public', t, t || ': existe') from unnest(array['locais', 'influenciadores']) t;
select col_not_null('public', 'locais', c, 'locais: ' || c || ' obrigatório') from unnest(array['tipo', 'nome', 'localizacao', 'criado_em']) c;
select col_not_null('public', 'influenciadores', c, 'influenciadores: ' || c || ' obrigatório') from unnest(array['nome', 'criado_em']) c;
select policies_are('public', 'locais', array['locais_ler'], 'locais: políticas exatas');
select policies_are('public', 'influenciadores', array['influenciadores_ler'], 'influenciadores: políticas exatas');
select table_privs_are('public', t, 'anon', array[]::text[], t || ': anon sem GRANT') from unnest(array['locais', 'influenciadores']) t;
select table_privs_are('public', t, 'authenticated', array[]::text[], t || ': authenticated só por coluna') from unnest(array['locais', 'influenciadores']) t;
select column_privs_are('public', 'locais', c, 'authenticated', array['SELECT'], 'locais: GRANT de ' || c)
  from unnest(array['id', 'tipo', 'nome', 'localizacao', 'criado_em']) c;
select column_privs_are('public', 'influenciadores', c, 'authenticated', array['SELECT'], 'influenciadores: GRANT de ' || c)
  from unnest(array['id', 'nome', 'foto', 'instagram', 'youtube', 'tiktok', 'criado_em']) c;

-- Restrições de locais, como dono do banco: o script de importação é quem escreve.
select lives_ok($$ insert into public.locais (tipo, nome, localizacao) values ('biblioteca', 'B', 'R') $$, 'locais_nome_check: 1 letra e locais_localizacao_check: 1 letra');
select lives_ok($$ insert into public.locais (tipo, nome, localizacao) values ('sebo', repeat('n', 120), repeat('l', 200)) $$, 'locais_tipo_check: sebo, nome de 120 e localização de 200');
select lives_ok($$ insert into public.locais (tipo, nome, localizacao) values ('sebo', 'B', 'R') $$, 'locais_tipo_nome_localizacao_key: mesmo nome em outro tipo pode');
select throws_ok($$ insert into public.locais (tipo, nome, localizacao) values ('biblioteca', 'B', 'R') $$, '23505', null, 'locais_tipo_nome_localizacao_key: repetido');
select throws_ok($$ insert into public.locais (tipo, nome, localizacao) values ('livraria', 'B', 'R') $$, '23514', null, 'locais_tipo_check: outro tipo');
select throws_ok($$ insert into public.locais (tipo, nome, localizacao) values ('sebo', '', 'R') $$, '23514', null, 'locais_nome_check: vazio');
select throws_ok($$ insert into public.locais (tipo, nome, localizacao) values ('sebo', E' \n ', 'R') $$, '23514', null, 'locais_nome_check: só espaços');
select throws_ok($$ insert into public.locais (tipo, nome, localizacao) values ('sebo', repeat('n', 121), 'R') $$, '23514', null, 'locais_nome_check: 121');
select throws_ok($$ insert into public.locais (tipo, nome, localizacao) values ('sebo', 'S', '') $$, '23514', null, 'locais_localizacao_check: vazia');
select throws_ok($$ insert into public.locais (tipo, nome, localizacao) values ('sebo', 'S', '  ') $$, '23514', null, 'locais_localizacao_check: só espaços');
select throws_ok($$ insert into public.locais (tipo, nome, localizacao) values ('sebo', 'S', repeat('l', 201)) $$, '23514', null, 'locais_localizacao_check: 201');

-- Restrições de influenciadores
select lives_ok($$ insert into public.influenciadores (nome, instagram) values ('I', 'a') $$, 'influenciadores_redes_check: só uma rede basta');
select lives_ok($$ insert into public.influenciadores (nome, youtube) values ('Y', repeat('a', 50)) $$, 'influenciadores_youtube_check: 50 letras');
select lives_ok($$ insert into public.influenciadores (nome, tiktok) values (repeat('n', 80), 'A_b.c-1') $$, 'influenciadores_tiktok_check: todos os símbolos e nome de 80');
select throws_ok($$ insert into public.influenciadores (nome) values ('Z') $$, '23514', null, 'influenciadores_redes_check: sem rede');
select throws_ok($$ insert into public.influenciadores (nome, instagram) values ('I', 'b') $$, '23505', null, 'influenciadores_nome_key: repetido');
select throws_ok($$ insert into public.influenciadores (nome, instagram) values ('', 'b') $$, '23514', null, 'influenciadores_nome_check: vazio');
select throws_ok($$ insert into public.influenciadores (nome, instagram) values ('  ', 'b') $$, '23514', null, 'influenciadores_nome_check: só espaços');
select throws_ok($$ insert into public.influenciadores (nome, instagram) values (repeat('n', 81), 'b') $$, '23514', null, 'influenciadores_nome_check: 81');
select throws_ok(format('insert into public.influenciadores (nome, %I) values (%L, %L)', r, 'R', v), '23514', null, 'influenciadores_' || r || '_check: ' || d)
  from unnest(array['instagram', 'youtube', 'tiktok']) r,
    (values ('@liv', 'arroba'), ('', 'vazia'), (repeat('a', 51), '51 letras'), ('a/b', 'barra'), ('javascript:x', 'dois pontos')) as x (v, d);
select throws_ok($$ insert into public.influenciadores (nome, instagram) values ('R', '@liv') $$, '23514', null, 'influenciadores_instagram_check: arroba');
select lives_ok($$ update public.influenciadores set foto = 'liv-1_a.jpg' where nome = 'I' $$, 'influenciadores_foto_check: arquivo simples');
select throws_ok(format('update public.influenciadores set foto = %L where nome = %L', v, 'I'), '23514', null, 'influenciadores_foto_check: recusa ' || v)
  from unnest(array['../x.jpg', 'https://exemplo.com/x.jpg', 'x.svg']) v;

-- Políticas
select testes.como((select ana from p));
select is((select count(*)::int from public.locais), 3, 'locais_ler: quem tem perfil lê');
select is((select count(*)::int from public.influenciadores), 3, 'influenciadores_ler: quem tem perfil lê');
select testes.como((select sem from p));
select is((select count(*)::int from public.locais), 0, 'locais_ler: sem perfil não lê');
select is((select count(*)::int from public.influenciadores), 0, 'influenciadores_ler: sem perfil não lê');
select testes.como((select adm from p));
select throws_ok($$ insert into public.locais (tipo, nome, localizacao) values ('sebo', 'X', 'Y') $$, '42501', null, 'locais: nem admin insere');
select throws_ok($$ update public.locais set nome = 'X' $$, '42501', null, 'locais: nem admin altera');
select throws_ok($$ delete from public.locais $$, '42501', null, 'locais: nem admin apaga');
select throws_ok($$ insert into public.influenciadores (nome, instagram) values ('X', 'y') $$, '42501', null, 'influenciadores: nem admin insere');
select throws_ok($$ update public.influenciadores set nome = 'X' $$, '42501', null, 'influenciadores: nem admin altera');
select throws_ok($$ delete from public.influenciadores $$, '42501', null, 'influenciadores: nem admin apaga');
select testes.anonimo();
select throws_ok($$ select id from public.locais $$, '42501', null, 'locais_ler: anon não lê');
select throws_ok($$ select id from public.influenciadores $$, '42501', null, 'influenciadores_ler: anon não lê');

select * from finish();
rollback;
