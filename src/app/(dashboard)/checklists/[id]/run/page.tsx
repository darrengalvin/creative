"use client";

import { useState, useEffect, useRef, use } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/contexts/toast-context";
import { CameraCapture } from "@/components/ui/camera-capture";
import Link from "next/link";

interface ChecklistRun {
  id: string;
  template_id: string;
  machine_id: string;
  user_id: string;
  status: string;
  started_at: string;
  job_number: string | null;
  part_number: string | null;
  program_name: string | null;
}

interface ChecklistItem {
  id: string;
  label?: string;
  question?: string; // Legacy format
  type: "yes_no" | "numeric" | "text";
  critical?: boolean;
  required?: boolean;
  photoRequired?: boolean; // Requires photo upload
  hint?: string;
  guidance?: string; // Legacy format
  minValue?: number;
  maxValue?: number;
  min_value?: number; // Legacy format
  max_value?: number; // Legacy format
  unit?: string;
  referenceImageUrl?: string; // Reference image
  reference_image_url?: string; // Legacy format
}

interface ChecklistSection {
  id: string;
  title: string;
  description?: string;
  items: ChecklistItem[];
}

interface ChecklistTemplate {
  id: string;
  name: string;
  type: string;
  json_definition: {
    sections: ChecklistSection[];
  };
}

interface Machine {
  id: string;
  name: string;
}

interface ChecklistAnswer {
  id?: string;
  run_id: string;
  item_id: string;
  value: boolean | string | number | null;
  comment?: string | null;
  photo_url?: string | null;
}

const cardStyle: React.CSSProperties = {
  background: 'white',
  borderRadius: '12px',
  boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
  border: '1px solid #e2e8f0',
};

const BRAND_BLUE = '#0057A8';

export default function ChecklistRunPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const router = useRouter();
  const { user } = useAuth();
  const { showToast } = useToast();
  const supabase = createClient();

  const [run, setRun] = useState<ChecklistRun | null>(null);
  const [template, setTemplate] = useState<ChecklistTemplate | null>(null);
  const [machine, setMachine] = useState<Machine | null>(null);
  const [answers, setAnswers] = useState<Map<string, ChecklistAnswer>>(new Map());
  // Local, uncontrolled-style drafts for text/numeric inputs so typing is not
  // interrupted by the async save + re-render cycle. Committed to the DB onBlur.
  const [inputDrafts, setInputDrafts] = useState<Map<string, string>>(new Map());
  const [currentSectionIndex, setCurrentSectionIndex] = useState(0);
  const [commentingItemId, setCommentingItemId] = useState<string | null>(null);
  const [uploadingItemId, setUploadingItemId] = useState<string | null>(null);
  const [commentText, setCommentText] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  
  // Concern modal state
  const [concernItemId, setConcernItemId] = useState<string | null>(null);
  const [concernItemLabel, setConcernItemLabel] = useState<string>("");
  const [concernDescription, setConcernDescription] = useState("");
  const [concernSeverity, setConcernSeverity] = useState<"low" | "medium" | "high" | "critical">("medium");
  const [concernPhotoUrl, setConcernPhotoUrl] = useState<string | null>(null);
  const [isSubmittingConcern, setIsSubmittingConcern] = useState(false);
  const [showConcernCamera, setShowConcernCamera] = useState(false);

  useEffect(() => {
    fetchData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedParams.id]);

  const fetchData = async () => {
    setIsLoading(true);

    const { data: runData } = await supabase
      .from("checklist_runs")
      .select("*")
      .eq("id", resolvedParams.id)
      .single();

    if (!runData || runData.status !== "in_progress") {
      router.push(`/checklists/${resolvedParams.id}`);
      return;
    }
    setRun(runData);

    const [templateRes, machineRes, answersRes] = await Promise.all([
      supabase.from("checklist_templates").select("*").eq("id", runData.template_id).single(),
      supabase.from("machines").select("id, name").eq("id", runData.machine_id).single(),
      supabase.from("checklist_answers").select("*").eq("run_id", resolvedParams.id),
    ]);

    setTemplate(templateRes.data);
    setMachine(machineRes.data);

    // Build answers map
    const answersMap = new Map<string, ChecklistAnswer>();
    (answersRes.data || []).forEach((a: ChecklistAnswer) => {
      answersMap.set(a.item_id, a);
    });
    setAnswers(answersMap);

    setIsLoading(false);
  };

  const saveAnswer = async (sectionId: string, itemId: string, value: boolean | string | number | null, comment?: string, photoUrl?: string) => {
    if (!run) return;
    setIsSaving(true);

    const existingAnswer = answers.get(itemId);
    const answerData: {
      run_id: string;
      section_id: string;
      item_id: string;
      value: boolean | string | number | null;
      comment: string | null;
      photo_url: string | null;
      answered_at: string;
      id?: string;
    } = {
      run_id: run.id,
      section_id: sectionId,
      item_id: itemId,
      value,
      comment: comment || null,
      photo_url: photoUrl !== undefined ? (photoUrl || null) : (existingAnswer?.photo_url || null),
      answered_at: new Date().toISOString(),
    };

    try {
      // Save through the server endpoint. The browser Supabase client's writes
      // are unreliable here (its auth lock can stall, so inserts/updates hang
      // and answers/comments silently never persist). The server reads the
      // session from cookies, so the write is authenticated and stable.
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000);

      const res = await fetch("/api/checklist-answers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        signal: controller.signal,
        body: JSON.stringify({
          runId: answerData.run_id,
          sectionId: answerData.section_id,
          itemId: answerData.item_id,
          value: answerData.value,
          comment: answerData.comment,
          photoUrl: answerData.photo_url,
        }),
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        let description =
          "The database rejected this answer. Please try again or contact your administrator.";
        try {
          const errJson = await res.json();
          if (errJson?.error) description = errJson.error;
        } catch {
          // ignore parse failure, keep default message
        }
        console.error("Error saving answer:", res.status, description);
        showToast({ type: "error", title: "Couldn't save your answer", description });
        setIsSaving(false);
        return;
      }

      const { answer } = await res.json();

      // Update local state with the row the server actually saved (includes id).
      setAnswers(new Map(answers.set(itemId, (answer ?? answerData) as ChecklistAnswer)));
    } catch (err) {
      console.error("Error saving answer:", err);
      showToast({
        type: "error",
        title: "Couldn't save",
        description: "Something went wrong while saving. Please check your connection and try again.",
      });
    }

    setIsSaving(false);
  };

  const handleAnswer = (sectionId: string, itemId: string, value: boolean) => {
    const existingAnswer = answers.get(itemId);
    saveAnswer(sectionId, itemId, value, existingAnswer?.comment || undefined, existingAnswer?.photo_url || undefined);
  };

  // The value shown in a text/numeric field: the local draft if the user has
  // started typing, otherwise the last saved answer value.
  const getInputValue = (itemId: string): string => {
    if (inputDrafts.has(itemId)) return inputDrafts.get(itemId) ?? "";
    const answer = answers.get(itemId);
    return answer?.value !== undefined && answer?.value !== null ? String(answer.value) : "";
  };

  // Debounce timers per item so we can auto-save text/numeric answers a short
  // moment after the user stops typing. Relying only on onBlur is fragile
  // (especially on tablets, where blur can fail to fire when tapping between
  // elements or dismissing the on-screen keyboard), which is why typed answers
  // could appear not to save.
  const autosaveTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const handleInputChange = (itemId: string, value: string) => {
    setInputDrafts((prev) => new Map(prev).set(itemId, value));
  };

  const handleInputChangeWithAutosave = (
    sectionId: string,
    itemId: string,
    type: "text" | "numeric",
    value: string
  ) => {
    setInputDrafts((prev) => new Map(prev).set(itemId, value));

    const timers = autosaveTimers.current;
    const existing = timers.get(itemId);
    if (existing) clearTimeout(existing);
    timers.set(
      itemId,
      setTimeout(() => {
        timers.delete(itemId);
        commitInputDraft(sectionId, itemId, type, value);
      }, 900)
    );
  };

  // Persist a text/numeric draft to the database (called onBlur / Enter).
  // The raw value is read straight from the input element at commit time and
  // passed in. Relying on the `inputDrafts` state here was unreliable: the
  // blur handler could close over a stale copy of the map, so the value the
  // user typed was silently dropped and never saved.
  const commitInputDraft = (sectionId: string, itemId: string, type: "text" | "numeric", explicitValue?: string) => {
    const raw = explicitValue !== undefined ? explicitValue : inputDrafts.get(itemId);
    if (raw === undefined) return; // nothing typed since last save

    const existingAnswer = answers.get(itemId);

    if (type === "numeric") {
      if (raw === "") return; // don't overwrite with empty
      const num = Number(raw);
      if (Number.isNaN(num)) return;
      if (existingAnswer && Number(existingAnswer.value) === num) return; // unchanged
      saveAnswer(sectionId, itemId, num, existingAnswer?.comment || undefined, existingAnswer?.photo_url || undefined);
    } else {
      if (raw === "") return;
      if (existingAnswer && String(existingAnswer.value) === raw) return; // unchanged
      saveAnswer(sectionId, itemId, raw, existingAnswer?.comment || undefined, existingAnswer?.photo_url || undefined);
    }
  };

  const [commentingSectionId, setCommentingSectionId] = useState<string | null>(null);
  const [uploadingSectionId, setUploadingSectionId] = useState<string | null>(null);

  const handleAddComment = (sectionId: string, itemId: string) => {
    setCommentingSectionId(sectionId);
    setCommentingItemId(itemId);
    setCommentText(answers.get(itemId)?.comment || "");
  };

  const handleAddPhoto = (sectionId: string, itemId: string) => {
    setUploadingSectionId(sectionId);
    setUploadingItemId(itemId);
  };

  const handlePhotoUpload = (itemId: string, photoUrl: string) => {
    if (!uploadingSectionId) return;
    const existingAnswer = answers.get(itemId);
    
    // Save the photo (or removal of photo) to the answer
    if (existingAnswer) {
      // Update existing answer with new photo URL (or empty string to remove)
      saveAnswer(
        uploadingSectionId, 
        itemId, 
        existingAnswer.value as boolean | string | number, 
        existingAnswer.comment || undefined, 
        photoUrl || "" // Empty string removes the photo
      );
    }
    
    // If photo was removed (empty string), update local state immediately
    if (!photoUrl && existingAnswer) {
      const updatedAnswer = { ...existingAnswer, photo_url: null };
      setAnswers(new Map(answers.set(itemId, updatedAnswer)));
    }
  };

  const handleSaveComment = () => {
    if (!commentingItemId || !commentingSectionId) return;
    const existingAnswer = answers.get(commentingItemId);
    // Save the comment even when the item hasn't been answered yet. Previously
    // this bailed out when there was no existing answer, so a comment added
    // before ticking YES/NO/entering a value was silently discarded.
    const currentValue = (existingAnswer?.value ?? null) as boolean | string | number | null;
    saveAnswer(
      commentingSectionId,
      commentingItemId,
      currentValue,
      commentText,
      existingAnswer?.photo_url || undefined
    );
    setCommentingSectionId(null);
    setCommentingItemId(null);
    setCommentText("");
  };

  // Raise Concern handlers
  const handleRaiseConcern = (itemId: string, itemLabel: string) => {
    setConcernItemId(itemId);
    setConcernItemLabel(itemLabel);
    setConcernDescription("");
    setConcernSeverity("medium");
    setConcernPhotoUrl(null);
    setShowConcernCamera(false);
  };

  const handleSubmitConcern = async () => {
    if (!concernItemId || !concernDescription.trim() || !run || !machine) return;
    setIsSubmittingConcern(true);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000);
      const res = await fetch("/api/machine-concerns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        signal: controller.signal,
        body: JSON.stringify({
          machineId: machine.id,
          checklistRunId: run.id,
          checklistItemId: concernItemId,
          checklistItemName: concernItemLabel,
          severity: concernSeverity,
          description: concernDescription,
          photoUrl: concernPhotoUrl,
        }),
      });
      clearTimeout(timeoutId);

      if (!res.ok) {
        let description = "Couldn't raise the concern. Please try again.";
        try {
          const errJson = await res.json();
          if (errJson?.code === "42P01") {
            description = "Concern feature not yet enabled (missing database table).";
          } else if (errJson?.error) {
            description = errJson.error;
          }
        } catch {
          // keep default message
        }
        console.error("Error submitting concern:", res.status, description);
        showToast({ type: "error", title: "Couldn't raise concern", description });
        setIsSubmittingConcern(false);
        return;
      }

      // Close modal
      setConcernItemId(null);
      setConcernItemLabel("");
      setConcernDescription("");
      setConcernPhotoUrl(null);
    } catch (err) {
      console.error("Error submitting concern:", err);
      showToast({
        type: "error",
        title: "Couldn't raise concern",
        description: "Something went wrong. Please try again.",
      });
    }

    setIsSubmittingConcern(false);
  };

  const handleConcernPhotoCapture = (photoUrl: string) => {
    setConcernPhotoUrl(photoUrl);
    setShowConcernCamera(false);
  };

  const updateRunStatus = async (status: "completed" | "aborted") => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);
    const res = await fetch("/api/checklist-runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      signal: controller.signal,
      body: JSON.stringify({ runId: run!.id, status }),
    });
    clearTimeout(timeoutId);
    if (!res.ok) {
      let description = "Please try again or contact your administrator.";
      try {
        const errJson = await res.json();
        if (errJson?.error) description = errJson.error;
      } catch {
        // keep default message
      }
      throw new Error(description);
    }
  };

  const handleComplete = async () => {
    if (!run) return;
    setIsCompleting(true);

    try {
      await updateRunStatus("completed");
      router.push(`/checklists/${run.id}`);
    } catch (err) {
      console.error("Error completing checklist:", err);
      showToast({
        type: "error",
        title: "Couldn't submit checklist",
        description: err instanceof Error ? err.message : "Please try again.",
      });
      setIsCompleting(false);
    }
  };

  const handleAbort = async () => {
    if (!run || !confirm("Are you sure you want to abort this checklist? This cannot be undone.")) return;

    try {
      await updateRunStatus("aborted");
      router.push(`/checklists/${run.id}`);
    } catch (err) {
      console.error("Error aborting checklist:", err);
      showToast({
        type: "error",
        title: "Couldn't abort checklist",
        description: err instanceof Error ? err.message : "Please try again.",
      });
    }
  };

  if (isLoading || !run || !template) {
    return (
      <div style={{ maxWidth: '800px', margin: '0 auto' }}>
        <div style={{ height: '32px', background: '#f3f4f6', borderRadius: '8px', width: '200px', marginBottom: '24px' }} />
        <div style={{ ...cardStyle, height: '400px' }} />
      </div>
    );
  }

  const sections = template.json_definition?.sections || [];
  const currentSection = sections[currentSectionIndex];
  const totalItems = sections.reduce((acc, s) => acc + s.items.length, 0);
  const answeredCount = answers.size;
  
  // Count failed items - yes_no = false, numeric = out of range
  const failedCount = sections.reduce((acc, section) => {
    return acc + section.items.filter(item => {
      const answer = answers.get(item.id);
      if (!answer || answer.value === null || answer.value === undefined) return false;
      
      const minVal = item.minValue ?? item.min_value;
      const maxVal = item.maxValue ?? item.max_value;
      
      if (item.type === "yes_no") {
        return answer.value === false;
      } else if (item.type === "numeric" && minVal !== undefined && maxVal !== undefined) {
        const numVal = Number(answer.value);
        return numVal < minVal || numVal > maxVal;
      }
      return false;
    }).length;
  }, 0);
  
  // Count items with missing required photos
  const missingPhotos = sections.reduce((acc, section) => {
    return acc + section.items.filter(item => {
      if (!item.photoRequired) return false;
      const answer = answers.get(item.id);
      return !answer || !answer.photo_url;
    }).length;
  }, 0);
  
  const progress = totalItems > 0 ? (answeredCount / totalItems) * 100 : 0;

  const allItemsAnswered = answeredCount >= totalItems && missingPhotos === 0;

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ ...cardStyle, padding: '20px', marginBottom: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
          <div>
            <h1 style={{ fontSize: '20px', fontWeight: 'bold', color: '#111827', margin: 0 }}>{template.name}</h1>
            <p style={{ color: '#6b7280', margin: '4px 0 0 0' }}>{machine?.name}</p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <p style={{ fontSize: '12px', color: '#6b7280', margin: 0 }}>Inspection ID</p>
            <p style={{ fontSize: '14px', fontWeight: '600', color: '#111827', margin: '2px 0 0 0', fontFamily: 'monospace' }}>
              {run.id.slice(0, 8).toUpperCase()}
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '32px', height: '32px', background: BRAND_BLUE, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: '600', fontSize: '12px' }}>
              {user?.name?.charAt(0).toUpperCase() || 'U'}
            </div>
            <div>
              <p style={{ fontSize: '12px', color: '#6b7280', margin: 0 }}>Operator</p>
              <p style={{ fontSize: '14px', fontWeight: '500', color: '#111827', margin: 0 }}>{user?.name}</p>
            </div>
          </div>
          {run.job_number && (
            <div>
              <p style={{ fontSize: '12px', color: '#6b7280', margin: 0 }}>Job</p>
              <p style={{ fontSize: '14px', fontWeight: '500', color: '#111827', margin: 0 }}>{run.job_number}</p>
            </div>
          )}
          {run.part_number && (
            <div>
              <p style={{ fontSize: '12px', color: '#6b7280', margin: 0 }}>Part</p>
              <p style={{ fontSize: '14px', fontWeight: '500', color: '#111827', margin: 0 }}>{run.part_number}</p>
            </div>
          )}
        </div>

        {/* Progress Bar */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
            <span style={{ fontSize: '12px', fontWeight: '500', color: '#6b7280' }}>Progress</span>
            <span style={{ fontSize: '12px', fontWeight: '500', color: '#6b7280' }}>{answeredCount} / {totalItems}</span>
          </div>
          <div style={{ height: '8px', background: '#e2e8f0', borderRadius: '4px', overflow: 'hidden' }}>
            <div style={{ height: '100%', background: BRAND_BLUE, width: `${progress}%`, transition: 'width 0.3s' }} />
          </div>
          {failedCount > 0 && (
            <p style={{ fontSize: '12px', color: '#dc2626', margin: '8px 0 0 0' }}>
              ⚠️ {failedCount} item{failedCount > 1 ? 's' : ''} failed
            </p>
          )}
          {missingPhotos > 0 && (
            <p style={{ fontSize: '12px', color: '#dc2626', margin: '8px 0 0 0' }}>
              📷 {missingPhotos} required photo{missingPhotos > 1 ? 's' : ''} missing
            </p>
          )}
        </div>
      </div>

      {/* Section Navigation */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', overflowX: 'auto', paddingBottom: '4px' }}>
        {sections.map((section, idx) => {
          const sectionAnswers = section.items.filter(item => answers.has(item.id)).length;
          const isComplete = sectionAnswers === section.items.length;
          const hasFailed = section.items.some(item => answers.get(item.id)?.value === false);

          return (
            <button
              key={section.id}
              onClick={() => setCurrentSectionIndex(idx)}
              style={{
                padding: '8px 16px',
                borderRadius: '8px',
                border: currentSectionIndex === idx ? `2px solid ${BRAND_BLUE}` : '1px solid #e2e8f0',
                background: currentSectionIndex === idx ? '#eff6ff' : 'white',
                color: currentSectionIndex === idx ? BRAND_BLUE : '#374151',
                fontWeight: currentSectionIndex === idx ? '600' : '400',
                fontSize: '14px',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              {section.title}
              {isComplete && !hasFailed && (
                <svg style={{ width: '16px', height: '16px', color: '#22c55e' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              )}
              {hasFailed && (
                <svg style={{ width: '16px', height: '16px', color: '#dc2626' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              )}
            </button>
          );
        })}
      </div>

      {/* Current Section */}
      {currentSection && (
        <div style={{ ...cardStyle, marginBottom: '16px' }}>
          <div style={{ padding: '20px', borderBottom: '1px solid #e2e8f0' }}>
            <h2 style={{ fontSize: '18px', fontWeight: '600', color: '#111827', margin: 0 }}>{currentSection.title}</h2>
            {currentSection.description && (
              <p style={{ fontSize: '14px', color: '#6b7280', margin: '4px 0 0 0' }}>{currentSection.description}</p>
            )}
          </div>

          <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {currentSection.items.map((item, index) => {
              const answer = answers.get(item.id);
              const hasAnswer = answer !== undefined && answer.value !== null && answer.value !== undefined;
              
              // Determine pass/fail based on item type
              let isPassed = false;
              let isFailed = false;
              
              // Handle both legacy (min_value/max_value) and new (minValue/maxValue) formats
              const minVal = item.minValue ?? item.min_value;
              const maxVal = item.maxValue ?? item.max_value;
              
              if (item.type === "yes_no") {
                isPassed = answer?.value === true;
                isFailed = answer?.value === false;
              } else if (item.type === "numeric" && hasAnswer) {
                const numVal = Number(answer?.value);
                if (minVal !== undefined && maxVal !== undefined) {
                  isPassed = numVal >= minVal && numVal <= maxVal;
                  isFailed = numVal < minVal || numVal > maxVal;
                } else {
                  isPassed = true; // No range = any value is OK
                }
              } else if (item.type === "text" && hasAnswer) {
                isPassed = true; // Text entered = complete
              }

              return (
                <div
                  key={item.id}
                  style={{
                    padding: '16px',
                    borderRadius: '12px',
                    border: `2px solid ${isFailed ? '#fecaca' : isPassed ? '#bbf7d0' : '#e2e8f0'}`,
                    background: isFailed ? '#fef2f2' : isPassed ? '#f0fdf4' : 'white',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                    <span style={{ 
                      width: '28px', 
                      height: '28px', 
                      borderRadius: '50%', 
                      background: isPassed ? '#22c55e' : isFailed ? '#ef4444' : '#e2e8f0',
                      color: isPassed || isFailed ? 'white' : '#6b7280',
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center',
                      fontSize: '14px',
                      fontWeight: '600',
                      flexShrink: 0,
                    }}>
                      {isPassed ? '✓' : isFailed ? '✗' : index + 1}
                    </span>

                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', marginBottom: '8px' }}>
                        <div>
                          <p style={{ fontWeight: '500', color: '#111827', margin: 0, fontSize: '15px' }}>
                            {item.label || item.question}
                            {item.critical && (
                              <span style={{ marginLeft: '8px', fontSize: '11px', padding: '2px 8px', borderRadius: '9999px', background: '#fef3c7', color: '#92400e', fontWeight: '600' }}>CRITICAL</span>
                            )}
                            {item.photoRequired && (
                              <span style={{ marginLeft: '8px', fontSize: '11px', padding: '2px 8px', borderRadius: '9999px', background: '#dbeafe', color: '#1e40af', fontWeight: '600' }}>📷 PHOTO REQUIRED</span>
                            )}
                          </p>
                          {(item.hint || item.guidance) && (
                            <p style={{ fontSize: '13px', color: '#6b7280', margin: '4px 0 0 0' }}>{item.hint || item.guidance}</p>
                          )}
                        </div>
                      </div>

                      {/* Reference Image - "It should look like this" */}
                      {(item.referenceImageUrl || item.reference_image_url) && (
                        <div style={{ marginBottom: '12px', padding: '12px', background: '#eff6ff', borderRadius: '8px', border: '1px solid #bfdbfe' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                            <svg style={{ width: '16px', height: '16px', color: '#0057A8' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <span style={{ fontSize: '13px', fontWeight: '600', color: '#0057A8' }}>
                              Reference: It should look like this
                            </span>
                          </div>
                          <img
                            src={item.referenceImageUrl || item.reference_image_url}
                            alt="Reference"
                            style={{
                              width: '100%',
                              maxWidth: '300px',
                              height: 'auto',
                              borderRadius: '6px',
                              border: '1px solid #bfdbfe',
                            }}
                          />
                        </div>
                      )}

                      {/* Answer Input - varies by type */}
                      {item.type === "yes_no" && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          <button
                            onClick={() => handleAnswer(currentSection.id, item.id, true)}
                            disabled={isSaving}
                            style={{
                              flex: 1,
                              minWidth: '120px',
                              padding: '12px',
                              borderRadius: '8px',
                              border: isPassed ? '2px solid #22c55e' : '1px solid #e2e8f0',
                              background: isPassed ? '#dcfce7' : 'white',
                              color: isPassed ? '#166534' : '#374151',
                              fontWeight: '600',
                              fontSize: '14px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '6px',
                            }}
                          >
                            <svg style={{ width: '18px', height: '18px' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                            YES
                          </button>
                          <button
                            onClick={() => handleAnswer(currentSection.id, item.id, false)}
                            disabled={isSaving}
                            style={{
                              flex: 1,
                              minWidth: '120px',
                              padding: '12px',
                              borderRadius: '8px',
                              border: isFailed ? '2px solid #ef4444' : '1px solid #e2e8f0',
                              background: isFailed ? '#fee2e2' : 'white',
                              color: isFailed ? '#991b1b' : '#374151',
                              fontWeight: '600',
                              fontSize: '14px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '6px',
                            }}
                          >
                            <svg style={{ width: '18px', height: '18px' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                            NO
                          </button>
                          {answer && (
                            <>
                              <button
                                onClick={() => handleAddComment(currentSection.id, item.id)}
                                style={{
                                  padding: '12px',
                                  borderRadius: '8px',
                                  border: '1px solid #e2e8f0',
                                  background: answer.comment ? '#fef3c7' : 'white',
                                  color: '#374151',
                                  cursor: 'pointer',
                                }}
                                title="Add comment"
                              >
                                <svg style={{ width: '18px', height: '18px' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                                </svg>
                              </button>
                              <button
                                onClick={() => handleAddPhoto(currentSection.id, item.id)}
                                style={{
                                  padding: '12px',
                                  borderRadius: '8px',
                                  border: '1px solid #e2e8f0',
                                  background: answer.photo_url ? '#dcfce7' : 'white',
                                  color: '#374151',
                                  cursor: 'pointer',
                                }}
                                title="Upload photo"
                              >
                                <svg style={{ width: '18px', height: '18px' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                                </svg>
                              </button>
                              <button
                                onClick={() => handleRaiseConcern(item.id, item.label || item.question || '')}
                                style={{
                                  padding: '12px',
                                  borderRadius: '8px',
                                  border: '1px solid #fca5a5',
                                  background: '#fef2f2',
                                  color: '#dc2626',
                                  cursor: 'pointer',
                                }}
                                title="Raise concern"
                              >
                                <svg style={{ width: '18px', height: '18px' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                </svg>
                              </button>
                            </>
                          )}
                        </div>
                      )}

                      {item.type === "numeric" && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '8px', minWidth: '200px' }}>
                            <input
                              type="number"
                              placeholder={minVal !== undefined && maxVal !== undefined 
                                ? `${minVal} - ${maxVal}` 
                                : "Enter value"}
                              value={getInputValue(item.id)}
                              onChange={(e) => handleInputChangeWithAutosave(currentSection.id, item.id, "numeric", e.target.value)}
                              onBlur={(e) => commitInputDraft(currentSection.id, item.id, "numeric", e.currentTarget.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  commitInputDraft(currentSection.id, item.id, "numeric", e.currentTarget.value);
                                  (e.target as HTMLInputElement).blur();
                                }
                              }}
                              style={{
                                flex: 1,
                                padding: '12px',
                                borderRadius: '8px',
                                border: answer ? '2px solid #22c55e' : '1px solid #e2e8f0',
                                fontSize: '16px',
                                fontWeight: '500',
                              }}
                            />
                            {item.unit && (
                              <span style={{ fontSize: '14px', color: '#6b7280', fontWeight: '500' }}>{item.unit}</span>
                            )}
                          </div>
                          {minVal !== undefined && maxVal !== undefined && (
                            <span style={{ fontSize: '12px', color: '#6b7280', whiteSpace: 'nowrap' }}>
                              Range: {minVal} - {maxVal}
                            </span>
                          )}
                          {answer && (
                            <>
                              <button
                                onClick={() => handleAddComment(currentSection.id, item.id)}
                                style={{
                                  padding: '12px',
                                  borderRadius: '8px',
                                  border: '1px solid #e2e8f0',
                                  background: answer.comment ? '#fef3c7' : 'white',
                                  color: '#374151',
                                  cursor: 'pointer',
                                }}
                                title="Add comment"
                              >
                                <svg style={{ width: '18px', height: '18px' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                                </svg>
                              </button>
                              <button
                                onClick={() => handleAddPhoto(currentSection.id, item.id)}
                                style={{
                                  padding: '12px',
                                  borderRadius: '8px',
                                  border: '1px solid #e2e8f0',
                                  background: answer.photo_url ? '#dcfce7' : 'white',
                                  color: '#374151',
                                  cursor: 'pointer',
                                }}
                                title="Upload photo"
                              >
                                <svg style={{ width: '18px', height: '18px' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                                </svg>
                              </button>
                              <button
                                onClick={() => handleRaiseConcern(item.id, item.label || item.question || '')}
                                style={{
                                  padding: '12px',
                                  borderRadius: '8px',
                                  border: '1px solid #fca5a5',
                                  background: '#fef2f2',
                                  color: '#dc2626',
                                  cursor: 'pointer',
                                }}
                                title="Raise concern"
                              >
                                <svg style={{ width: '18px', height: '18px' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                </svg>
                              </button>
                            </>
                          )}
                        </div>
                      )}

                      {item.type === "text" && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          <input
                            type="text"
                            placeholder="Enter response..."
                            value={getInputValue(item.id)}
                              onChange={(e) => handleInputChangeWithAutosave(currentSection.id, item.id, "text", e.target.value)}
                              onBlur={(e) => commitInputDraft(currentSection.id, item.id, "text", e.currentTarget.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                commitInputDraft(currentSection.id, item.id, "text", e.currentTarget.value);
                                (e.target as HTMLInputElement).blur();
                              }
                            }}
                            style={{
                              flex: 1,
                              minWidth: '200px',
                              padding: '12px',
                              borderRadius: '8px',
                              border: answer ? '2px solid #22c55e' : '1px solid #e2e8f0',
                              fontSize: '14px',
                            }}
                          />
                          {answer && (
                            <>
                              <button
                                onClick={() => handleAddComment(currentSection.id, item.id)}
                                style={{
                                  padding: '12px',
                                  borderRadius: '8px',
                                  border: '1px solid #e2e8f0',
                                  background: answer.comment ? '#fef3c7' : 'white',
                                  color: '#374151',
                                  cursor: 'pointer',
                                }}
                                title="Add comment"
                              >
                                <svg style={{ width: '18px', height: '18px' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                                </svg>
                              </button>
                              <button
                                onClick={() => handleAddPhoto(currentSection.id, item.id)}
                                style={{
                                  padding: '12px',
                                  borderRadius: '8px',
                                  border: '1px solid #e2e8f0',
                                  background: answer.photo_url ? '#dcfce7' : 'white',
                                  color: '#374151',
                                  cursor: 'pointer',
                                }}
                                title="Upload photo"
                              >
                                <svg style={{ width: '18px', height: '18px' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                                </svg>
                              </button>
                              <button
                                onClick={() => handleRaiseConcern(item.id, item.label || item.question || '')}
                                style={{
                                  padding: '12px',
                                  borderRadius: '8px',
                                  border: '1px solid #fca5a5',
                                  background: '#fef2f2',
                                  color: '#dc2626',
                                  cursor: 'pointer',
                                }}
                                title="Raise concern"
                              >
                                <svg style={{ width: '18px', height: '18px' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                </svg>
                              </button>
                            </>
                          )}
                        </div>
                      )}

                      {/* Show uploaded photo */}
                      {answer?.photo_url && (
                        <div style={{ marginTop: '12px', padding: '12px', background: '#f0fdf4', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <svg style={{ width: '16px', height: '16px', color: '#22c55e' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                              </svg>
                              <span style={{ fontSize: '13px', fontWeight: '600', color: '#166534' }}>
                                Your Photo
                              </span>
                            </div>
                            <button
                              onClick={() => handleAddPhoto(currentSection.id, item.id)}
                              style={{
                                padding: '6px 12px',
                                background: 'white',
                                border: '1px solid #bbf7d0',
                                borderRadius: '6px',
                                color: '#166534',
                                fontSize: '12px',
                                fontWeight: '600',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                              }}
                            >
                              <svg style={{ width: '14px', height: '14px' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                              </svg>
                              Change
                            </button>
                          </div>
                          <img
                            src={answer.photo_url}
                            alt="Uploaded"
                            style={{
                              width: '100%',
                              maxWidth: '300px',
                              height: 'auto',
                              borderRadius: '6px',
                              border: '1px solid #bbf7d0',
                              cursor: 'pointer',
                            }}
                            onClick={() => window.open(answer.photo_url!, '_blank')}
                          />
                        </div>
                      )}

                      {/* Warning for missing required photo */}
                      {item.photoRequired && !answer?.photo_url && (
                        <div style={{ marginTop: '12px', padding: '12px', background: '#fef2f2', borderRadius: '8px', border: '1px solid #fecaca' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <svg style={{ width: '16px', height: '16px', color: '#dc2626' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                            <span style={{ fontSize: '13px', fontWeight: '500', color: '#dc2626' }}>
                              Photo required - Please upload a photo to continue
                            </span>
                          </div>
                        </div>
                      )}

                      {/* Show existing comment */}
                      {answer?.comment && commentingItemId !== item.id && (
                        <div style={{ marginTop: '8px', padding: '8px 12px', background: '#fffbeb', borderRadius: '6px', border: '1px solid #fef3c7' }}>
                          <p style={{ fontSize: '13px', color: '#92400e', margin: 0 }}>
                            <strong>Note:</strong> {answer.comment}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Comment Modal */}
      {commentingItemId && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 50,
          padding: '20px',
        }}>
          <div style={{ ...cardStyle, width: '100%', maxWidth: '400px', padding: '24px' }}>
            <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#111827', marginBottom: '16px' }}>Add Comment</h3>
            <textarea
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder="Enter your comment or observation..."
              style={{
                width: '100%',
                padding: '12px',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                fontSize: '14px',
                minHeight: '120px',
                resize: 'vertical',
              }}
            />
            <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
              <button
                onClick={() => { setCommentingItemId(null); setCommentText(""); }}
                style={{
                  flex: 1,
                  padding: '12px',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  background: 'white',
                  color: '#374151',
                  fontWeight: '500',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSaveComment}
                style={{
                  flex: 1,
                  padding: '12px',
                  border: 'none',
                  borderRadius: '8px',
                  background: BRAND_BLUE,
                  color: 'white',
                  fontWeight: '500',
                  cursor: 'pointer',
                }}
              >
                Save Comment
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Photo Capture Modal */}
      {uploadingItemId && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.85)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 50,
          padding: '16px',
        }}>
          <div style={{ 
            width: '100%', 
            maxWidth: '500px', 
            background: 'white',
            borderRadius: '20px',
            overflow: 'hidden',
          }}>
            {/* Modal Header */}
            <div style={{ 
              padding: '16px 20px', 
              borderBottom: '1px solid #e2e8f0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}>
              <div>
                <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#111827', margin: 0 }}>
                  📷 Capture Photo
                </h3>
                <p style={{ fontSize: '13px', color: '#6b7280', margin: '4px 0 0 0' }}>
                  Take a photo showing the current state
                </p>
              </div>
              <button
                onClick={() => { setUploadingItemId(null); setUploadingSectionId(null); }}
                style={{
                  width: '36px',
                  height: '36px',
                  border: 'none',
                  background: '#f1f5f9',
                  borderRadius: '50%',
                  color: '#64748b',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <svg style={{ width: '20px', height: '20px' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            {/* Camera Component */}
            <div style={{ padding: '20px' }}>
              <CameraCapture
                onCapture={(url) => {
                  handlePhotoUpload(uploadingItemId, url);
                  if (url) {
                    setUploadingItemId(null);
                    setUploadingSectionId(null);
                  }
                }}
                currentImageUrl={answers.get(uploadingItemId)?.photo_url}
                bucket="checklist-images"
                path={`runs/${run?.id}`}
              />
            </div>
          </div>
        </div>
      )}

      {/* Raise Concern Modal */}
      {concernItemId && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 50,
          padding: '20px',
        }}>
          <div style={{ ...cardStyle, width: '100%', maxWidth: '480px', padding: '24px', maxHeight: '90vh', overflowY: 'auto' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
              <div style={{
                width: '44px',
                height: '44px',
                borderRadius: '12px',
                background: '#fef2f2',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <svg style={{ width: '24px', height: '24px', color: '#dc2626' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div>
                <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#111827', margin: 0 }}>Raise a Concern</h3>
                <p style={{ fontSize: '13px', color: '#6b7280', margin: '4px 0 0 0' }}>
                  Re: {concernItemLabel}
                </p>
              </div>
            </div>

            {/* Severity Selection */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#374151', marginBottom: '8px' }}>
                Severity Level
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
                {[
                  { value: 'low', label: 'Low', color: '#22c55e', bg: '#dcfce7' },
                  { value: 'medium', label: 'Medium', color: '#f59e0b', bg: '#fef3c7' },
                  { value: 'high', label: 'High', color: '#f97316', bg: '#ffedd5' },
                  { value: 'critical', label: 'Critical', color: '#dc2626', bg: '#fef2f2' },
                ].map((option) => (
                  <button
                    key={option.value}
                    onClick={() => setConcernSeverity(option.value as typeof concernSeverity)}
                    style={{
                      padding: '10px 8px',
                      borderRadius: '8px',
                      border: concernSeverity === option.value ? `2px solid ${option.color}` : '1px solid #e2e8f0',
                      background: concernSeverity === option.value ? option.bg : 'white',
                      color: concernSeverity === option.value ? option.color : '#6b7280',
                      fontWeight: '600',
                      fontSize: '12px',
                      cursor: 'pointer',
                    }}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Description */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#374151', marginBottom: '8px' }}>
                What&apos;s the issue? *
              </label>
              <textarea
                value={concernDescription}
                onChange={(e) => setConcernDescription(e.target.value)}
                placeholder="Describe what you've observed..."
                style={{
                  width: '100%',
                  padding: '12px',
                  border: '2px solid #e2e8f0',
                  borderRadius: '8px',
                  fontSize: '14px',
                  minHeight: '100px',
                  resize: 'vertical',
                }}
              />
            </div>

            {/* Photo (Optional) */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#374151', marginBottom: '8px' }}>
                Add Photo (Optional)
              </label>
              {!showConcernCamera && !concernPhotoUrl && (
                <button
                  onClick={() => setShowConcernCamera(true)}
                  style={{
                    width: '100%',
                    padding: '16px',
                    borderRadius: '8px',
                    border: '2px dashed #e2e8f0',
                    background: '#f8fafc',
                    color: '#64748b',
                    fontWeight: '500',
                    fontSize: '14px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                  }}
                >
                  <svg style={{ width: '20px', height: '20px' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  Take Photo
                </button>
              )}
              {showConcernCamera && (
                <div style={{ borderRadius: '8px', overflow: 'hidden' }}>
                  <CameraCapture
                    onCapture={handleConcernPhotoCapture}
                    bucket="checklist-images"
                    path={`concerns/${machine?.id}`}
                  />
                </div>
              )}
              {concernPhotoUrl && !showConcernCamera && (
                <div style={{ position: 'relative' }}>
                  <img
                    src={concernPhotoUrl}
                    alt="Concern"
                    style={{ width: '100%', maxHeight: '200px', objectFit: 'cover', borderRadius: '8px' }}
                  />
                  <button
                    onClick={() => { setConcernPhotoUrl(null); }}
                    style={{
                      position: 'absolute',
                      top: '8px',
                      right: '8px',
                      width: '32px',
                      height: '32px',
                      borderRadius: '50%',
                      background: 'rgba(0,0,0,0.6)',
                      border: 'none',
                      color: 'white',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <svg style={{ width: '16px', height: '16px' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              )}
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={() => {
                  setConcernItemId(null);
                  setConcernItemLabel('');
                  setConcernDescription('');
                  setConcernPhotoUrl(null);
                  setShowConcernCamera(false);
                }}
                style={{
                  flex: 1,
                  padding: '14px',
                  border: '1px solid #e2e8f0',
                  borderRadius: '10px',
                  background: 'white',
                  color: '#374151',
                  fontWeight: '600',
                  fontSize: '14px',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitConcern}
                disabled={!concernDescription.trim() || isSubmittingConcern}
                style={{
                  flex: 1,
                  padding: '14px',
                  border: 'none',
                  borderRadius: '10px',
                  background: concernDescription.trim() ? '#dc2626' : '#fca5a5',
                  color: 'white',
                  fontWeight: '600',
                  fontSize: '14px',
                  cursor: concernDescription.trim() ? 'pointer' : 'not-allowed',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                }}
              >
                {isSubmittingConcern ? 'Submitting...' : (
                  <>
                    <svg style={{ width: '18px', height: '18px' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    Submit Concern
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Remaining Items Warning */}
      {!allItemsAnswered && (
        <div style={{ ...cardStyle, padding: '16px', marginBottom: '16px', background: '#fffbeb', borderColor: '#fef3c7' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <svg style={{ width: '20px', height: '20px', color: '#d97706' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span style={{ fontWeight: '600', color: '#92400e' }}>
              {totalItems - answeredCount > 0 && `${totalItems - answeredCount} item${totalItems - answeredCount !== 1 ? 's' : ''} remaining`}
              {totalItems - answeredCount > 0 && missingPhotos > 0 && ' • '}
              {missingPhotos > 0 && `${missingPhotos} photo${missingPhotos !== 1 ? 's' : ''} required`}
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {sections.map((section) => {
              const unansweredItems = section.items.filter(item => !answers.has(item.id));
              const missingPhotoItems = section.items.filter(item => item.photoRequired && (!answers.get(item.id) || !answers.get(item.id)?.photo_url));
              if (unansweredItems.length === 0 && missingPhotoItems.length === 0) return null;
              return (
                <div key={section.id}>
                  <button
                    onClick={() => setCurrentSectionIndex(sections.indexOf(section))}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '8px 12px',
                      background: 'white',
                      border: '1px solid #e2e8f0',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      width: '100%',
                      textAlign: 'left',
                    }}
                  >
                    <span style={{ fontSize: '14px', fontWeight: '500', color: '#374151' }}>
                      {section.title}
                    </span>
                    <span style={{ fontSize: '12px', color: '#6b7280' }}>
                      {unansweredItems.length > 0 && `(${unansweredItems.length} unanswered`}
                      {unansweredItems.length > 0 && missingPhotoItems.length > 0 && ', '}
                      {missingPhotoItems.length > 0 && `${missingPhotoItems.length} photo${missingPhotoItems.length !== 1 ? 's' : ''}`}
                      {(unansweredItems.length > 0 || missingPhotoItems.length > 0) && ')'}
                    </span>
                    <svg style={{ width: '16px', height: '16px', color: '#9ca3af', marginLeft: 'auto' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Navigation and Complete */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '24px' }}>
        <button
          onClick={() => setCurrentSectionIndex(Math.max(0, currentSectionIndex - 1))}
          disabled={currentSectionIndex === 0}
          style={{
            padding: '12px 20px',
            border: '1px solid #e2e8f0',
            borderRadius: '8px',
            background: 'white',
            color: currentSectionIndex === 0 ? '#94a3b8' : '#374151',
            fontWeight: '500',
            cursor: currentSectionIndex === 0 ? 'not-allowed' : 'pointer',
          }}
        >
          ← Previous
        </button>

        {currentSectionIndex < sections.length - 1 ? (
          <button
            onClick={() => setCurrentSectionIndex(currentSectionIndex + 1)}
            style={{
              flex: 1,
              padding: '12px 20px',
              border: 'none',
              borderRadius: '8px',
              background: BRAND_BLUE,
              color: 'white',
              fontWeight: '500',
              cursor: 'pointer',
            }}
          >
            Next Section →
          </button>
        ) : (
          <button
            onClick={handleComplete}
            disabled={!allItemsAnswered || isCompleting}
            style={{
              flex: 1,
              padding: '12px 20px',
              border: 'none',
              borderRadius: '8px',
              background: allItemsAnswered ? '#22c55e' : '#94a3b8',
              color: 'white',
              fontWeight: '600',
              cursor: allItemsAnswered ? 'pointer' : 'not-allowed',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
            }}
          >
            {isCompleting ? 'Completing...' : (
              <>
                <svg style={{ width: '20px', height: '20px' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Complete Checklist
              </>
            )}
          </button>
        )}
      </div>

      {/* Abort Option */}
      <div style={{ textAlign: 'center' }}>
        <button
          onClick={handleAbort}
          style={{
            padding: '8px 16px',
            border: 'none',
            background: 'transparent',
            color: '#dc2626',
            fontSize: '14px',
            cursor: 'pointer',
          }}
        >
          Abort Checklist
        </button>
      </div>
    </div>
  );
}
