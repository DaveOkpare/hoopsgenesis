import {
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";

import {
  getRecord,
  type ListRecordsParams,
  listStudentRecords,
  uploadRecord,
} from "@/features/student-records/api";
import type { Id } from "@/features/types";

export type {
  AcademicKind,
  PersonRef,
  StudentRecordView,
} from "@/features/student-records/api";

export const studentRecordKeys = {
  all: (academyId: Id) => ["academies", academyId, "records"] as const,
  list: (academyId: Id, studentId: Id, params: ListRecordsParams) =>
    [
      ...studentRecordKeys.all(academyId),
      "student",
      studentId,
      params,
    ] as const,
  detail: (academyId: Id, recordId: Id) =>
    [...studentRecordKeys.all(academyId), "detail", recordId] as const,
};

export function studentRecordsQueryOptions(
  academyId: Id,
  studentId: Id,
  params: ListRecordsParams = {}
) {
  return queryOptions({
    queryKey: studentRecordKeys.list(academyId, studentId, params),
    queryFn: () => listStudentRecords(academyId, studentId, params),
    select: (page) => page.data,
  });
}

export function recordQueryOptions(academyId: Id, recordId: Id) {
  return queryOptions({
    queryKey: studentRecordKeys.detail(academyId, recordId),
    queryFn: () => getRecord(academyId, recordId),
    retry: false,
  });
}

/** Upload + create the record; the new pending record is cached and lists refetch. */
export function useUploadRecord() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: uploadRecord,
    onSuccess: async (record) => {
      queryClient.setQueryData(
        studentRecordKeys.detail(record.academyId, record.id),
        record
      );
      await queryClient.invalidateQueries({
        queryKey: studentRecordKeys.all(record.academyId),
        predicate: (query) => query.queryKey[3] === "student",
      });
    },
  });
}
