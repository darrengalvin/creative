"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import type { WorkCentre } from "@/types/database";

const BRAND_BLUE = "#0057A8";

const cardStyle: React.CSSProperties = {
  background: "white",
  borderRadius: "12px",
  boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
  border: "1px solid #e2e8f0",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 14px",
  border: "1px solid #d1d5db",
  borderRadius: "8px",
  fontSize: "14px",
  outline: "none",
};

const buttonStyle: React.CSSProperties = {
  padding: "10px 20px",
  borderRadius: "8px",
  fontWeight: "500",
  fontSize: "14px",
  cursor: "pointer",
  border: "none",
  display: "inline-flex",
  alignItems: "center",
  gap: "8px",
};

interface WorkCentreWithCount extends WorkCentre {
  machine_count?: number;
}

export default function AdminWorkCentresPage() {
  const { hasRole, isLoading: authLoading } = useAuth();
  const [workCentres, setWorkCentres] = useState<WorkCentreWithCount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ name: "", description: "" });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const supabase = createClient();
  const isAdmin = hasRole(["admin", "supervisor"]);

  useEffect(() => {
    fetchWorkCentres();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchWorkCentres = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from("work_centres")
      .select("*, machines(count)")
      .order("display_order");

    if (!error && data) {
      const withCounts = data.map((wc) => ({
        ...wc,
        machine_count: (wc.machines as unknown as { count: number }[])?.[0]?.count || 0,
      }));
      setWorkCentres(withCounts);
    }
    setIsLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (editingId) {
      const { error } = await supabase
        .from("work_centres")
        .update({ name: formData.name, description: formData.description || null })
        .eq("id", editingId);

      if (error) {
        setError(error.message);
      } else {
        setSuccess("Work centre updated");
        setShowModal(false);
        setEditingId(null);
        fetchWorkCentres();
      }
    } else {
      const { error } = await supabase.from("work_centres").insert({
        name: formData.name,
        description: formData.description || null,
        display_order: workCentres.length,
      });

      if (error) {
        setError(error.message);
      } else {
        setSuccess("Work centre created");
        setShowModal(false);
        fetchWorkCentres();
      }
    }
    setFormData({ name: "", description: "" });
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this work centre? Machines will be unassigned.")) return;

    const { error } = await supabase.from("work_centres").delete().eq("id", id);
    if (error) {
      setError(error.message);
    } else {
      setSuccess("Work centre deleted");
      fetchWorkCentres();
    }
  };

  const openEdit = (wc: WorkCentre) => {
    setEditingId(wc.id);
    setFormData({ name: wc.name, description: wc.description || "" });
    setShowModal(true);
  };

  if (authLoading) {
    return (
      <div style={{ padding: "40px", textAlign: "center", color: "#6b7280" }}>Loading...</div>
    );
  }

  if (!isAdmin) {
    return (
      <div style={{ padding: "40px", textAlign: "center" }}>
        <h1 style={{ fontSize: "24px", fontWeight: "bold", marginBottom: "8px" }}>Access Denied</h1>
        <p style={{ color: "#6b7280" }}>You don&apos;t have permission to access this page.</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: "900px", margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
        <div>
          <h1 style={{ fontSize: "24px", fontWeight: "bold", color: "#111827", margin: 0 }}>
            Manage Work Centres
          </h1>
          <p style={{ color: "#6b7280", margin: "4px 0 0 0" }}>
            Organize machines into work centres
          </p>
        </div>
        <button
          onClick={() => {
            setEditingId(null);
            setFormData({ name: "", description: "" });
            setShowModal(true);
          }}
          style={{ ...buttonStyle, background: BRAND_BLUE, color: "white" }}
        >
          <svg style={{ width: "20px", height: "20px" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
          Add Work Centre
        </button>
      </div>

      {error && (
        <div style={{ padding: "12px 16px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "8px", color: "#dc2626", marginBottom: "16px" }}>
          {error}
        </div>
      )}
      {success && (
        <div style={{ padding: "12px 16px", background: "#dcfce7", border: "1px solid #bbf7d0", borderRadius: "8px", color: "#166534", marginBottom: "16px" }}>
          {success}
        </div>
      )}

      <div style={{ ...cardStyle, overflow: "hidden" }}>
        {isLoading ? (
          <div style={{ padding: "40px", textAlign: "center", color: "#6b7280" }}>Loading...</div>
        ) : workCentres.length === 0 ? (
          <div style={{ padding: "40px", textAlign: "center", color: "#6b7280" }}>
            No work centres yet. Create one to get started.
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                <th style={{ padding: "12px 16px", textAlign: "left", fontSize: "12px", fontWeight: "600", color: "#6b7280", textTransform: "uppercase" }}>Name</th>
                <th style={{ padding: "12px 16px", textAlign: "left", fontSize: "12px", fontWeight: "600", color: "#6b7280", textTransform: "uppercase" }}>Description</th>
                <th style={{ padding: "12px 16px", textAlign: "center", fontSize: "12px", fontWeight: "600", color: "#6b7280", textTransform: "uppercase" }}>Machines</th>
                <th style={{ padding: "12px 16px", textAlign: "right", fontSize: "12px", fontWeight: "600", color: "#6b7280", textTransform: "uppercase" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {workCentres.map((wc) => (
                <tr key={wc.id} style={{ borderBottom: "1px solid #e2e8f0" }}>
                  <td style={{ padding: "16px", fontWeight: "500", color: "#111827" }}>{wc.name}</td>
                  <td style={{ padding: "16px", color: "#6b7280", fontSize: "14px" }}>{wc.description || "-"}</td>
                  <td style={{ padding: "16px", textAlign: "center" }}>
                    <span style={{ background: "#f3f4f6", padding: "4px 12px", borderRadius: "9999px", fontSize: "13px", fontWeight: "500" }}>
                      {wc.machine_count}
                    </span>
                  </td>
                  <td style={{ padding: "16px", textAlign: "right" }}>
                    <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
                      <button onClick={() => openEdit(wc)} style={{ padding: "8px", background: "#f3f4f6", border: "none", borderRadius: "6px", cursor: "pointer" }}>
                        <svg style={{ width: "18px", height: "18px", color: "#374151" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      <button onClick={() => handleDelete(wc.id)} style={{ padding: "8px", background: "#fef2f2", border: "none", borderRadius: "6px", cursor: "pointer" }}>
                        <svg style={{ width: "18px", height: "18px", color: "#dc2626" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: "20px" }}>
          <div style={{ ...cardStyle, width: "100%", maxWidth: "450px" }}>
            <div style={{ padding: "20px", borderBottom: "1px solid #e2e8f0" }}>
              <h2 style={{ fontSize: "18px", fontWeight: "600", margin: 0 }}>
                {editingId ? "Edit Work Centre" : "Add Work Centre"}
              </h2>
            </div>
            <form onSubmit={handleSubmit} style={{ padding: "20px" }}>
              <div style={{ marginBottom: "16px" }}>
                <label style={{ display: "block", fontSize: "14px", fontWeight: "500", marginBottom: "6px" }}>Name *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  style={inputStyle}
                  placeholder="e.g., CNC, Press, Paint"
                  required
                />
              </div>
              <div style={{ marginBottom: "16px" }}>
                <label style={{ display: "block", fontSize: "14px", fontWeight: "500", marginBottom: "6px" }}>Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  style={{ ...inputStyle, minHeight: "80px", resize: "vertical" }}
                  placeholder="Optional description"
                />
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", paddingTop: "16px", borderTop: "1px solid #e2e8f0" }}>
                <button type="button" onClick={() => setShowModal(false)} style={{ ...buttonStyle, background: "white", color: "#374151", border: "1px solid #d1d5db" }}>
                  Cancel
                </button>
                <button type="submit" style={{ ...buttonStyle, background: BRAND_BLUE, color: "white" }}>
                  {editingId ? "Save Changes" : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}







