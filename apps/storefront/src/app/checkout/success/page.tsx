import Link from "next/link";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/status-pill";

export const dynamic = "force-dynamic";

export default async function CheckoutSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ executionArn?: string }>;
}) {
  const params = await searchParams;
  const executionArn = params.executionArn ?? "";
  return (
    <main className="mx-auto max-w-3xl space-y-6 px-6 py-10">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Checkout in progress</CardTitle>
          <StatusPill variant="info">step functions</StatusPill>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-fg-muted">
            We started the checkout saga. Your order shows up under <code className="font-mono">/orders</code> once
            the state machine commits.
          </p>
          {executionArn ? (
            <p className="break-all font-mono text-xs text-fg-subtle">
              executionArn: {executionArn}
            </p>
          ) : null}
          <Button asChild>
            <Link href="/orders">View orders</Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
