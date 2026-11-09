export function PageLoading({ message = "পেজ লোড হচ্ছে…" }: { message?: string }) {
  return (
    <main className="grid min-h-screen place-items-center bg-background px-4 text-center">
      <p role="status" className="font-semibold text-foreground">
        <span
          aria-hidden="true"
          className="mx-auto mb-3 block size-8 rounded-full border-2 border-primary/25 border-t-primary motion-safe:animate-spin"
        />
        {message}
      </p>
    </main>
  );
}
