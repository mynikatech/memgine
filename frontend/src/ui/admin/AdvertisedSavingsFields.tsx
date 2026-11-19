import { useEffect, useState } from "react";
import { services } from "@/src/core/services/service-registry";
import { View } from "react-native";
import type { AdvertisedSavings } from "@/src/core/domain/entities";
import { formatSavingsAmount, formatSavingsMoney, readSavingsOverride } from "@/src/core/domain/savings-display";
import { Input } from "../Input";
import { Text } from "../Text";

/** Each editor is keyed by record ID. Reference and pricing refreshes leave the draft intact. */
export function useAdvertisedSavingsOverride(savings: AdvertisedSavings | null | undefined, defaultCurrency: string) {
  const [amount, onAmount] = useState(() => formatSavingsAmount(savings?.override) ?? "");
  const [currency, onCurrency] = useState(() => savings?.override?.currency ?? "");
  const [error, setError] = useState<string>();
  const [activeCurrencies, setActiveCurrencies] = useState<Set<string>>();

  useEffect(() => {
    let active = true;
    void services.referenceData.listCurrencies().then((currencies) => {
      if (active) setActiveCurrencies(new Set(currencies.filter((item) => item.active).map((item) => item.code.toUpperCase())));
    }).catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  const suggestedCurrency = savings?.calculated?.currency ?? defaultCurrency;
  const selectedCurrency = currency.trim().toUpperCase() || suggestedCurrency;
  const knownCurrency = activeCurrencies?.has(selectedCurrency) ??
    (selectedCurrency === savings?.override?.currency || selectedCurrency === savings?.calculated?.currency);
  const override = amount.trim() && !knownCurrency
    ? undefined
    : readSavingsOverride(amount, selectedCurrency, savings);

  const validateOverride = () => {
    setError(override === undefined
      ? "Enter a nonnegative amount in a supported currency with the correct decimal precision."
      : undefined);
    return override;
  };

  return {
    validateOverride,
    fields: { amount, currency, onAmount, onCurrency, error, override, suggestedCurrency },
  };
}

type Props = {
  savings?: AdvertisedSavings | null;
  amount: string;
  currency: string;
  suggestedCurrency: string;
  override: ReturnType<typeof readSavingsOverride>;
  onAmount: (value: string) => void;
  onCurrency: (value: string) => void;
  error?: string;
  readOnly?: boolean;
};

export function AdvertisedSavingsFields({ savings, amount, currency, suggestedCurrency, override, onAmount, onCurrency, error, readOnly }: Props) {
  const effective = override === null ? savings?.calculated : override;
  return (
    <View style={{ gap: 8 }}>
      <Text variant="title">Savings &amp; Value</Text>
      <Text>Calculated estimate: {formatSavingsMoney(savings?.calculated) ?? "Unavailable"}</Text>
      {savings?.basis && <Text variant="bodySmall">{savings.basis}</Text>}
      <Input label="Advertised override (optional)" value={amount} onChangeText={onAmount} keyboardType="decimal-pad" editable={!readOnly} />
      <Input label="Override currency" value={currency} onChangeText={onCurrency} placeholder={suggestedCurrency || "Currency code"} autoCapitalize="characters" maxLength={3} editable={!readOnly} />
      {error && <Text color="danger">{error}</Text>}
      <Text>Effective advertised value: {formatSavingsMoney(effective) ?? "Unavailable"}</Text>
      <Text variant="bodySmall">Estimates and overrides are for display. Catalog estimates refresh after configuration is saved.</Text>
    </View>
  );
}
