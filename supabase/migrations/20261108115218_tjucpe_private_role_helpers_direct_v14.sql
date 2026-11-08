create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = 'admin'
  );
$function$;

create or replace function private.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role in ('teacher','admin')
  );
$function$;

create or replace function public.guard_experiment_owner()
returns trigger
language plpgsql
set search_path = 'public'
as $function$
begin
  if new.owner_id is distinct from old.owner_id and not private.is_admin() then
    raise exception 'Experiment record owner cannot be changed';
  end if;
  return new;
end;
$function$;

create or replace function public.guard_profile_role_change()
returns trigger
language plpgsql
set search_path = 'public'
as $function$
begin
  if new.role is distinct from old.role
     and current_user not in ('postgres','supabase_admin','service_role')
     and not private.is_admin() then
    raise exception 'Only a platform administrator can change account roles';
  end if;
  return new;
end;
$function$;

create or replace function public.guard_report_insert_fields()
returns trigger
language plpgsql
set search_path = 'public'
as $function$
begin
  if not private.is_staff() and current_user not in ('postgres','supabase_admin','service_role') then
    new.student_id := auth.uid();
    new.score := null;
    new.feedback := null;
    new.reviewed_by := null;
    new.reviewed_at := null;
    if new.status not in ('draft','submitted') then
      new.status := 'submitted';
    end if;
  end if;
  return new;
end;
$function$;
