import { Redirect } from "expo-router";

import { APP_ROUTES } from "@/src/constants/navigation";

/** DEV entry seam; the resulting Org Admin URL is always organization scoped. */
export default function OrgAdminDevEntry() {
  return <Redirect href={APP_ROUTES.workspaces as never} />;
}
