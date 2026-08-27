import { useMemo } from "react";

import { View } from "react-native";

import type { CountryReference } from "@/src/core";

import { useTheme } from "@/src/providers";

import { FieldLabel } from "./FieldLabel";
import { Input } from "./Input";
import { ReferenceSelect } from "./ReferenceSelect";
import { Text } from "./Text";

export type PhoneValue = {
  countryId: string;
  callingCode: string;
  number: string;
};

export type PhoneFieldProps = {
  label?: string;
  required?: boolean;
  value: PhoneValue;
  countries: CountryReference[];
  onChange: (value: PhoneValue) => void;
  error?: string;
  maxDigits?: number;
  disabled?: boolean;
  placeholder?: string;
  testID?: string;
};

export function PhoneField({
  label = "Phone",
  required = false,
  value,
  countries,
  onChange,
  error,
  maxDigits = 10,
  disabled = false,
  placeholder = "Phone number",
  testID,
}: PhoneFieldProps) {
  const theme = useTheme();

  const selectedCountry = useMemo(
    () => countries.find((country) => country.id === value.countryId),
    [countries, value.countryId],
  );

  const handleCountryChange = (countryId: string) => {
    const country = countries.find((item) => item.id === countryId);

    if (!country) {
      return;
    }

    onChange({
      countryId: country.id,
      callingCode: country.callingCode ?? "",
      number: value.number,
    });
  };

  const handleNumberChange = (text: string) => {
    const digitsOnly = text.replace(/\D/g, "");

    onChange({
      ...value,
      number: digitsOnly.slice(0, maxDigits),
    });
  };

  return (
    <View style={{ gap: theme.spacing.xs }}>
      <FieldLabel label={label} required={required} />

      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          gap: theme.spacing.sm,
          alignItems: "flex-start",
        }}
      >
        <View
          style={{
            width: 160,
          }}
        >
          <ReferenceSelect
            value={value.countryId}
            items={countries}
            onChange={handleCountryChange}
            placeholder="Country"
            disabled={disabled}
            renderItemLabel={(country) =>
              `${country.name} (${country.callingCode ?? ""})`
            }
            testID={testID ? `${testID}-country` : undefined}
          />
        </View>

        <View
          style={{
            flex: 1,
            minWidth: 180,
          }}
        >
          <Input
            value={value.number}
            onChangeText={handleNumberChange}
            placeholder={placeholder}
            keyboardType="phone-pad"
            maxLength={maxDigits}
            editable={!disabled}
            error={error}
            testID={testID ? `${testID}-number` : undefined}
          />
        </View>
      </View>

      {selectedCountry?.callingCode ? null : null}

      {!error && value.number.length > 0 ? (
        <Text variant="caption" color="textMuted">
          {value.number.length}/{maxDigits} digits
        </Text>
      ) : null}
    </View>
  );
}
