import { createFileRoute } from "@tanstack/react-router";

import { AcademySettingsScreen } from "@/features/academy-settings/settings-screen";
import { useActiveMembership } from "@/features/viewer/queries";

export const Route = createFileRoute("/_auth/admin/settings")({
  component: AcademySettingsPage,
});

function AcademySettingsPage() {
  const academyId = useActiveMembership()?.academy.id;
  if (!academyId) {
    return null;
  }
  return <AcademySettingsScreen academyId={academyId} key={academyId} />;
}
