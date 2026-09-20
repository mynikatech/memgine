import { httpClient } from "./http-client";
import type { ApiResult } from "./result";
export type AppNotification={id:string;organizationId?:string|null;eventType:string;title:string;message:string;context?:string|null;createdAt:string;readAt?:string|null};
export class NotificationApi { list():Promise<ApiResult<AppNotification[]>> { return httpClient.get("/api/v1/notifications"); } unreadCount():Promise<ApiResult<{count:number}>> { return httpClient.get("/api/v1/notifications/unread-count"); } markRead(id:string):Promise<ApiResult<{updated:boolean}>> { return httpClient.post(`/api/v1/notifications/${encodeURIComponent(id)}/read`,{}); } markAllRead():Promise<ApiResult<{updated:number}>> { return httpClient.post("/api/v1/notifications/read-all",{}); } }
