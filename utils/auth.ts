import { H3Event, requireBasicAuth } from "nitro/h3";

export async function requireAuth(event: H3Event) {
  const [username, password] = (process.env.STATUS_AUTH || "").split(":");
  if (!username || !password) return;
  await requireBasicAuth(event, { username, password });
}
