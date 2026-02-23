-- =============================================================
-- INVITE-ONLY SIGNUP SYSTEM
-- =============================================================
-- 1. Tabela invitations
-- 2. Indexes
-- 3. RLS policies
-- 4. Trigger para bloquear signup sem convite
-- 5. Seed admin
-- =============================================================

-- 1. Tabela invitations
CREATE TABLE IF NOT EXISTS public.invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  token uuid NOT NULL DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired')),
  invited_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days')
);

-- 2. Indexes
CREATE UNIQUE INDEX IF NOT EXISTS idx_invitations_token ON public.invitations(token);
CREATE INDEX IF NOT EXISTS idx_invitations_email ON public.invitations(email);
CREATE INDEX IF NOT EXISTS idx_invitations_status ON public.invitations(status);

-- 3. RLS
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;

-- Admins (owner/admin in user_roles) can read all invitations
CREATE POLICY "admins_read_invitations" ON public.invitations
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role IN ('owner', 'admin')
    )
  );

-- Admins can insert invitations
CREATE POLICY "admins_insert_invitations" ON public.invitations
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role IN ('owner', 'admin')
    )
  );

-- Admins can update invitations (revoke, etc.)
CREATE POLICY "admins_update_invitations" ON public.invitations
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role IN ('owner', 'admin')
    )
  );

-- Anon can read by token (for signup validation)
CREATE POLICY "anon_read_invitation_by_token" ON public.invitations
  FOR SELECT TO anon
  USING (true);

-- 4. Trigger: block signup without valid invite
CREATE OR REPLACE FUNCTION public.handle_invite_on_signup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _invite RECORD;
BEGIN
  -- Check for a valid pending invite for this email
  SELECT * INTO _invite
  FROM public.invitations
  WHERE email = NEW.email
    AND status = 'pending'
    AND expires_at > now()
  ORDER BY created_at DESC
  LIMIT 1;

  IF _invite.id IS NOT NULL THEN
    -- Valid invite found: mark as accepted
    UPDATE public.invitations
    SET status = 'accepted',
        accepted_at = now()
    WHERE id = _invite.id;
  ELSE
    -- No valid invite: ban the user
    UPDATE auth.users
    SET banned_until = '2999-01-01 00:00:00+00'
    WHERE id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

-- Drop existing trigger if any, then create
DROP TRIGGER IF EXISTS on_auth_user_created_invite_check ON auth.users;
CREATE TRIGGER on_auth_user_created_invite_check
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_invite_on_signup();

-- 5. Seed admin: grant owner role to rafamelopratique@gmail.com
-- Only inserts if the user exists and doesn't already have a role
DO $$
DECLARE
  _uid uuid;
BEGIN
  SELECT id INTO _uid FROM auth.users WHERE email = 'rafamelopratique@gmail.com' LIMIT 1;
  IF _uid IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (_uid, 'owner')
    ON CONFLICT DO NOTHING;
  END IF;
END;
$$;
