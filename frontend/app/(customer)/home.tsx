import { Redirect } from "expo-router";

/**
 * The former always-on business "Home" is replaced by the Memgine platform
 * model: the customer starts at "Your Memberships" and enters a business by
 * selecting a membership. This route redirects to keep any old links working.
 */
export default function CustomerHomeRedirect() {
  return <Redirect href="/cards" />;
}
