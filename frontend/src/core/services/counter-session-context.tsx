import * as React from "react";

import type { CounterContext } from "@/src/data/api/counter-api";

type CounterSessionValue = {
  context: CounterContext | null;
  setContext: React.Dispatch<React.SetStateAction<CounterContext | null>>;
};

const CounterSessionContext = React.createContext<CounterSessionValue | null>(
  null,
);

export function CounterSessionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [context, setContext] = React.useState<CounterContext | null>(null);
  const value = React.useMemo(() => ({ context, setContext }), [context]);
  return (
    <CounterSessionContext.Provider value={value}>
      {children}
    </CounterSessionContext.Provider>
  );
}

export function useCounterSession(): CounterSessionValue {
  const value = React.useContext(CounterSessionContext);
  if (!value)
    throw new Error(
      "useCounterSession must be used inside CounterSessionProvider.",
    );
  return value;
}
