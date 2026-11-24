-- Listas: só o script de importação escreve (service_role).
create table public.locais (
  id uuid primary key default gen_random_uuid(),
  tipo text not null constraint locais_tipo_check check (tipo in ('biblioteca', 'sebo')),
  nome text not null constraint locais_nome_check check (nome ~ '\S' and char_length(nome) <= 120),
  localizacao text not null constraint locais_localizacao_check check (localizacao ~ '\S' and char_length(localizacao) <= 200),
  criado_em timestamptz not null default now(),
  constraint locais_tipo_nome_localizacao_key unique (tipo, nome, localizacao)
);

alter table public.locais enable row level security;
revoke all on public.locais from anon, authenticated;
grant select (id, tipo, nome, localizacao, criado_em) on public.locais to authenticated;
grant all on public.locais to service_role;

create policy locais_ler on public.locais for select to authenticated
  using ((select privado.tem_perfil()));

create table public.influenciadores (
  id uuid primary key default gen_random_uuid(),
  nome text not null constraint influenciadores_nome_key unique
    constraint influenciadores_nome_check check (nome ~ '\S' and char_length(nome) <= 80),
  foto text constraint influenciadores_foto_check check (foto ~ '^[A-Za-z0-9_-]{1,80}\.(jpg|png|webp)$'),
  instagram text constraint influenciadores_instagram_check check (instagram ~ '^[A-Za-z0-9_.-]{1,50}$'),
  youtube text constraint influenciadores_youtube_check check (youtube ~ '^[A-Za-z0-9_.-]{1,50}$'),
  tiktok text constraint influenciadores_tiktok_check check (tiktok ~ '^[A-Za-z0-9_.-]{1,50}$'),
  criado_em timestamptz not null default now(),
  constraint influenciadores_redes_check check (coalesce(instagram, youtube, tiktok) is not null)
);

alter table public.influenciadores enable row level security;
revoke all on public.influenciadores from anon, authenticated;
grant select (id, nome, foto, instagram, youtube, tiktok, criado_em) on public.influenciadores to authenticated;
grant all on public.influenciadores to service_role;

create policy influenciadores_ler on public.influenciadores for select to authenticated
  using ((select privado.tem_perfil()));

create table public.avaliacoes (
  id uuid primary key default gen_random_uuid(),
  local_id uuid not null references public.locais (id) on delete cascade,
  autor_id uuid not null references public.perfis (id) on delete cascade,
  nota smallint not null constraint avaliacoes_nota_check check (nota between 1 and 5),
  comentario text not null constraint avaliacoes_comentario_check check (comentario ~ '\S' and char_length(comentario) <= 1000),
  criado_em timestamptz not null default now(),
  constraint avaliacoes_local_id_autor_id_key unique (local_id, autor_id)
);
create index avaliacoes_autor_id_idx on public.avaliacoes (autor_id);

alter table public.avaliacoes enable row level security;
revoke all on public.avaliacoes from anon, authenticated;
grant select (id, local_id, autor_id, nota, comentario, criado_em), insert (local_id, autor_id, nota, comentario),
  update (nota, comentario), delete on public.avaliacoes to authenticated;
grant all on public.avaliacoes to service_role;

create policy avaliacoes_ler on public.avaliacoes for select to authenticated
  using ((select privado.tem_perfil()));
create policy avaliacoes_inserir on public.avaliacoes for insert to authenticated
  with check (autor_id = (select auth.uid()) and (select privado.tem_perfil()));
create policy avaliacoes_alterar on public.avaliacoes for update to authenticated
  using (autor_id = (select auth.uid())) with check (autor_id = (select auth.uid()));
create policy avaliacoes_apagar on public.avaliacoes for delete to authenticated
  using (autor_id = (select auth.uid()) or (select privado.eh_admin()));

create view public.locais_com_nota with (security_invoker = true) as
  select l.id, l.tipo, l.nome, l.localizacao, l.criado_em,
    round(avg(a.nota), 1) as media, count(a.id)::int as total
  from public.locais l left join public.avaliacoes a on a.local_id = l.id
  group by l.id;
revoke all on public.locais_com_nota from anon, authenticated;
grant select on public.locais_com_nota to authenticated;
grant select on public.locais_com_nota to service_role;
