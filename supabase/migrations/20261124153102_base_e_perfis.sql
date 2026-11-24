-- Negar por padrão: nada do que for criado daqui em diante nasce acessível.
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public revoke execute on functions from anon, authenticated;
alter default privileges for role postgres revoke execute on functions from public;

create schema privado;
revoke all on schema privado from public;
grant usage on schema privado to authenticated;

create table public.perfis (
  id uuid primary key references auth.users (id) on delete cascade,
  nome text not null constraint perfis_nome_check check (nome ~ '\S' and char_length(nome) <= 60),
  usuario text not null constraint perfis_usuario_key unique
    constraint perfis_usuario_check check (usuario ~ '^[a-z0-9_.]{3,30}$'),
  foto_path text constraint perfis_foto_path_check
    check (foto_path ~ ('^' || id::text || '/[0-9a-f-]{36}\.(jpg|png|webp)$')),
  admin boolean not null default false,
  criado_em timestamptz not null default now()
);

alter table public.perfis enable row level security;
revoke all on public.perfis from anon, authenticated;
grant select (id, nome, usuario, foto_path, criado_em), insert (id, nome, usuario), update (nome, usuario, foto_path)
  on public.perfis to authenticated;
grant all on public.perfis to service_role;

-- security definer: consultam perfis sem passar pela política de perfis, que os chama.
create function privado.tem_perfil() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.perfis where id = (select auth.uid()));
$$;

create function privado.eh_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.perfis where id = (select auth.uid()) and admin);
$$;

create function public.sou_admin() returns boolean
language sql stable security invoker set search_path = '' as $$
  select privado.eh_admin();
$$;

revoke all on function privado.tem_perfil(), privado.eh_admin(), public.sou_admin() from public, anon, authenticated;
grant execute on function privado.tem_perfil(), privado.eh_admin(), public.sou_admin() to authenticated;

create policy perfis_ler on public.perfis for select to authenticated
  using (id = (select auth.uid()) or (select privado.tem_perfil()));
create policy perfis_inserir on public.perfis for insert to authenticated
  with check (id = (select auth.uid()));
create policy perfis_alterar on public.perfis for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Fotos: cada pessoa com perfil mexe só na própria pasta. Sem política de update: trocar é enviar outro arquivo.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatares', 'avatares', true, 2097152, array['image/jpeg', 'image/png', 'image/webp']);

create policy avatares_ler on storage.objects for select to authenticated
  using (bucket_id = 'avatares' and (storage.foldername(name))[1] = (select auth.uid())::text and (select privado.tem_perfil()));
create policy avatares_inserir on storage.objects for insert to authenticated
  with check (bucket_id = 'avatares' and (storage.foldername(name))[1] = (select auth.uid())::text and (select privado.tem_perfil()));
create policy avatares_apagar on storage.objects for delete to authenticated
  using (bucket_id = 'avatares' and (storage.foldername(name))[1] = (select auth.uid())::text and (select privado.tem_perfil()));
