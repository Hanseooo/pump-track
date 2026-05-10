export function formatTimeAgo(minutes: number): string {
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${Math.floor(minutes)} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}