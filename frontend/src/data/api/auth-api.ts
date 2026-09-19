import { httpClient } from "./http-client";
import type { ApiResult } from "./result";

export type AuthAccessContext = {
  organizationId?: string | null;
  organizationName?: string | null;
  roles: string[];
  capabilities: string[];
};

export type AuthSession = {
  userId: string;
  displayName: string;
  expiresAt: string;
  access: AuthAccessContext[];
  passwordConfigured: boolean;
};

export type OtpChallenge = {
  challengeId: string;
  expiresAt: string;
  resendAt: string;
  devCode?: string | null;
};

export class AuthApi {
  session(): Promise<ApiResult<AuthSession>> {
    return httpClient.get("/api/v1/auth/session");
  }

  passwordLogin(phone: string, regionCode: string, password: string) {
    return httpClient.post<
      { phone: string; regionCode: string; password: string },
      AuthSession
    >("/api/v1/auth/password/login", { phone, regionCode, password });
  }

  requestOtp(phone: string, regionCode: string) {
    return httpClient.post<{ phone: string; regionCode: string }, OtpChallenge>(
      "/api/v1/auth/otp/request",
      { phone, regionCode },
    );
  }

  verifyOtp(challengeId: string, otp: string) {
    return httpClient.post<{ challengeId: string; otp: string }, AuthSession>(
      "/api/v1/auth/otp/verify",
      { challengeId, otp },
    );
  }

  logout() {
    return httpClient.post<Record<string, never>, { loggedOut: boolean }>(
      "/api/v1/auth/logout",
      {},
    );
  }

  setPassword(password: string) {
    return httpClient.post<{ password: string }, { updated: boolean }>(
      "/api/v1/auth/password",
      { password },
    );
  }
}

export const authApi = new AuthApi();
