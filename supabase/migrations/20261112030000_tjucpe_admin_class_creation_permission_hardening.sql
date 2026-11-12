-- TJUCPE role and class-management permission hardening.
-- The admin control plane remains server-authorized. Remove the default PUBLIC
-- EXECUTE grant from this SECURITY DEFINER class ownership helper.
revoke all on function private.is_class_teacher(uuid) from public, anon;
grant execute on function private.is_class_teacher(uuid) to authenticated, service_role;
