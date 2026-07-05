import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// GET: data needed to start a checklist (machines + active templates).
// POST: create a new checklist run and return its id.
//
// Both run server-side (session resolved from the request cookie) because the
// browser Supabase client could stall on its auth lock, leaving the start page
// stuck loading and run creation hanging.
export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const [machinesRes, templatesRes] = await Promise.all([
      supabase.from("machines").select("id, name, manufacturer, model").order("name"),
      supabase
        .from("checklist_templates")
        .select("id, name, type, machine_id, frequency")
        .eq("status", "active")
        .order("name"),
    ]);

    if (machinesRes.error) {
      console.error("[/api/checklist-start] machines error:", machinesRes.error);
      return NextResponse.json({ error: machinesRes.error.message }, { status: 500 });
    }
    if (templatesRes.error) {
      console.error("[/api/checklist-start] templates error:", templatesRes.error);
      return NextResponse.json({ error: templatesRes.error.message }, { status: 500 });
    }

    return NextResponse.json({
      machines: machinesRes.data || [],
      templates: templatesRes.data || [],
    });
  } catch (err) {
    console.error("[/api/checklist-start] GET exception:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await request.json();
    const { templateId, machineId, dueDate, jobNumber } = body ?? {};

    if (!templateId || !machineId) {
      return NextResponse.json(
        { error: "templateId and machineId are required" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("checklist_runs")
      .insert({
        template_id: templateId,
        machine_id: machineId,
        user_id: user.id,
        status: "in_progress",
        started_at: new Date().toISOString(),
        due_date: dueDate ?? null,
        job_number: jobNumber ?? null,
      })
      .select("id")
      .single();

    if (error) {
      console.error("[/api/checklist-start] insert error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ runId: data.id });
  } catch (err) {
    console.error("[/api/checklist-start] POST exception:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
