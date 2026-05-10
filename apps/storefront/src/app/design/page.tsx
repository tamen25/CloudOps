import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { StatusPill } from "@/components/ui/status-pill";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

/**
 * Internal design preview at /design. Renders every primitive in every
 * variant. Gated by NEXT_PUBLIC_DESIGN_PREVIEW=1 so the route returns 404
 * in a normal prod build. Substitutes for Storybook (story #78 explicit
 * decision).
 */
export default function DesignPreview() {
  if (process.env.NEXT_PUBLIC_DESIGN_PREVIEW !== "1") {
    notFound();
  }

  return (
    <main className="mx-auto max-w-6xl space-y-12 px-6 py-12">
      <header className="space-y-2">
        <StatusPill variant="live">design preview</StatusPill>
        <h1 className="text-4xl font-semibold tracking-tight">CloudOps Dim</h1>
        <p className="max-w-prose text-fg-muted">
          Dark-only design system. Tokens are exposed as Tailwind theme keys
          and CSS custom properties (<code className="font-mono">tokens.css</code>).
          WCAG AA verified — see <code className="font-mono">test/contrast.test.ts</code>.
        </p>
      </header>

      <Section title="Surfaces">
        <div className="grid grid-cols-3 gap-4">
          <Swatch label="bg.base" hex="#1c2128" className="bg-bg-base" />
          <Swatch label="bg.raised" hex="#22272e" className="bg-bg-raised" />
          <Swatch label="bg.elev" hex="#2d333b" className="bg-bg-elev" />
        </div>
      </Section>

      <Section title="Brand">
        <div className="grid grid-cols-3 gap-4">
          <Swatch label="brand.400" hex="#5eead4" className="bg-brand-400 text-fg-invert" />
          <Swatch label="brand.500" hex="#2dd4bf" className="bg-brand-500 text-fg-invert" />
          <Swatch label="brand.600" hex="#14b8a6" className="bg-brand-600 text-fg-invert" />
        </div>
      </Section>

      <Section title="State">
        <div className="grid grid-cols-4 gap-4">
          <Swatch label="success" hex="#57ab5a" className="bg-success text-fg-invert" />
          <Swatch label="warning" hex="#c69026" className="bg-warning text-fg-invert" />
          <Swatch label="danger" hex="#e5534b" className="bg-danger text-fg-invert" />
          <Swatch label="info" hex="#539bf5" className="bg-info text-fg-invert" />
        </div>
      </Section>

      <Section title="Typography">
        <div className="space-y-2">
          <p className="text-3xl font-semibold tracking-tight">Heading 32 / Inter</p>
          <p className="text-2xl font-semibold tracking-tight">Heading 24 / Inter</p>
          <p className="text-xl font-semibold">Heading 20 / Inter</p>
          <p className="text-base">Body 16 — reading size for product copy.</p>
          <p className="text-sm text-fg-muted">Body 14 muted — captions, helper text.</p>
          <p className="font-mono text-sm">SKU-WIDGET-001 · ord_01HK9PM3QF · $42.48</p>
        </div>
      </Section>

      <Section title="Buttons">
        <div className="flex flex-wrap items-center gap-3">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Danger</Button>
          <Button variant="link">Link</Button>
          <Button size="sm">Small</Button>
          <Button size="lg">Large</Button>
          <Button disabled>Disabled</Button>
        </div>
      </Section>

      <Section title="Status pills">
        <div className="flex flex-wrap items-center gap-3">
          <StatusPill variant="live">live</StatusPill>
          <StatusPill variant="success">confirmed</StatusPill>
          <StatusPill variant="warning">low stock</StatusPill>
          <StatusPill variant="danger">out of stock</StatusPill>
          <StatusPill variant="info">in transit</StatusPill>
          <StatusPill variant="muted">draft</StatusPill>
        </div>
      </Section>

      <Section title="Badges">
        <div className="flex flex-wrap items-center gap-3">
          <Badge>default</Badge>
          <Badge variant="brand">brand</Badge>
          <Badge variant="success">success</Badge>
          <Badge variant="warning">warning</Badge>
          <Badge variant="danger">danger</Badge>
          <Badge variant="info">info</Badge>
          <Badge variant="outline">outline</Badge>
        </div>
      </Section>

      <Section title="Form fields">
        <div className="max-w-sm space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" placeholder="jane@acme.example" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="qty">Quantity</Label>
            <Input id="qty" type="number" defaultValue={1} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="disabled">Disabled</Label>
            <Input id="disabled" disabled defaultValue="locked" />
          </div>
        </div>
      </Section>

      <Section title="Card">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Cloud Widget</CardTitle>
            <CardDescription>WIDGET-001 · in stock</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-fg-muted">
              A small widget for testing card composition. Swap copy when the
              real product page lands.
            </p>
          </CardContent>
          <CardFooter className="justify-between">
            <span className="font-mono text-lg">$29.98</span>
            <Button>Add to cart</Button>
          </CardFooter>
        </Card>
      </Section>

      <Section title="Skeleton">
        <div className="max-w-md space-y-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-32 w-full" />
        </div>
      </Section>

      <Section title="Separator">
        <div className="space-y-3">
          <p className="text-sm text-fg-muted">Above the line.</p>
          <Separator />
          <p className="text-sm text-fg-muted">Below the line.</p>
        </div>
      </Section>

      <Section title="Tabs">
        <Tabs defaultValue="overview" className="max-w-md">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="audit">Audit</TabsTrigger>
            <TabsTrigger value="raw">Raw</TabsTrigger>
          </TabsList>
          <TabsContent value="overview">
            <p className="text-sm text-fg-muted">High-level summary of the order.</p>
          </TabsContent>
          <TabsContent value="audit">
            <p className="text-sm text-fg-muted">Audit-trail rows.</p>
          </TabsContent>
          <TabsContent value="raw">
            <pre className="font-mono text-xs text-fg-muted">{`{ "id": "ord_01HK9PM3QF" }`}</pre>
          </TabsContent>
        </Tabs>
      </Section>

      <Section title="Table">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>SKU</TableHead>
              <TableHead>Name</TableHead>
              <TableHead className="text-right">Qty</TableHead>
              <TableHead className="text-right">Price</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell className="font-mono">WIDGET-001</TableCell>
              <TableCell>Cloud Widget</TableCell>
              <TableCell className="text-right font-mono">2</TableCell>
              <TableCell className="text-right font-mono">$29.98</TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="font-mono">BOLT-042</TableCell>
              <TableCell>Bolt of Bytes</TableCell>
              <TableCell className="text-right font-mono">1</TableCell>
              <TableCell className="text-right font-mono">$12.50</TableCell>
            </TableRow>
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell colSpan={3}>Total</TableCell>
              <TableCell className="text-right font-mono">$42.48</TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </Section>
    </main>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-fg-muted">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Swatch({
  label,
  hex,
  className,
}: {
  label: string;
  hex: string;
  className?: string;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-border-default">
      <div className={`flex h-20 items-end p-3 ${className ?? ""}`}>
        <span className="font-mono text-xs">{label}</span>
      </div>
      <div className="bg-bg-raised px-3 py-2 text-xs text-fg-muted font-mono">
        {hex}
      </div>
    </div>
  );
}
