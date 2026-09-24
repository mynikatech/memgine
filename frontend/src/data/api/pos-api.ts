import { httpClient } from "./http-client";
import type { ApiResult } from "./result";

export type PosDevice = { deviceId:string; organizationId:string; storeId:string; storeName?:string|null; deviceName:string; revokedAt?:string|null; lastSeenAt?:string|null };
export type PosStaff = { staffId:string; displayName:string; staffCode:string; designation?:string|null; pinConfigured:boolean };
export type PosContext = { organizationId:string; organizationName:string; storeId:string; storeName:string; deviceId:string; deviceName:string; staff:PosStaff[] };
export type PoyntPairingCode = { pairingId:string; pairingCode:string; organizationId:string; storeId:string; expiresAt:string };
export const posApi={
 context:():Promise<ApiResult<PosContext>>=>httpClient.get("/api/v1/pos/context"),
 unlock:(staffId:string,pin:string)=>httpClient.post<{staffId:string;pin:string}, import("./auth-api").AuthSession>("/api/v1/pos/unlock",{staffId,pin}),
 list:(org:string)=>httpClient.get<PosDevice[]>(`/api/v1/organizations/${encodeURIComponent(org)}/pos-devices`),
 register:(org:string,storeId:string,deviceName:string)=>httpClient.post<{storeId:string;deviceName:string},PosDevice>(`/api/v1/organizations/${encodeURIComponent(org)}/pos-devices`,{storeId,deviceName}),
 revoke:(org:string,id:string)=>httpClient.delete<{revoked:boolean}>(`/api/v1/organizations/${encodeURIComponent(org)}/pos-devices/${encodeURIComponent(id)}`),
  setPin:(org:string,staff:string,pin:string)=>httpClient.put<{pin:string},{updated:boolean}>(`/api/v1/organizations/${encodeURIComponent(org)}/staff/${encodeURIComponent(staff)}/pos-pin`,{pin}),
  createPoyntPairingCode:(org:string,storeId:string)=>httpClient.post<{storeId:string},PoyntPairingCode>(`/api/v1/organizations/${encodeURIComponent(org)}/poynt/pairing-codes`,{storeId}),
};
