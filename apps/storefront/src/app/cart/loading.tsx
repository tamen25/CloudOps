import { Skeleton } from "@/components/ui/skeleton";

export default function CartLoading() {
  return (
    <main className="mx-auto max-w-3xl space-y-4 px-6 py-10">
      <Skeleton className="h-7 w-24" />
      <Skeleton className="h-64 w-full" />
    </main>
  );
}
