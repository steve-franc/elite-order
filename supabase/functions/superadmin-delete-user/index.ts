import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const auth = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: auth } } });
    const { data: userRes, error: uerr } = await userClient.auth.getUser();
    if (uerr || !userRes?.user) throw new Error("Not authenticated");

    const admin = createClient(SUPABASE_URL, SERVICE);
    const { data: isSuper, error: rerr } = await admin.rpc("is_superadmin", { _user_id: userRes.user.id });
    if (rerr) throw rerr;
    if (!isSuper) throw new Error("Forbidden");

    const { user_id } = await req.json();
    if (!user_id) throw new Error("user_id required");
    if (user_id === userRes.user.id) throw new Error("Cannot delete yourself");

    // Wipe public footprint (idempotent)
    await admin.rpc("superadmin_delete_user", { _user_id: user_id });
    // Delete auth user
    const { error: derr } = await admin.auth.admin.deleteUser(user_id);
    if (derr) throw derr;

    return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message ?? String(e) }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
