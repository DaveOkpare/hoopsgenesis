/**
 * Which payment providers the webhook accepts, keyed by the `:provider` path
 * segment. A provider whose secret is not configured is treated as unknown
 * (404), so an unconfigured provider can never accept unsigned requests.
 *
 * Adding one: `create<Name>Provider` in this folder (see ./provider.ts),
 * an optional `PAYMENT_WEBHOOK_<NAME>_SECRET` in apps/web/.env.schema, and a
 * line in `PROVIDER_FACTORIES` below.
 */
import { ENV } from "../../../../env.server";
import { createGenericProvider, GENERIC_PROVIDER_NAME } from "./generic";
import type { PaymentProvider, PaymentProviderRegistry } from "./provider";

type ProviderFactory = (secret: string) => PaymentProvider;

const PROVIDER_FACTORIES: Record<string, ProviderFactory> = {
  [GENERIC_PROVIDER_NAME]: createGenericProvider,
};

/** Each provider's secret, read when a request arrives (never at import). */
const SECRET_READERS: Record<string, () => string | undefined> = {
  [GENERIC_PROVIDER_NAME]: () => ENV.PAYMENT_WEBHOOK_GENERIC_SECRET,
};

/**
 * A registry over `secrets` (provider name to secret, or a function returning
 * them). Tests pass their own secrets; the app uses `defaultPaymentProviders`.
 */
export const createPaymentProviderRegistry =
  (secrets: (name: string) => string | undefined): PaymentProviderRegistry =>
  (name) => {
    if (!Object.hasOwn(PROVIDER_FACTORIES, name)) {
      return;
    }
    const secret = secrets(name)?.trim();
    if (!secret) {
      return;
    }
    return PROVIDER_FACTORIES[name]?.(secret);
  };

export const defaultPaymentProviders = createPaymentProviderRegistry((name) =>
  Object.hasOwn(SECRET_READERS, name) ? SECRET_READERS[name]?.() : undefined
);
