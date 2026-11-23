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
  useUploadRecord,
} from "@/features/student-records/queries";
import { ACADEMIC_KIND_LABEL } from "@/features/student-records/record-data";
import { uploadProblem } from "@/features/student-records/upload-rules";
import {
  emptyUploadForm,
  recordData,
  type UploadFormValues,
  uploadSchema,
} from "@/features/student-records/upload-schema";
import type { DateOnly, Id } from "@/features/types";

/*
 * "Upload a record" (ST-6, 44B-0): pick a type, choose the file, fill the template's
 * fields in the fog card, send. The record is created as pending ("Waiting for review").
 */

const KINDS: AcademicKind[] = ["report_card", "certificate", "other"];

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
}: {
  academyId: Id;
  studentId: Id;
  today: DateOnly;
  initial?: Partial<UploadFormValues>;
}) {
  const navigate = useNavigate();
  const upload = useUploadRecord();

  const form = useForm({
    defaultValues: { ...emptyUploadForm, ...initial },
    validators: { onSubmit: uploadSchema },
    onSubmit: async ({ value }) => {
      if (!value.file) {
        return;
      }
      try {
        const record = await upload.mutateAsync({
          academyId,
          studentId,
          file: value.file,
          recordedOn: today,
          data: recordData(value),
        });
        toast.success("Sent for review");
        await navigate({
          to: "/student/records/$recordId",
          params: { recordId: record.id },
        });
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Upload failed. Try again."
        );
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
      const next = KINDS.find((k) => k === event.currentTarget.dataset.kind);
      if (next) {
        form.setFieldValue("kind", next);
      }
    },
    [form]
  );

  return (
    <form className="flex flex-col gap-5" noValidate onSubmit={handleSubmit}>
      <fieldset className="flex flex-col gap-2">
        <legend className="pb-2 font-semibold text-[13px] text-muted uppercase leading-4 tracking-label">
          Type
        </legend>
        <div className="flex flex-wrap gap-[6px]">
          {KINDS.map((k) => (
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
