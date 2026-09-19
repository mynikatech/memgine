import { Redirect } from "expo-router";

import { APP_ROUTES } from "@/src/constants/navigation";
import { useBusiness } from "@/src/providers";

/** DEV entry seam; the resulting Org Admin URL is always organization scoped. */
export default function OrgAdminDevEntry() {
  const { organization } = useBusiness();
  return (
    <Redirect href={APP_ROUTES.orgAdmin.organization(organization.id) as never} />
  );
}
