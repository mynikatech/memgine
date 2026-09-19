import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  authApi,
  type AuthSession,
  type OtpChallenge,
} from "@/src/data/api/auth-api";
import type { ApiResult } from "@/src/data/api/result";

type AuthContextValue = {
  session: AuthSession | null;
  loading: boolean;
  refresh: () => Promise<AuthSession | null>;
  passwordLogin: (
    phone: string,
    regionCode: string,
    password: string,
  ) => Promise<AuthSession>;
  requestOtp: (phone: string, regionCode: string) => Promise<OtpChallenge>;
  verifyOtp: (challengeId: string, otp: string) => Promise<AuthSession>;
  setPassword: (password: string) => Promise<void>;
  logout: () => Promise<void>;
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

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const result = await authApi.session();
      const current = result.success ? result.data : null;
      setSession(current);
      return current;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      loading,
      refresh,
      passwordLogin: async (phone, regionCode, password) => {
        const next = unwrap<AuthSession>(
          await authApi.passwordLogin(phone, regionCode, password),
        );
        setSession(next);
        return next;
      },
      requestOtp: async (phone, regionCode) =>
        unwrap<OtpChallenge>(await authApi.requestOtp(phone, regionCode)),
      verifyOtp: async (challengeId, otp) => {
        const next = unwrap<AuthSession>(
          await authApi.verifyOtp(challengeId, otp),
        );
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
        setSession(null);
      },
      hasCapability: (capability, organizationId) =>
        session?.access.some(
          (context) =>
            context.capabilities.includes(capability) &&
            (organizationId === undefined ||
              context.organizationId === organizationId),
        ) ?? false,
    }),
    [loading, refresh, session],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
