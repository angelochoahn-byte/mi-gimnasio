-- Mi Gimnasio: estructura de la base de datos en Supabase.
-- Pegar completo en Supabase → SQL Editor → New query → Run.
-- Cada registro es un documento JSON dentro de una "colección"
-- (clientes, movimientos, reservas, mantenimientos, insumos, codigos, config).

create table if not exists public.docs (
  owner      uuid        not null default auth.uid() references auth.users(id) on delete cascade,
  col        text        not null,
  id         text        not null,
  data       jsonb       not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (owner, col, id)
);

-- Solo el dueño de cada fila puede verla o cambiarla.
alter table public.docs enable row level security;

drop policy if exists "solo el dueño" on public.docs;
create policy "solo el dueño" on public.docs
  for all to authenticated
  using (owner = (select auth.uid()))
  with check (owner = (select auth.uid()));

revoke all on public.docs from anon;
grant select, insert, update, delete on public.docs to authenticated;

-- Cambios en vivo entre el teléfono y la computadora.
do $$ begin
  alter publication supabase_realtime add table public.docs;
exception when duplicate_object then null; end $$;
