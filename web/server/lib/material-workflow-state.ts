export type RequestStatus = "draft" | "pending_cm" | "pending_pm" | "approved";
export function nextMaterialStatus(status: RequestStatus, action: "approve" | "reject", roles: readonly string[]): RequestStatus {
  const role = status === "pending_cm" ? "CM" : status === "pending_pm" ? "ProjectManager" : null;
  if (!role || (!roles.includes(role) && !roles.includes("MasterAdmin"))) throw new Error("ไม่มีสิทธิ์อนุมัติในขั้นตอนนี้ หรือสถานะเปลี่ยนไปแล้ว");
  return action === "reject" ? "draft" : status === "pending_cm" ? "pending_pm" : "approved";
}
