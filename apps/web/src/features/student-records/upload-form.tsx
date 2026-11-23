import { Button } from "@hoops-genesis/ui/components/button";
import { FilterChip } from "@hoops-genesis/ui/components/chip";
import { FieldMessage } from "@hoops-genesis/ui/components/label";
import { cn } from "@hoops-genesis/ui/lib/utils";
import { type AnyFieldApi, useForm, useStore } from "@tanstack/react-form";
import { useNavigate } from "@tanstack/react-router";
import {
  type ChangeEvent,
  type FormEvent,
  type MouseEvent,
  type ReactNode,
  useCallback,
} from "react";
import { toast } from "sonner";

import { FilePicker } from "@/features/student-records/file-picker";
import {
  type AcademicKind,
  type RecordTemplate,
  useUploadRecord,
} from "@/features/student-records/queries";
import { ACADEMIC_KIND_LABEL } from "@/features/student-records/record-data";
import { uploadProblem } from "@/features/student-records/upload-rules";
import {
  emptyUploadForm,
  recordData,
  templateFields,
  type UploadFormValues,
  uploadSchemaFor,
} from "@/features/student-records/upload-schema";
import type { DateOnly, Id } from "@/features/types";
import { errorMessage, isApiError } from "@/lib/api-client";

/*
 * "Upload a record" (ST-6, 44B-0): pick a type, choose the file, fill the template's
 * fields in the fog card, send. The record is created as pending ("Waiting for review").
 */

const KINDS: AcademicKind[] = ["report_card", "certificate", "other"];

/** Server field (`data.<name>`) -> form field, for the server's validation errors. */
const SERVER_FIELDS: Record<string, keyof UploadFormValues> = {
  schoolName: "school",
  term: "term",
  schoolYear: "schoolYear",
  subjects: "subjects",
  averageScore: "average",
};

function formFieldFor(path: string): keyof UploadFormValues | null {
  const [, field] = path.split(".");
  return field ? (SERVER_FIELDS[field] ?? null) : null;
}

/** 400 `invalid_record_data` issues (`data.term`, ...) as form field errors. */
function serverFieldErrors(error: unknown): [keyof UploadFormValues, string][] {
  if (!isApiError(error, "invalid_record_data")) {
    return [];
  }
  const issues = (error.details as { issues?: unknown } | null)?.issues;
  return (Array.isArray(issues) ? issues : []).flatMap((issue: unknown) => {
    const { path, message } = issue as { path?: string; message?: string };
    const field = path ? formFieldFor(path) : null;
    return field && message ? [[field, message] as const] : [];
  }) as [keyof UploadFormValues, string][];
}

function errorText(field: AnyFieldApi): string | null {
  const [first] = field.state.meta.errors as (
    | string
    | { message?: string }
    | undefined
  )[];
  if (!first) {
    return null;
  }
  return typeof first === "string" ? first : (first.message ?? null);
}

/** One row of the fog card: label on the left, value typed in on the right. */
function TemplateRow({
  field,
  label,
  error,
  children,
}: {
  field: string;
  label: string;
  error: string | null;
  children: ReactNode;
}) {
  return (
    <div className="border-line border-b last:border-b-0">
      <div className="flex items-center justify-between gap-4 py-[14px]">
        <label
          className="shrink-0 text-[15px] text-muted leading-[18px]"
          htmlFor={field}
        >
          {label}
        </label>
        {children}
      </div>
      {error ? (
        <FieldMessage className="-mt-1 pb-3" id={`${field}-error`} tone="error">
          {error}
        </FieldMessage>
      ) : null}
    </div>
  );
}

const valueInput =
  "min-w-0 flex-1 rounded-sm bg-transparent text-right font-medium text-[15px] text-ink leading-[18px] outline-none placeholder:font-regular placeholder:text-[#8A8A8A] focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-4 focus-visible:ring-offset-fog";

function TextValue({
  field,
  placeholder,
  inputMode,
  className,
  label,
}: {
  field: AnyFieldApi;
  placeholder?: string;
  inputMode?: "numeric" | "decimal";
  className?: string;
  label?: string;
}) {
  const handleChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) =>
      field.handleChange(event.target.value),
    [field]
  );
  const error = errorText(field);
  return (
    <input
      aria-describedby={error ? `${field.name}-error` : undefined}
      aria-invalid={error ? true : undefined}
      aria-label={label}
      className={cn(valueInput, className)}
      id={field.name}
      inputMode={inputMode}
      name={field.name}
      onBlur={field.handleBlur}
      onChange={handleChange}
      placeholder={placeholder}
      value={field.state.value as string}
    />
  );
}

export function UploadForm({
  academyId,
  studentId,
  today,
  initial,
  templates,
}: {
  academyId: Id;
  studentId: Id;
  today: DateOnly;
  initial?: Partial<UploadFormValues>;
  /** Academic record templates (GET /record-templates): which kinds and fields exist. */
  templates: RecordTemplate[];
}) {
  const navigate = useNavigate();
  const upload = useUploadRecord();
  const templateFor = (k: AcademicKind) =>
    templates.find((template) => template.key === k);
  const kinds = KINDS.filter((k) => templateFor(k));
  const fieldsFor = (k: AcademicKind) => templateFields(templateFor(k));

  const form = useForm({
    defaultValues: { ...emptyUploadForm, ...initial },
    validators: { onSubmit: uploadSchemaFor(fieldsFor) },
    onSubmit: async ({ value, formApi }) => {
      if (!value.file) {
        return;
      }
      try {
        const { record, fileSaved } = await upload.mutateAsync({
          academyId,
          studentId,
          file: value.file,
          recordedOn: today,
          schemaVersion: templateFor(value.kind)?.schemaVersion ?? 1,
          data: recordData(value, fieldsFor(value.kind)),
        });
        if (fileSaved) {
          toast.success("Sent for review");
        } else {
          // 503 storage_not_configured: the details were saved, the file was not.
          toast.warning(
            "Sent for review without the file: file uploads aren’t set up yet. Show your coach the paper copy."
          );
        }
        await navigate({
          to: "/student/records/$recordId",
          params: { recordId: record.id },
        });
      } catch (error) {
        const fieldErrors = serverFieldErrors(error);
        for (const [field, message] of fieldErrors) {
          formApi.setFieldMeta(field, (meta) => ({
            ...meta,
            errorMap: { ...meta.errorMap, onSubmit: message },
          }));
        }
        if (fieldErrors.length === 0) {
          toast.error(errorMessage(error, "Upload failed. Try again."));
        }
      }
    },
  });
  const kind = useStore(form.store, (state) => state.values.kind);
  const isSubmitting = useStore(form.store, (state) => state.isSubmitting);

  const handleSubmit = useCallback(
    (event: FormEvent) => {
      event.preventDefault();
      event.stopPropagation();
      form.handleSubmit();
    },
    [form]
  );
  const selectKind = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      const next = kinds.find((k) => k === event.currentTarget.dataset.kind);
      if (next) {
        form.setFieldValue("kind", next);
      }
    },
    [form, kinds]
  );
  const fields = fieldsFor(kind);

  return (
    <form className="flex flex-col gap-5" noValidate onSubmit={handleSubmit}>
      <fieldset className="flex flex-col gap-2">
        <legend className="pb-2 font-semibold text-[13px] text-muted uppercase leading-4 tracking-label">
          Type
        </legend>
        <div className="flex flex-wrap gap-[6px]">
          {kinds.map((k) => (
            <FilterChip
              className="px-[14px]"
              data-kind={k}
              key={k}
              onClick={selectKind}
              selected={kind === k}
            >
              {ACADEMIC_KIND_LABEL[k]}
            </FilterChip>
          ))}
        </div>
      </fieldset>

      <form.Field
        name="file"
        validators={{
          onChange: ({ value }) => (value ? uploadProblem(value) : undefined),
        }}
      >
        {(field) => {
          const error = errorText(field);
          return (
            <div className="flex flex-col gap-2">
              <FilePicker
                describedBy={error ? "file-error" : undefined}
                file={field.state.value}
                id="file"
                invalid={Boolean(error)}
                onBlur={field.handleBlur}
                onChange={field.handleChange}
              />
              {error ? (
                <FieldMessage id="file-error" role="alert" tone="error">
                  {error}
                </FieldMessage>
              ) : null}
            </div>
          );
        }}
      </form.Field>

      <div className="flex flex-col rounded-md bg-fog px-4">
        {kind === "report_card" ? (
          <>
            <form.Field name="school">
              {(field) => (
                <TemplateRow
                  error={errorText(field)}
                  field="school"
                  label="School"
                >
                  <TextValue
                    field={field}
                    placeholder="Kigali Parents School"
                  />
                </TemplateRow>
              )}
            </form.Field>
            <form.Field name="term">
              {(field) => (
                <TemplateRow error={errorText(field)} field="term" label="Term">
                  <TextValue field={field} placeholder="Term 3, 2026" />
                </TemplateRow>
              )}
            </form.Field>
            {fields.has("schoolYear") ? (
              <form.Field name="schoolYear">
                {(field) => (
                  <TemplateRow
                    error={errorText(field)}
                    field="schoolYear"
                    label="School year"
                  >
                    <TextValue field={field} placeholder="2026/2027" />
                  </TemplateRow>
                )}
              </form.Field>
            ) : null}
            {fields.has("subjects") ? (
              <form.Field name="subjects">
                {(field) => (
                  <TemplateRow
                    error={errorText(field)}
                    field="subjects"
                    label="Subjects"
                  >
                    <TextValue
                      field={field}
                      placeholder="Maths A1, English B+"
                    />
                  </TemplateRow>
                )}
              </form.Field>
            ) : null}
            <form.Field name="average">
              {(field) => (
                <TemplateRow
                  error={errorText(field)}
                  field="average"
                  label="Average"
                >
                  <TextValue
                    field={field}
                    inputMode="decimal"
                    placeholder="%"
                  />
                </TemplateRow>
              )}
            </form.Field>
            {fields.has("position") ? (
              <form.Field name="position">
                {(field) => (
                  <TemplateRow
                    error={errorText(field)}
                    field="position"
                    label="Position in class"
                  >
                    <span className="flex min-w-0 items-center justify-end gap-[6px] font-medium text-[15px] text-ink leading-[18px]">
                      <TextValue
                        className="w-10 flex-none"
                        field={field}
                        inputMode="numeric"
                        placeholder="6"
                      />
                      <span aria-hidden="true">of</span>
                      <form.Field name="classSize">
                        {(sizeField) => (
                          <TextValue
                            className="w-10 flex-none"
                            field={sizeField}
                            inputMode="numeric"
                            label="Class size"
                            placeholder="42"
                          />
                        )}
                      </form.Field>
                    </span>
                  </TemplateRow>
                )}
              </form.Field>
            ) : null}
          </>
        ) : null}
        {kind === "report_card" ? null : (
          <form.Field name="title">
            {(field) => (
              <TemplateRow
                error={errorText(field)}
                field="title"
                label={kind === "certificate" ? "Certificate" : "Title"}
              >
                <TextValue
                  field={field}
                  placeholder={
                    kind === "certificate" ? "First aid" : "What is it?"
                  }
                />
              </TemplateRow>
            )}
          </form.Field>
        )}
        {kind === "certificate" ? (
          <form.Field name="issuedBy">
            {(field) => (
              <TemplateRow
                error={errorText(field)}
                field="issuedBy"
                label="Issued by"
              >
                <TextValue field={field} placeholder="Rwanda Red Cross" />
              </TemplateRow>
            )}
          </form.Field>
        ) : null}
        {kind === "other" ? (
          <form.Field name="note">
            {(field) => (
              <TemplateRow error={errorText(field)} field="note" label="Note">
                <TextValue field={field} placeholder="Optional" />
              </TemplateRow>
            )}
          </form.Field>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <Button
          className="w-full p-4 text-base leading-5"
          disabled={isSubmitting}
          type="submit"
        >
          {isSubmitting ? "Sending…" : "Send for review"}
        </Button>
        <p className="text-center text-[13px] text-muted leading-4">
          You can edit or delete it until your coach reviews it
        </p>
      </div>
    </form>
  );
}
