-- =============================================================
-- USER MANAGEMENT — Owner-only functions
-- =============================================================
-- 1. list_all_users()    — List all users with role info
-- 2. delete_user(UUID)   — Completely remove a user
-- =============================================================

-- =============================================================
-- 1. LIST ALL USERS
-- =============================================================
-- Returns all users from auth.users joined with their role
-- from user_roles. If no role exists, defaults to 'user'.
-- Only callable by users with 'owner' role in user_roles.
-- =============================================================

CREATE OR REPLACE FUNCTION public.list_all_users()
RETURNS TABLE (
  user_id UUID,
  email TEXT,
  role TEXT,
  created_at TIMESTAMPTZ,
  last_sign_in_at TIMESTAMPTZ,
  is_banned BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_role app_role;
BEGIN
  -- Verify caller is an owner
  SELECT ur.role INTO caller_role
  FROM public.user_roles ur
  WHERE ur.user_id = auth.uid()
    AND ur.role = 'owner'
  LIMIT 1;

  IF caller_role IS NULL THEN
    RAISE EXCEPTION 'Permission denied: only owners can list all users';
  END IF;

  -- Return all users with their highest role (or 'user' if none)
  RETURN QUERY
  SELECT
    au.id AS user_id,
    au.email::TEXT AS email,
    COALESCE(ur.role::TEXT, 'user') AS role,
    au.created_at,
    au.last_sign_in_at,
    (au.banned_until IS NOT NULL AND au.banned_until > NOW()) AS is_banned
  FROM auth.users au
  LEFT JOIN LATERAL (
    SELECT r.role
    FROM public.user_roles r
    WHERE r.user_id = au.id
    ORDER BY
      CASE r.role
        WHEN 'owner' THEN 1
        WHEN 'admin' THEN 2
        WHEN 'editor' THEN 3
        WHEN 'viewer' THEN 4
      END
    LIMIT 1
  ) ur ON true
  ORDER BY au.created_at ASC;
END;
$$;

-- =============================================================
-- 2. DELETE USER
-- =============================================================
-- Completely removes a user and all their associated data.
-- Cannot delete users with 'owner' role.
-- Only callable by users with 'owner' role in user_roles.
--
-- Deletion order:
--   1. workspace_members (remove from all workspaces)
--   2. user_roles
--   3. profiles
--   4. invitations (where invited_by = target)
--   5. auth.users (cascade will also clean up FK references)
--
-- Note: responses/response_answers are anonymous form submissions
-- (session-based, no user_id) and are NOT deleted.
-- =============================================================

CREATE OR REPLACE FUNCTION public.delete_user(target_user_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_role app_role;
  target_role app_role;
  target_email TEXT;
BEGIN
  -- 1. Verify caller is an owner
  SELECT ur.role INTO caller_role
  FROM public.user_roles ur
  WHERE ur.user_id = auth.uid()
    AND ur.role = 'owner'
  LIMIT 1;

  IF caller_role IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Permission denied: only owners can delete users');
  END IF;

  -- 2. Prevent self-deletion
  IF target_user_id = auth.uid() THEN
    RETURN json_build_object('success', false, 'error', 'Cannot delete your own account');
  END IF;

  -- 3. Verify target user exists
  SELECT au.email INTO target_email
  FROM auth.users au
  WHERE au.id = target_user_id;

  IF target_email IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'User not found');
  END IF;

  -- 4. Cannot delete users with 'owner' role
  SELECT ur.role INTO target_role
  FROM public.user_roles ur
  WHERE ur.user_id = target_user_id
    AND ur.role = 'owner'
  LIMIT 1;

  IF target_role IS NOT NULL THEN
    RETURN json_build_object('success', false, 'error', 'Cannot delete a user with owner role');
  END IF;

  -- 5. Delete from workspace_members
  DELETE FROM public.workspace_members wm
  WHERE wm.user_id = target_user_id;

  -- 6. Delete from user_roles
  DELETE FROM public.user_roles ur
  WHERE ur.user_id = target_user_id;

  -- 7. Delete from profiles
  DELETE FROM public.profiles p
  WHERE p.user_id = target_user_id;

  -- 8. Nullify invited_by references in invitations
  UPDATE public.invitations
  SET invited_by = NULL
  WHERE invited_by = target_user_id;

  -- 9. Delete from auth.users
  -- This will also cascade-delete any remaining FK references
  DELETE FROM auth.users
  WHERE id = target_user_id;

  RETURN json_build_object('success', true);

EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- =============================================================
-- 3. TOGGLE USER STATUS (activate / deactivate)
-- =============================================================
-- Sets or clears banned_until on auth.users.
-- active = true  → unban (set banned_until to NULL)
-- active = false → ban  (set banned_until to year 2999)
-- Only callable by owners. Cannot ban owners.
-- =============================================================

CREATE OR REPLACE FUNCTION public.toggle_user_status(target_user_id UUID, active BOOLEAN)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_role app_role;
  target_role app_role;
BEGIN
  -- 1. Verify caller is an owner
  SELECT ur.role INTO caller_role
  FROM public.user_roles ur
  WHERE ur.user_id = auth.uid()
    AND ur.role = 'owner'
  LIMIT 1;

  IF caller_role IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Permission denied: only owners can toggle user status');
  END IF;

  -- 2. Prevent self-ban
  IF target_user_id = auth.uid() THEN
    RETURN json_build_object('success', false, 'error', 'Cannot deactivate your own account');
  END IF;

  -- 3. Cannot ban owners
  SELECT ur.role INTO target_role
  FROM public.user_roles ur
  WHERE ur.user_id = target_user_id
    AND ur.role = 'owner'
  LIMIT 1;

  IF target_role IS NOT NULL AND NOT active THEN
    RETURN json_build_object('success', false, 'error', 'Cannot deactivate a user with owner role');
  END IF;

  -- 4. Toggle banned_until
  IF active THEN
    UPDATE auth.users SET banned_until = NULL WHERE id = target_user_id;
  ELSE
    UPDATE auth.users SET banned_until = '2999-12-31T23:59:59Z'::timestamptz WHERE id = target_user_id;
  END IF;

  RETURN json_build_object('success', true);

EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;
