const ID_LIKE_SEGMENT =
  /^(?:\d{4,}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[A-Za-z0-9+_=%-]{20,})$/i;

/** Replaces id-like path segments (student ids, GUIDs, tokens) so paths are safe to print. */
export function redactPath(pathname: string): string {
  return pathname
    .split("/")
    .map((segment) => (ID_LIKE_SEGMENT.test(segment) ? ":id" : segment))
    .join("/");
}
