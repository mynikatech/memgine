import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Platform } from "react-native";

import {
  authApi,
  type AuthSession,
  type OtpChallenge,
} from "@/src/data/api/auth-api";
import type { ApiResult } from "@/src/data/api/result";
import { saveNativeSessionToken } from "@/src/data/api/http-client";
import { storage } from "@/src/utils/storage";

export type MobileSessionMode = "customer" | "business";

const NATIVE_SESSION_MODE_KEY = "memgine.native.session-mode";

type AuthContextValue = {
  session: AuthSession | null;
  loading: boolean;
  mobileSessionMode: MobileSessionMode | null;
  refresh: () => Promise<AuthSession | null>;
  passwordLogin: (
    phone: string,
    regionCode: string,
    password: string,
  ) => Promise<AuthSession>;
  requestOtp: (phone: string, regionCode: string) => Promise<OtpChallenge>;
  verifyOtp: (challengeId: string, otp: string) => Promise<AuthSession>;
  requestCustomerOtp: (phone: string, regionCode: string) => Promise<OtpChallenge>;
  verifyCustomerOtp: (challengeId: string, otp: string) => Promise<AuthSession>;
  unlockPos: (staffId: string, pin: string) => Promise<AuthSession>;
  setPassword: (password: string) => Promise<void>;
  logout: () => Promise<void>;
  setMobileSessionMode: (mode: MobileSessionMode) => Promise<void>;
  hasCapability: (capability: string, organizationId?: string) => boolean;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function unwrap<T>(result: ApiResult<T>): T {
  if (!result.success) throw new Error(result.error.message);
  return result.data as T;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [mobileSessionMode, setMobileSessionModeState] = useState<MobileSessionMode | null>(null);

  const saveMobileSessionMode = useCallback(async (mode: MobileSessionMode | null) => {
    if (Platform.OS === "web") return;
    setMobileSessionModeState(mode);
    if (mode) await storage.secureSet(NATIVE_SESSION_MODE_KEY, mode);
    else await storage.secureRemove(NATIVE_SESSION_MODE_KEY);
  }, []);

  const inferredMobileMode = useCallback((candidate: AuthSession): MobileSessionMode =>
    candidate.access.some((context) => context.capabilities.some((capability) =>
      capability === "PLATFORM_ADMIN_ACCESS" || capability === "ORG_ADMIN_ACCESS" || capability === "COUNTER_ACCESS",
    )) ? "business" : "customer", []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const result = await authApi.session();
      const current = result.success ? result.data : null;
      if (!current) {
        await saveNativeSessionToken(null);
        await saveMobileSessionMode(null);
      } else if (Platform.OS !== "web") {
        const stored = await storage.secureGet<MobileSessionMode | null>(NATIVE_SESSION_MODE_KEY, null);
        const mode = stored === "customer" || stored === "business"
          ? stored
          : inferredMobileMode(current);
        setMobileSessionModeState(mode);
        if (!stored) await storage.secureSet(NATIVE_SESSION_MODE_KEY, mode);
      }
      setSession(current);
      return current;
    } finally {
      setLoading(false);
    }
  }, [inferredMobileMode, saveMobileSessionMode]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      loading,
      mobileSessionMode,
      refresh,
      passwordLogin: async (phone, regionCode, password) => {
        const next = unwrap<AuthSession>(
          await authApi.passwordLogin(phone, regionCode, password),
        );
        await saveNativeSessionToken(next.sessionToken ?? null);
        setSession(next);
        return next;
      },
      requestOtp: async (phone, regionCode) =>
        unwrap<OtpChallenge>(await authApi.requestOtp(phone, regionCode)),
      verifyOtp: async (challengeId, otp) => {
        const next = unwrap<AuthSession>(
          await authApi.verifyOtp(challengeId, otp),
        );
        await saveNativeSessionToken(next.sessionToken ?? null);
        setSession(next);
        return next;
      },
      requestCustomerOtp: async (phone, regionCode) =>
        unwrap<OtpChallenge>(await authApi.requestCustomerOtp(phone, regionCode)),
      verifyCustomerOtp: async (challengeId, otp) => {
        const next = unwrap<AuthSession>(
          await authApi.verifyCustomerOtp(challengeId, otp),
        );
        await saveNativeSessionToken(next.sessionToken ?? null);
        setSession(next);
        return next;
      },
      unlockPos: async (staffId, pin) => {
        const next = unwrap<AuthSession>(await authApi.unlockPos(staffId, pin));
        setSession(next);
        return next;
      },
      setPassword: async (password) => {
        unwrap(await authApi.setPassword(password));
        await refresh();
      },
      logout: async () => {
        const result = await authApi.logout();
        if (!result.success) throw new Error(result.error.message);
        await saveNativeSessionToken(null);
        await saveMobileSessionMode(null);
        setSession(null);
      },
      setMobileSessionMode: async (mode) => {
        await saveMobileSessionMode(mode);
      },
      hasCapability: (capability, organizationId) =>
        session?.access.some(
          (context) =>
            context.capabilities.includes(capability) &&
            (organizationId === undefined ||
              context.organizationId === organizationId),
        ) ?? false,
    }),
    [loading, mobileSessionMode, refresh, saveMobileSessionMode, session],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
