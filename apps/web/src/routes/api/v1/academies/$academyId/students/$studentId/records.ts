import { createFileRoute } from "@tanstack/react-router";

import {
  createStudentRecord,
  listStudentRecords,
} from "@/server/api/v1/records";

export const Route = createFileRoute(
  "/api/v1/academies/$academyId/students/$studentId/records"
)({
  server: {
    handlers: {
      GET: listStudentRecords,
      POST: createStudentRecord,
    },
  },
});
