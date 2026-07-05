import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// Server-side loader for the checklist run page. The page previously issued
// several queries through the browser Supabase client, which waits on the auth
// session and can stall on the navigator.locks-based auth lock - so the page
// often hung on "Loading..." until a manual refresh. Reading from the server
// (session resolved from the request cookie) is fast and reliable.
export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const runId = searchParams.get("runId");
    if (!runId) {
      return NextResponse.json({ error: "runId is required" }, { status: 400 });
    }

    const { data: run, error: runError } = await supabase
      .from("checklist_runs")
      .select("*")
      .eq("id", runId)
      .single();

    if (runError || !run) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }

    const [templateRes, machineRes, answersRes, operatorRes] = await Promise.all([
      supabase.from("checklist_templates").select("*").eq("id", run.template_id).single(),
      supabase.from("machines").select("*").eq("id", run.machine_id).single(),
      supabase.from("checklist_answers").select("*").eq("run_id", runId),
      supabase.from("users").select("name").eq("id", run.user_id).single(),
    ]);

    return NextResponse.json({
      run,
      template: templateRes.data ?? null,
      machine: machineRes.data ?? null,
      answers: answersRes.data ?? [],
      operator: operatorRes.data ?? null,
    });
  } catch (err) {
    console.error("[/api/checklist-run] exception:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
