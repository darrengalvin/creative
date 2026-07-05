"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import Link from "next/link";
import type { Machine, MachineStatus, RiskCategory, WorkCentre } from "@/types/database";

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

const statusColors: Record<MachineStatus, { bg: string; color: string }> = {
  available: { bg: "#dcfce7", color: "#166534" },
  in_use: { bg: "#dbeafe", color: "#1e40af" },
  under_maintenance: { bg: "#fef3c7", color: "#92400e" },
  locked_out: { bg: "#fee2e2", color: "#991b1b" },
  decommissioned: { bg: "#f3f4f6", color: "#6b7280" },
};

const riskColors: Record<RiskCategory, { bg: string; color: string }> = {
  normal: { bg: "#f3f4f6", color: "#6b7280" },
  high_risk: { bg: "#fef3c7", color: "#92400e" },
  aerospace: { bg: "#dbeafe", color: "#1e40af" },
};

interface MachineWithWorkCentre extends Machine {
  work_centres?: { id: string; name: string } | null;
}

export default function AdminMachinesPage() {
  const { hasRole, isLoading: authLoading } = useAuth();
  const [machines, setMachines] = useState<MachineWithWorkCentre[]>([]);
  const [workCentres, setWorkCentres] = useState<WorkCentre[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingMachine, setEditingMachine] = useState<MachineWithWorkCentre | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [filterWorkCentre, setFilterWorkCentre] = useState("");

  const [formData, setFormData] = useState({
    name: "",
    manufacturer: "",
    model: "",
    serial_number: "",
    location: "",
    description: "",
    status: "available" as MachineStatus,
    risk_category: "normal" as RiskCategory,
    work_centre_id: "",
  });

  const supabase = createClient();
  const isAdmin = hasRole(["admin", "supervisor"]);

  useEffect(() => {
    fetchData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchData = async () => {
    setIsLoading(true);

    const [machinesRes, wcRes] = await Promise.all([
      supabase.from("machines").select("*, work_centres(id, name)").order("name"),
      supabase.from("work_centres").select("*").order("display_order"),
    ]);

    if (machinesRes.data) setMachines(machinesRes.data);
    if (wcRes.data) setWorkCentres(wcRes.data);

    setIsLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    const payload = {
      name: formData.name,
      manufacturer: formData.manufacturer || null,
      model: formData.model || null,
      serial_number: formData.serial_number || null,
      location: formData.location || null,
      description: formData.description || null,
      status: formData.status,
      risk_category: formData.risk_category,
      work_centre_id: formData.work_centre_id || null,
    };

    if (editingMachine) {
      const { error } = await supabase.from("machines").update(payload).eq("id", editingMachine.id);
      if (error) {
        setError(error.message);
      } else {
        setSuccess("Machine updated");
        setShowModal(false);
        setEditingMachine(null);
        fetchData();
      }
    } else {
      const { error } = await supabase.from("machines").insert(payload);
      if (error) {
        setError(error.message);
      } else {
        setSuccess("Machine created");
        setShowModal(false);
        fetchData();
      }
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this machine? This cannot be undone.")) return;

    const { error } = await supabase.from("machines").delete().eq("id", id);
    if (error) {
      setError(error.message);
    } else {
      setSuccess("Machine deleted");
      fetchData();
    }
  };

  const openEdit = (machine: MachineWithWorkCentre) => {
    setEditingMachine(machine);
    setFormData({
      name: machine.name,
      manufacturer: machine.manufacturer || "",
      model: machine.model || "",
      serial_number: machine.serial_number || "",
      location: machine.location || "",
      description: machine.description || "",
      status: machine.status,
      risk_category: machine.risk_category,
      work_centre_id: machine.work_centre_id || "",
    });
    setShowModal(true);
  };

  const openCreate = () => {
    setEditingMachine(null);
    setFormData({
      name: "",
      manufacturer: "",
      model: "",
      serial_number: "",
      location: "",
      description: "",
      status: "available",
      risk_category: "normal",
      work_centre_id: "",
    });
    setShowModal(true);
  };

  const filteredMachines = filterWorkCentre
    ? machines.filter((m) => m.work_centre_id === filterWorkCentre)
    : machines;

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
    <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px", flexWrap: "wrap", gap: "16px" }}>
        <div>
          <h1 style={{ fontSize: "24px", fontWeight: "bold", color: "#111827", margin: 0 }}>
            Manage Machines
          </h1>
          <p style={{ color: "#6b7280", margin: "4px 0 0 0" }}>
            Add and configure machines
          </p>
        </div>
        <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
          <select
            value={filterWorkCentre}
            onChange={(e) => setFilterWorkCentre(e.target.value)}
            style={{ ...inputStyle, width: "auto", minWidth: "180px" }}
          >
            <option value="">All Work Centres</option>
            {workCentres.map((wc) => (
              <option key={wc.id} value={wc.id}>{wc.name}</option>
            ))}
          </select>
          <button onClick={openCreate} style={{ ...buttonStyle, background: BRAND_BLUE, color: "white" }}>
            <svg style={{ width: "20px", height: "20px" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            Add Machine
          </button>
        </div>
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
        ) : filteredMachines.length === 0 ? (
          <div style={{ padding: "40px", textAlign: "center", color: "#6b7280" }}>
            No machines found. Create one to get started.
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                <th style={{ padding: "12px 16px", textAlign: "left", fontSize: "12px", fontWeight: "600", color: "#6b7280", textTransform: "uppercase" }}>Machine</th>
                <th style={{ padding: "12px 16px", textAlign: "left", fontSize: "12px", fontWeight: "600", color: "#6b7280", textTransform: "uppercase" }}>Work Centre</th>
                <th style={{ padding: "12px 16px", textAlign: "left", fontSize: "12px", fontWeight: "600", color: "#6b7280", textTransform: "uppercase" }}>Status</th>
                <th style={{ padding: "12px 16px", textAlign: "left", fontSize: "12px", fontWeight: "600", color: "#6b7280", textTransform: "uppercase" }}>Risk</th>
                <th style={{ padding: "12px 16px", textAlign: "right", fontSize: "12px", fontWeight: "600", color: "#6b7280", textTransform: "uppercase" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredMachines.map((machine) => (
                <tr key={machine.id} style={{ borderBottom: "1px solid #e2e8f0" }}>
                  <td style={{ padding: "16px" }}>
                    <Link href={`/admin/machines/${machine.id}`} style={{ textDecoration: "none" }}>
                      <p style={{ fontWeight: "500", color: "#111827", margin: 0 }}>{machine.name}</p>
                      <p style={{ fontSize: "13px", color: "#6b7280", margin: "2px 0 0 0" }}>
                        {[machine.manufacturer, machine.model].filter(Boolean).join(" ") || "No details"}
                      </p>
                    </Link>
                  </td>
                  <td style={{ padding: "16px", color: "#6b7280", fontSize: "14px" }}>
                    {machine.work_centres?.name || "-"}
                  </td>
                  <td style={{ padding: "16px" }}>
                    <span style={{
                      padding: "4px 12px",
                      borderRadius: "9999px",
                      fontSize: "13px",
                      fontWeight: "500",
                      background: statusColors[machine.status]?.bg,
                      color: statusColors[machine.status]?.color,
                      textTransform: "capitalize",
                    }}>
                      {machine.status.replace("_", " ")}
                    </span>
                  </td>
                  <td style={{ padding: "16px" }}>
                    <span style={{
                      padding: "4px 12px",
                      borderRadius: "9999px",
                      fontSize: "13px",
                      fontWeight: "500",
                      background: riskColors[machine.risk_category]?.bg,
                      color: riskColors[machine.risk_category]?.color,
                      textTransform: "capitalize",
                    }}>
                      {machine.risk_category.replace("_", " ")}
                    </span>
                  </td>
                  <td style={{ padding: "16px", textAlign: "right" }}>
                    <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
                      <button onClick={() => openEdit(machine)} style={{ padding: "8px", background: "#f3f4f6", border: "none", borderRadius: "6px", cursor: "pointer" }}>
                        <svg style={{ width: "18px", height: "18px", color: "#374151" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      <button onClick={() => handleDelete(machine.id)} style={{ padding: "8px", background: "#fef2f2", border: "none", borderRadius: "6px", cursor: "pointer" }}>
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
          <div style={{ ...cardStyle, width: "100%", maxWidth: "550px", maxHeight: "90vh", overflow: "auto" }}>
            <div style={{ padding: "20px", borderBottom: "1px solid #e2e8f0" }}>
              <h2 style={{ fontSize: "18px", fontWeight: "600", margin: 0 }}>
                {editingMachine ? "Edit Machine" : "Add Machine"}
              </h2>
            </div>
            <form onSubmit={handleSubmit} style={{ padding: "20px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={{ display: "block", fontSize: "14px", fontWeight: "500", marginBottom: "6px" }}>Name *</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    style={inputStyle}
                    placeholder="e.g., MAKA CR 27"
                    required
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "14px", fontWeight: "500", marginBottom: "6px" }}>Manufacturer</label>
                  <input
                    type="text"
                    value={formData.manufacturer}
                    onChange={(e) => setFormData({ ...formData, manufacturer: e.target.value })}
                    style={inputStyle}
                    placeholder="e.g., MAKA Systems"
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "14px", fontWeight: "500", marginBottom: "6px" }}>Model</label>
                  <input
                    type="text"
                    value={formData.model}
                    onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                    style={inputStyle}
                    placeholder="e.g., CR 27"
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "14px", fontWeight: "500", marginBottom: "6px" }}>Serial Number</label>
                  <input
                    type="text"
                    value={formData.serial_number}
                    onChange={(e) => setFormData({ ...formData, serial_number: e.target.value })}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "14px", fontWeight: "500", marginBottom: "6px" }}>Location</label>
                  <input
                    type="text"
                    value={formData.location}
                    onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                    style={inputStyle}
                    placeholder="e.g., Bay 1"
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "14px", fontWeight: "500", marginBottom: "6px" }}>Work Centre</label>
                  <select
                    value={formData.work_centre_id}
                    onChange={(e) => setFormData({ ...formData, work_centre_id: e.target.value })}
                    style={inputStyle}
                  >
                    <option value="">None</option>
                    {workCentres.map((wc) => (
                      <option key={wc.id} value={wc.id}>{wc.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "14px", fontWeight: "500", marginBottom: "6px" }}>Status</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as MachineStatus })}
                    style={inputStyle}
                  >
                    <option value="available">Available</option>
                    <option value="in_use">In Use</option>
                    <option value="under_maintenance">Under Maintenance</option>
                    <option value="locked_out">Locked Out</option>
                    <option value="decommissioned">Decommissioned</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "14px", fontWeight: "500", marginBottom: "6px" }}>Risk Category</label>
                  <select
                    value={formData.risk_category}
                    onChange={(e) => setFormData({ ...formData, risk_category: e.target.value as RiskCategory })}
                    style={inputStyle}
                  >
                    <option value="normal">Normal</option>
                    <option value="high_risk">High Risk</option>
                    <option value="aerospace">Aerospace</option>
                  </select>
                </div>
                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={{ display: "block", fontSize: "14px", fontWeight: "500", marginBottom: "6px" }}>Description</label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    style={{ ...inputStyle, minHeight: "80px", resize: "vertical" }}
                    placeholder="Optional description"
                  />
                </div>
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", paddingTop: "20px", marginTop: "20px", borderTop: "1px solid #e2e8f0" }}>
                <button type="button" onClick={() => setShowModal(false)} style={{ ...buttonStyle, background: "white", color: "#374151", border: "1px solid #d1d5db" }}>
                  Cancel
                </button>
                <button type="submit" style={{ ...buttonStyle, background: BRAND_BLUE, color: "white" }}>
                  {editingMachine ? "Save Changes" : "Create Machine"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}








