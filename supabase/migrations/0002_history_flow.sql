-- ============================================================
-- sorgumcore — migration 0002: history alur baru (discovery-first)
-- Tambahan untuk alur: sesi masak menyimpan nama menu + segmentasi,
-- dan resep di-cache agar bisa dibuka kembali cepat.
-- ============================================================

-- ------------------------------------------------------------
-- chat_sessions: tambah metadata konteks (segmentasi + menu)
-- ------------------------------------------------------------
ALTER TABLE public.chat_sessions
    ADD COLUMN IF NOT EXISTS menu_item_name VARCHAR(255),
    ADD COLUMN IF NOT EXISTS age_group VARCHAR(50),
    ADD COLUMN IF NOT EXISTS special_condition VARCHAR(50),
    ADD COLUMN IF NOT EXISTS finished_at TIMESTAMP WITH TIME ZONE;

-- ------------------------------------------------------------
-- chat_messages: tandai pesan yang berasal dari sesi masak
-- (bukan sekadar chat tanya-jawab)
-- ------------------------------------------------------------
ALTER TABLE public.chat_messages
    ADD COLUMN IF NOT EXISTS step_order INTEGER; -- langkah resep yg sedang dibahas (nullable)

-- ------------------------------------------------------------
-- Tabel baru: recipes (cache resep dari RAG per sesi)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.recipes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES public.chat_sessions(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    servings INTEGER NOT NULL DEFAULT 1,
    ingredients JSONB NOT NULL DEFAULT '[]'::jsonb,
    steps JSONB NOT NULL DEFAULT '[]'::jsonb,   -- array RecipeStep {order,title,instruction,durationMinutes}
    total_minutes INTEGER NOT NULL DEFAULT 0,
    source_docs JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.recipes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own recipes" ON public.recipes;
CREATE POLICY "Users can manage own recipes" ON public.recipes
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.chat_sessions
            WHERE chat_sessions.id = recipes.session_id
              AND chat_sessions.user_id = auth.uid()
        )
    );
