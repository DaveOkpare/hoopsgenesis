import { Input } from "@hoops-genesis/ui/components/input";
import { Field, FieldMessage, Label } from "@hoops-genesis/ui/components/label";
import { cn } from "@hoops-genesis/ui/lib/utils";
import type { AnyFieldApi } from "@tanstack/react-form";
import {
  type ChangeEvent,
  type ComponentProps,
  type ReactNode,
  useCallback,
} from "react";

/*
 * Text input bound to a TanStack Form field, with label and first error.
 * <form.Field name="email">
 *   {(field) => <FormTextField field={field} label="Email" type="email" />}
 * </form.Field>
 * Optional: `labelAction` sits at the right of the label row ("Forgot password?"),
 * `trailing` sits inside the input on the right (an icon or icon button), `description`
 * is helper text under the input. `className` goes to the input.
 */
export function FormTextField({
  field,
  label,
  labelAction,
  trailing,
  description,
  descriptionClassName,
  className,
  ...inputProps
}: {
  field: AnyFieldApi;
  label: string;
  labelAction?: ReactNode;
  trailing?: ReactNode;
  description?: ReactNode;
  descriptionClassName?: string;
  size?: "default" | "lg";
} & Omit<
  ComponentProps<"input">,
  "id" | "name" | "value" | "onChange" | "onBlur" | "size"
>) {
  const handleChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) =>
      field.handleChange(event.target.value),
    [field]
  );
  const error = field.state.meta.errors[0] as { message?: string } | undefined;
  const errorId = `${field.name}-error`;
  const descriptionId = `${field.name}-description`;
  const describedBy =
    [description ? descriptionId : null, error?.message ? errorId : null]
      .filter(Boolean)
      .join(" ") || undefined;

  const labelNode = <Label htmlFor={field.name}>{label}</Label>;
  const input = (
    <Input
      aria-describedby={describedBy}
      aria-invalid={error ? true : undefined}
      className={cn(trailing ? "pr-12" : null, className)}
      id={field.name}
      name={field.name}
      onBlur={field.handleBlur}
      onChange={handleChange}
      value={field.state.value as string}
      {...inputProps}
    />
  );

  return (
    <Field>
      {labelAction ? (
        <div className="flex items-center justify-between gap-3">
          {labelNode}
          {labelAction}
        </div>
      ) : (
        labelNode
      )}
      {trailing ? (
        <div className="relative">
          {input}
          <div className="absolute inset-y-0 right-4 flex items-center">
            {trailing}
          </div>
        </div>
      ) : (
        input
      )}
      {description ? (
        <FieldMessage className={descriptionClassName} id={descriptionId}>
          {description}
        </FieldMessage>
      ) : null}
      {error?.message ? (
        <FieldMessage id={errorId} role="alert" tone="error">
          {error.message}
        </FieldMessage>
      ) : null}
    </Field>
  );
}
