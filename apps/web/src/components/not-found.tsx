import { buttonVariants } from "@hoops-genesis/ui/components/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@hoops-genesis/ui/components/empty";
import { Link } from "@tanstack/react-router";

export function NotFound() {
  return (
    <div className="flex min-h-svh p-6">
      <Empty>
        <EmptyHeader>
          <EmptyTitle>Page not found</EmptyTitle>
          <EmptyDescription>
            The link may be old, or the page has moved.
          </EmptyDescription>
        </EmptyHeader>
        <Link className={buttonVariants()} to="/app">
          Go to your home
        </Link>
      </Empty>
    </div>
  );
}
