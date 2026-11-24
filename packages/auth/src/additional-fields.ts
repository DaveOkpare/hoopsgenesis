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
      /** Academy venue, in decimal degrees. QR scans are measured from here. */
      latitude: { type: "number", required: true, input: true },
      longitude: { type: "number", required: true, input: true },
      /** How far from the coordinates a QR scan may be, in metres. */
      attendanceRadiusM: {
        type: "number",
        required: false,
        defaultValue: 150,
        input: true,
      },
      /**
       * Random value baked into the academy's printed QR code. Set on the
       * server when the academy is created (never from the client);
       * regenerating it retires old prints. Never returned by Better Auth
       * (organization list, get-full-organization, set-active): server code
       * reads it through Prisma, and admins get the QR from
       * GET /api/v1/academies/:id/academy-qr.
       */
      qrNonce: {
        type: "string",
        required: false,
        input: false,
        returned: false,
      },
    },
  },
  team: {
    additionalFields: {
      /** e.g. U12 */
      ageGroup: { type: "string", required: false, input: true },
    },
  },
} as const;
