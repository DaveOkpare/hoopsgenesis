import {
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";

import {
  getRecord,
  type ListRecordsParams,
  listRecordTemplates,
  listStudentRecords,
  uploadRecord,
} from "@/features/student-records/api";
import type { Id, RecordType } from "@/features/types";

export type {
  AcademicKind,
  PersonRef,
  RecordMetric,
  RecordTemplate,
  StudentRecordView,
  UploadRecordResult,
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
  templates: (academyId: Id, recordType: RecordType | undefined) =>
    ["academies", academyId, "record-templates", recordType ?? "all"] as const,
};

/** The record templates (app config on the server; they rarely change). */
export function recordTemplatesQueryOptions(
  academyId: Id,
  recordType?: RecordType
) {
  return queryOptions({
    queryKey: studentRecordKeys.templates(academyId, recordType),
    queryFn: () => listRecordTemplates(academyId, recordType),
    staleTime: Number.POSITIVE_INFINITY,
  });
}

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
    onSuccess: async ({ record }) => {
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
