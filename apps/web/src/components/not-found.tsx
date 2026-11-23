import { buttonVariants } from "@hoops-genesis/ui/components/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@hoops-genesis/ui/components/empty";
import { Link } from "@tanstack/react-router";

import { PageFrame } from "@/components/page-frame";

/** Unknown URL, or a page whose record does not exist (an API 404). */
export function NotFound() {
  return (
    <PageFrame>
      <Empty>
        <EmptyHeader>
          <EmptyTitle>Page not found</EmptyTitle>
          <EmptyDescription>
            The link may be old, or the page has moved.
          </EmptyDescription>
        </EmptyHeader>
        <Link className={buttonVariants({ size: "lg" })} to="/app">
          Go to your home
        </Link>
      </Empty>
    </PageFrame>
  );
}
