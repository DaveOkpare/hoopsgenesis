import { Button, buttonVariants } from "@hoops-genesis/ui/components/button";
import { Input } from "@hoops-genesis/ui/components/input";
import { Field, FieldMessage, Label } from "@hoops-genesis/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@hoops-genesis/ui/components/select";
import { cn } from "@hoops-genesis/ui/lib/utils";
import { type AnyFieldApi, useForm } from "@tanstack/react-form";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import z from "zod";

import {
  type LatLng,
  MockMap,
  RadiusSlider,
} from "@/features/owner-academies/location-picker";
import {
  type Place,
  placesQueryOptions,
  platformAcademiesQueryOptions,
  useCreateAcademy,
} from "@/features/owner-academies/queries";

const TIME_ZONES = [
  { value: "Africa/Kigali", label: "Africa/Kigali" },
  { value: "Africa/Kampala", label: "Africa/Kampala" },
  { value: "Africa/Nairobi", label: "Africa/Nairobi" },
  { value: "Asia/Kolkata", label: "Asia/Kolkata" },
];

const CURRENCIES = [
  { value: "RWF", label: "RWF · Rwandan franc" },
  { value: "UGX", label: "UGX · Ugandan shilling" },
  { value: "KES", label: "KES · Kenyan shilling" },
  { value: "INR", label: "INR · Indian rupee" },
  { value: "USD", label: "USD · US dollar" },
];

const DEFAULT_RADIUS_M = 150;
/** Where the map opens before an address is picked (Kigali). */
const DEFAULT_CENTER: LatLng = { latitude: -1.9441, longitude: 30.0619 };
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const NON_SLUG_CHARS = /[^a-z0-9]+/g;
const EDGE_DASHES = /^-+|-+$/g;
const MIN_NAME = 3;

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(NON_SLUG_CHARS, "-")
    .replace(EDGE_DASHES, "");
}

function buildSchema(takenSlugs: string[]) {
  return z.object({
    name: z.string().trim().min(MIN_NAME, "Enter the academy's name"),
    slug: z
      .string()
      .regex(SLUG_PATTERN, "Use lowercase letters, numbers and dashes")
      .refine((slug) => !takenSlugs.includes(slug), "This address is taken"),
    timezone: z.string().min(1, "Pick a time zone"),
    defaultCurrency: z.string().min(1, "Pick a currency"),
    address: z.string().trim().min(1, "Search for the academy's address"),
    latitude: z
      .number()
      .nullable()
      .refine((value) => value !== null, "Drop the pin on the entrance"),
    longitude: z.number().nullable(),
    attendanceRadiusM: z.number().min(50).max(500),
    adminEmail: z.email("Enter the admin's email address"),
  });
}

interface FormValues {
  address: string;
  adminEmail: string;
  attendanceRadiusM: number;
  defaultCurrency: string;
  latitude: number | null;
  longitude: number | null;
  name: string;
  slug: string;
  timezone: string;
}

const DEFAULT_VALUES: FormValues = {
  name: "",
  slug: "",
  timezone: "",
  defaultCurrency: "",
  address: "",
  latitude: null,
  longitude: null,
  attendanceRadiusM: DEFAULT_RADIUS_M,
  adminEmail: "",
};

function fieldError(field: AnyFieldApi): string | undefined {
  const error = field.state.meta.errors[0] as { message?: string } | undefined;
  return error?.message;
}

function StepHeading({
  step,
  done = true,
  id,
  children,
}: {
  step: number;
  done?: boolean;
  id?: string;
  children: ReactNode;
}) {
  return (
    <h2 className="flex items-center gap-[10px]" id={id}>
      <span
        aria-hidden="true"
        className={cn(
          "flex size-[26px] shrink-0 items-center justify-center rounded-full font-bold text-[13px] leading-4",
          done
            ? "bg-ink text-white"
            : "border-[#C8C8C8] border-[1.5px] text-muted"
        )}
      >
        {step}
      </span>
      <span className="font-semibold text-[17px] text-ink leading-[22px]">
        {children}
      </span>
    </h2>
  );
}

function Hint({
  field,
  id,
  children,
}: {
  field: AnyFieldApi;
  id: string;
  children?: ReactNode;
}) {
  const error = fieldError(field);
  if (error) {
    return (
      <FieldMessage id={id} tone="error">
        {error}
      </FieldMessage>
    );
  }
  return children ? <FieldMessage id={id}>{children}</FieldMessage> : null;
}

function NameField({
  field,
  onNameChange,
}: {
  field: AnyFieldApi;
  onNameChange: (name: string) => void;
}) {
  const handleChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      field.handleChange(event.target.value);
      onNameChange(event.target.value);
    },
    [field, onNameChange]
  );
  return (
    <Field>
      <Label htmlFor="academy-name">Academy name</Label>
      <Input
        aria-describedby="academy-name-hint"
        aria-invalid={fieldError(field) ? true : undefined}
        autoComplete="off"
        id="academy-name"
        name={field.name}
        onBlur={field.handleBlur}
        onChange={handleChange}
        placeholder="Hoops Genesis Mumbai"
        value={field.state.value as string}
      />
      <Hint field={field} id="academy-name-hint" />
    </Field>
  );
}

function SlugField({
  field,
  onEdited,
}: {
  field: AnyFieldApi;
  onEdited: () => void;
}) {
  const handleChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      field.handleChange(event.target.value.toLowerCase());
      onEdited();
    },
    [field, onEdited]
  );
  const invalid = Boolean(fieldError(field));
  return (
    <Field>
      <Label htmlFor="academy-slug">Web address</Label>
      <div
        className={cn(
          "flex min-w-0 items-center rounded-[14px] border-2 border-transparent bg-fog px-[14px] py-3 text-[15px] leading-[18px] transition-colors focus-within:border-ink focus-within:bg-white",
          invalid && "border-orange-deep bg-white"
        )}
      >
        <span className="shrink-0 text-muted max-md:hidden">
          app.hoopsgenesis.com/
        </span>
        <span className="shrink-0 text-muted md:hidden">…/</span>
        <input
          aria-describedby="academy-slug-hint"
          aria-invalid={invalid || undefined}
          autoCapitalize="none"
          autoComplete="off"
          className="min-w-0 flex-1 bg-transparent text-ink outline-none placeholder:text-muted"
          id="academy-slug"
          name={field.name}
          onBlur={field.handleBlur}
          onChange={handleChange}
          placeholder="hoops-genesis-mumbai"
          spellCheck={false}
          value={field.state.value as string}
        />
      </div>
      <Hint field={field} id="academy-slug-hint">
        Made from the name. You can edit it.
      </Hint>
    </Field>
  );
}

function SelectField({
  field,
  id,
  label,
  items,
  placeholder,
  hint,
}: {
  field: AnyFieldApi;
  id: string;
  label: string;
  items: { value: string; label: string }[];
  placeholder: string;
  hint?: string;
}) {
  const handleChange = useCallback(
    (next: string | null) => field.handleChange(next ?? ""),
    [field]
  );
  const value = (field.state.value as string) || null;
  return (
    <Field className="min-w-0 flex-1">
      <Label htmlFor={id}>{label}</Label>
      <Select items={items} onValueChange={handleChange} value={value}>
        <SelectTrigger
          aria-describedby={`${id}-hint`}
          aria-invalid={fieldError(field) ? true : undefined}
          id={id}
        >
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Hint field={field} id={`${id}-hint`}>
        {hint}
      </Hint>
    </Field>
  );
}

function AddressField({
  field,
  places,
  onPlace,
}: {
  field: AnyFieldApi;
  places: Place[];
  onPlace: (place: Place) => void;
}) {
  const pick = useCallback(
    (text: string) => {
      const needle = text.trim().toLowerCase();
      const exact = places.find((p) => p.label.toLowerCase() === needle);
      const match =
        exact ??
        (needle
          ? places.find((p) => p.label.toLowerCase().includes(needle))
          : undefined);
      if (match) {
        field.handleChange(match.label);
        onPlace(match);
      }
      return Boolean(exact);
    },
    [field, onPlace, places]
  );
  const handleChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      field.handleChange(event.target.value);
      const exact = places.find((p) => p.label === event.target.value);
      if (exact) {
        onPlace(exact);
      }
    },
    [field, onPlace, places]
  );
  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") {
        event.preventDefault();
        pick(event.currentTarget.value);
      }
    },
    [pick]
  );
  const invalid = Boolean(fieldError(field));
  return (
    <Field>
      <label
        className={cn(
          "flex min-w-0 cursor-text items-center gap-2 rounded-full border border-line bg-white px-[14px] py-3 transition-colors focus-within:border-ink",
          invalid && "border-orange-deep"
        )}
      >
        <svg
          aria-hidden="true"
          className="shrink-0 text-muted"
          height="16"
          viewBox="0 0 16 16"
          width="16"
        >
          <circle
            cx="7"
            cy="7"
            fill="none"
            r="4.8"
            stroke="currentColor"
            strokeWidth="1.6"
          />
          <path
            d="M10.6 10.6L14 14"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeWidth="1.6"
          />
        </svg>
        <input
          aria-describedby="academy-address-hint"
          aria-invalid={invalid || undefined}
          aria-label="Academy address"
          autoComplete="off"
          className="min-w-0 flex-1 bg-transparent text-ink text-sm leading-[18px] outline-none placeholder:text-muted"
          id="academy-address"
          list="academy-address-places"
          name={field.name}
          onBlur={field.handleBlur}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder="Search the address"
          value={field.state.value as string}
        />
        <datalist id="academy-address-places">
          {places.map((p) => (
            <option key={p.label} value={p.label} />
          ))}
        </datalist>
      </label>
      <Hint field={field} id="academy-address-hint" />
    </Field>
  );
}

function AdminEmailField({ field }: { field: AnyFieldApi }) {
  const handleChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) =>
      field.handleChange(event.target.value),
    [field]
  );
  return (
    <>
      <Input
        aria-describedby="admin-email-hint"
        aria-invalid={fieldError(field) ? true : undefined}
        aria-labelledby="invite-admin-heading"
        autoComplete="off"
        id="admin-email"
        name={field.name}
        onBlur={field.handleBlur}
        onChange={handleChange}
        placeholder="name@example.com"
        type="email"
        value={field.state.value as string}
      />
      <Hint field={field} id="admin-email-hint">
        The academy shows “Admin invited” until they accept. Admins run the
        academy day to day.
      </Hint>
    </>
  );
}

const selectLocation = (state: { values: FormValues }) => ({
  latitude: state.values.latitude,
  longitude: state.values.longitude,
  radius: state.values.attendanceRadiusM,
});

const selectSubmitting = (state: { isSubmitting: boolean }) =>
  state.isSubmitting;

/** "[Owner] Create academy" (PA-1). `showErrors` runs validation on load (for review). */
export function CreateAcademyForm({
  showErrors = false,
}: {
  showErrors?: boolean;
}) {
  const navigate = useNavigate();
  const { data: academies } = useSuspenseQuery(platformAcademiesQueryOptions());
  const { data: places } = useSuspenseQuery(placesQueryOptions());
  const create = useCreateAcademy();
  const [center, setCenter] = useState<LatLng>(DEFAULT_CENTER);
  const slugEdited = useRef<boolean>(false);

  const schema = useMemo(
    () => buildSchema(academies.map((a) => a.academy.slug)),
    [academies]
  );

  const form = useForm({
    defaultValues: DEFAULT_VALUES,
    validators: { onSubmit: schema },
    onSubmit: async ({ value }) => {
      if (value.latitude === null || value.longitude === null) {
        return;
      }
      try {
        const row = await create.mutateAsync({
          name: value.name.trim(),
          slug: value.slug,
          timezone: value.timezone,
          defaultCurrency: value.defaultCurrency,
          address: value.address.trim(),
          latitude: value.latitude,
          longitude: value.longitude,
          attendanceRadiusM: value.attendanceRadiusM,
          adminEmail: value.adminEmail.trim(),
        });
        toast.success(`${row.academy.name} is ready`, {
          description: `Invite sent to ${value.adminEmail.trim()}.`,
        });
        await navigate({
          to: "/owner/academies/$academyId",
          params: { academyId: row.academy.id },
        });
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "Could not create the academy"
        );
      }
    },
  });

  useEffect(() => {
    if (showErrors) {
      form.handleSubmit();
    }
  }, [showErrors, form]);

  const handleNameChange = useCallback(
    (name: string) => {
      if (!slugEdited.current) {
        form.setFieldValue("slug", slugify(name));
      }
    },
    [form]
  );
  const markSlugEdited = useCallback(() => {
    slugEdited.current = true;
  }, []);

  const handlePlace = useCallback(
    (place: Place) => {
      const point = { latitude: place.latitude, longitude: place.longitude };
      setCenter(point);
      form.setFieldValue("latitude", point.latitude);
      form.setFieldValue("longitude", point.longitude);
      form.setFieldValue("timezone", place.timezone);
      form.setFieldValue("defaultCurrency", place.currency);
    },
    [form]
  );

  const handlePinChange = useCallback(
    (pin: LatLng) => {
      form.setFieldValue("latitude", pin.latitude);
      form.setFieldValue("longitude", pin.longitude);
      form.validateField("latitude", "change");
    },
    [form]
  );
  const handleRadiusChange = useCallback(
    (radius: number) => form.setFieldValue("attendanceRadiusM", radius),
    [form]
  );

  const handleSubmit = useCallback(
    (event: FormEvent) => {
      event.preventDefault();
      event.stopPropagation();
      form.handleSubmit();
    },
    [form]
  );

  return (
    <form
      className="flex flex-col gap-8 max-md:gap-[18px]"
      noValidate
      onSubmit={handleSubmit}
    >
      <div className="flex w-full items-start gap-4 max-md:flex-col">
        <section
          aria-labelledby="details-heading"
          className="flex min-w-0 flex-1 flex-col gap-[18px] rounded-[20px] border border-line p-6 max-md:w-full max-md:p-5"
        >
          <StepHeading id="details-heading" step={1}>
            Details
          </StepHeading>
          <form.Field name="name">
            {(field) => (
              <NameField field={field} onNameChange={handleNameChange} />
            )}
          </form.Field>
          <form.Field name="slug">
            {(field) => <SlugField field={field} onEdited={markSlugEdited} />}
          </form.Field>
          <div className="flex gap-3 max-md:flex-col max-md:gap-[18px]">
            <form.Field name="timezone">
              {(field) => (
                <SelectField
                  field={field}
                  hint="Set from the pin"
                  id="academy-timezone"
                  items={TIME_ZONES}
                  label="Time zone"
                  placeholder="Choose a time zone"
                />
              )}
            </form.Field>
            <form.Field name="defaultCurrency">
              {(field) => (
                <SelectField
                  field={field}
                  id="academy-currency"
                  items={CURRENCIES}
                  label="Default currency"
                  placeholder="Choose a currency"
                />
              )}
            </form.Field>
          </div>
          <div className="flex flex-col gap-2 border-line border-t pt-2">
            <div className="pt-[10px]">
              <StepHeading done={false} id="invite-admin-heading" step={3}>
                Invite the academy admin
              </StepHeading>
            </div>
            <form.Field name="adminEmail">
              {(field) => <AdminEmailField field={field} />}
            </form.Field>
          </div>
        </section>

        <section
          aria-labelledby="location-heading"
          className="flex min-w-0 flex-[1.15] flex-col gap-4 rounded-[20px] border border-line p-6 max-md:w-full max-md:p-5"
        >
          <StepHeading id="location-heading" step={2}>
            Location
          </StepHeading>
          <form.Field name="address">
            {(field) => (
              <AddressField
                field={field}
                onPlace={handlePlace}
                places={places}
              />
            )}
          </form.Field>
          <form.Subscribe selector={selectLocation}>
            {({ latitude, longitude, radius }) => (
              <>
                <form.Field name="latitude">
                  {(field) => (
                    <div className="flex flex-col gap-2">
                      <MockMap
                        center={center}
                        invalid={Boolean(fieldError(field))}
                        onPinChange={handlePinChange}
                        pin={
                          latitude === null || longitude === null
                            ? null
                            : { latitude, longitude }
                        }
                        radiusM={radius}
                      />
                      <Hint field={field} id="academy-pin-hint" />
                    </div>
                  )}
                </form.Field>
                <RadiusSlider onChange={handleRadiusChange} value={radius} />
              </>
            )}
          </form.Subscribe>
        </section>
      </div>

      <div className="flex w-full justify-end gap-2 max-md:flex-col-reverse">
        <Link
          className={cn(
            buttonVariants({ variant: "ghost" }),
            "max-md:py-[17px] max-md:text-[17px] max-md:leading-[22px]"
          )}
          to="/owner"
        >
          Cancel
        </Link>
        <form.Subscribe selector={selectSubmitting}>
          {(isSubmitting) => (
            <Button
              className="px-[22px] max-md:w-full max-md:py-[17px] max-md:text-[17px] max-md:leading-[22px]"
              disabled={isSubmitting}
              type="submit"
            >
              {isSubmitting ? "Creating…" : "Create and invite admin"}
            </Button>
          )}
        </form.Subscribe>
      </div>
    </form>
  );
}
