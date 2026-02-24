-- =============================================================
-- PROMOTE USER TO ADMIN (via email)
-- =============================================================
-- Funcao SECURITY DEFINER que permite admins/owners promoverem
-- usuarios a admin buscando pelo email em auth.users
-- =============================================================

CREATE OR REPLACE FUNCTION public.promote_to_admin(target_email TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_role app_role;
  target_user_id UUID;
BEGIN
  -- 1. Verificar se quem esta chamando e admin/owner
  SELECT role INTO caller_role
  FROM public.user_roles
  WHERE user_id = auth.uid()
    AND role IN ('owner', 'admin')
  LIMIT 1;

  IF caller_role IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Sem permissao');
  END IF;

  -- 2. Buscar user_id pelo email em auth.users
  SELECT id INTO target_user_id
  FROM auth.users
  WHERE email = lower(target_email);

  IF target_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Usuario nao encontrado. Verifique se o email tem conta criada.');
  END IF;

  -- 3. Verificar se ja e admin/owner
  IF EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = target_user_id
      AND role IN ('admin', 'owner')
  ) THEN
    RETURN json_build_object('success', false, 'error', 'Este usuario ja e administrador.');
  END IF;

  -- 4. Inserir role admin
  INSERT INTO public.user_roles (user_id, role)
  VALUES (target_user_id, 'admin')
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN json_build_object('success', true, 'user_id', target_user_id);
END;
$$;

-- Tambem criar funcao para remover admin
CREATE OR REPLACE FUNCTION public.remove_admin(target_user_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_role app_role;
  target_role app_role;
BEGIN
  -- 1. Verificar se quem chama e owner
  SELECT role INTO caller_role
  FROM public.user_roles
  WHERE user_id = auth.uid()
    AND role = 'owner'
  LIMIT 1;

  IF caller_role IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Apenas owners podem remover admins.');
  END IF;

  -- 2. Verificar se o alvo nao e owner
  SELECT role INTO target_role
  FROM public.user_roles
  WHERE user_id = target_user_id
    AND role = 'owner'
  LIMIT 1;

  IF target_role IS NOT NULL THEN
    RETURN json_build_object('success', false, 'error', 'Nao e possivel remover um owner.');
  END IF;

  -- 3. Remover role admin
  DELETE FROM public.user_roles
  WHERE user_id = target_user_id
    AND role = 'admin';

  RETURN json_build_object('success', true);
END;
$$;

-- Policy para admins verem todos os roles (necessario para listar admins)
DROP POLICY IF EXISTS "Users can view own roles" ON public.user_roles;
CREATE POLICY "admins_view_all_roles" ON public.user_roles
  FOR SELECT TO authenticated
  USING (
    -- Pode ver o proprio role OU ser admin/owner
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('owner', 'admin')
    )
  );
