"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { formatDate } from "@/lib/utils";
import { EmptyState } from "@/components/ui/empty-state";
import { ClipboardCheck, Clock, CheckCircle2, Search, Filter, ChevronRight, Calendar, User, Wrench } from "lucide-react";

interface ChecklistRun {
  id: string;
  status: "in_progress" | "completed" | "abandoned";
  started_at: string;
  completed_at: string | null;
  checklist_templates: { name: string } | null;
  machines: { name: string } | null;
  users: { name: string } | null;
}

const BRAND_BLUE = '#0057A8';

const statusConfig: Record<string, { bg: string; color: string; label: string; icon: typeof ClipboardCheck }> = {
  in_progress: { bg: '#dbeafe', color: '#1e40af', label: 'In Progress', icon: Clock },
  completed: { bg: '#dcfce7', color: '#166534', label: 'Completed', icon: CheckCircle2 },
  abandoned: { bg: '#f3f4f6', color: '#6b7280', label: 'Abandoned', icon: ClipboardCheck },
};

export default function ChecklistHistoryPage() {
  const [runs, setRuns] = useState<ChecklistRun[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "in_progress" | "completed">("all");

  // Fetch via a server route instead of the browser Supabase client. The
  // browser client depended on the auth session being ready (up to an 8s
  // ceiling) and could stall on session locks, which made this page appear to
  // hang until a manual refresh. The server route resolves the user from the
  // session cookie and is reliably fast.
  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000);
      const res = await fetch("/api/my-checklists", {
        credentials: "include",
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!res.ok) {
        console.error("[Checklists] Error fetching runs:", res.status);
        setRuns([]);
        return;
      }

      const { runs: runData } = await res.json();
      setRuns(runData || []);
    } catch (err) {
      console.error("[Checklists] Error fetching runs:", err);
      setRuns([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Filter runs
  const filteredRuns = runs.filter((r) => {
    const matchesSearch = 
      r.checklist_templates?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.machines?.name?.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesStatus = statusFilter === "all" || r.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  // Group by date
  const groupedRuns: Record<string, ChecklistRun[]> = {};
  filteredRuns.forEach(run => {
    const date = new Date(run.started_at);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    let groupKey: string;
    if (date.toDateString() === today.toDateString()) {
      groupKey = "Today";
    } else if (date.toDateString() === yesterday.toDateString()) {
      groupKey = "Yesterday";
    } else {
      groupKey = date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
    }
    
    if (!groupedRuns[groupKey]) {
      groupedRuns[groupKey] = [];
    }
    groupedRuns[groupKey].push(run);
  });

  // Stats
  const completedToday = runs.filter((r) => {
    const today = new Date();
    const runDate = new Date(r.started_at);
    return r.status === "completed" && runDate.toDateString() === today.toDateString();
  }).length;

  const inProgressCount = runs.filter((r) => r.status === "in_progress").length;
  const totalCompleted = runs.filter((r) => r.status === "completed").length;

  const getTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    
    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return formatDate(dateString);
  };

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '28px' }}>
        <h1 style={{ 
          fontFamily: 'var(--font-display, "DM Sans", sans-serif)',
          fontSize: '28px', 
          fontWeight: 'bold', 
          color: '#111827', 
          margin: 0,
          letterSpacing: '-0.02em',
        }}>
          My Checklists
        </h1>
        <p style={{ color: '#6b7280', marginTop: '6px', fontSize: '15px' }}>
          Your checklist history and in-progress items
        </p>
      </div>

      {/* Quick Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '24px' }}>
        {[
          { icon: Clock, label: 'In Progress', value: inProgressCount, color: '#d97706', bg: '#fef3c7' },
          { icon: CheckCircle2, label: 'Today', value: completedToday, color: '#16a34a', bg: '#dcfce7' },
          { icon: ClipboardCheck, label: 'Total Done', value: totalCompleted, color: BRAND_BLUE, bg: '#dbeafe' },
        ].map((stat, index) => (
          <div 
            key={stat.label}
            style={{ 
              background: 'white',
              borderRadius: '14px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
              border: '1px solid #e2e8f0',
              padding: '16px',
              animation: `fadeInUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) ${index * 50}ms backwards`,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ 
                width: '40px', 
                height: '40px', 
                borderRadius: '10px', 
                background: stat.bg, 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
              }}>
                <stat.icon style={{ width: '20px', height: '20px', color: stat.color }} />
              </div>
              <div>
                <p style={{ 
                  fontFamily: 'var(--font-display, "DM Sans", sans-serif)',
                  fontSize: '22px', 
                  fontWeight: 'bold', 
                  color: '#111827', 
                  margin: 0,
                }}>
                  {stat.value}
                </p>
                <p style={{ fontSize: '12px', color: '#6b7280', margin: 0, fontWeight: 500 }}>
                  {stat.label}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Search & Filters */}
      <div style={{ 
        display: 'flex', 
        gap: '12px', 
        marginBottom: '20px',
        flexWrap: 'wrap',
        animation: 'fadeInUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) 0.1s backwards',
      }}>
        {/* Search */}
        <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
          <Search style={{ 
            position: 'absolute', 
            left: '14px', 
            top: '50%', 
            transform: 'translateY(-50%)', 
            width: '18px', 
            height: '18px', 
            color: '#9ca3af',
          }} />
          <input
            type="text"
            placeholder="Search checklists..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '12px 12px 12px 44px',
              border: '2px solid #e5e7eb',
              borderRadius: '12px',
              fontSize: '14px',
              outline: 'none',
              background: 'white',
              transition: 'border-color 0.15s, box-shadow 0.15s',
            }}
            onFocus={(e) => {
              e.target.style.borderColor = BRAND_BLUE;
              e.target.style.boxShadow = '0 0 0 4px rgba(0, 87, 168, 0.1)';
            }}
            onBlur={(e) => {
              e.target.style.borderColor = '#e5e7eb';
              e.target.style.boxShadow = 'none';
            }}
          />
        </div>

        {/* Status Filter */}
        <div style={{ display: 'flex', gap: '6px', background: '#f3f4f6', borderRadius: '10px', padding: '4px' }}>
          {[
            { key: "all", label: "All" },
            { key: "in_progress", label: "In Progress" },
            { key: "completed", label: "Completed" },
          ].map((filter) => (
            <button
              key={filter.key}
              onClick={() => setStatusFilter(filter.key as typeof statusFilter)}
              style={{
                padding: '8px 14px',
                background: statusFilter === filter.key ? 'white' : 'transparent',
                color: statusFilter === filter.key ? BRAND_BLUE : '#64748b',
                border: 'none',
                borderRadius: '8px',
                fontWeight: '600',
                fontSize: '13px',
                cursor: 'pointer',
                boxShadow: statusFilter === filter.key ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                transition: 'all 0.15s',
              }}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {[1, 2, 3, 4].map((i) => (
            <div 
              key={i} 
              style={{ 
                background: 'white',
                borderRadius: '14px',
                border: '1px solid #e2e8f0',
                padding: '18px',
              }}
            >
              <div style={{ display: 'flex', gap: '14px', alignItems: 'center' }}>
                <div style={{ 
                  width: '48px', 
                  height: '48px', 
                  background: 'linear-gradient(90deg, #f3f4f6 0%, #e5e7eb 50%, #f3f4f6 100%)',
                  backgroundSize: '200% 100%',
                  animation: 'shimmer 1.5s ease-in-out infinite',
                  borderRadius: '12px',
                }} />
                <div style={{ flex: 1 }}>
                  <div style={{ 
                    height: '16px', 
                    background: 'linear-gradient(90deg, #f3f4f6 0%, #e5e7eb 50%, #f3f4f6 100%)',
                    backgroundSize: '200% 100%',
                    animation: 'shimmer 1.5s ease-in-out infinite',
                    borderRadius: '6px', 
                    width: '60%', 
                    marginBottom: '8px',
                  }} />
                  <div style={{ 
                    height: '12px', 
                    background: 'linear-gradient(90deg, #f3f4f6 0%, #e5e7eb 50%, #f3f4f6 100%)',
                    backgroundSize: '200% 100%',
                    animation: 'shimmer 1.5s ease-in-out infinite',
                    borderRadius: '4px', 
                    width: '40%',
                  }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : filteredRuns.length === 0 ? (
        <EmptyState
          icon={<ClipboardCheck style={{ width: '48px', height: '48px' }} />}
          title={searchQuery || statusFilter !== "all" ? "No matching checklists" : "No checklists yet"}
          description={searchQuery || statusFilter !== "all"
            ? "Try adjusting your filters" 
            : "Start your first checklist from the Work Centres page"}
          action={!searchQuery && statusFilter === "all" ? {
            label: "Go to Work Centres",
            href: "/work-centres"
          } : undefined}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {Object.entries(groupedRuns).map(([dateGroup, groupRuns], groupIndex) => (
            <div 
              key={dateGroup}
              style={{
                animation: `fadeInUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) ${groupIndex * 100}ms backwards`,
              }}
            >
              {/* Date Header */}
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '10px',
                marginBottom: '12px',
              }}>
                <Calendar style={{ width: '16px', height: '16px', color: '#9ca3af' }} />
                <h3 style={{ 
                  fontSize: '13px', 
                  fontWeight: '700', 
                  color: '#6b7280', 
                  margin: 0,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}>
                  {dateGroup}
                </h3>
                <div style={{ flex: 1, height: '1px', background: '#e5e7eb' }} />
              </div>

              {/* Runs for this date */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {groupRuns.map((run, index) => {
                  const config = statusConfig[run.status];
                  const StatusIcon = config.icon;
                  
                  return (
                    <Link
                      key={run.id}
                      href={run.status === 'in_progress' ? `/checklists/${run.id}/run` : `/checklists/${run.id}`}
                      style={{ textDecoration: 'none' }}
                    >
                      <div 
                        style={{ 
                          background: 'white',
                          borderRadius: '14px',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                          border: run.status === 'in_progress' ? `2px solid ${BRAND_BLUE}` : '1px solid #e2e8f0',
                          padding: '16px',
                          transition: 'transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.2s',
                          cursor: 'pointer',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.transform = 'translateX(4px)';
                          e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.transform = 'translateX(0)';
                          e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)';
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                          {/* Status Icon */}
                          <div style={{
                            width: '44px',
                            height: '44px',
                            borderRadius: '12px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: config.bg,
                            flexShrink: 0,
                          }}>
                            <StatusIcon style={{ width: '22px', height: '22px', color: config.color }} />
                          </div>
                          
                          {/* Details */}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                              <h4 style={{ 
                                fontFamily: 'var(--font-display, "DM Sans", sans-serif)',
                                fontWeight: '600', 
                                color: '#111827', 
                                margin: 0,
                                fontSize: '15px',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                              }}>
                                {run.checklist_templates?.name || 'Unknown Checklist'}
                              </h4>
                              <span style={{
                                fontSize: '11px',
                                fontWeight: '600',
                                padding: '3px 8px',
                                borderRadius: '6px',
                                background: config.bg,
                                color: config.color,
                                flexShrink: 0,
                              }}>
                                {config.label}
                              </span>
                            </div>
                            
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '13px', color: '#6b7280' }}>
                              {run.machines && (
                                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                  <Wrench style={{ width: '13px', height: '13px' }} />
                                  {run.machines.name}
                                </span>
                              )}
                              <span style={{ color: '#d1d5db' }}>•</span>
                              <span>{getTimeAgo(run.started_at)}</span>
                            </div>
                          </div>
                          
                          {/* Action indicator */}
                          {run.status === 'in_progress' ? (
                            <div style={{
                              padding: '8px 14px',
                              background: `linear-gradient(135deg, ${BRAND_BLUE} 0%, #003d75 100%)`,
                              color: 'white',
                              borderRadius: '8px',
                              fontSize: '12px',
                              fontWeight: '600',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                            }}>
                              Continue
                              <ChevronRight style={{ width: '14px', height: '14px' }} />
                            </div>
                          ) : (
                            <ChevronRight style={{ width: '20px', height: '20px', color: '#9ca3af' }} />
                          )}
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
