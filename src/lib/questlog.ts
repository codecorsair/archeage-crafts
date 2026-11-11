/** Search by the exact catalog name without requiring Questlog's custom item IDs. */
export function questlogSearchUrl(name: string): string {
  return `https://questlog.gg/archeage-chronicles/en/db/search?${new URLSearchParams({ searchTerm: name })}`;
}
