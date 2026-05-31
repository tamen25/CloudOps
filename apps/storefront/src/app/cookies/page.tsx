import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function CookiesPage() {
  return (
    <main className="mx-auto max-w-4xl space-y-6 px-6 py-10">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Cookie notice</h1>
        <p className="text-sm text-fg-muted">
          The storefront currently uses only essential cookies needed for sign-in
          and cart operation. No advertising or analytics cookies are set.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Current cookies</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="text-fg-muted">
                <tr>
                  <th className="border-b border-border-muted px-3 py-2">Cookie</th>
                  <th className="border-b border-border-muted px-3 py-2">Purpose</th>
                  <th className="border-b border-border-muted px-3 py-2">Lifetime</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="border-b border-border-muted px-3 py-2 font-mono">
                    cloudops_session
                  </td>
                  <td className="border-b border-border-muted px-3 py-2">
                    Maintains the signed-in session.
                  </td>
                  <td className="border-b border-border-muted px-3 py-2">
                    Matches the issued ID token lifetime.
                  </td>
                </tr>
                <tr>
                  <td className="border-b border-border-muted px-3 py-2 font-mono">
                    cloudops_guest_id
                  </td>
                  <td className="border-b border-border-muted px-3 py-2">
                    Keeps an anonymous cart attached to the browser before sign-in.
                  </td>
                  <td className="border-b border-border-muted px-3 py-2">7 days.</td>
                </tr>
                <tr>
                  <td className="border-b border-border-muted px-3 py-2 font-mono">
                    cloudops_oauth_state
                  </td>
                  <td className="border-b border-border-muted px-3 py-2">
                    Protects the sign-in flow against request forgery.
                  </td>
                  <td className="border-b border-border-muted px-3 py-2">5 minutes.</td>
                </tr>
                <tr>
                  <td className="border-b border-border-muted px-3 py-2 font-mono">
                    cloudops_pkce_verifier
                  </td>
                  <td className="border-b border-border-muted px-3 py-2">
                    Completes the PKCE sign-in exchange.
                  </td>
                  <td className="border-b border-border-muted px-3 py-2">5 minutes.</td>
                </tr>
                <tr>
                  <td className="px-3 py-2 font-mono">cloudops_post_login</td>
                  <td className="px-3 py-2">
                    Restores the safe page you asked for after sign-in.
                  </td>
                  <td className="px-3 py-2">5 minutes.</td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
