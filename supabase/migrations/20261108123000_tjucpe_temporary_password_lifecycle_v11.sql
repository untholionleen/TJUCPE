-- Force a private password change after the shared temporary reset password has been used.
alter table public.profiles
  add column if not exists must_change_password boolean not null default false;

comment on column public.profiles.must_change_password is
  'When true, the user may only access the password-change screen until a personal password has been set.';
