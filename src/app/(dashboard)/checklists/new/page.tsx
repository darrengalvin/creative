"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import Link from "next/link";
import type { ChecklistFrequency } from "@/types/database";

interface Machine {
  id: string;
  name: string;
  manufacturer: string | null;
  model: string | null;
}

interface ChecklistTemplate {
  id: string;
  name: string;
  type: string;
  machine_id: string | null;
  frequency: ChecklistFrequency | null;
}

const BRAND_BLUE = '#0057A8';

// Calculate due date based on frequency
function calculateDueDate(frequency: ChecklistFrequency | null, startDate: Date = new Date()): Date | null {
  if (!frequency || frequency === 'once') return null;
  
  const due = new Date(startDate);
  
  switch (frequency) {
    case 'daily':
      due.setDate(due.getDate() + 1);
      break;
    case 'weekly':
      due.setDate(due.getDate() + 7);
      break;
    case 'monthly':
      due.setMonth(due.getMonth() + 1);
      break;
    case 'quarterly':
      due.setMonth(due.getMonth() + 3);
      break;
    case 'annually':
      due.setFullYear(due.getFullYear() + 1);
      break;
    default:
      return null;
  }
  
  return due;
}

// Checklist type icons and colors
const checklistTypeConfig: Record<string, { icon: string; color: string; bg: string; label: string }> = {
  pre_run: { icon: "▶️", color: "#16a34a", bg: "#dcfce7", label: "Pre-Run Check" },
  first_off: { icon: "🎯", color: "#2563eb", bg: "#dbeafe", label: "First-Off Inspection" },
  shutdown: { icon: "⏹️", color: "#dc2626", bg: "#fee2e2", label: "Shutdown Check" },
  maintenance: { icon: "🔧", color: "#d97706", bg: "#fef3c7", label: "Maintenance" },
  safety: { icon: "🛡️", color: "#7c3aed", bg: "#ede9fe", label: "Safety Inspection" },
  quality: { icon: "✅", color: "#0891b2", bg: "#cffafe", label: "Quality Check" },
};

function NewChecklistContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();

  const preselectedMachineId = searchParams.get("machineId");

  const [machines, setMachines] = useState<Machine[]>([]);
  const [templates, setTemplates] = useState<ChecklistTemplate[]>([]);
  const [selectedMachineId, setSelectedMachineId] = useState(preselectedMachineId || "");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState<string | null>(null); // track which template is being submitted
  const [error, setError] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    fetchData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchData = async () => {
    setIsLoading(true);
    setLoadFailed(false);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      const res = await fetch("/api/checklist-start", {
        credentials: "include",
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!res.ok) throw new Error(`Request failed with status ${res.status}`);

      const { machines: machineData, templates: templateData } = await res.json();
      setMachines(machineData || []);
      setTemplates(templateData || []);
    } catch (err) {
      console.error("Error loading checklist data:", err);
      setLoadFailed(true);
    } finally {
      setIsLoading(false);
    }
  };

  // Filter templates based on selected machine (generic + machine-specific)
  const availableTemplates = selectedMachineId
    ? templates.filter(t => !t.machine_id || t.machine_id === selectedMachineId)
    : templates;

  const selectedMachine = machines.find(m => m.id === selectedMachineId);

  // Generate job number based on machine, date, and sequence
  const generateJobNumber = (machineName: string) => {
    const today = new Date();
    const dateStr = today.toISOString().split('T')[0].replace(/-/g, '');
    const machineCode = machineName.replace(/[^a-zA-Z0-9]/g, '').substring(0, 6).toUpperCase();
    const timeSeq = today.getHours().toString().padStart(2, '0') + today.getMinutes().toString().padStart(2, '0');
    return `${machineCode}-${dateStr}-${timeSeq}`;
  };

  const handleStartChecklist = async (template: ChecklistTemplate) => {
    if (!selectedMachineId || !user || isSubmitting) return;

    setIsSubmitting(template.id);
    setError(null);

    try {
      const now = new Date();
      const calculatedDueDate = calculateDueDate(template.frequency, now);
      const jobNumber = selectedMachine ? generateJobNumber(selectedMachine.name) : null;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      const res = await fetch("/api/checklist-start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        signal: controller.signal,
        body: JSON.stringify({
          templateId: template.id,
          machineId: selectedMachineId,
          dueDate: calculatedDueDate ? calculatedDueDate.toISOString() : null,
          jobNumber,
        }),
      });
      clearTimeout(timeoutId);

      if (!res.ok) {
        let message = "Failed to start checklist";
        try {
          const errJson = await res.json();
          if (errJson?.error) message = errJson.error;
        } catch {
          // keep default
        }
        throw new Error(message);
      }

      const { runId } = await res.json();
      router.push(`/checklists/${runId}/run`);
    } catch (err) {
      console.error("Error creating checklist run:", err);
      setError(err instanceof Error ? err.message : "Failed to start checklist");
      setIsSubmitting(null);
    }
  };

  if (isLoading) {
    return (
      <div style={{ maxWidth: '700px', margin: '0 auto' }}>
        <div style={{ 
          height: '32px', 
          background: 'linear-gradient(90deg, #f3f4f6 0%, #e5e7eb 50%, #f3f4f6 100%)',
          backgroundSize: '200% 100%',
          animation: 'shimmer 1.5s ease-in-out infinite',
          borderRadius: '8px', 
          width: '200px', 
          marginBottom: '32px',
        }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {[1, 2, 3].map(i => (
            <div key={i} style={{ 
              background: 'white', 
              borderRadius: '16px', 
              border: '2px solid #e2e8f0',
              padding: '24px',
              height: '100px',
            }} />
          ))}
        </div>
      </div>
    );
  }

  // If the initial load failed (or timed out), show a clear error with a retry button
  // instead of leaving the user stuck on a blank loading screen.
  if (loadFailed) {
    return (
      <div style={{ maxWidth: '700px', margin: '0 auto' }}>
        <div style={{
          padding: '48px 24px',
          background: 'white',
          borderRadius: '16px',
          border: '2px solid #fecaca',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>⚠️</div>
          <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#374151', marginBottom: '8px' }}>
            Couldn&apos;t load checklists
          </h3>
          <p style={{ color: '#6b7280', fontSize: '14px', marginBottom: '24px' }}>
            Something went wrong loading this page. Check your connection and try again.
          </p>
          <button
            onClick={fetchData}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '12px 24px',
              background: BRAND_BLUE,
              color: 'white',
              border: 'none',
              borderRadius: '10px',
              fontSize: '15px',
              fontWeight: '600',
              cursor: 'pointer',
            }}
          >
            <svg style={{ width: '18px', height: '18px' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Try Again
          </button>
        </div>
      </div>
    );
  }

  // If no machine selected, show machine selection
  if (!selectedMachineId) {
    return (
      <div style={{ maxWidth: '700px', margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <h1 style={{ 
            fontFamily: 'var(--font-display, "DM Sans", sans-serif)',
            fontSize: '28px', 
            fontWeight: 'bold', 
            color: '#111827', 
            margin: 0,
          }}>
            Select a Machine
          </h1>
          <p style={{ fontSize: '15px', color: '#6b7280', marginTop: '8px' }}>
            Choose which machine you're working on
          </p>
        </div>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {machines.map((machine, index) => (
            <button
              key={machine.id}
              onClick={() => setSelectedMachineId(machine.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '16px',
                padding: '20px',
                background: 'white',
                border: '2px solid #e2e8f0',
                borderRadius: '14px',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.2s',
                animation: `fadeInUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) ${index * 30}ms backwards`,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = BRAND_BLUE;
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 8px 24px rgba(0, 87, 168, 0.12)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = '#e2e8f0';
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              <div style={{
                width: '48px',
                height: '48px',
                background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
                borderRadius: '12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '24px',
              }}>
                🔧
              </div>
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#111827', margin: 0 }}>
                  {machine.name}
                </h3>
                {machine.manufacturer && (
                  <p style={{ fontSize: '13px', color: '#6b7280', margin: '4px 0 0 0' }}>
                    {machine.manufacturer} {machine.model}
                  </p>
                )}
              </div>
              <svg style={{ width: '20px', height: '20px', color: '#9ca3af', marginLeft: 'auto' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          ))}
        </div>
        
        <div style={{ marginTop: '24px', textAlign: 'center' }}>
          <Link
            href="/work-centres"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              color: '#6b7280',
              fontSize: '14px',
              textDecoration: 'none',
            }}
          >
            <svg style={{ width: '16px', height: '16px' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Back to Work Centres
          </Link>
        </div>
      </div>
    );
  }

  // Machine is selected - show checklist options
  return (
    <div style={{ maxWidth: '700px', margin: '0 auto' }}>
      {/* Machine Header */}
      <div style={{ marginBottom: '32px', animation: 'fadeInUp 0.4s cubic-bezier(0.16, 1, 0.3, 1)' }}>
        <Link
          href="/work-centres"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 16px',
            background: 'white',
            border: '2px solid #e2e8f0',
            borderRadius: '10px',
            color: '#64748b',
            fontSize: '14px',
            fontWeight: '500',
            textDecoration: 'none',
            marginBottom: '20px',
            transition: 'border-color 0.15s, color 0.15s',
          }}
        >
          <svg style={{ width: '18px', height: '18px' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Change Machine
        </Link>

        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: '16px',
          padding: '24px',
          background: 'white',
          borderRadius: '16px',
          border: '2px solid #e2e8f0',
        }}>
          <div style={{
            width: '64px',
            height: '64px',
            background: `linear-gradient(135deg, ${BRAND_BLUE} 0%, #003d75 100%)`,
            borderRadius: '16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '28px',
            boxShadow: '0 4px 12px rgba(0, 87, 168, 0.25)',
          }}>
            🔧
          </div>
          <div>
            <p style={{ fontSize: '12px', color: '#6b7280', margin: 0, fontWeight: 500 }}>
              You're working on
            </p>
            <h2 style={{ 
              fontFamily: 'var(--font-display, "DM Sans", sans-serif)',
              fontSize: '22px', 
              fontWeight: 'bold', 
              color: '#111827', 
              margin: '4px 0 0 0',
            }}>
              {selectedMachine?.name}
            </h2>
            {selectedMachine?.manufacturer && (
              <p style={{ fontSize: '14px', color: '#6b7280', margin: '4px 0 0 0' }}>
                {selectedMachine.manufacturer} {selectedMachine.model}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* What do you need to do? */}
      <div style={{ marginBottom: '20px' }}>
        <h3 style={{ 
          fontFamily: 'var(--font-display, "DM Sans", sans-serif)',
          fontSize: '20px', 
          fontWeight: '600', 
          color: '#111827', 
          margin: 0,
        }}>
          What do you need to do?
        </h3>
        <p style={{ fontSize: '14px', color: '#6b7280', margin: '4px 0 0 0' }}>
          Tap a checklist to start
        </p>
      </div>

      {/* Error Message */}
      {error && (
        <div style={{ 
          padding: '14px', 
          background: '#fef2f2', 
          borderRadius: '12px', 
          border: '1px solid #fecaca', 
          marginBottom: '16px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          animation: 'shake 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
        }}>
          <svg style={{ width: '20px', height: '20px', color: '#dc2626', flexShrink: 0 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p style={{ color: '#991b1b', margin: 0, fontSize: '14px' }}>{error}</p>
        </div>
      )}

      {/* Checklist Options */}
      {availableTemplates.length === 0 ? (
        <div style={{ 
          padding: '48px 24px', 
          background: 'white', 
          borderRadius: '16px', 
          border: '2px dashed #e2e8f0',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>📋</div>
          <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#374151', marginBottom: '8px' }}>
            No checklists available
          </h3>
          <p style={{ color: '#6b7280', fontSize: '14px' }}>
            Ask your supervisor to create checklist templates for this machine
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {availableTemplates.map((template, index) => {
            const typeConfig = checklistTypeConfig[template.type] || { 
              icon: "📋", 
              color: "#374151", 
              bg: "#f3f4f6", 
              label: template.type.replace('_', ' ') 
            };
            const isStarting = isSubmitting === template.id;

            return (
              <button
                key={template.id}
                onClick={() => handleStartChecklist(template)}
                disabled={!!isSubmitting}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '16px',
                  padding: '20px',
                  background: 'white',
                  border: '2px solid #e2e8f0',
                  borderRadius: '16px',
                  cursor: isSubmitting ? 'not-allowed' : 'pointer',
                  textAlign: 'left',
                  width: '100%',
                  transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
                  opacity: isSubmitting && !isStarting ? 0.5 : 1,
                  animation: `fadeInUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) ${index * 50}ms backwards`,
                }}
                onMouseEnter={(e) => {
                  if (!isSubmitting) {
                    e.currentTarget.style.borderColor = typeConfig.color;
                    e.currentTarget.style.transform = 'translateY(-3px)';
                    e.currentTarget.style.boxShadow = `0 12px 32px ${typeConfig.color}20`;
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = '#e2e8f0';
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                {/* Icon */}
                <div style={{
                  width: '56px',
                  height: '56px',
                  background: typeConfig.bg,
                  borderRadius: '14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '28px',
                  flexShrink: 0,
                }}>
                  {isStarting ? (
                    <svg style={{ width: '28px', height: '28px', color: typeConfig.color, animation: 'spin 1s linear infinite' }} fill="none" viewBox="0 0 24 24">
                      <circle style={{ opacity: 0.25 }} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path style={{ opacity: 0.75 }} fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  ) : (
                    typeConfig.icon
                  )}
                </div>

                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h3 style={{ 
                    fontFamily: 'var(--font-display, "DM Sans", sans-serif)',
                    fontSize: '17px', 
                    fontWeight: '600', 
                    color: '#111827', 
                    margin: 0,
                  }}>
                    {template.name}
                  </h3>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px', flexWrap: 'wrap' }}>
                    <span style={{
                      fontSize: '12px',
                      fontWeight: '600',
                      padding: '3px 10px',
                      borderRadius: '9999px',
                      background: typeConfig.bg,
                      color: typeConfig.color,
                    }}>
                      {typeConfig.label}
                    </span>
                    {template.frequency && template.frequency !== 'once' && (
                      <span style={{
                        fontSize: '12px',
                        fontWeight: '500',
                        color: '#6b7280',
                      }}>
                        • {template.frequency}
                      </span>
                    )}
                  </div>
                </div>

                {/* Arrow */}
                <div style={{
                  width: '44px',
                  height: '44px',
                  background: isStarting ? typeConfig.bg : `linear-gradient(135deg, ${BRAND_BLUE} 0%, #003d75 100%)`,
                  borderRadius: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  boxShadow: isStarting ? 'none' : '0 4px 12px rgba(0, 87, 168, 0.25)',
                }}>
                  <svg style={{ width: '20px', height: '20px', color: isStarting ? typeConfig.color : 'white' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Operator info footer */}
      <div style={{ 
        marginTop: '32px', 
        padding: '16px 20px',
        background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
        borderRadius: '12px',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
      }}>
        <div style={{
          width: '40px',
          height: '40px',
          background: `linear-gradient(135deg, ${BRAND_BLUE} 0%, #003d75 100%)`,
          borderRadius: '10px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'white',
          fontWeight: '700',
          fontSize: '16px',
        }}>
          {user?.name?.charAt(0).toUpperCase() || 'U'}
        </div>
        <div>
          <p style={{ fontSize: '13px', color: '#6b7280', margin: 0 }}>Logged in as</p>
          <p style={{ fontSize: '15px', fontWeight: '600', color: '#111827', margin: '2px 0 0 0' }}>
            {user?.name || 'Unknown'}
          </p>
        </div>
      </div>
    </div>
  );
}

export default function NewChecklistPage() {
  return (
    <Suspense fallback={
      <div style={{ maxWidth: '700px', margin: '0 auto' }}>
        <div style={{ 
          height: '32px', 
          background: 'linear-gradient(90deg, #f3f4f6 0%, #e5e7eb 50%, #f3f4f6 100%)',
          backgroundSize: '200% 100%',
          animation: 'shimmer 1.5s ease-in-out infinite',
          borderRadius: '8px', 
          width: '200px', 
          marginBottom: '24px',
        }} />
      </div>
    }>
      <NewChecklistContent />
    </Suspense>
  );
}
