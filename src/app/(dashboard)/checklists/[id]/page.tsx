"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import type { ChecklistRun, ChecklistTemplate, Machine, ChecklistAnswer } from "@/types/database";
import Link from "next/link";
import { formatDateTime } from "@/lib/utils";

const cardStyle: React.CSSProperties = {
  background: 'white',
  borderRadius: '12px',
  boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
  border: '1px solid #e2e8f0',
};

const statusConfig = {
  in_progress: { bg: "#fef3c7", color: "#92400e", label: "In Progress" },
  completed: { bg: "#dcfce7", color: "#166534", label: "Completed" },
  aborted: { bg: "#fee2e2", color: "#991b1b", label: "Aborted" },
};

export default function ChecklistDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const router = useRouter();
  const [run, setRun] = useState<ChecklistRun | null>(null);
  const [template, setTemplate] = useState<ChecklistTemplate | null>(null);
  const [machine, setMachine] = useState<Machine | null>(null);
  const [answers, setAnswers] = useState<ChecklistAnswer[]>([]);
  const [operator, setOperator] = useState<{ name: string } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    fetchData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedParams.id]);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000);
      const res = await fetch(`/api/checklist-run?runId=${encodeURIComponent(resolvedParams.id)}`, {
        credentials: "include",
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!res.ok) {
        router.push("/checklists");
        return;
      }

      const { run: runData, template: templateData, machine: machineData, answers: answersData, operator: operatorData } =
        await res.json();

      if (!runData) {
        router.push("/checklists");
        return;
      }

      setRun(runData);
      setTemplate(templateData);
      setMachine(machineData);
      setAnswers(answersData || []);
      setOperator(operatorData);
    } catch (err) {
      console.error("[ChecklistDetail] load error:", err);
      router.push("/checklists");
      return;
    } finally {
      setIsLoading(false);
    }
  };

  const getAnswerForItem = (itemId: string) => {
    return answers.find((a) => a.item_id === itemId);
  };

  const handleExportPDF = async () => {
    if (!run || !template || isExporting) return;
    setIsExporting(true);

    const esc = (v: unknown) =>
      String(v ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");

    const statusLabel = statusConfig[run.status]?.label || run.status;
    const statusColors: Record<string, { bg: string; fg: string }> = {
      completed: { bg: "#dcfce7", fg: "#166534" },
      in_progress: { bg: "#fef3c7", fg: "#92400e" },
      aborted: { bg: "#fee2e2", fg: "#991b1b" },
    };
    const statusColor = statusColors[run.status] || { bg: "#e2e8f0", fg: "#374151" };
    const pdfSections = template.json_definition?.sections || [];

    // Inline styles on every element — html2canvas reads computed per-element
    // styles, so inline styling survives rasterisation even though a <style>
    // block in the isolated iframe does not.
    const FONT = "-apple-system, 'Segoe UI', Arial, sans-serif";

    const metaCell = (label: string, valueHtml: string) => `
      <div style="min-width:130px;">
        <div style="color:#6b7280;font-size:10px;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:2px;">${esc(label)}</div>
        <div style="font-size:14px;font-weight:600;color:#111827;">${valueHtml}</div>
      </div>`;

    const metaCells = [
      metaCell(
        "Status",
        `<span style="display:inline-block;padding:3px 12px;border-radius:9999px;background:${statusColor.bg};color:${statusColor.fg};font-weight:700;font-size:12px;">${esc(statusLabel)}</span>`
      ),
      metaCell("Operator", esc(operator?.name || "Unknown")),
      metaCell("Started", esc(formatDateTime(run.started_at))),
      run.completed_at ? metaCell("Completed", esc(formatDateTime(run.completed_at))) : "",
      run.job_number ? metaCell("Job Number", esc(run.job_number)) : "",
      metaCell("Inspection ID", esc(run.id.slice(0, 8).toUpperCase())),
    ].join("");

    const resultPill = (text: string, bg: string, fg: string) =>
      `<span style="display:inline-block;padding:3px 10px;border-radius:9999px;background:${bg};color:${fg};font-weight:700;font-size:11px;white-space:nowrap;">${esc(text)}</span>`;

    const sectionsHtml = pdfSections
      .map((section) => {
        const itemsHtml = section.items
          .map((item, index) => {
            const answer = answers.find((a) => a.item_id === item.id);
            const isPassed = answer?.value === true || answer?.value === "yes";
            const isFailed = answer?.value === false || answer?.value === "no";
            let resultHtml = `<span style="color:#9ca3af;font-size:12px;">Not answered</span>`;
            if (answer) {
              if (isPassed) resultHtml = resultPill("Pass", "#dcfce7", "#166534");
              else if (isFailed) resultHtml = resultPill("Fail", "#fee2e2", "#991b1b");
              else resultHtml = `<span style="color:#111827;font-weight:600;font-size:13px;">${esc(answer.value)}</span>`;
            }
            const commentHtml = answer?.comment
              ? `<div style="margin-top:6px;padding:6px 10px;background:#fffbeb;border:1px solid #fde68a;border-radius:6px;font-size:12px;color:#92400e;"><strong>Note:</strong> ${esc(answer.comment)}</div>`
              : "";
            const photoHtml = answer?.photo_url
              ? `<div style="margin-top:8px;"><img src="${esc(answer.photo_url)}" alt="Attached photo" style="max-width:240px;border:1px solid #e2e8f0;border-radius:6px;" /></div>`
              : "";
            const criticalTag = item.critical
              ? ` <span style="font-size:9px;background:#fef3c7;color:#92400e;padding:1px 6px;border-radius:9999px;font-weight:700;vertical-align:middle;">CRITICAL</span>`
              : "";
            const rowBg = index % 2 === 0 ? "#ffffff" : "#f9fafb";
            return `
              <tr style="background:${rowBg};">
                <td style="padding:8px;border-bottom:1px solid #eef2f7;vertical-align:top;width:28px;text-align:center;color:#9ca3af;font-size:12px;">${index + 1}</td>
                <td style="padding:8px;border-bottom:1px solid #eef2f7;vertical-align:top;font-size:13px;color:#111827;">
                  ${esc(item.label || item.question)}${criticalTag}
                  ${commentHtml}
                  ${photoHtml}
                </td>
                <td style="padding:8px;border-bottom:1px solid #eef2f7;vertical-align:top;width:96px;text-align:center;">${resultHtml}</td>
              </tr>`;
          })
          .join("");
        return `
          <div style="margin-bottom:22px;page-break-inside:avoid;">
            <h2 style="font-size:15px;color:#0057A8;border-bottom:2px solid #e2e8f0;padding-bottom:6px;margin:0 0 10px 0;">${esc(section.title)}</h2>
            ${section.description ? `<p style="color:#6b7280;font-size:12px;margin:0 0 10px 0;">${esc(section.description)}</p>` : ""}
            <table style="width:100%;border-collapse:collapse;">
              <thead>
                <tr>
                  <th style="text-align:center;background:#f1f5f9;padding:7px 8px;border-bottom:2px solid #cbd5e1;font-size:10px;text-transform:uppercase;letter-spacing:0.04em;color:#64748b;width:28px;">#</th>
                  <th style="text-align:left;background:#f1f5f9;padding:7px 8px;border-bottom:2px solid #cbd5e1;font-size:10px;text-transform:uppercase;letter-spacing:0.04em;color:#64748b;">Check</th>
                  <th style="text-align:center;background:#f1f5f9;padding:7px 8px;border-bottom:2px solid #cbd5e1;font-size:10px;text-transform:uppercase;letter-spacing:0.04em;color:#64748b;width:96px;">Result</th>
                </tr>
              </thead>
              <tbody>${itemsHtml}</tbody>
            </table>
          </div>`;
      })
      .join("");

    const notesHtml = run.notes
      ? `<div style="margin-bottom:22px;page-break-inside:avoid;">
          <h2 style="font-size:15px;color:#0057A8;border-bottom:2px solid #e2e8f0;padding-bottom:6px;margin:0 0 10px 0;">Notes</h2>
          <p style="font-size:13px;color:#374151;margin:0;">${esc(run.notes)}</p>
        </div>`
      : "";

    const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><title>${esc(template.name)} - ${esc(machine?.name || "")}</title></head>
<body style="margin:0;background:#ffffff;">
  <div id="pdf-root" style="font-family:${FONT};color:#111827;width:760px;padding:32px;background:#ffffff;">
    <div style="border-bottom:3px solid #0057A8;padding-bottom:14px;margin-bottom:18px;">
      <h1 style="color:#0057A8;margin:0 0 4px 0;font-size:24px;font-weight:800;">${esc(template.name)}</h1>
      <p style="color:#475569;font-size:15px;margin:0;">${esc(machine?.name || "")}</p>
    </div>
    <div style="display:flex;flex-wrap:wrap;gap:20px 32px;margin-bottom:24px;">
      ${metaCells}
    </div>
    ${sectionsHtml}
    ${notesHtml}
    <div style="margin-top:28px;padding-top:12px;border-top:1px solid #e2e8f0;color:#9ca3af;font-size:11px;">Generated ${esc(formatDateTime(new Date().toISOString()))} &bull; Creative Composites Machine Checklist System</div>
  </div>
</body>
</html>`;

    // Render the report inside an isolated, off-screen iframe so the app's
    // global Tailwind styles (which use oklch colours html2canvas can't parse)
    // never touch it, then rasterise that clean document into a real PDF file.
    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.left = "-10000px";
    iframe.style.top = "0";
    iframe.style.width = "800px";
    iframe.style.height = "1131px";
    iframe.setAttribute("aria-hidden", "true");
    document.body.appendChild(iframe);

    const cleanup = () => {
      if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
      setIsExporting(false);
    };

    const doc = iframe.contentDocument;
    if (!doc) {
      cleanup();
      alert("Sorry, the PDF couldn't be generated. Please try again.");
      return;
    }
    doc.open();
    doc.write(html);
    doc.close();

    const safeName = `${template.name} - ${machine?.name || "checklist"}`
      .replace(/[^a-z0-9\-_ ]/gi, "")
      .trim()
      .replace(/\s+/g, "-");
    const filename = `${safeName || "checklist"}-${run.id.slice(0, 8)}.pdf`;

    const waitForImages = async () => {
      const imgs = Array.from(doc.images || []);
      await Promise.all(
        imgs.map((img) =>
          img.complete
            ? Promise.resolve()
            : new Promise<void>((resolve) => {
                img.onload = () => resolve();
                img.onerror = () => resolve();
              })
        )
      );
    };

    try {
      await waitForImages();
      const { default: html2pdf } = await import("html2pdf.js");
      const target = doc.getElementById("pdf-root") || doc.body;
      await html2pdf()
        .set({
          margin: [10, 10, 12, 10],
          filename,
          image: { type: "jpeg", quality: 0.98 },
          html2canvas: { scale: 2, useCORS: true, backgroundColor: "#ffffff", windowWidth: 824 },
          jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
          pagebreak: { mode: ["css", "legacy"] },
        })
        .from(target)
        .save();
    } catch (err) {
      console.error("[ChecklistDetail] PDF export failed:", err);
      alert("Sorry, the PDF couldn't be generated. Please try again.");
    } finally {
      cleanup();
    }
  };

  if (isLoading) {
    return (
      <div style={{ maxWidth: '800px', margin: '0 auto' }}>
        <div style={{ height: '32px', background: '#f3f4f6', borderRadius: '8px', width: '200px', marginBottom: '24px' }} />
        <div style={{ ...cardStyle, height: '300px' }} />
      </div>
    );
  }

  if (!run || !template) {
    return null;
  }

  const sections = template.json_definition?.sections || [];
  const totalItems = sections.reduce((acc, s) => acc + s.items.length, 0);
  const answeredItems = answers.length;
  const failedItems = answers.filter((a) => a.value === false || a.value === "no").length;

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <Link href="/checklists" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '8px 12px', color: '#6b7280', fontSize: '14px', fontWeight: '500' }}>
            <svg style={{ width: '16px', height: '16px' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </Link>
          <div>
            <h1 style={{ fontSize: '20px', fontWeight: 'bold', color: '#111827', margin: 0 }}>{template.name}</h1>
            <p style={{ color: '#6b7280', margin: '2px 0 0 0' }}>{machine?.name}</p>
          </div>
        </div>
        <span style={{ fontSize: '14px', fontWeight: '500', padding: '6px 14px', borderRadius: '9999px', background: statusConfig[run.status].bg, color: statusConfig[run.status].color }}>
          {statusConfig[run.status].label}
        </span>
      </div>

      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
        <div style={{ ...cardStyle, padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <svg style={{ width: '20px', height: '20px', color: '#6b7280' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            <div>
              <p style={{ fontSize: '12px', color: '#6b7280', margin: 0 }}>Operator</p>
              <p style={{ fontWeight: '500', color: '#111827', margin: 0 }}>{operator?.name || "Unknown"}</p>
            </div>
          </div>
        </div>
        <div style={{ ...cardStyle, padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <svg style={{ width: '20px', height: '20px', color: '#6b7280' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <div>
              <p style={{ fontSize: '12px', color: '#6b7280', margin: 0 }}>Started</p>
              <p style={{ fontWeight: '500', color: '#111827', margin: 0 }}>{formatDateTime(run.started_at)}</p>
            </div>
          </div>
        </div>
        <div style={{ ...cardStyle, padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <svg style={{ width: '20px', height: '20px', color: '#22c55e' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <p style={{ fontSize: '12px', color: '#6b7280', margin: 0 }}>Completed</p>
              <p style={{ fontWeight: '500', color: '#111827', margin: 0 }}>{answeredItems} / {totalItems}</p>
            </div>
          </div>
        </div>
        <div style={{ ...cardStyle, padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <svg style={{ width: '20px', height: '20px', color: '#ef4444' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <p style={{ fontSize: '12px', color: '#6b7280', margin: 0 }}>Failed</p>
              <p style={{ fontWeight: '500', color: '#111827', margin: 0 }}>{failedItems} items</p>
            </div>
          </div>
        </div>
      </div>

      {/* Job Number */}
      {run.job_number && (
        <div style={{ ...cardStyle, padding: '16px', marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <svg style={{ width: '20px', height: '20px', color: '#6b7280' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <div>
              <p style={{ fontSize: '12px', color: '#6b7280', margin: 0 }}>Job Number</p>
              <p style={{ fontWeight: '600', margin: '2px 0 0 0', fontFamily: 'monospace', letterSpacing: '0.5px' }}>{run.job_number}</p>
            </div>
          </div>
        </div>
      )}

      {/* Checklist Sections */}
      {sections.map((section) => (
        <div key={section.id} style={{ ...cardStyle, marginBottom: '16px' }}>
          <div style={{ padding: '20px', borderBottom: '1px solid #e2e8f0' }}>
            <h2 style={{ fontSize: '18px', fontWeight: '600', color: '#111827', margin: 0 }}>{section.title}</h2>
            {section.description && <p style={{ fontSize: '14px', color: '#6b7280', margin: '4px 0 0 0' }}>{section.description}</p>}
          </div>
          <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {section.items.map((item, index) => {
              const answer = getAnswerForItem(item.id);
              const isPassed = answer?.value === true || answer?.value === "yes";
              const isFailed = answer?.value === false || answer?.value === "no";

              return (
                <div key={item.id} style={{
                  padding: '16px',
                  borderRadius: '8px',
                  border: `1px solid ${isFailed ? '#fecaca' : isPassed ? '#bbf7d0' : '#e2e8f0'}`,
                  background: isFailed ? '#fef2f2' : isPassed ? '#f0fdf4' : '#f8fafc',
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                    <span style={{ fontSize: '14px', fontWeight: '500', color: '#6b7280', marginTop: '2px' }}>{index + 1}.</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
                        <p style={{ fontWeight: '500', color: '#111827', margin: 0 }}>
                          {item.label || item.question}
                          {item.critical && (
                            <span style={{ marginLeft: '8px', fontSize: '12px', padding: '2px 8px', borderRadius: '9999px', background: '#fef3c7', color: '#92400e' }}>Critical</span>
                          )}
                        </p>
                        {answer && (
                          <span style={{
                            fontSize: '12px',
                            fontWeight: '500',
                            padding: '4px 10px',
                            borderRadius: '9999px',
                            background: isPassed ? '#dcfce7' : isFailed ? '#fee2e2' : '#f3f4f6',
                            color: isPassed ? '#166534' : isFailed ? '#991b1b' : '#374151',
                          }}>
                            {isPassed ? 'Pass' : isFailed ? 'Fail' : String(answer.value)}
                          </span>
                        )}
                        {!answer && (
                          <span style={{ fontSize: '12px', fontWeight: '500', padding: '4px 10px', borderRadius: '9999px', background: '#f3f4f6', color: '#6b7280' }}>Not answered</span>
                        )}
                      </div>
                      {answer?.comment && (
                        <div style={{ marginTop: '8px', padding: '8px', borderRadius: '6px', background: 'white' }}>
                          <p style={{ fontSize: '14px', color: '#6b7280', margin: 0 }}>{answer.comment}</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* Notes */}
      {run.notes && (
        <div style={{ ...cardStyle, padding: '16px', marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
            <svg style={{ width: '20px', height: '20px', color: '#6b7280' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            <h3 style={{ fontWeight: '600', color: '#111827', margin: 0 }}>Notes</h3>
          </div>
          <p style={{ color: '#6b7280', margin: 0 }}>{run.notes}</p>
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: '12px' }}>
        <button onClick={handleExportPDF} disabled={isExporting} style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '12px', border: '1px solid #e2e8f0', borderRadius: '8px', background: 'white', color: '#374151', fontWeight: '500', cursor: isExporting ? 'wait' : 'pointer', opacity: isExporting ? 0.6 : 1 }}>
          <svg style={{ width: '16px', height: '16px' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          {isExporting ? "Generating PDF…" : "Export PDF"}
        </button>
        {run.status === "in_progress" && (
          <Link href={`/checklists/${run.id}/run`} style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '12px', background: '#0057A8', color: 'white', borderRadius: '8px', fontWeight: '500' }}>
            Continue Checklist
          </Link>
        )}
      </div>
    </div>
  );
}
