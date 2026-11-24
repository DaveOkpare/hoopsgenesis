/*
 * Academy settings for academy admins (AO-1): Paper 8H3-0 (web), 7MW-0 (phone).
 * Saved with Better Auth organization.update (see ./api.ts). Settings the server does
 * not let an admin change are shown read-only with the reason.
 */
import { Button } from "@hoops-genesis/ui/components/button";
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@hoops-genesis/ui/components/dialog";
import { Input } from "@hoops-genesis/ui/components/input";
import { Field, FieldMessage, Label } from "@hoops-genesis/ui/components/label";
import {
  Eyebrow,
  PageActions,
  PageHeader,
  PageHeading,
  PageTitle,
} from "@hoops-genesis/ui/components/page-header";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@hoops-genesis/ui/components/select";
import { Skeleton } from "@hoops-genesis/ui/components/skeleton";
import { cn } from "@hoops-genesis/ui/lib/utils";
import { type AnyFieldApi, useForm } from "@tanstack/react-form";
import { useQuery } from "@tanstack/react-query";
import {
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
  useCallback,
  useMemo,
  useState,
} from "react";
import { toast } from "sonner";
import z from "zod";

import { FormTextField } from "@/components/form-text-field";
import {
  type AcademySettings,
  academySettingsQueryOptions,
  useUpdateAcademySettings,
} from "@/features/academy-settings/queries";
import { defaultFeeQueryOptions } from "@/features/fees/queries";
import {
  type LatLng,
  MockMap,
} from "@/features/owner-academies/location-picker";
import type { Id } from "@/features/types";
import { academyCountry, countryName } from "@/features/viewer/selectors";
import { apiFieldErrors, errorMessage } from "@/lib/api-client";
import { formatMoney } from "@/lib/format";

/** The zones the app knows a country for (the owner's create form offers the same). */
const TIME_ZONES = ["Africa/Kigali", "Africa/Kampala", "Asia/Kolkata"];

const RADII = [50, 100, 150, 300] as const;
const MAX_NAME = 100;
const MAX_LOCATION = 300;
const MAX_LATITUDE = 90;
const MAX_LONGITUDE = 180;

/** Fixed for every academy in the app today (server/api/time.ts SESSION_WINDOW). */
const CHECK_IN_OPENS_MIN = 30;
const CHECK_IN_CLOSES_MIN = 60;

const schema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Give the academy a name")
    .max(MAX_NAME, `Keep it under ${MAX_NAME} characters`),
  timezone: z.string().min(1, "Pick a time zone"),
  location: z
    .string()
    .trim()
    .max(MAX_LOCATION, `Keep it under ${MAX_LOCATION} characters`),
  latitude: z.number().min(-MAX_LATITUDE).max(MAX_LATITUDE),
  longitude: z.number().min(-MAX_LONGITUDE).max(MAX_LONGITUDE),
  attendanceRadiusM: z.number().int().positive(),
});

type FormValues = z.infer<typeof schema>;

interface FormState {
  isDirty: boolean;
  isSubmitting: boolean;
  values: FormValues;
}

const selectSaveState = (state: FormState) => ({
  dirty: state.isDirty,
  submitting: state.isSubmitting,
});
const selectTimeZone = (state: FormState) => state.values.timezone;
const selectVenue = (state: FormState) => ({
  location: state.values.location,
  latitude: state.values.latitude,
  longitude: state.values.longitude,
  radius: state.values.attendanceRadiusM,
});

/** Country is not stored; the app reads it from the time zone (viewer/selectors). */
function countryOfZone(timezone: string) {
  return academyCountry({ timezone } as Parameters<typeof academyCountry>[0]);
}

function zoneLabel(zone: string): string {
  try {
    const offset =
      new Intl.DateTimeFormat("en-US", {
        timeZone: zone,
        timeZoneName: "shortOffset",
      })
        .formatToParts(new Date())
        .find((part) => part.type === "timeZoneName")?.value ?? "";
    return `${zone}, ${offset.replace("GMT", "UTC")}`;
  } catch {
    return zone;
  }
}

function currencyLabel(code: string): string {
  try {
    const name = new Intl.DisplayNames(["en"], { type: "currency" }).of(code);
    if (!name) {
      return code;
    }
    // "Rwandan Franc" → "Rwandan franc", as the design writes it.
    const words = name.split(" ");
    const last = words.pop() ?? "";
    return `${code}, ${[...words, last.toLowerCase()].join(" ")}`;
  } catch {
    return code;
  }
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="flex w-full gap-12 border-line border-t py-7 max-md:py-5 max-lg:flex-col max-lg:gap-5">
      <div className="flex w-[300px] shrink-0 flex-col gap-[6px] max-lg:w-full">
        <h2 className="font-semibold text-[17px] text-ink leading-[22px]">
          {title}
        </h2>
        <p className="text-muted text-sm leading-5">{description}</p>
      </div>
      <div className="flex min-w-0 max-w-[640px] flex-1 basis-0 flex-col gap-[18px] max-lg:max-w-none">
        {children}
      </div>
    </section>
  );
}

/** A value the admin can see but not change here, with the reason. */
function ReadOnly({
  label,
  value,
  note,
  dot,
  className,
}: {
  label: string;
  value: ReactNode;
  note?: string;
  dot?: string;
  className?: string;
}) {
  return (
    <div
      className={cn("flex min-w-0 flex-1 basis-0 flex-col gap-2", className)}
    >
      <p className="font-semibold text-ink text-sm leading-[18px]">{label}</p>
      <p className="flex items-center gap-2 rounded-[12px] bg-fog px-[14px] py-3 text-[15px] text-ink leading-5">
        {dot ? (
          <span aria-hidden="true" className={cn("size-2 rounded-full", dot)} />
        ) : null}
        {value}
      </p>
      {note ? <p className="text-[13px] text-muted leading-4">{note}</p> : null}
    </div>
  );
}

const COUNTRY_DOT = {
  rwanda: "bg-rwanda",
  uganda: "bg-uganda",
  india: "bg-india",
} as const;

function TimeZoneField({ field }: { field: AnyFieldApi }) {
  const current = field.state.value as string;
  const items = useMemo(
    () =>
      [...new Set([current, ...TIME_ZONES])]
        .filter(Boolean)
        .map((zone) => ({ value: zone, label: zoneLabel(zone) })),
    [current]
  );
  const handleChange = useCallback(
    (next: unknown) => {
      if (typeof next === "string") {
        field.handleChange(next);
      }
    },
    [field]
  );
  return (
    <Field>
      <Label htmlFor="timezone">Time zone</Label>
      <Select items={items} onValueChange={handleChange} value={current}>
        <SelectTrigger
          aria-describedby="timezone-note"
          className="rounded-[12px] border border-[#D4D4D4] bg-white"
          id="timezone"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <FieldMessage id="timezone-note">
        Session times and check-in windows use this time zone. The country shown
        follows it.
      </FieldMessage>
    </Field>
  );
}

function RadiusChip({
  value,
  selected,
  onPick,
}: {
  value: number;
  selected: boolean;
  onPick: (value: number) => void;
}) {
  const handleClick = useCallback(() => onPick(value), [onPick, value]);
  return (
    <button
      aria-pressed={selected}
      className={cn(
        "cursor-pointer rounded-full border px-4 py-[9px] text-sm leading-[18px] outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 max-md:min-h-11",
        selected
          ? "border-ink bg-ink font-semibold text-white"
          : "border-line bg-white font-medium text-ink hover:bg-fog"
      )}
      onClick={handleClick}
      type="button"
    >
      {value} m
    </button>
  );
}

function RadiusField({ field }: { field: AnyFieldApi }) {
  const value = field.state.value as number;
  const options = RADII.includes(value as (typeof RADII)[number])
    ? [...RADII]
    : [...RADII, value].sort((a, b) => a - b);
  const handlePick = useCallback(
    (next: number) => field.handleChange(next),
    [field]
  );
  return (
    <fieldset className="flex flex-col gap-[10px]">
      <legend className="pb-[10px] font-semibold text-ink text-sm leading-[18px]">
        How close to the academy
      </legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <RadiusChip
            key={option}
            onPick={handlePick}
            selected={option === value}
            value={option}
          />
        ))}
      </div>
    </fieldset>
  );
}

function PinIcon() {
  return (
    <svg aria-hidden="true" height="20" viewBox="0 0 20 20" width="20">
      <path
        d="M10 18s6-5.2 6-10a6 6 0 10-12 0c0 4.8 6 10 6 10z"
        fill="none"
        stroke="#EB7724"
        strokeWidth="1.8"
      />
      <circle cx="10" cy="8" fill="#EB7724" r="2.2" />
    </svg>
  );
}

const COORD_DIGITS = 5;

function PinDialog({
  open,
  onOpenChange,
  initial,
  radiusM,
  onApply,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: { location: string; pin: LatLng };
  radiusM: number;
  onApply: (value: { location: string; pin: LatLng }) => void;
}) {
  const [pin, setPin] = useState<LatLng>(initial.pin);
  const [location, setLocation] = useState(initial.location);
  const handleLocation = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => setLocation(event.target.value),
    []
  );
  const handleApply = useCallback(() => {
    onApply({ location: location.trim(), pin });
    onOpenChange(false);
  }, [location, onApply, onOpenChange, pin]);
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="md:max-w-[560px]" mobile="fullscreen">
        <DialogHeader>
          <DialogTitle>Move the pin</DialogTitle>
          <DialogDescription>
            Drag the pin to the court, or use the arrow keys. Students check in
            within {radiusM} m of it.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="gap-4">
          <Field>
            <Label htmlFor="venue">Venue address</Label>
            <Input
              id="venue"
              maxLength={MAX_LOCATION}
              onChange={handleLocation}
              placeholder="Kimironko court, KG 11 Ave"
              value={location}
            />
          </Field>
          <MockMap
            center={initial.pin}
            onPinChange={setPin}
            pin={pin}
            radiusM={radiusM}
          />
          <p className="text-[13px] text-muted leading-4" id="map-help">
            Pin at {pin.latitude.toFixed(COORD_DIGITS)},{" "}
            {pin.longitude.toFixed(COORD_DIGITS)}
          </p>
        </DialogBody>
        <DialogFooter>
          <DialogClose render={<Button variant="ghost" />}>Cancel</DialogClose>
          <Button onClick={handleApply}>Use this pin</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SettingsForm({
  academyId,
  settings,
}: {
  academyId: Id;
  settings: AcademySettings;
}) {
  const update = useUpdateAcademySettings(academyId);
  const [pinOpen, setPinOpen] = useState(false);
  const fee = useQuery({
    ...defaultFeeQueryOptions(academyId),
    throwOnError: false,
  });
  const defaultValues: FormValues = {
    name: settings.name,
    timezone: settings.timezone,
    location: settings.location ?? "",
    latitude: settings.latitude,
    longitude: settings.longitude,
    attendanceRadiusM: settings.attendanceRadiusM,
  };
  const form = useForm({
    defaultValues,
    validators: { onSubmit: schema },
    onSubmit: async ({ value, formApi }) => {
      try {
        const saved = await update.mutateAsync({
          name: value.name.trim(),
          timezone: value.timezone,
          location: value.location.trim() || null,
          latitude: value.latitude,
          longitude: value.longitude,
          attendanceRadiusM: value.attendanceRadiusM,
        });
        formApi.reset({
          name: saved.name,
          timezone: saved.timezone,
          location: saved.location ?? "",
          latitude: saved.latitude,
          longitude: saved.longitude,
          attendanceRadiusM: saved.attendanceRadiusM,
        });
        toast.success("Settings saved");
      } catch (error) {
        const fields = apiFieldErrors(error);
        if (fields.name) {
          formApi.setFieldMeta("name", (meta) => ({
            ...meta,
            errorMap: { onSubmit: { message: fields.name } },
          }));
        }
        toast.error(
          errorMessage(error, "The settings couldn't be saved. Try again.")
        );
      }
    },
  });
  const handleSubmit = useCallback(
    (event: FormEvent) => {
      event.preventDefault();
      event.stopPropagation();
      form.handleSubmit();
    },
    [form]
  );
  const openPin = useCallback(() => setPinOpen(true), []);
  const applyPin = useCallback(
    ({ location, pin }: { location: string; pin: LatLng }) => {
      form.setFieldValue("location", location);
      form.setFieldValue("latitude", pin.latitude);
      form.setFieldValue("longitude", pin.longitude);
    },
    [form]
  );

  const saveButton = (
    <form.Subscribe selector={selectSaveState}>
      {({ dirty, submitting }) => (
        <Button
          className="h-auto px-5 py-[13px] text-[15px] max-md:w-full max-md:py-4"
          disabled={!dirty || submitting}
          form="academy-settings"
          type="submit"
        >
          {submitting ? "Saving…" : "Save changes"}
        </Button>
      )}
    </form.Subscribe>
  );

  return (
    <>
      <PageHeader className="pb-0">
        <PageHeading>
          <Eyebrow>{settings.name}</Eyebrow>
          <PageTitle>
            <span className="max-md:hidden">Academy settings</span>
            <span className="md:hidden">Settings</span>
          </PageTitle>
        </PageHeading>
        <PageActions className="max-md:hidden">{saveButton}</PageActions>
      </PageHeader>
      <form
        className="flex flex-col max-md:pb-24"
        id="academy-settings"
        noValidate
        onSubmit={handleSubmit}
      >
        <Section
          description="Shown to members and on the printed QR poster."
          title="Academy details"
        >
          <form.Field name="name">
            {(field) => (
              <FormTextField
                autoComplete="organization"
                className="rounded-[12px] border border-[#D4D4D4] bg-white"
                field={field}
                label="Academy name"
              />
            )}
          </form.Field>
          <div className="flex gap-4 max-md:flex-col">
            <form.Subscribe selector={selectTimeZone}>
              {(zone) => {
                const shown = countryOfZone(zone);
                return (
                  <ReadOnly
                    dot={COUNTRY_DOT[shown]}
                    label="Country"
                    note="Set by the owner when the academy was made."
                    value={countryName(shown)}
                  />
                );
              }}
            </form.Subscribe>
            <ReadOnly
              label="Currency"
              note="Payments already recorded keep theirs; ask the owner to change it."
              value={currencyLabel(settings.defaultCurrency)}
            />
          </div>
          <form.Field name="timezone">
            {(field) => <TimeZoneField field={field} />}
          </form.Field>
        </Section>

        <Section
          description="When students can scan the QR code, and how close to the academy they must be."
          title="Check-in rules"
        >
          <div className="flex gap-4 max-md:flex-col">
            <ReadOnly
              label="Check-in opens"
              note="The same for every academy for now."
              value={`${CHECK_IN_OPENS_MIN} min before start`}
            />
            <ReadOnly
              label="Check-in closes"
              value={`${CHECK_IN_CLOSES_MIN} min after end`}
            />
          </div>
          <ReadOnly
            className="max-w-[308px] max-md:max-w-none"
            label="Late after"
            note="Not set yet: coaches mark a student late by hand."
            value="Set by the coach"
          />
          <form.Field name="attendanceRadiusM">
            {(field) => <RadiusField field={field} />}
          </form.Field>
          <form.Subscribe selector={selectVenue}>
            {({ location, latitude, longitude, radius }) => (
              <>
                <div className="flex items-center gap-[14px] rounded-md bg-fog p-[14px]">
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-[12px] bg-white">
                    <PinIcon />
                  </span>
                  <span className="flex min-w-0 flex-1 basis-0 flex-col gap-[2px]">
                    <span className="font-semibold text-[15px] text-ink leading-5">
                      {location || "No address yet"}
                    </span>
                    <span className="text-[13px] text-muted leading-4">
                      Pin at {latitude.toFixed(COORD_DIGITS)},{" "}
                      {longitude.toFixed(COORD_DIGITS)}
                    </span>
                  </span>
                  <Button
                    className="h-auto bg-white px-[14px] py-2"
                    onClick={openPin}
                    size="sm"
                    variant="outline"
                  >
                    Move pin
                  </Button>
                </div>
                {pinOpen ? (
                  <PinDialog
                    initial={{ location, pin: { latitude, longitude } }}
                    onApply={applyPin}
                    onOpenChange={setPinOpen}
                    open={pinOpen}
                    radiusM={radius}
                  />
                ) : null}
              </>
            )}
          </form.Subscribe>
        </Section>

        <Section
          description="The usual monthly fee fills in the amount when you record a payment. You can still change it on each payment."
          title="Fees"
        >
          <div className="flex gap-4 max-md:flex-col">
            <ReadOnly
              label="Usual monthly fee"
              note="Worked out from recent payments. There is no fee setting to change yet."
              value={
                fee.data?.amount
                  ? formatMoney(fee.data)
                  : "No payments recorded yet"
              }
            />
            <ReadOnly
              label="Overdue after"
              note="Each payment has its own due date for now."
              value="Set on each payment"
            />
          </div>
        </Section>

        <Section
          description="For now, a coach closes each session and marks the students who never came."
          title="Closing sessions"
        >
          <div className="flex items-center gap-4 rounded-md border border-[#C8C8C8] border-dashed px-[18px] py-4">
            <span
              aria-hidden="true"
              className="flex h-[26px] w-11 shrink-0 items-center rounded-full bg-[#E2E2E2] p-[3px]"
            >
              <span className="size-5 rounded-full bg-white shadow-[0_1px_2px_#11111126]" />
            </span>
            <span className="flex min-w-0 flex-1 basis-0 flex-col gap-[2px]">
              <span className="font-semibold text-[15px] text-muted leading-5">
                Mark no-shows absent automatically
              </span>
              <span className="text-[13px] text-muted leading-4">
                When check-in closes, everyone who didn’t scan is marked absent.
              </span>
            </span>
            <span className="shrink-0 rounded-full bg-fog px-[10px] py-[5px] font-semibold text-[12px] text-ink leading-4">
              Coming soon
            </span>
          </div>
        </Section>
      </form>
      {/* Phone: the save bar is pinned above the tab bar once something changed. */}
      <form.Subscribe selector={selectSaveState}>
        {({ dirty, submitting }) =>
          dirty || submitting ? (
            <div className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+72px)] z-30 border-line border-t bg-white px-5 py-3 md:hidden">
              {saveButton}
            </div>
          ) : null
        }
      </form.Subscribe>
    </>
  );
}

function SettingsSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-20 w-[420px] max-w-full rounded-[14px]" />
      {["a", "b", "c"].map((key) => (
        <div className="flex gap-12 max-lg:flex-col" key={key}>
          <Skeleton className="h-16 w-[300px] max-w-full rounded-[14px]" />
          <Skeleton className="h-[220px] flex-1 rounded-[14px]" />
        </div>
      ))}
    </div>
  );
}

export function AcademySettingsScreen({ academyId }: { academyId: Id }) {
  const { data } = useQuery(academySettingsQueryOptions(academyId));
  if (!data) {
    return <SettingsSkeleton />;
  }
  return <SettingsForm academyId={academyId} key={data.id} settings={data} />;
}
