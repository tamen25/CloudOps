import { ImageUploader } from "@/components/admin/ImageUploader";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function UploadPage() {
  return (
    <main className="mx-auto max-w-3xl space-y-6 px-6 py-10">
      <Card>
        <CardHeader>
          <CardTitle>Upload product image</CardTitle>
        </CardHeader>
        <CardContent>
          <ImageUploader />
        </CardContent>
      </Card>
    </main>
  );
}
