/**
 * Extra columns on Better Auth tables, shared by the server config and the
 * clients (for type inference). Keep this file free of server-only imports.
 */

export const userAdditionalFields = {
  phone: { type: "string", required: false, input: true },
  dateOfBirth: { type: "date", required: false, input: true },
} as const;

export const organizationSchema = {
  organization: {
    additionalFields: {
      location: { type: "string", required: false, input: true },
      /** IANA time zone name, e.g. Africa/Lagos. */
      timezone: { type: "string", required: true, input: true },
      /** ISO 4217 code, the default currency for new fees. */
      defaultCurrency: { type: "string", required: true, input: true },
    },
  },
  team: {
    additionalFields: {
      /** e.g. U12 */
      ageGroup: { type: "string", required: false, input: true },
    },
  },
} as const;
