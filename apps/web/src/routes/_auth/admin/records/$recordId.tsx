import { createFileRoute } from "@tanstack/react-router";

import {
  AdminRecordDetailScreen,
  parseAdminRecordsSearch,
} from "@/features/records/admin-records";

export const Route = createFileRoute("/_auth/admin/records/$recordId")({
  validateSearch: parseAdminRecordsSearch,
  component: RecordPage,
});

function RecordPage() {
  const { recordId } = Route.useParams();
  const { tab } = Route.useSearch();
  return <AdminRecordDetailScreen recordId={recordId} tab={tab} />;
}
