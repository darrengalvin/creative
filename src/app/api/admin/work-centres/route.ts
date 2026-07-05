import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

// Admin CRUD for work centres, done server-side (session from the request
// cookie) because the browser Supabase client could stall on its auth lock -
// leaving the admin page stuck on "Loading..." until a manual refresh.

async function requireAdmin(supabase: SupabaseClient) {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return { ok: false as const, status: 401, error: "Not authenticated" };

  const { data: profile } = await supabase.from("users").select("role").eq("id", user.id).single();
  if (!profile || !["admin", "supervisor"].includes(profile.role)) {
    return { ok: false as const, status: 403, error: "Forbidden" };
  }
  return { ok: true as const, user };
}

export async function GET() {
  try {
    const supabase = await createClient();
    const auth = await requireAdmin(supabase);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { data, error } = await supabase
      .from("work_centres")
      .select("*, machines(count)")
      .order("display_order");

    if (error) {
      console.error("[/api/admin/work-centres] GET error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const workCentres = (data || []).map((wc) => ({
      ...wc,
      machine_count: (wc.machines as unknown as { count: number }[])?.[0]?.count || 0,
    }));

    return NextResponse.json({ workCentres });
  } catch (err) {
    console.error("[/api/admin/work-centres] GET exception:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const auth = await requireAdmin(supabase);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { name, description, displayOrder } = (await request.json()) ?? {};
    if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });

    const { data, error } = await supabase
      .from("work_centres")
      .insert({ name, description: description || null, display_order: displayOrder ?? 0 })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ workCentre: data });
  } catch (err) {
    console.error("[/api/admin/work-centres] POST exception:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const supabase = await createClient();
    const auth = await requireAdmin(supabase);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { id, name, description } = (await request.json()) ?? {};
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    const { data, error } = await supabase
      .from("work_centres")
      .update({ name, description: description || null })
      .eq("id", id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ workCentre: data });
  } catch (err) {
    console.error("[/api/admin/work-centres] PUT exception:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const supabase = await createClient();
    const auth = await requireAdmin(supabase);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    const { error } = await supabase.from("work_centres").delete().eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[/api/admin/work-centres] DELETE exception:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
