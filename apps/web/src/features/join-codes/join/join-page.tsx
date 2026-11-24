import { Skeleton } from "@hoops-genesis/ui/components/skeleton";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";

import { AuthLayout } from "@/components/auth-layout";
import { formatCode, normalizeCode } from "@/features/join-codes/code-format";
import { ConfirmCode } from "@/features/join-codes/join/confirm-code";
import { EnterCode } from "@/features/join-codes/join/enter-code";
import { JoinedWithCode } from "@/features/join-codes/join/joined-view";
import type { JoinProblem } from "@/features/join-codes/join/problems";
import {
  JoinSignedOut,
  JoinSignUpForm,
} from "@/features/join-codes/join/signed-out";
import {
  canPreviewJoinCodeSignedOut,
  type InvitationCodePreview,
  type JoinPreviewAs,
  type JoinSession,
  joinCodeErrorCode,
  joinCodeKeys,
  joinCodeRetryAt,
  joinedDetailsQueryOptions,
  joinPreviewExtrasQueryOptions,
  joinPreviewQueryOptions,
  joinSessionQueryOptions,
  useJoinCodesNow,
  useRedeemJoinCode,
} from "@/features/join-codes/queries";
import { viewerKeys } from "@/features/viewer/queries";
import { isTransientError } from "@/lib/errors";
import { isUiPreview } from "@/lib/preview";

const WHITESPACE = /\s+/;
/** Preview query key for someone not signed in (preview fixtures only). */
const SIGNED_OUT = "signed-out";

/** "Claire Ingabire" -> "Claire I." */
function shortName(name: string): string {
  const [first, ...rest] = name.trim().split(WHITESPACE);
  const last = rest.at(-1);
  return last ? `${first} ${last.charAt(0)}.` : name;
}

export interface JoinPageSearch {
  account?: "new";
  as?: JoinPreviewAs;
  state?: "joined";
}

export interface JoinNavigation {
  /** Patch this page's search params. */
  setSearch: (patch: Partial<JoinPageSearch>) => void;
  /** Check a code: go to /join/<code>. */
  toCode: (code: string) => void;
  /** Back to an empty /join. */
  toEnter: () => void;
}

function Loading() {
  return (
    <AuthLayout width="code">
      <div aria-busy="true" className="flex flex-col gap-[22px]">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-[54px] w-4/5" />
        <Skeleton className="h-[74px]" />
        <Skeleton className="h-[56px] rounded-full" />
      </div>
    </AuthLayout>
  );
}

/** "Joined with a code" (9HB-0 / 9JO-0), with the place and next session read as the new member. */
function Joined({
  display,
  joinerName,
  preview,
  todayHref,
}: {
  display: string;
  joinerName: string;
  preview: InvitationCodePreview;
  todayHref: string;
}) {
  // Place and next session: left out if they fail.
  const details = useQuery({
    ...joinedDetailsQueryOptions(preview.academy.id, preview.team?.id ?? null),
    throwOnError: false,
  });
  return (
    <AuthLayout width="confirm">
      <JoinedWithCode
        details={
          details.status === "pending" ? undefined : (details.data ?? null)
        }
        displayCode={display}
        joinerName={joinerName}
        preview={preview}
        todayHref={todayHref}
      />
    </AuthLayout>
  );
}

/** A failed redeem: what went wrong and when (for a 429's wait). */
interface RedeemFailure {
  error: unknown;
  problem: JoinProblem;
}

function CodeFlow({
  code,
  nav,
  search,
  session,
}: {
  code: string;
  nav: JoinNavigation;
  search: JoinPageSearch;
  session: JoinSession;
}) {
  // A code that is wrong, used up, expired or rate limited comes back as a 4xx and is
  // shown in the form below; only a dropped connection or a server failure goes to the
  // error screen.
  const preview = useQuery({
    ...joinPreviewQueryOptions(code, session.id),
    throwOnError: (error, query) =>
      query.state.data === undefined && isTransientError(error),
  });
  const academyId = preview.data?.academy.id;
  // City and coach names for the cards: left out if they fail.
  const extras = useQuery({
    ...joinPreviewExtrasQueryOptions(
      academyId ?? "",
      preview.data?.team?.id ?? null
    ),
    enabled: Boolean(academyId),
    throwOnError: false,
  }).data;
  const now = useJoinCodesNow();
  const redeem = useRedeemJoinCode();
  const [failure, setFailure] = useState<RedeemFailure | null>(null);
  const [edited, setEdited] = useState(false);
  const display = formatCode(code);
  const joinerName = shortName(session.name);

  const handleJoin = useCallback(async () => {
    try {
      await redeem.mutateAsync({ code: display });
      nav.setSearch({ state: "joined" });
    } catch (error) {
      setFailure({
        error,
        problem: {
          code: joinCodeErrorCode(error) ?? "unknown",
          academyName: preview.data?.academy.name,
        },
      });
    }
  }, [display, nav, preview.data?.academy.name, redeem]);
  const handleEdited = useCallback(() => setEdited(true), []);
  const { refetch } = preview;
  const handleRetry = useCallback(() => {
    setFailure(null);
    setEdited(false);
    refetch();
  }, [refetch]);

  if (!(preview.data || preview.error) || preview.isRefetching) {
    return <Loading />;
  }

  const homeHref = isUiPreview ? `/${preview.data?.role ?? "student"}` : "/app";

  if (search.state === "joined" && preview.data) {
    return (
      <Joined
        display={display}
        joinerName={session.name}
        preview={preview.data}
        todayHref={homeHref}
      />
    );
  }

  let problem: JoinProblem | null = failure?.problem ?? null;
  let problemError: unknown = failure?.error;
  if (preview.error) {
    problem = { code: joinCodeErrorCode(preview.error) ?? "unknown" };
    problemError = preview.error;
  } else if (preview.data?.alreadyMember) {
    problem = {
      code: "already_member",
      academyName: preview.data.academy.name,
    };
  }

  if (problem || !preview.data) {
    const academyLabel = extras?.city ?? preview.data?.academy.name ?? "";
    return (
      <AuthLayout width="code">
        <EnterCode
          initialCode={code}
          joinerName={joinerName}
          key={code}
          now={now}
          onCheck={nav.toCode}
          onCodeEdited={handleEdited}
          onRetry={handleRetry}
          openAcademy={{ label: `Open ${academyLabel}`, to: homeHref }}
          problem={edited ? null : problem}
          retryAt={joinCodeRetryAt(problemError, now)}
        />
      </AuthLayout>
    );
  }

  return (
    <AuthLayout width="confirm">
      <ConfirmCode
        displayCode={display}
        extras={extras ?? null}
        joining={redeem.isPending}
        onJoin={handleJoin}
        onWrongCode={nav.toEnter}
        preview={preview.data}
      />
    </AuthLayout>
  );
}

/**
 * Signed out (9G0-0 / 9IM-0). Real mode can't preview the code without a session, so
 * only the preview fixtures fill in the academy card; see canPreviewJoinCodeSignedOut.
 */
function SignedOut({
  code,
  onCreateAccount,
}: {
  code: string | null;
  onCreateAccount: () => void;
}) {
  const canPreview = canPreviewJoinCodeSignedOut && code !== null;
  const preview = useQuery({
    ...joinPreviewQueryOptions(code ?? "", SIGNED_OUT),
    enabled: canPreview,
    throwOnError: false,
  });
  const academyId = preview.data?.academy.id;
  const extras = useQuery({
    ...joinPreviewExtrasQueryOptions(
      academyId ?? "",
      preview.data?.team?.id ?? null
    ),
    enabled: Boolean(academyId),
    throwOnError: false,
  }).data;
  if (canPreview && preview.isPending) {
    return <Loading />;
  }
  return (
    <AuthLayout width="confirm">
      <JoinSignedOut
        code={code ? formatCode(code) : null}
        extras={extras ?? null}
        onCreateAccount={onCreateAccount}
        preview={preview.data ?? null}
      />
    </AuthLayout>
  );
}

/**
 * /join and /join/<code> (Paper 6WQ-0 → 6WR-0 → 9HB-0; phone 6WS-0, 6WT-0, 6WU-0,
 * 9KQ-0, 9JO-0). Signed out (9G0-0 / 9IM-0): make an account or sign in first, keeping
 * the code (spec step 4).
 */
export function JoinPage({
  code: rawCode,
  nav,
  search,
}: {
  code: string | null;
  nav: JoinNavigation;
  search: JoinPageSearch;
}) {
  const queryClient = useQueryClient();
  const session = useQuery(
    joinSessionQueryOptions({ preview: isUiPreview, previewAs: search.as })
  );
  const code = rawCode ? normalizeCode(rawCode) : null;
  const display = code ? formatCode(code) : null;

  const handleCheck = useCallback(
    (next: string) => nav.toCode(formatCode(next)),
    [nav]
  );
  const startSignUp = useCallback(
    () => nav.setSearch({ account: "new" }),
    [nav]
  );
  const handleSignedUp = useCallback(async () => {
    // A new session: drop anything cached for whoever was signed in before.
    if (!isUiPreview) {
      queryClient.removeQueries({ queryKey: viewerKeys.all });
    }
    await queryClient.invalidateQueries({ queryKey: joinCodeKeys.all });
    nav.setSearch({ account: undefined, as: undefined });
  }, [nav, queryClient]);

  if (session.data === undefined) {
    return <Loading />;
  }
  if (!session.data) {
    return search.account === "new" ? (
      <AuthLayout width="wide">
        <JoinSignUpForm code={display} onSignedUp={handleSignedUp} />
      </AuthLayout>
    ) : (
      <SignedOut code={code} onCreateAccount={startSignUp} />
    );
  }
  if (!code) {
    return (
      <AuthLayout width="code">
        <EnterCode
          initialCode=""
          joinerName={shortName(session.data.name)}
          onCheck={handleCheck}
          problem={null}
        />
      </AuthLayout>
    );
  }
  return (
    <CodeFlow
      code={code}
      key={code}
      nav={{ ...nav, toCode: handleCheck }}
      search={search}
      session={session.data}
    />
  );
}
