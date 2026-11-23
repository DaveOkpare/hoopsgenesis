import { expoClient } from "@better-auth/expo/client";
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
import Constants from "expo-constants";
import {
  getItem,
  getItemAsync,
  setItem,
  setItemAsync,
} from "expo-secure-store";

import { ENV } from "../src/env";

export const authClient = createAuthClient({
  baseURL: ENV.EXPO_PUBLIC_SERVER_URL,
  plugins: [
    expoClient({
      scheme: Constants.expoConfig?.scheme as string,
      storagePrefix: Constants.expoConfig?.scheme as string,
      storage: { getItem, getItemAsync, setItem, setItemAsync },
    }),
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
