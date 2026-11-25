create table public.amizades (
  id uuid primary key default gen_random_uuid(),
  solicitante_id uuid not null references public.perfis (id) on delete cascade,
  destinatario_id uuid not null references public.perfis (id) on delete cascade,
  status text not null default 'pendente' constraint amizades_status_check check (status in ('pendente', 'aceita')),
  criado_em timestamptz not null default now(),
  constraint amizades_destinatario_id_check check (destinatario_id <> solicitante_id)
);
-- Um só vínculo por par, em qualquer ordem.
create unique index amizades_par_key on public.amizades (least(solicitante_id, destinatario_id), greatest(solicitante_id, destinatario_id));
create index amizades_solicitante_id_idx on public.amizades (solicitante_id);
create index amizades_destinatario_id_idx on public.amizades (destinatario_id);

alter table public.amizades enable row level security;
revoke all on public.amizades from anon, authenticated;
grant select (id, solicitante_id, destinatario_id, status, criado_em), insert (solicitante_id, destinatario_id),
  update (status), delete on public.amizades to authenticated;
grant all on public.amizades to service_role;

create policy amizades_ler on public.amizades for select to authenticated
  using ((select auth.uid()) in (solicitante_id, destinatario_id) and (select privado.tem_perfil()));
create policy amizades_inserir on public.amizades for insert to authenticated
  with check (solicitante_id = (select auth.uid()) and (select privado.tem_perfil()));
create policy amizades_alterar on public.amizades for update to authenticated
  using (destinatario_id = (select auth.uid()) and status = 'pendente')
  with check (destinatario_id = (select auth.uid()) and status = 'aceita');
create policy amizades_apagar on public.amizades for delete to authenticated
  using ((select auth.uid()) in (solicitante_id, destinatario_id));

create table public.notificacoes (
  id uuid primary key default gen_random_uuid(),
  para_id uuid not null references public.perfis (id) on delete cascade,
  de_id uuid not null references public.perfis (id) on delete cascade,
  tipo text not null constraint notificacoes_tipo_check check (tipo in ('pedido_amizade', 'amizade_aceita', 'comentario')),
  publicacao_id uuid references public.publicacoes (id) on delete cascade,
  lida boolean not null default false,
  criado_em timestamptz not null default now()
);
create index notificacoes_para_id_idx on public.notificacoes (para_id);
create index notificacoes_de_id_idx on public.notificacoes (de_id);
create index notificacoes_publicacao_id_idx on public.notificacoes (publicacao_id);

alter table public.notificacoes enable row level security;
revoke all on public.notificacoes from anon, authenticated;
grant select (id, para_id, de_id, tipo, publicacao_id, lida, criado_em), update (lida), delete on public.notificacoes to authenticated;
grant all on public.notificacoes to service_role;

create policy notificacoes_ler on public.notificacoes for select to authenticated
  using (para_id = (select auth.uid()) and (select privado.tem_perfil()));
create policy notificacoes_alterar on public.notificacoes for update to authenticated
  using (para_id = (select auth.uid())) with check (para_id = (select auth.uid()));
create policy notificacoes_apagar on public.notificacoes for delete to authenticated
  using (para_id = (select auth.uid()));

-- security definer: só os triggers gravam notificações; ninguém tem insert.
create function privado.amizades_notificar_pedido() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.notificacoes (para_id, de_id, tipo) values (new.destinatario_id, new.solicitante_id, 'pedido_amizade');
  return null;
end $$;

create function privado.amizades_notificar_aceite() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.notificacoes (para_id, de_id, tipo) values (new.solicitante_id, new.destinatario_id, 'amizade_aceita');
  return null;
end $$;

create function privado.comentarios_notificar() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.notificacoes (para_id, de_id, tipo, publicacao_id)
  select p.autor_id, new.autor_id, 'comentario', p.id from public.publicacoes p
  where p.id = new.publicacao_id and p.autor_id <> new.autor_id;
  return null;
end $$;

revoke all on function privado.amizades_notificar_pedido(), privado.amizades_notificar_aceite(), privado.comentarios_notificar()
  from public, anon, authenticated;

create trigger amizades_notificar_pedido after insert on public.amizades
  for each row execute function privado.amizades_notificar_pedido();
create trigger amizades_notificar_aceite after update on public.amizades
  for each row when (old.status = 'pendente' and new.status = 'aceita') execute function privado.amizades_notificar_aceite();
create trigger comentarios_notificar after insert on public.comentarios
  for each row execute function privado.comentarios_notificar();

-- security definer: o cliente não alcança auth.users. Sem parâmetro: só apaga quem chama; o resto vai por cascata.
create function public.excluir_minha_conta() returns void
language sql volatile security definer set search_path = '' as $$
  delete from auth.users where id = (select auth.uid());
$$;

revoke all on function public.excluir_minha_conta() from public, anon, authenticated;
grant execute on function public.excluir_minha_conta() to authenticated;
