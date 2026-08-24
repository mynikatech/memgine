import { useEffect, useState } from "react";
import { Alert, View } from "react-native";

import { Organization, OrganizationDetails, services } from "@/src/core";

import { useBusiness } from "@/src/providers";
import { StateView } from "@/src/ui";
import { BusinessForm } from "@/src/ui/admin/BusinessForm";

export default function OrgAdminBusiness() {
  const { organization } = useBusiness();

  const [details, setDetails] = useState<OrganizationDetails | null>(null);

  const [organizationTypes, setOrganizationTypes] = useState<
    Awaited<ReturnType<typeof services.referenceData.listOrganizationTypes>>
  >([]);

  const [organizationStatuses, setOrganizationStatuses] = useState<
    Awaited<ReturnType<typeof services.status.listOrganizationStatuses>>
  >([]);

  const [countries, setCountries] = useState<
    Awaited<ReturnType<typeof services.referenceData.listCountries>>
  >([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [regions, setRegions] = useState<
    Awaited<ReturnType<typeof services.referenceData.listRegions>>
  >([]);

  const [cities, setCities] = useState<
    Awaited<ReturnType<typeof services.referenceData.listCities>>
  >([]);

  const handleCountryChange = async (countryCode: string) => {
    try {
      const regionList = await services.referenceData.listRegions(countryCode);

      setRegions(regionList);
      setCities([]);
    } catch (loadError) {
      Alert.alert(
        "Unable to load regions",
        loadError instanceof Error
          ? loadError.message
          : "Unable to load regions.",
      );
    }
  };

  const handleRegionChange = async (
    countryCode: string,
    regionCode: string,
  ) => {
    try {
      const cityList = await services.referenceData.listCities(
        countryCode,
        regionCode,
      );

      setCities(cityList);
    } catch (loadError) {
      Alert.alert(
        "Unable to load cities",
        loadError instanceof Error
          ? loadError.message
          : "Unable to load cities.",
      );
    }
  };

  useEffect(() => {
    let mounted = true;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const [organizationDetails, types, statuses, countryList] =
          await Promise.all([
            services.organization.getOrganizationDetails(organization.id),
            services.referenceData.listOrganizationTypes(),
            services.status.listOrganizationStatuses(),
            services.referenceData.listCountries(),
          ]);

        const countryCode = organizationDetails?.address.countryCode;

        const regionList = countryCode
          ? await services.referenceData.listRegions(countryCode)
          : [];

        const currentRegion = regionList.find(
          (region) =>
            region.code === organizationDetails?.address.region ||
            region.name === organizationDetails?.address.region,
        );

        const cityList =
          countryCode && currentRegion
            ? await services.referenceData.listCities(
                countryCode,
                currentRegion.code,
              )
            : [];

        if (!mounted) {
          return;
        }

        setDetails(organizationDetails);
        setOrganizationTypes(types);
        setOrganizationStatuses(statuses);
        setCountries(countryList);
        setRegions(regionList);
        setCities(cityList);
      } catch (loadError) {
        if (!mounted) {
          return;
        }

        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load business information.",
        );
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    void load();

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
        try {
          await services.organization.updateOrganization(
            organization.id,
            updatedOrganization,
          );

          await services.organization.updateOrganizationDetails(
            organization.id,
            updatedDetails,
          );

          setDetails(updatedDetails);

          Alert.alert(
            "Business updated",
            "Your business information has been saved.",
          );
        } catch (saveError) {
          Alert.alert(
            "Unable to save business",
            saveError instanceof Error
              ? saveError.message
              : "Unable to save business information.",
          );
        }
      }}
    />
  );
}
