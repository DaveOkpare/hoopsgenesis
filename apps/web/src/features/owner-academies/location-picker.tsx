import { cn } from "@hoops-genesis/ui/lib/utils";
import {
  type ChangeEvent,
  type KeyboardEvent,
  type PointerEvent,
  useCallback,
  useRef,
} from "react";

/*
 * Location picker for "[Owner] Create academy" (PA-1): a map with a draggable pin and a
 * check-in radius circle. No map library is installed, so <MockMap> draws the map as the
 * design does and projects pixels to lat/lng around `center` at a fixed scale. To use a
 * real map, replace <MockMap> with a component that takes the same props
 * (center, pin, radiusM, onPinChange); <RadiusSlider> and the form stay as they are.
 */

export interface LatLng {
  latitude: number;
  longitude: number;
}

/** 150 m draws as an 80px radius, as in the design. */
const METERS_PER_PX = 150 / 80;
const METERS_PER_DEGREE = 111_320;
const KEY_STEP_PX = 10;
const DEG_TO_RAD = Math.PI / 180;

const KEY_DELTAS: Record<string, [number, number]> = {
  ArrowUp: [0, -KEY_STEP_PX],
  ArrowDown: [0, KEY_STEP_PX],
  ArrowLeft: [-KEY_STEP_PX, 0],
  ArrowRight: [KEY_STEP_PX, 0],
};

function metersPerDegreeLng(latitude: number): number {
  return METERS_PER_DEGREE * Math.cos(latitude * DEG_TO_RAD);
}

/** Pixel offset from the map centre → lat/lng. */
function toLatLng(center: LatLng, dx: number, dy: number): LatLng {
  return {
    latitude: center.latitude - (dy * METERS_PER_PX) / METERS_PER_DEGREE,
    longitude:
      center.longitude +
      (dx * METERS_PER_PX) / metersPerDegreeLng(center.latitude),
  };
}

/** lat/lng → pixel offset from the map centre. */
function toOffset(center: LatLng, point: LatLng): { dx: number; dy: number } {
  return {
    dx:
      ((point.longitude - center.longitude) *
        metersPerDegreeLng(center.latitude)) /
      METERS_PER_PX,
    dy:
      ((center.latitude - point.latitude) * METERS_PER_DEGREE) / METERS_PER_PX,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function PinIcon() {
  return (
    <svg aria-hidden="true" height="40" viewBox="0 0 28 40" width="28">
      <path
        d="M14 39C14 39 27 23 27 14A13 13 0 001 14c0 9 13 25 13 25z"
        fill="#111111"
      />
      <circle cx="14" cy="14" fill="#FFFFFF" r="5" />
    </svg>
  );
}

export function MockMap({
  center,
  pin,
  radiusM,
  onPinChange,
  invalid = false,
  className,
}: {
  center: LatLng;
  pin: LatLng | null;
  radiusM: number;
  onPinChange: (pin: LatLng) => void;
  invalid?: boolean;
  className?: string;
}) {
  const mapRef = useRef<HTMLDivElement>(null);
  const grab = useRef<{ dx: number; dy: number } | null>(null);
  const offset = pin ? toOffset(center, pin) : null;

  const placeAt = useCallback(
    (clientX: number, clientY: number) => {
      const rect = mapRef.current?.getBoundingClientRect();
      if (!(rect && grab.current)) {
        return;
      }
      const halfW = rect.width / 2;
      const halfH = rect.height / 2;
      const dx = clamp(
        clientX - rect.left - halfW - grab.current.dx,
        -halfW,
        halfW
      );
      const dy = clamp(
        clientY - rect.top - halfH - grab.current.dy,
        -halfH,
        halfH
      );
      onPinChange(toLatLng(center, dx, dy));
    },
    [center, onPinChange]
  );

  const handlePointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const rect = mapRef.current?.getBoundingClientRect();
      if (!rect) {
        return;
      }
      const onPin = (event.target as Element).closest("[data-pin]");
      // Grabbing the pin keeps its tip where it was relative to the pointer;
      // tapping the map moves the tip to the pointer.
      if (onPin && offset) {
        const tipX = rect.left + rect.width / 2 + offset.dx;
        const tipY = rect.top + rect.height / 2 + offset.dy;
        grab.current = { dx: event.clientX - tipX, dy: event.clientY - tipY };
      } else {
        grab.current = { dx: 0, dy: 0 };
      }
      event.currentTarget.setPointerCapture(event.pointerId);
      event.currentTarget.focus();
      placeAt(event.clientX, event.clientY);
    },
    [offset, placeAt]
  );

  const handlePointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (grab.current) {
        placeAt(event.clientX, event.clientY);
      }
    },
    [placeAt]
  );

  const handlePointerUp = useCallback(() => {
    grab.current = null;
  }, []);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        if (!pin) {
          onPinChange(center);
        }
        return;
      }
      const delta = KEY_DELTAS[event.key];
      if (!delta) {
        return;
      }
      event.preventDefault();
      const current = offset ?? { dx: 0, dy: 0 };
      onPinChange(
        toLatLng(center, current.dx + delta[0], current.dy + delta[1])
      );
    },
    [center, offset, onPinChange, pin]
  );

  const radiusPx = radiusM / METERS_PER_PX;

  return (
    // biome-ignore lint/a11y/noNoninteractiveElementInteractions: a 2D pin on a map has no native control; role="application" takes pointer and arrow-key input.
    <div
      aria-describedby="map-help"
      aria-invalid={invalid || undefined}
      aria-label={
        pin
          ? `Map. Pin at ${pin.latitude.toFixed(5)}, ${pin.longitude.toFixed(5)}. Arrow keys move it.`
          : "Map. Press Enter to drop the pin in the middle, then use the arrow keys."
      }
      className={cn(
        "relative h-[340px] shrink-0 cursor-crosshair touch-none select-none overflow-hidden rounded-md bg-[#E4E7DF] outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 max-md:h-[280px]",
        invalid && "ring-2 ring-orange-deep",
        className
      )}
      onKeyDown={handleKeyDown}
      onPointerCancel={handlePointerUp}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      ref={mapRef}
      role="application"
      // biome-ignore lint/a11y/noNoninteractiveTabindex: the map is the focus target for arrow-key pin moves.
      tabIndex={0}
    >
      <svg
        aria-hidden="true"
        className="absolute inset-0 size-full"
        preserveAspectRatio="none"
        viewBox="0 0 480 340"
      >
        <path
          d="M0 220 L480 120 M90 0 L170 340 M330 0 L290 340 M0 70 L480 280"
          fill="none"
          stroke="#FFFFFF"
          strokeWidth="12"
        />
        <path
          d="M0 170 L480 190 M220 0 L240 340"
          fill="none"
          stroke="#FFFFFF"
          strokeWidth="5"
        />
        <path d="M380 230 q40 -20 90 10 v100 h-120z" fill="#CFE3EE" />
      </svg>
      {offset ? (
        <>
          <div
            aria-hidden="true"
            className="pointer-events-none absolute rounded-full border-2 border-orange bg-[#EB772424]"
            style={{
              width: radiusPx * 2,
              height: radiusPx * 2,
              left: `calc(50% + ${offset.dx - radiusPx}px)`,
              top: `calc(50% + ${offset.dy - radiusPx}px)`,
            }}
          />
          <div
            className="absolute h-10 w-7 cursor-grab active:cursor-grabbing"
            data-pin=""
            style={{
              left: `calc(50% + ${offset.dx - 14}px)`,
              top: `calc(50% + ${offset.dy - 40}px)`,
            }}
          >
            <PinIcon />
          </div>
        </>
      ) : null}
      <p
        className="pointer-events-none absolute top-[14px] left-[14px] rounded-full bg-white px-3 py-2 font-medium text-[13px] text-ink leading-4 shadow-[0_2px_8px_#1111111F]"
        id="map-help"
      >
        {pin ? "Drag the pin to the entrance" : "Tap the map to drop the pin"}
      </p>
    </div>
  );
}

const RADIUS_MIN = 50;
const RADIUS_MAX = 500;
const RADIUS_STEP = 10;

/** "Check-in radius" slider, 50–500 m. A native range input sits over the drawn track. */
export function RadiusSlider({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  const handleChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) =>
      onChange(Number(event.target.value)),
    [onChange]
  );
  const fraction = (value - RADIUS_MIN) / (RADIUS_MAX - RADIUS_MIN);
  const percent = `${fraction * 100}%`;
  return (
    <div className="flex flex-col gap-[10px]">
      <div className="flex justify-between">
        <label
          className="font-semibold text-ink text-sm leading-[18px]"
          htmlFor="radius"
        >
          Check-in radius
        </label>
        <output
          className="font-semibold text-ink text-sm leading-[18px]"
          htmlFor="radius"
        >
          {value} m
        </output>
      </div>
      <div className="relative flex h-5 items-center">
        <div className="h-[6px] w-full rounded-full bg-line" />
        <div
          className="absolute top-[7px] left-0 h-[6px] rounded-full bg-ink"
          style={{ width: percent }}
        />
        <input
          aria-valuetext={`${value} metres`}
          className="peer absolute inset-0 z-10 w-full cursor-pointer opacity-0"
          id="radius"
          max={RADIUS_MAX}
          min={RADIUS_MIN}
          onChange={handleChange}
          step={RADIUS_STEP}
          type="range"
          value={value}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute top-0 size-5 rounded-full border-2 border-ink bg-white peer-focus-visible:ring-2 peer-focus-visible:ring-ink peer-focus-visible:ring-offset-2"
          style={{ left: `calc(${percent} - ${fraction * 20}px)` }}
        />
      </div>
      <div className="flex justify-between text-[13px] text-muted leading-4">
        <span>{RADIUS_MIN} m</span>
        <span>{RADIUS_MAX} m</span>
      </div>
    </div>
  );
}
