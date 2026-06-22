import { getRequest } from "@tanstack/react-start/server";
import { auth } from "~/lib/auth";

export async function requireSession() {
  const request = getRequest();
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    throw new Error("Unauthorized");
  }
  return session;
}
