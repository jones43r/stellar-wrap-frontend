export function DappCardSkeleton() {
  return (
    <div
      aria-label="Loading dapp"
      aria-live="polite"
      aria-busy="true"
      role="status"
      className="relative flex aspect-square flex-col justify-end overflow-hidden rounded-3xl border border-gray-200 bg-gray-50 p-4 sm:p-5 md:p-6 lg:p-8 dark:border-[#1DB954]/15 dark:bg-[#0d1711]"
    >
      <div aria-hidden="true" className="absolute right-3 top-3 h-10 w-10 rounded-full bg-gray-200 skeleton-shimmer sm:right-4 sm:top-4 md:right-5 md:top-5 dark:bg-white/10" />
      <div aria-hidden="true" className="absolute left-3 top-3 h-9 w-9 rounded-xl bg-gray-200 skeleton-shimmer sm:left-4 sm:top-4 sm:h-10 sm:w-10 md:left-5 md:top-5 md:h-11 md:w-11 dark:bg-white/10" />
      <div className="relative z-10 space-y-3">
        <div aria-hidden="true" className="h-7 w-3/4 rounded-md bg-gray-200 skeleton-shimmer sm:h-8 md:h-9 dark:bg-white/10" />
        <div aria-hidden="true" className="h-5 w-1/2 rounded-md bg-[#1DB954]/15 skeleton-shimmer dark:bg-[#1DB954]/20" />
      </div>
    </div>
  );
}