import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PrivacyActions } from "@/components/PrivacyActions";

export const dynamic = "force-dynamic";

const privacyContact = process.env.PRIVACY_CONTACT_EMAIL ?? "privacy@example.com";

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-4xl space-y-6 px-6 py-10">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Privacy</h1>
        <p className="text-sm text-fg-muted">
          This page explains the data the demo storefront uses and gives signed-in
          users direct access to export and erasure tools.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>What we collect</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-fg-muted">
          <p>
            When you sign in, the storefront uses your account identifier, email
            address, and tenant assignment from the identity provider so it can
            authenticate you, show your orders, and send order updates.
          </p>
          <p>
            We store cart contents, order records, audit events, idempotency keys,
            and short-lived realtime connection records needed to operate the shop.
            Completed business records may be retained, but erasure removes the
            direct user link from those records.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>How the data is used</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-fg-muted">
          <p>
            Data is used to authenticate requests, process carts and orders, send
            confirmation messages, prevent replayed checkout requests, support
            realtime order updates, and preserve security/audit evidence.
          </p>
          <p>
            We do not use advertising or analytics cookies in this demo. See the{" "}
            <Link href="/cookies" className="text-brand-500 hover:text-brand-400">
              cookie notice
            </Link>{" "}
            for the current cookie inventory.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Your controls</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-fg-muted">
          <p>
            Signed-in users can download the account-linked data currently exposed
            by this application or request erasure of the direct links the
            storefront controls.
          </p>
          <PrivacyActions />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Contact</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-fg-muted">
          For privacy requests or questions, contact{" "}
          <a href={`mailto:${privacyContact}`} className="text-brand-500 hover:text-brand-400">
            {privacyContact}
          </a>
          .
        </CardContent>
      </Card>
    </main>
  );
}
