import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT =
  `You are an expert developer productivity analyst. Analyze this screenshot of a user's desktop.

summary: Write a single compound sentence describing the workflow. If multiple windows are visible (split-screen), explicitly describe the relationship (e.g., "User is coding in [App A] while referencing [App B]").

tags: Extract 3-5 relevant keywords. If split-screen, include "Split View" and names of both apps.

app_context: Identify the active applications. If multitasking, output "App A + App B". Return ONLY valid JSON.`;

function safeJson(obj: unknown, max = 2000) {
  try {
    const s = JSON.stringify(obj);
    return s.length > max ? s.slice(0, max) + "…(truncated)" : s;
  } catch {
    return "[unstringifiable]";
  }
}

function decodeJwtPayload(authHeader: string) {
  try {
    const jwt = authHeader.split(" ")[1];
    const part = jwt.split(".")[1];
    const base64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const json = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
    return JSON.parse(json);
  } catch {
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const requestId = crypto.randomUUID();
  const startedAt = Date.now();

  try {
    console.log(`[AI][${requestId}] 🚀 Request received`, {
      method: req.method,
      url: req.url,
      ts: new Date().toISOString(),
    });

    const authHeader = req.headers.get("authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      console.warn(`[AI][${requestId}] ❌ Missing Authorization header`);
      return new Response(JSON.stringify({ error: "Missing Authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const claims = decodeJwtPayload(authHeader);
    const clerkId = claims?.clerk_user_id ?? claims?.sub;

    console.log(`[AI][${requestId}] 🔐 JWT claims`, {
      sub: claims?.sub,
      clerk_user_id: claims?.clerk_user_id,
      aud: claims?.aud,
      role: claims?.role,
    });

    if (!clerkId || typeof clerkId !== "string") {
      throw new Error("JWT missing clerk_user_id (or sub). Update Clerk template to include clerk_user_id.");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!supabaseServiceRole) {
      throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY in function env vars.");
    }

    // User client (RLS enforced) -> for audit_logs read/update
    const supabase = createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: authHeader } },
    });

    // Service client (bypasses RLS) -> ONLY for signed URL generation
    const service = createClient(supabaseUrl, supabaseServiceRole);

    const body = await req.json();
    const { record_id, image_path } = body ?? {};

    console.log(`[AI][${requestId}] 📥 Payload`, { record_id, image_path });

    if (!record_id || !image_path) {
      return new Response(JSON.stringify({ error: "record_id and image_path are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Ownership guard: prevent signing arbitrary files
    if (!String(image_path).startsWith(`${clerkId}/`)) {
      console.warn(`[AI][${requestId}] 🚫 Forbidden path`, { clerkId, image_path });
      return new Response(JSON.stringify({ error: "Forbidden: image_path does not belong to caller" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Confirm record visible to the user via RLS
    const { data: existingRow, error: readErr } = await supabase
      .from("audit_logs")
      .select("id, user_id, image_path, summary, tags, app_context, created_at")
      .eq("id", record_id)
      .maybeSingle();

    console.log(`[AI][${requestId}] 📄 audit_logs row (pre-update)`, { existingRow, readErr: readErr?.message });

    if (!existingRow) {
      console.warn(`[AI][${requestId}] ⚠️ audit_logs row not visible (RLS?)`, { record_id });
      // still continue; update may also be blocked
    }

    // 1) Create signed URL (no download)
    console.log(`[AI][${requestId}] 🔗 Creating signed URL…`, { image_path });

    const { data: signed, error: signErr } = await service
      .storage
      .from("session_evidence")
      .createSignedUrl(image_path, 60);

    if (signErr || !signed?.signedUrl) {
      console.error(`[AI][${requestId}] ❌ Signed URL failed`, signErr);
      throw new Error(`Signed URL failed: ${safeJson(signErr, 800)}`);
    }

    const signedUrl = signed.signedUrl;
    console.log(`[AI][${requestId}] ✅ Signed URL created (short-lived)`, {
      image_path,
      ttl_seconds: 60,
    });

    // 2) Call Gemini with URL
    const apiKey = Deno.env.get("GOOGLE_API_KEY");
    if (!apiKey) throw new Error("Missing GOOGLE_API_KEY env var");

    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

    console.log(`[AI][${requestId}] 🤖 Calling Gemini…`);

    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          role: "user",
          parts: [
            { text: SYSTEM_PROMPT },
            // URL-based image input (no base64)
            { fileData: { mimeType: "image/jpeg", fileUri: signedUrl } },
          ],
        }],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: "application/json",
        },
      }),
    });

    console.log(`[AI][${requestId}] 🤖 Gemini HTTP`, { status: resp.status, ok: resp.ok });

    const aiData = await resp.json();
    console.log(`[AI][${requestId}] 🤖 Gemini raw (truncated)`, safeJson(aiData, 2500));

    const raw =
      aiData?.candidates?.[0]?.content?.parts?.[0]?.text ??
      aiData?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text).join("") ??
      null;

    if (!raw) {
      throw new Error(`Gemini returned no text. Raw response: ${safeJson(aiData, 800)}`);
    }

    console.log(`[AI][${requestId}] 🧾 Gemini text`, raw.slice(0, 800) + (raw.length > 800 ? "…(truncated)" : ""));

    let result: { summary: string; tags: string[] | string; app_context: string };
    try {
      result = JSON.parse(raw);
    } catch {
      const match = raw.match(/\{[\s\S]*\}/);
      if (!match) throw new Error(`Gemini returned non-JSON: ${raw.slice(0, 200)}`);
      result = JSON.parse(match[0]);
    }

    const tags = Array.isArray(result.tags)
      ? result.tags.slice(0, 8)
      : typeof result.tags === "string"
        ? result.tags.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 8)
        : [];

    console.log(`[AI][${requestId}] ✅ Parsed result`, { ...result, tags });

    // 3) Update audit_logs using user client (RLS)
    console.log(`[AI][${requestId}] 🧱 Updating audit_logs…`, { record_id });

    const { data: updated, error: updateError, count } = await supabase
      .from("audit_logs")
      .update(
        {
          summary: result.summary ?? null,
          tags,
          app_context: result.app_context ?? null,
        },
        { count: "exact" }
      )
      .eq("id", record_id)
      .select("id, user_id, summary, tags, app_context");

    console.log(`[AI][${requestId}] 🧱 Update result`, {
      count,
      updateError: updateError ? updateError.message : null,
      updated,
    });

    if (updateError) throw new Error(`DB update failed: ${updateError.message}`);
    if (!count || count === 0) {
      console.warn(`[AI][${requestId}] ⚠️ Update matched 0 rows (RLS or wrong record_id).`);
    }

    console.log(`[AI][${requestId}] ✅ Done in ${Date.now() - startedAt}ms`);

    return new Response(JSON.stringify({ ...result, tags }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error(`[AI][${requestId}] 💥 ERROR`, error);
    return new Response(JSON.stringify({ error: (error as Error).message, requestId }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
