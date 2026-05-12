import Link from "next/link";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function AdminHome() {
  return (
    <main className="mx-auto max-w-3xl space-y-6 px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
      <Card>
        <CardHeader>
          <CardTitle>Upload an asset</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-fg-muted">
            Upload a product image. The image-resize Lambda generates sm/md/lg
            WebP variants and stores them under <code className="font-mono">resized/</code> on the
            CDN. Originals stay private.
          </p>
          <Button asChild>
            <Link href="/admin/upload">Open uploader</Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
