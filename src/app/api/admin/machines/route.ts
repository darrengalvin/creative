import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

// Admin CRUD for machines, done server-side (session from the request cookie)
// because the browser Supabase client could stall on its auth lock - leaving
// the admin page stuck on "Loading..." until a manual refresh.

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

function buildPayload(body: Record<string, unknown>) {
  return {
    name: body.name,
    manufacturer: body.manufacturer || null,
    model: body.model || null,
    serial_number: body.serialNumber || null,
    location: body.location || null,
    description: body.description || null,
    status: body.status,
    risk_category: body.riskCategory,
    work_centre_id: body.workCentreId || null,
  };
}

export async function GET() {
  try {
    const supabase = await createClient();
    const auth = await requireAdmin(supabase);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const [machinesRes, wcRes] = await Promise.all([
      supabase.from("machines").select("*, work_centres(id, name)").order("name"),
      supabase.from("work_centres").select("*").order("display_order"),
    ]);

    if (machinesRes.error) {
      console.error("[/api/admin/machines] machines error:", machinesRes.error);
      return NextResponse.json({ error: machinesRes.error.message }, { status: 500 });
    }
    if (wcRes.error) {
      console.error("[/api/admin/machines] work_centres error:", wcRes.error);
      return NextResponse.json({ error: wcRes.error.message }, { status: 500 });
    }

    return NextResponse.json({
      machines: machinesRes.data || [],
      workCentres: wcRes.data || [],
    });
  } catch (err) {
    console.error("[/api/admin/machines] GET exception:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const auth = await requireAdmin(supabase);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const body = (await request.json()) ?? {};
    if (!body.name) return NextResponse.json({ error: "name is required" }, { status: 400 });

    const { data, error } = await supabase.from("machines").insert(buildPayload(body)).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ machine: data });
  } catch (err) {
    console.error("[/api/admin/machines] POST exception:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const supabase = await createClient();
    const auth = await requireAdmin(supabase);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const body = (await request.json()) ?? {};
    if (!body.id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    const { data, error } = await supabase
      .from("machines")
      .update(buildPayload(body))
      .eq("id", body.id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ machine: data });
  } catch (err) {
    console.error("[/api/admin/machines] PUT exception:", err);
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

    const { error } = await supabase.from("machines").delete().eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[/api/admin/machines] DELETE exception:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
