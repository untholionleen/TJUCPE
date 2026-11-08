revoke all on function private.is_admin() from public, anon;
revoke all on function private.is_staff() from public, anon;
grant execute on function private.is_admin() to authenticated, service_role;
grant execute on function private.is_staff() to authenticated, service_role;
