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
  type JoinPreviewAs,
  type JoinSession,
  joinCodeErrorCode,
  joinCodeKeys,
  joinPreviewExtrasQueryOptions,
  joinPreviewQueryOptions,
  joinSessionQueryOptions,
  useRedeemJoinCode,
} from "@/features/join-codes/queries";
import { isUiPreview } from "@/lib/preview";

const WHITESPACE = /\s+/;

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
  const preview = useQuery(joinPreviewQueryOptions(code, session.id));
  const academyId = preview.data?.academy.id;
  const extras = useQuery({
    ...joinPreviewExtrasQueryOptions(
      academyId ?? "",
      preview.data?.team?.id ?? null
    ),
    enabled: Boolean(academyId),
  }).data;
  const redeem = useRedeemJoinCode();
  const [redeemProblem, setRedeemProblem] = useState<JoinProblem | null>(null);
  const [edited, setEdited] = useState(false);
  const display = formatCode(code);
  const joinerName = shortName(session.name);

  const handleJoin = useCallback(async () => {
    try {
      await redeem.mutateAsync({ code: display });
      nav.setSearch({ state: "joined" });
    } catch (error) {
      setRedeemProblem({
        code: joinCodeErrorCode(error) ?? "unknown",
        academyName: preview.data?.academy.name,
      });
    }
  }, [display, nav, preview.data?.academy.name, redeem]);
  const handleEdited = useCallback(() => setEdited(true), []);

  if (!(preview.data || preview.error)) {
    return <Loading />;
  }

  const homeHref = isUiPreview ? `/${preview.data?.role ?? "student"}` : "/app";

  if (search.state === "joined" && preview.data) {
    return (
      <AuthLayout tone="orange">
        <JoinedWithCode
          extras={extras ?? null}
          joinerName={session.name}
          preview={preview.data}
          todayHref={homeHref}
        />
      </AuthLayout>
    );
  }

  let problem: JoinProblem | null = redeemProblem;
  if (preview.error) {
    problem = { code: joinCodeErrorCode(preview.error) ?? "unknown" };
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
          onCheck={nav.toCode}
          onCodeEdited={handleEdited}
          openAcademy={{ label: `Open ${academyLabel}`, to: homeHref }}
          problem={edited ? null : problem}
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
 * /join and /join/<code> (Paper 6WQ-0 → 6WR-0 → "You're in"; phone 6WS-0, 6WT-0, 6WU-0).
 * Signed out: make an account or sign in first, keeping the code (spec step 4).
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
    await queryClient.invalidateQueries({ queryKey: joinCodeKeys.all });
    nav.setSearch({ account: undefined, as: undefined });
  }, [nav, queryClient]);

  if (session.data === undefined) {
    return <Loading />;
  }
  if (!session.data) {
    return (
      <AuthLayout width={search.account === "new" ? "wide" : "code"}>
        {search.account === "new" ? (
          <JoinSignUpForm code={display} onSignedUp={handleSignedUp} />
        ) : (
          <JoinSignedOut code={display} onCreateAccount={startSignUp} />
        )}
      </AuthLayout>
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
