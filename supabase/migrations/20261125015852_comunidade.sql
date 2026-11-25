create table public.grupos (
  id uuid primary key default gen_random_uuid(),
  nome text not null constraint grupos_nome_key unique
    constraint grupos_nome_check check (nome ~ '\S' and char_length(nome) <= 60),
  descricao text not null default '' constraint grupos_descricao_check check (char_length(descricao) <= 300),
  criador_id uuid not null references public.perfis (id) on delete cascade,
  criado_em timestamptz not null default now()
);
create index grupos_criador_id_idx on public.grupos (criador_id);

alter table public.grupos enable row level security;
revoke all on public.grupos from anon, authenticated;
grant select (id, nome, descricao, criador_id, criado_em), insert (nome, descricao, criador_id), delete on public.grupos to authenticated;
grant all on public.grupos to service_role;

create policy grupos_ler on public.grupos for select to authenticated
  using ((select privado.tem_perfil()));
create policy grupos_inserir on public.grupos for insert to authenticated
  with check (criador_id = (select auth.uid()) and (select privado.tem_perfil()));
create policy grupos_apagar on public.grupos for delete to authenticated
  using (criador_id = (select auth.uid()) or (select privado.eh_admin()));

create table public.grupo_membros (
  grupo_id uuid not null references public.grupos (id) on delete cascade,
  perfil_id uuid not null references public.perfis (id) on delete cascade,
  criado_em timestamptz not null default now(),
  primary key (grupo_id, perfil_id)
);
create index grupo_membros_perfil_id_idx on public.grupo_membros (perfil_id);

alter table public.grupo_membros enable row level security;
revoke all on public.grupo_membros from anon, authenticated;
grant select (grupo_id, perfil_id, criado_em), insert (grupo_id, perfil_id), delete on public.grupo_membros to authenticated;
grant all on public.grupo_membros to service_role;

-- security definer: consultam outra tabela sem passar pela política dela, o que evita recursão.
create function privado.eh_membro(grupo uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.grupo_membros m where m.grupo_id = grupo and m.perfil_id = (select auth.uid()));
$$;

create function privado.criou_grupo(grupo uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.grupos g where g.id = grupo and g.criador_id = (select auth.uid()));
$$;

create function privado.grupos_incluir_criador() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.grupo_membros (grupo_id, perfil_id) values (new.id, new.criador_id);
  return null;
end $$;

revoke all on function privado.eh_membro(uuid), privado.criou_grupo(uuid), privado.grupos_incluir_criador() from public, anon, authenticated;
grant execute on function privado.eh_membro(uuid), privado.criou_grupo(uuid) to authenticated;

create trigger grupos_incluir_criador after insert on public.grupos
  for each row execute function privado.grupos_incluir_criador();

create policy grupo_membros_ler on public.grupo_membros for select to authenticated
  using ((select privado.tem_perfil()));
create policy grupo_membros_inserir on public.grupo_membros for insert to authenticated
  with check (perfil_id = (select auth.uid()) and (select privado.tem_perfil()));
create policy grupo_membros_apagar on public.grupo_membros for delete to authenticated
  using (perfil_id = (select auth.uid()) and not privado.criou_grupo(grupo_id));

create table public.publicacoes (
  id uuid primary key default gen_random_uuid(),
  autor_id uuid not null references public.perfis (id) on delete cascade,
  grupo_id uuid references public.grupos (id) on delete cascade,
  texto text not null constraint publicacoes_texto_check check (texto ~ '\S' and char_length(texto) <= 2000),
  livro_titulo text constraint publicacoes_livro_titulo_check check (livro_titulo ~ '\S' and char_length(livro_titulo) <= 200),
  livro_autor text,
  criado_em timestamptz not null default now(),
  constraint publicacoes_livro_autor_check
    check (livro_autor is null or (livro_titulo is not null and char_length(livro_autor) <= 120))
);
create index publicacoes_autor_id_idx on public.publicacoes (autor_id);
create index publicacoes_grupo_id_idx on public.publicacoes (grupo_id);

alter table public.publicacoes enable row level security;
revoke all on public.publicacoes from anon, authenticated;
grant select (id, autor_id, grupo_id, texto, livro_titulo, livro_autor, criado_em),
  insert (autor_id, grupo_id, texto, livro_titulo, livro_autor), delete on public.publicacoes to authenticated;
grant all on public.publicacoes to service_role;

create policy publicacoes_ler on public.publicacoes for select to authenticated
  using ((select privado.tem_perfil()));
create policy publicacoes_inserir on public.publicacoes for insert to authenticated
  with check (autor_id = (select auth.uid()) and (select privado.tem_perfil())
    and (grupo_id is null or privado.eh_membro(grupo_id)));
create policy publicacoes_apagar on public.publicacoes for delete to authenticated
  using (autor_id = (select auth.uid()) or (select privado.eh_admin()));

create table public.comentarios (
  id uuid primary key default gen_random_uuid(),
  publicacao_id uuid not null references public.publicacoes (id) on delete cascade,
  autor_id uuid not null references public.perfis (id) on delete cascade,
  texto text not null constraint comentarios_texto_check check (texto ~ '\S' and char_length(texto) <= 1000),
  criado_em timestamptz not null default now()
);
create index comentarios_publicacao_id_idx on public.comentarios (publicacao_id);
create index comentarios_autor_id_idx on public.comentarios (autor_id);

alter table public.comentarios enable row level security;
revoke all on public.comentarios from anon, authenticated;
grant select (id, publicacao_id, autor_id, texto, criado_em), insert (publicacao_id, autor_id, texto), delete
  on public.comentarios to authenticated;
grant all on public.comentarios to service_role;

create function privado.pode_comentar(publicacao uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.publicacoes p
    where p.id = publicacao and (p.grupo_id is null or privado.eh_membro(p.grupo_id)));
$$;

revoke all on function privado.pode_comentar(uuid) from public, anon, authenticated;
grant execute on function privado.pode_comentar(uuid) to authenticated;

create policy comentarios_ler on public.comentarios for select to authenticated
  using ((select privado.tem_perfil()));
create policy comentarios_inserir on public.comentarios for insert to authenticated
  with check (autor_id = (select auth.uid()) and (select privado.tem_perfil()) and privado.pode_comentar(publicacao_id));
create policy comentarios_apagar on public.comentarios for delete to authenticated
  using (autor_id = (select auth.uid()) or (select privado.eh_admin()));
