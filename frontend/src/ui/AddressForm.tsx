import { useMemo } from "react";
import { View } from "react-native";

import type {
  Address,
  CityReference,
  CountryReference,
  RegionReference,
} from "@/src/core";

import { useTheme } from "@/src/providers";

import { Input } from "./Input";
import { ReferenceSelect } from "./ReferenceSelect";
import { Text } from "./Text";

export type AddressFormProps = {
  value: Address;

  countries: CountryReference[];
  regions: RegionReference[];
  cities: CityReference[];

  onChange: (address: Address) => void;

  onCountryChange?: (countryCode: string) => void;
  onRegionChange?: (countryCode: string, regionCode: string) => void;

  compact?: boolean;
};

export function AddressForm({
  value,
  countries,
  regions,
  cities,
  onChange,
  onCountryChange,
  onRegionChange,
  compact = false,
}: AddressFormProps) {
  const theme = useTheme();

  /*
   * Regions belonging to the selected country.
   */
  const availableRegions = useMemo(
    () =>
      value.countryCode
        ? regions.filter((region) => region.countryCode === value.countryCode)
        : [],
    [regions, value.countryCode],
  );

  /*
   * Cities belonging to the selected country
   * and selected region.
   */
  const availableCities = useMemo(
    () =>
      value.countryCode && value.region
        ? cities.filter(
            (city) =>
              city.countryCode === value.countryCode &&
              city.regionCode === value.region,
          )
        : [],
    [cities, value.countryCode, value.region],
  );

  const updateAddress = <K extends keyof Address>(
    field: K,
    fieldValue: Address[K],
  ) => {
    onChange({
      ...value,
      [field]: fieldValue,
    });
  };

  /*
   * Country selection
   *
   * ReferenceSelect returns the country reference ID.
   * Address stores countryCode, so convert ID -> countryCode.
   */
  const handleCountryChange = (countryId: string) => {
    const country = countries.find((item) => item.id === countryId);

    if (!country) {
      return;
    }

    const address: Address = {
      ...value,
      countryCode: country.countryCode,
      region: "",
      city: "",
    };

    onChange(address);

    /*
     * Let the parent load regions for this country.
     */
    onCountryChange?.(country.countryCode);
  };

  /*
   * Region selection
   *
   * ReferenceSelect returns the region reference ID.
   * Address stores region code.
   */
  const handleRegionChange = (regionId: string) => {
    const region = regions.find((item) => item.id === regionId);

    if (!region) {
      return;
    }

    const address: Address = {
      ...value,
      region: region.code,
      city: "",
    };

    onChange(address);

    /*
     * Let the parent load cities for this region.
     */
    onRegionChange?.(region.countryCode, region.code);
  };

  /*
   * City selection
   *
   * Address stores the city name.
   */
  const handleCityChange = (cityId: string) => {
    const city = cities.find((item) => item.id === cityId);

    if (!city) {
      return;
    }

    onChange({
      ...value,
      city: city.name,
    });
  };

  return (
    <View
      style={{
        gap: theme.spacing.md,
      }}
    >
      <Text variant="label" color="textSecondary">
        Address
      </Text>

      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          gap: theme.spacing.md,
        }}
      >
        {/* Address Line 1 */}
        <View style={{ width: "100%" }}>
          <Input
            label="Address Line 1"
            value={value.line1}
            placeholder="Street address"
            onChangeText={(text) => updateAddress("line1", text)}
          />
        </View>

        {/* Address Line 2 */}
        <View style={{ width: "100%" }}>
          <Input
            label="Address Line 2"
            value={value.line2 ?? ""}
            placeholder="Apartment, suite, unit, etc. (optional)"
            onChangeText={(text) => updateAddress("line2", text || undefined)}
          />
        </View>

        {/* Country */}
        <View
          style={{
            width: compact ? "100%" : "48%",
          }}
        >
          <ReferenceSelect
            label="Country"
            value={
              countries.find(
                (country) => country.countryCode === value.countryCode,
              )?.id ?? ""
            }
            items={countries}
            placeholder="Select country"
            onChange={handleCountryChange}
          />
        </View>

        {/* Region */}
        <View
          style={{
            width: compact ? "100%" : "48%",
          }}
        >
          <ReferenceSelect
            label="State / Province"
            value={
              availableRegions.find((region) => region.code === value.region)
                ?.id ?? ""
            }
            items={availableRegions}
            placeholder={
              value.countryCode
                ? "Select state / province"
                : "Select country first"
            }
            disabled={!value.countryCode}
            onChange={handleRegionChange}
          />
        </View>

        {/* City */}
        <View
          style={{
            width: compact ? "100%" : "48%",
          }}
        >
          <ReferenceSelect
            label="City"
            value={
              availableCities.find((city) => city.name === value.city)?.id ?? ""
            }
            items={availableCities}
            placeholder={
              value.region ? "Select city" : "Select state / province first"
            }
            disabled={!value.region}
            onChange={handleCityChange}
          />
        </View>

        {/* Postal Code */}
        <View
          style={{
            width: compact ? "100%" : "48%",
          }}
        >
          <Input
            label="Postal / ZIP Code"
            value={value.postalCode ?? ""}
            placeholder="Postal / ZIP code"
            onChangeText={(text) =>
              updateAddress("postalCode", text || undefined)
            }
          />
        </View>
      </View>
    </View>
  );
}
