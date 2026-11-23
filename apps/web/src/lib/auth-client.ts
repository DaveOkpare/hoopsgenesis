import {
  organizationSchema,
  userAdditionalFields,
} from "@hoops-genesis/auth/additional-fields";
import { ac, academyRoles } from "@hoops-genesis/auth/permissions";
import {
  adminClient,
  inferAdditionalFields,
  inferOrgAdditionalFields,
  organizationClient,
} from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  plugins: [
    inferAdditionalFields({ user: userAdditionalFields }),
    adminClient(),
    organizationClient({
      ac,
      roles: academyRoles,
      teams: { enabled: true },
      schema: inferOrgAdditionalFields(organizationSchema),
    }),
  ],
});
