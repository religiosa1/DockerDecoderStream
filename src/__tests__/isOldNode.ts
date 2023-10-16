export function isOldNode(): boolean {
  const major = parseInt(process.version?.match(/v?(\d+)/)?.[1] ?? "", 10);
  return major < 18;
}