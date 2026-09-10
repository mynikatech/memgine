/*
 * Initial Preference Type reference data.
 *
 * Seed these through the normal local-data/reference-data initialization
 * path, not from the Profile screen.
 */
export const INITIAL_PREFERENCE_TYPES = [
  {
    id: "preference-type-notifications",
    preferenceTypeCode: "NOTIFICATIONS",
    preferenceTypeName: "Notifications",
    dataType: "BOOLEAN",
    defaultValue: "true",
    description: "Whether customer notifications are enabled.",
  },
  {
    id: "preference-type-marketing-emails",
    preferenceTypeCode: "MARKETING_EMAILS",
    preferenceTypeName: "Marketing Emails",
    dataType: "BOOLEAN",
    defaultValue: "false",
    description: "Whether customer marketing emails are enabled.",
  },
] as const;
