import { useEffect, useState } from "react";
import { Alert, View } from "react-native";

import {
  InMemoryOrganizationService,
  InMemoryReferenceDataService,
  Organization,
  OrganizationDetails,
} from "@/src/core";
import { useBusiness } from "@/src/providers";
import { StateView } from "@/src/ui";
import { BusinessForm } from "@/src/ui/admin/BusinessForm";

const organizationService = new InMemoryOrganizationService();
const referenceDataService = new InMemoryReferenceDataService();

export default function OrgAdminBusiness() {
  const { organization } = useBusiness();

  const [details, setDetails] = useState<OrganizationDetails | null>(null);
  const [organizationTypes, setOrganizationTypes] = useState<
    Awaited<ReturnType<typeof referenceDataService.listOrganizationTypes>>
  >([]);
  const [organizationStatuses, setOrganizationStatuses] = useState<
    Awaited<ReturnType<typeof referenceDataService.listOrganizationStatuses>>
  >([]);
  const [countries, setCountries] = useState<
    Awaited<ReturnType<typeof referenceDataService.listCountries>>
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [regions, setRegions] = useState<
    Awaited<ReturnType<typeof referenceDataService.listRegions>>
  >([]);
  const [cities, setCities] = useState<
    Awaited<ReturnType<typeof referenceDataService.listCities>>
  >([]);

  // 3. User changes country
  const handleCountryChange = async (countryCode: string) => {
    const regionList = await referenceDataService.listRegions(countryCode);

    setRegions(regionList);
    setCities([]);
  };

  // 4. User changes region
  const handleRegionChange = async (
    countryCode: string,
    regionCode: string,
  ) => {
    const cityList = await referenceDataService.listCities(
      countryCode,
      regionCode,
    );

    setCities(cityList);
  };
  useEffect(() => {
    let mounted = true;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const [organizationDetails, types, statuses, countryList] =
          await Promise.all([
            organizationService.getOrganizationDetails(organization.id),
            referenceDataService.listOrganizationTypes(),
            referenceDataService.listOrganizationStatuses(),
            referenceDataService.listCountries(),
          ]);

        const countryCode = organizationDetails?.address.countryCode;

        const regionList = countryCode
          ? await referenceDataService.listRegions(countryCode)
          : [];

        const currentRegion = regionList.find(
          (region) =>
            region.code === organizationDetails?.address.region ||
            region.name === organizationDetails?.address.region,
        );

        const cityList =
          countryCode && currentRegion
            ? await referenceDataService.listCities(
                countryCode,
                currentRegion.code,
              )
            : [];

        if (!mounted) return;

        setDetails(organizationDetails);
        setOrganizationTypes(types);
        setOrganizationStatuses(statuses);
        setCountries(countryList);
        setRegions(regionList);
        setCities(cityList);
      } catch (loadError) {
        if (!mounted) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load business information.",
        );
      } finally {
        if (mounted) setLoading(false);
      }
    }

    load();
    return () => {
      mounted = false;
    };
  }, [organization.id]);

  if (loading) {
    return (
      <View style={{ flex: 1 }}>
        <StateView
          kind="loading"
          title="Loading business"
          message="Loading organization information..."
        />
      </View>
    );
  }

  if (error) {
    return (
      <View style={{ flex: 1 }}>
        <StateView
          kind="error"
          title="Unable to load business"
          message={error}
        />
      </View>
    );
  }

  return (
    <BusinessForm
      organization={organization}
      details={details}
      countries={countries}
      regions={regions}
      cities={cities}
      organizationTypes={organizationTypes}
      organizationStatuses={organizationStatuses}
      onCountryChange={handleCountryChange}
      onRegionChange={handleRegionChange}
      onSave={async (
        updatedOrganization: Organization,
        updatedDetails: OrganizationDetails,
      ) => {
        await organizationService.updateOrganization(
          organization.id,
          updatedOrganization,
        );

        // The current mock has no seeded OrganizationDetails row yet. Keep the
        // edited details in screen state until the mock data is seeded; the real
        // service will persist this through updateOrganizationDetails().
        if (details) {
          await organizationService.updateOrganizationDetails(
            organization.id,
            updatedDetails,
          );
        }

        setDetails(updatedDetails);

        Alert.alert(
          "Business updated",
          "Your business information has been saved.",
        );
      }}
    />
  );
}
