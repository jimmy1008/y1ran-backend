import express from "express";
import { createClient } from "@supabase/supabase-js";

export default function createAuthIdentitiesRouter(authMiddleware) {
  const router = express.Router();

  const supabaseAdmin = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  router.get("/oauth-linked", async (req, res) => {
    try {
      const provider = (req.query.provider || "").toString();
      const providerUserId = (req.query.provider_user_id || "").toString();

      if (!provider || !providerUserId) {
        return res
          .status(400)
          .json({ error: "missing provider/provider_user_id" });
      }

      const { data, error } = await supabaseAdmin
        .from("user_identities")
        .select("user_id")
        .eq("provider", provider)
        .eq("provider_user_id", providerUserId)
        .maybeSingle();

      if (error) return res.status(500).json({ error: error.message });

      return res.json({
        linked: !!data,
        user_id: data?.user_id || null,
      });
    } catch (e) {
      return res.status(500).json({ error: e?.message || "server error" });
    }
  });

  router.post("/oauth-link", authMiddleware, async (req, res) => {
    try {
      const { provider, provider_user_id } = req.body || {};
      if (!provider || !provider_user_id) {
        return res
          .status(400)
          .json({ error: "missing provider/provider_user_id" });
      }

      const { error } = await supabaseAdmin
        .from("user_identities")
        .upsert(
          {
            user_id: req.user.id,
            provider,
            provider_user_id,
          },
          { onConflict: "provider,provider_user_id" }
        );

      if (error) return res.status(500).json({ error: error.message });

      return res.json({ ok: true });
    } catch (e) {
      return res.status(500).json({ error: e?.message || "server error" });
    }
  });

  return router;
}
