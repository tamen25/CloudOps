import { Skeleton } from "@/components/ui/skeleton";

export default function ProductDetailLoading() {
  return (
    <main className="mx-auto max-w-5xl space-y-6 px-6 py-10">
      <Skeleton className="h-8 w-24" />
      <Skeleton className="h-64 w-full" />
      <Skeleton className="h-32 w-full" />
    </main>
  );
}
