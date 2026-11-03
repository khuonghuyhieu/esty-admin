export const sampleMembers = [
  { id: "jordan", name: "Jordan Kim", email: "jordan@workspace.test", role: "Admin", access: "Active" },
  { id: "alex", name: "Alex Rivera", email: "alex@workspace.test", role: "Operator", access: "Active" },
  { id: "maya", name: "Maya Chen", email: "maya@workspace.test", role: "Viewer", access: "Invited" },
] as const;

export const sampleSettings = {
  displayName: "Jordan Kim",
  email: "jordan@workspace.test",
  workspaceName: "Sample Workspace",
};

export const illustrativeRoles = ["Admin", "Operator", "Viewer"] as const;
export const illustrativePermissions = [
  { label: "View sample workspace", examples: ["Example access", "Example access", "Example access"] },
  { label: "Edit sample workspace", examples: ["Example access", "Example access", "Not illustrated"] },
  { label: "Manage sample members", examples: ["Example access", "Not illustrated", "Not illustrated"] },
] as const;
