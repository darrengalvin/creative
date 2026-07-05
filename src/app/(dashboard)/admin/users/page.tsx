"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/auth-context";
import type { UserRole } from "@/types/database";

interface User {
  id: string;
  email: string;
  username: string | null;
  name: string;
  role: UserRole;
  department: string | null;
  created_at: string;
  updated_at: string;
  last_sign_in_at?: string;
}

const BRAND_BLUE = "#0057A8";

const roleOptions: { value: UserRole; label: string; description: string }[] = [
  { value: "admin", label: "Admin", description: "Full system access" },
  { value: "supervisor", label: "Supervisor", description: "Manage templates & approve" },
  { value: "operator", label: "Operator", description: "Run checklists" },
  { value: "maintenance", label: "Maintenance", description: "Maintenance tasks" },
  { value: "viewer", label: "Viewer", description: "View only" },
];

const roleColors: Record<UserRole, { bg: string; color: string }> = {
  admin: { bg: "#fef3c7", color: "#92400e" },
  supervisor: { bg: "#dbeafe", color: "#1e40af" },
  operator: { bg: "#dcfce7", color: "#166534" },
  maintenance: { bg: "#f3e8ff", color: "#7c3aed" },
  viewer: { bg: "#f3f4f6", color: "#6b7280" },
};

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

export default function AdminUsersPage() {
  const { user: currentUser, hasRole, viewAsUser, isImpersonating, isLoading: authLoading } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Form state
  const [formData, setFormData] = useState({
    email: "",
    username: "",
    password: "",
    name: "",
    role: "operator" as UserRole,
    department: "",
    isInternalUser: true, // Default to internal user (no email required)
  });

  const isAdmin = hasRole("admin");

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/admin/users");
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        setUsers(data.users || []);
      }
    } catch {
      setError("Failed to fetch users");
    }
    setIsLoading(false);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    // For internal users, generate an internal email from username
    const payload = {
      ...formData,
      email: formData.isInternalUser 
        ? `${formData.username.toLowerCase().replace(/\s+/g, '.')}@cc.internal` 
        : formData.email,
    };

    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (data.error) {
        setError(data.error);
      } else {
        setSuccess(data.message);
        setShowCreateModal(false);
        setFormData({
          email: "",
          username: "",
          password: "",
          name: "",
          role: "operator",
          department: "",
          isInternalUser: true,
        });
        fetchUsers();
      }
    } catch {
      setError("Failed to create user");
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;
    setError("");
    setSuccess("");

    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: selectedUser.id,
          name: formData.name,
          role: formData.role,
          department: formData.department || null,
          password: formData.password || undefined,
        }),
      });
      const data = await res.json();

      if (data.error) {
        setError(data.error);
      } else {
        setSuccess("User updated successfully");
        setShowEditModal(false);
        setSelectedUser(null);
        fetchUsers();
      }
    } catch {
      setError("Failed to update user");
    }
  };

  const handleDelete = async (userId: string) => {
    if (!confirm("Are you sure you want to delete this user? This action cannot be undone.")) {
      return;
    }

    setError("");
    try {
      const res = await fetch(`/api/admin/users?id=${userId}`, {
        method: "DELETE",
      });
      const data = await res.json();

      if (data.error) {
        setError(data.error);
      } else {
        setSuccess("User deleted successfully");
        fetchUsers();
      }
    } catch {
      setError("Failed to delete user");
    }
  };

  const openEditModal = (user: User) => {
    setSelectedUser(user);
    setFormData({
      email: user.email,
      username: user.username || "",
      password: "",
      name: user.name,
      role: user.role,
      department: user.department || "",
      isInternalUser: user.email?.endsWith('@cc.internal') || false,
    });
    setShowEditModal(true);
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return "Never";
    return new Date(dateString).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const generatePassword = () => {
    const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%";
    let password = "";
    for (let i = 0; i < 12; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setFormData({ ...formData, password });
  };

  if (authLoading) {
    return (
      <div style={{ padding: "40px", textAlign: "center", color: "#6b7280" }}>Loading...</div>
    );
  }

  if (!isAdmin) {
    return (
      <div style={{ padding: "40px", textAlign: "center" }}>
        <h1 style={{ fontSize: "24px", fontWeight: "bold", color: "#111827", marginBottom: "8px" }}>
          Access Denied
        </h1>
        <p style={{ color: "#6b7280" }}>You don&apos;t have permission to access this page.</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
        <div>
          <h1 style={{ fontSize: "24px", fontWeight: "bold", color: "#111827", margin: 0 }}>
            User Management
          </h1>
          <p style={{ color: "#6b7280", margin: "4px 0 0 0" }}>
            Create and manage user accounts
          </p>
        </div>
        <button
          onClick={() => {
            setFormData({
              email: "",
              username: "",
              password: "",
              name: "",
              role: "operator",
              department: "",
              isInternalUser: true,
            });
            setShowCreateModal(true);
          }}
          style={{
            ...buttonStyle,
            background: BRAND_BLUE,
            color: "white",
          }}
        >
          <svg style={{ width: "20px", height: "20px" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
          Add User
        </button>
      </div>

      {/* Messages */}
      {error && (
        <div style={{
          padding: "12px 16px",
          background: "#fef2f2",
          border: "1px solid #fecaca",
          borderRadius: "8px",
          color: "#dc2626",
          marginBottom: "16px",
        }}>
          {error}
        </div>
      )}
      {success && (
        <div style={{
          padding: "12px 16px",
          background: "#dcfce7",
          border: "1px solid #bbf7d0",
          borderRadius: "8px",
          color: "#166534",
          marginBottom: "16px",
        }}>
          {success}
        </div>
      )}

      {/* Users Table */}
      <div style={{ ...cardStyle, overflow: "hidden" }}>
        {isLoading ? (
          <div style={{ padding: "40px", textAlign: "center", color: "#6b7280" }}>
            Loading users...
          </div>
        ) : users.length === 0 ? (
          <div style={{ padding: "40px", textAlign: "center", color: "#6b7280" }}>
            No users found. Create one to get started.
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                <th style={{ padding: "12px 16px", textAlign: "left", fontSize: "12px", fontWeight: "600", color: "#6b7280", textTransform: "uppercase" }}>User</th>
                <th style={{ padding: "12px 16px", textAlign: "left", fontSize: "12px", fontWeight: "600", color: "#6b7280", textTransform: "uppercase" }}>Role</th>
                <th style={{ padding: "12px 16px", textAlign: "left", fontSize: "12px", fontWeight: "600", color: "#6b7280", textTransform: "uppercase" }}>Department</th>
                <th style={{ padding: "12px 16px", textAlign: "left", fontSize: "12px", fontWeight: "600", color: "#6b7280", textTransform: "uppercase" }}>Last Sign In</th>
                <th style={{ padding: "12px 16px", textAlign: "right", fontSize: "12px", fontWeight: "600", color: "#6b7280", textTransform: "uppercase" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} style={{ borderBottom: "1px solid #e2e8f0" }}>
                  <td style={{ padding: "16px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                      <div style={{
                        width: "40px",
                        height: "40px",
                        borderRadius: "50%",
                        background: BRAND_BLUE,
                        color: "white",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontWeight: "600",
                        fontSize: "14px",
                      }}>
                        {user.name?.charAt(0).toUpperCase() || "?"}
                      </div>
                      <div>
                        <p style={{ fontWeight: "500", color: "#111827", margin: 0 }}>
                          {user.name}
                          {user.id === currentUser?.id && (
                            <span style={{ fontSize: "12px", color: "#6b7280", marginLeft: "8px" }}>(You)</span>
                          )}
                        </p>
                        <p style={{ fontSize: "13px", color: "#6b7280", margin: "2px 0 0 0", display: "flex", alignItems: "center", gap: "4px" }}>
                          {user.email?.endsWith('@cc.internal') ? (
                            <>
                              <span style={{ 
                                display: "inline-flex", 
                                alignItems: "center", 
                                gap: "3px",
                                background: "#f0fdf4", 
                                color: "#166534",
                                padding: "2px 6px",
                                borderRadius: "4px",
                                fontSize: "11px",
                                fontWeight: "500",
                              }}>
                                🏭 {user.username || user.email.replace('@cc.internal', '')}
                              </span>
                            </>
                          ) : (
                            <>{user.email}</>
                          )}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: "16px" }}>
                    <span style={{
                      display: "inline-block",
                      padding: "4px 12px",
                      borderRadius: "9999px",
                      fontSize: "13px",
                      fontWeight: "500",
                      background: roleColors[user.role]?.bg || "#f3f4f6",
                      color: roleColors[user.role]?.color || "#6b7280",
                      textTransform: "capitalize",
                    }}>
                      {user.role}
                    </span>
                  </td>
                  <td style={{ padding: "16px", color: "#6b7280", fontSize: "14px" }}>
                    {user.department || "-"}
                  </td>
                  <td style={{ padding: "16px", color: "#6b7280", fontSize: "14px" }}>
                    {formatDate(user.last_sign_in_at)}
                  </td>
                  <td style={{ padding: "16px", textAlign: "right" }}>
                    <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
                      {user.id !== currentUser?.id && !isImpersonating && (
                        <button
                          onClick={() => viewAsUser(user)}
                          title="View as this user"
                          style={{
                            padding: "8px",
                            background: "#dbeafe",
                            border: "none",
                            borderRadius: "6px",
                            cursor: "pointer",
                            color: "#1e40af",
                          }}
                        >
                          <svg style={{ width: "18px", height: "18px" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                        </button>
                      )}
                      <button
                        onClick={() => openEditModal(user)}
                        title="Edit user"
                        style={{
                          padding: "8px",
                          background: "#f3f4f6",
                          border: "none",
                          borderRadius: "6px",
                          cursor: "pointer",
                          color: "#374151",
                        }}
                      >
                        <svg style={{ width: "18px", height: "18px" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      {user.id !== currentUser?.id && (
                        <button
                          onClick={() => handleDelete(user.id)}
                          title="Delete user"
                          style={{
                            padding: "8px",
                            background: "#fef2f2",
                            border: "none",
                            borderRadius: "6px",
                            cursor: "pointer",
                            color: "#dc2626",
                          }}
                        >
                          <svg style={{ width: "18px", height: "18px" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Create User Modal */}
      {showCreateModal && (
        <div style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.5)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 50,
          padding: "20px",
        }}>
          <div style={{
            ...cardStyle,
            width: "100%",
            maxWidth: "500px",
            maxHeight: "90vh",
            overflow: "auto",
          }}>
            <div style={{ padding: "20px", borderBottom: "1px solid #e2e8f0" }}>
              <h2 style={{ fontSize: "18px", fontWeight: "600", margin: 0 }}>Create New User</h2>
            </div>
            <form onSubmit={handleCreate} style={{ padding: "20px" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                {/* User Type Toggle */}
                <div style={{ 
                  display: "flex", 
                  background: "#f3f4f6", 
                  borderRadius: "10px", 
                  padding: "4px",
                  gap: "4px",
                }}>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, isInternalUser: true })}
                    style={{
                      flex: 1,
                      padding: "10px 16px",
                      borderRadius: "8px",
                      border: "none",
                      fontSize: "14px",
                      fontWeight: "500",
                      cursor: "pointer",
                      background: formData.isInternalUser ? "white" : "transparent",
                      color: formData.isInternalUser ? BRAND_BLUE : "#6b7280",
                      boxShadow: formData.isInternalUser ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                      transition: "all 0.2s",
                    }}
                  >
                    🏭 Internal User
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, isInternalUser: false })}
                    style={{
                      flex: 1,
                      padding: "10px 16px",
                      borderRadius: "8px",
                      border: "none",
                      fontSize: "14px",
                      fontWeight: "500",
                      cursor: "pointer",
                      background: !formData.isInternalUser ? "white" : "transparent",
                      color: !formData.isInternalUser ? BRAND_BLUE : "#6b7280",
                      boxShadow: !formData.isInternalUser ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                      transition: "all 0.2s",
                    }}
                  >
                    ✉️ Email User
                  </button>
                </div>

                <p style={{ fontSize: "13px", color: "#6b7280", margin: "-8px 0 0 0", padding: "0 4px" }}>
                  {formData.isInternalUser 
                    ? "Internal users log in with a username - no email required" 
                    : "Email users log in with their email address"}
                </p>

                <div>
                  <label style={{ display: "block", fontSize: "14px", fontWeight: "500", color: "#374151", marginBottom: "6px" }}>
                    Full Name *
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    style={inputStyle}
                    placeholder="John Smith"
                    required
                  />
                </div>

                {formData.isInternalUser ? (
                  <div>
                    <label style={{ display: "block", fontSize: "14px", fontWeight: "500", color: "#374151", marginBottom: "6px" }}>
                      Username *
                    </label>
                    <input
                      type="text"
                      value={formData.username}
                      onChange={(e) => setFormData({ ...formData, username: e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, '') })}
                      style={inputStyle}
                      placeholder="jsmith"
                      required
                    />
                    <p style={{ fontSize: "12px", color: "#6b7280", marginTop: "4px" }}>
                      Lowercase letters, numbers, dots, and dashes only
                    </p>
                  </div>
                ) : (
                  <div>
                    <label style={{ display: "block", fontSize: "14px", fontWeight: "500", color: "#374151", marginBottom: "6px" }}>
                      Email Address *
                    </label>
                    <input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      style={inputStyle}
                      placeholder="john@company.com"
                      required
                    />
                  </div>
                )}

                <div>
                  <label style={{ display: "block", fontSize: "14px", fontWeight: "500", color: "#374151", marginBottom: "6px" }}>
                    Password *
                  </label>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <input
                      type="text"
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      style={{ ...inputStyle, flex: 1 }}
                      placeholder="Enter password"
                      required
                      minLength={6}
                    />
                    <button
                      type="button"
                      onClick={generatePassword}
                      style={{
                        ...buttonStyle,
                        background: "#f3f4f6",
                        color: "#374151",
                        border: "1px solid #d1d5db",
                        whiteSpace: "nowrap",
                      }}
                    >
                      Generate
                    </button>
                  </div>
                  <p style={{ fontSize: "12px", color: "#6b7280", marginTop: "4px" }}>
                    Minimum 6 characters
                  </p>
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "14px", fontWeight: "500", color: "#374151", marginBottom: "6px" }}>
                    Role *
                  </label>
                  <select
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value as UserRole })}
                    style={inputStyle}
                  >
                    {roleOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label} - {opt.description}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "14px", fontWeight: "500", color: "#374151", marginBottom: "6px" }}>
                    Department
                  </label>
                  <input
                    type="text"
                    value={formData.department}
                    onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                    style={inputStyle}
                    placeholder="e.g., Production, Quality, etc."
                  />
                </div>

              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", marginTop: "24px", paddingTop: "20px", borderTop: "1px solid #e2e8f0" }}>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  style={{
                    ...buttonStyle,
                    background: "white",
                    color: "#374151",
                    border: "1px solid #d1d5db",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{
                    ...buttonStyle,
                    background: BRAND_BLUE,
                    color: "white",
                  }}
                >
                  Create User
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {showEditModal && selectedUser && (
        <div style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.5)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 50,
          padding: "20px",
        }}>
          <div style={{
            ...cardStyle,
            width: "100%",
            maxWidth: "500px",
            maxHeight: "90vh",
            overflow: "auto",
          }}>
            <div style={{ padding: "20px", borderBottom: "1px solid #e2e8f0" }}>
              <h2 style={{ fontSize: "18px", fontWeight: "600", margin: 0 }}>Edit User</h2>
              <p style={{ fontSize: "14px", color: "#6b7280", margin: "4px 0 0 0" }}>{selectedUser.email}</p>
            </div>
            <form onSubmit={handleUpdate} style={{ padding: "20px" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "14px", fontWeight: "500", color: "#374151", marginBottom: "6px" }}>
                    Full Name
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    style={inputStyle}
                    required
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "14px", fontWeight: "500", color: "#374151", marginBottom: "6px" }}>
                    Role
                  </label>
                  <select
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value as UserRole })}
                    style={inputStyle}
                    disabled={selectedUser.id === currentUser?.id}
                  >
                    {roleOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label} - {opt.description}
                      </option>
                    ))}
                  </select>
                  {selectedUser.id === currentUser?.id && (
                    <p style={{ fontSize: "12px", color: "#6b7280", marginTop: "4px" }}>
                      You cannot change your own role
                    </p>
                  )}
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "14px", fontWeight: "500", color: "#374151", marginBottom: "6px" }}>
                    Department
                  </label>
                  <input
                    type="text"
                    value={formData.department}
                    onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                    style={inputStyle}
                    placeholder="e.g., Production, Quality, etc."
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "14px", fontWeight: "500", color: "#374151", marginBottom: "6px" }}>
                    New Password
                  </label>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <input
                      type="text"
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      style={{ ...inputStyle, flex: 1 }}
                      placeholder="Leave blank to keep current"
                      minLength={6}
                    />
                    <button
                      type="button"
                      onClick={generatePassword}
                      style={{
                        ...buttonStyle,
                        background: "#f3f4f6",
                        color: "#374151",
                        border: "1px solid #d1d5db",
                        whiteSpace: "nowrap",
                      }}
                    >
                      Generate
                    </button>
                  </div>
                  <p style={{ fontSize: "12px", color: "#6b7280", marginTop: "4px" }}>
                    Leave blank to keep current password
                  </p>
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", marginTop: "24px", paddingTop: "20px", borderTop: "1px solid #e2e8f0" }}>
                <button
                  type="button"
                  onClick={() => {
                    setShowEditModal(false);
                    setSelectedUser(null);
                  }}
                  style={{
                    ...buttonStyle,
                    background: "white",
                    color: "#374151",
                    border: "1px solid #d1d5db",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{
                    ...buttonStyle,
                    background: BRAND_BLUE,
                    color: "white",
                  }}
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
