import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

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

    const { data: runs, error: runError } = await supabase
      .from("checklist_runs")
      .select(
        `
        *,
        checklist_templates (name),
        machines (name),
        users!checklist_runs_user_id_fkey (name)
      `
      )
      .eq("user_id", user.id)
      .order("started_at", { ascending: false })
      .limit(50);

    if (runError) {
      console.error("[/api/my-checklists] fetch error:", runError);
      return NextResponse.json({ error: runError.message }, { status: 500 });
    }

    return NextResponse.json({ runs: runs || [] });
  } catch (err) {
    console.error("[/api/my-checklists] exception:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
