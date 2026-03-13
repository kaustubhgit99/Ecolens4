-- =================================================================
-- ECOLENS — COMPLETE DATABASE SETUP
-- Project: https://behdmwslebogluoenfnu.supabase.co
-- Run this entire block in:
--   Supabase Dashboard → SQL Editor → New Query → Run
-- =================================================================

-- ─────────────────────────────────────────────────────────────────
-- 1. EXTENSIONS
-- ─────────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS postgis;


-- ─────────────────────────────────────────────────────────────────
-- 2. SHARED TRIGGER FUNCTION  (updated_at)
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


-- ─────────────────────────────────────────────────────────────────
-- 3. USERS TABLE
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.users (
  id            UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email         TEXT        UNIQUE,
  phone         TEXT        UNIQUE,
  full_name     TEXT        NOT NULL,
  role          TEXT        DEFAULT 'citizen'
                            CHECK (role IN ('citizen', 'authority', 'admin')),
  ward          TEXT,
  department    TEXT,
  coins_total   INTEGER     DEFAULT 0 CHECK (coins_total >= 0),
  coins_month   INTEGER     DEFAULT 0 CHECK (coins_month >= 0),
  spam_strikes  INTEGER     DEFAULT 0,
  is_blocked    BOOLEAN     DEFAULT FALSE,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

DROP TRIGGER IF EXISTS users_updated_at ON public.users;
CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Auto-create public profile on Supabase Auth signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'Anonymous')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE INDEX IF NOT EXISTS users_role_idx        ON public.users(role);
CREATE INDEX IF NOT EXISTS users_coins_month_idx ON public.users(coins_month DESC);


-- ─────────────────────────────────────────────────────────────────
-- 4. DEPARTMENTS TABLE
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.departments (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT        NOT NULL,
  code         TEXT        UNIQUE NOT NULL,
  head_user_id UUID        REFERENCES public.users(id) ON DELETE SET NULL,
  active       BOOLEAN     DEFAULT TRUE,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Seed departments
INSERT INTO public.departments (name, code) VALUES
  ('Sanitation Department',        'SAN'),
  ('Public Works Department',      'PWD'),
  ('Drainage & Sewage Department', 'DRN'),
  ('Water Supply Department',      'WTR'),
  ('Electricity Department',       'ELC'),
  ('General Administration',       'GEN')
ON CONFLICT (code) DO NOTHING;


-- ─────────────────────────────────────────────────────────────────
-- 5. COMPLAINTS TABLE
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.complaints (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  citizen_id        UUID        REFERENCES public.users(id) ON DELETE SET NULL,

  -- Citizen input
  title             TEXT,
  description       TEXT,
  voice_transcript  TEXT,
  image_url         TEXT,
  audio_url         TEXT,
  latitude          DECIMAL(9,6),
  longitude         DECIMAL(9,6),
  address           TEXT,
  ward              TEXT,

  -- AI results
  ai_category       TEXT,
  ai_subcategory    TEXT,
  ai_priority       TEXT        CHECK (ai_priority IN ('High', 'Medium', 'Low')),
  ai_priority_score INTEGER     CHECK (ai_priority_score BETWEEN 0 AND 100),
  ai_department     TEXT,
  ai_is_spam        BOOLEAN     DEFAULT FALSE,
  ai_is_duplicate   BOOLEAN     DEFAULT FALSE,
  ai_duplicate_of   UUID        REFERENCES public.complaints(id) ON DELETE SET NULL,
  ai_severity       TEXT        CHECK (ai_severity IN ('high', 'medium', 'low')),
  ai_confidence     DECIMAL(4,3) CHECK (ai_confidence BETWEEN 0 AND 1),
  ai_objects        JSONB       DEFAULT '[]',
  ai_raw_response   JSONB,

  -- Status & assignment
  status            TEXT        DEFAULT 'pending'
                                CHECK (status IN (
                                  'pending', 'ai_processing', 'rejected_spam',
                                  'merged', 'routed', 'in_progress', 'resolved'
                                )),
  assigned_to       UUID        REFERENCES public.users(id) ON DELETE SET NULL,
  department        TEXT,

  -- Resolution
  resolved_at       TIMESTAMPTZ,
  resolution_notes  TEXT,
  coins_awarded     BOOLEAN     DEFAULT FALSE,

  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

DROP TRIGGER IF EXISTS complaints_updated_at ON public.complaints;
CREATE TRIGGER complaints_updated_at
  BEFORE UPDATE ON public.complaints
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Standard indexes
CREATE INDEX IF NOT EXISTS complaints_citizen_idx    ON public.complaints(citizen_id);
CREATE INDEX IF NOT EXISTS complaints_status_idx     ON public.complaints(status);
CREATE INDEX IF NOT EXISTS complaints_priority_idx   ON public.complaints(ai_priority);
CREATE INDEX IF NOT EXISTS complaints_department_idx ON public.complaints(department);
CREATE INDEX IF NOT EXISTS complaints_created_idx    ON public.complaints(created_at DESC);
CREATE INDEX IF NOT EXISTS complaints_ward_idx       ON public.complaints(ward);
CREATE INDEX IF NOT EXISTS complaints_duplicate_idx  ON public.complaints(ai_duplicate_of)
  WHERE ai_duplicate_of IS NOT NULL;

-- PostGIS geography column (generated, always in sync with lat/lon)
ALTER TABLE public.complaints
  ADD COLUMN IF NOT EXISTS location GEOGRAPHY(Point, 4326)
  GENERATED ALWAYS AS (
    CASE
      WHEN latitude IS NOT NULL AND longitude IS NOT NULL
      THEN ST_MakePoint(longitude, latitude)::geography
      ELSE NULL
    END
  ) STORED;

CREATE INDEX IF NOT EXISTS complaints_location_idx
  ON public.complaints USING GIST(location);


-- ─────────────────────────────────────────────────────────────────
-- 6. COIN_TRANSACTIONS TABLE
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.coin_transactions (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  complaint_id UUID        REFERENCES public.complaints(id) ON DELETE SET NULL,
  coins        INTEGER     NOT NULL,
  reason       TEXT        NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS coin_tx_user_idx      ON public.coin_transactions(user_id);
CREATE INDEX IF NOT EXISTS coin_tx_complaint_idx ON public.coin_transactions(complaint_id);
CREATE INDEX IF NOT EXISTS coin_tx_created_idx   ON public.coin_transactions(created_at DESC);


-- ─────────────────────────────────────────────────────────────────
-- 7. NOTIFICATIONS TABLE
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.notifications (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  complaint_id UUID        REFERENCES public.complaints(id) ON DELETE CASCADE,
  message      TEXT        NOT NULL,
  type         TEXT        NOT NULL
                           CHECK (type IN ('status_update', 'coin_earned', 'duplicate_merged')),
  read         BOOLEAN     DEFAULT FALSE,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS notifications_user_idx    ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS notifications_unread_idx  ON public.notifications(user_id, read)
  WHERE read = FALSE;
CREATE INDEX IF NOT EXISTS notifications_created_idx ON public.notifications(created_at DESC);


-- =================================================================
-- ROW LEVEL SECURITY
-- =================================================================

ALTER TABLE public.users             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.complaints        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coin_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.departments       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications     ENABLE ROW LEVEL SECURITY;

-- ── users ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "users_read_own"       ON public.users;
DROP POLICY IF EXISTS "users_update_own"     ON public.users;
DROP POLICY IF EXISTS "users_authority_read" ON public.users;

CREATE POLICY "users_read_own"
  ON public.users FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "users_update_own"
  ON public.users FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "users_authority_read"
  ON public.users FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('authority', 'admin')
    )
  );

-- ── complaints ────────────────────────────────────────────────────
DROP POLICY IF EXISTS "complaints_citizen_read"     ON public.complaints;
DROP POLICY IF EXISTS "complaints_citizen_insert"   ON public.complaints;
DROP POLICY IF EXISTS "complaints_authority_read"   ON public.complaints;
DROP POLICY IF EXISTS "complaints_authority_update" ON public.complaints;
DROP POLICY IF EXISTS "complaints_admin_all"        ON public.complaints;

CREATE POLICY "complaints_citizen_read"
  ON public.complaints FOR SELECT
  USING (citizen_id = auth.uid());

CREATE POLICY "complaints_citizen_insert"
  ON public.complaints FOR INSERT
  WITH CHECK (citizen_id = auth.uid());

CREATE POLICY "complaints_authority_read"
  ON public.complaints FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('authority', 'admin')
    )
  );

CREATE POLICY "complaints_authority_update"
  ON public.complaints FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('authority', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('authority', 'admin')
    )
  );

CREATE POLICY "complaints_admin_all"
  ON public.complaints FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role = 'admin'
    )
  );

-- ── coin_transactions ─────────────────────────────────────────────
DROP POLICY IF EXISTS "coin_tx_read_own"   ON public.coin_transactions;
DROP POLICY IF EXISTS "coin_tx_admin_read" ON public.coin_transactions;

CREATE POLICY "coin_tx_read_own"
  ON public.coin_transactions FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "coin_tx_admin_read"
  ON public.coin_transactions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role = 'admin'
    )
  );

-- ── departments ───────────────────────────────────────────────────
DROP POLICY IF EXISTS "departments_auth_read"  ON public.departments;
DROP POLICY IF EXISTS "departments_admin_write" ON public.departments;

CREATE POLICY "departments_auth_read"
  ON public.departments FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "departments_admin_write"
  ON public.departments FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role = 'admin'
    )
  );

-- ── notifications ─────────────────────────────────────────────────
DROP POLICY IF EXISTS "notif_read_own"   ON public.notifications;
DROP POLICY IF EXISTS "notif_update_own" ON public.notifications;

CREATE POLICY "notif_read_own"
  ON public.notifications FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "notif_update_own"
  ON public.notifications FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());


-- =================================================================
-- HELPER FUNCTIONS
-- =================================================================

-- Atomically increment coin counters (called from service-role API routes)
CREATE OR REPLACE FUNCTION public.increment_coins(p_user_id UUID, p_amount INTEGER)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.users
  SET
    coins_total = coins_total + p_amount,
    coins_month = coins_month + p_amount
  WHERE id = p_user_id;
END;
$$;

-- Reset monthly coins — schedule via pg_cron or call manually on 1st of month:
--   SELECT public.reset_monthly_coins();
CREATE OR REPLACE FUNCTION public.reset_monthly_coins()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.users SET coins_month = 0;
END;
$$;


-- =================================================================
-- STORAGE BUCKET POLICIES
-- Run AFTER creating the 'complaint-images' bucket in the dashboard
-- =================================================================

-- Citizens can upload into their own folder: complaint-images/<uid>/...
CREATE POLICY "storage_citizen_upload"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'complaint-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- All authenticated users can read complaint images
CREATE POLICY "storage_auth_read"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'complaint-images');

-- =================================================================
-- DONE
-- =================================================================
