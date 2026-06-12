import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { eq, and } from "drizzle-orm";
import { db } from "~/db/index";
import { projects } from "~/db/schema";
import { auth } from "~/lib/auth";

function generatePublicKey(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function requireSession() {
  const request = getRequest();
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    throw new Error("Unauthorized");
  }
  return session;
}

export const listProjectsFn = createServerFn({ method: "GET" }).handler(
  async () => {
    const session = await requireSession();
    return db
      .select()
      .from(projects)
      .where(eq(projects.userId, session.user.id))
      .orderBy(projects.createdAt);
  },
);

export const createProjectFn = createServerFn({ method: "POST" })
  .validator((data: { name: string }) => data)
  .handler(async ({ data }) => {
    const session = await requireSession();
    const name = data.name.trim();
    if (!name) {
      throw new Error("Project name is required");
    }
    const id = crypto.randomUUID();
    const publicKey = generatePublicKey();
    const [project] = await db
      .insert(projects)
      .values({ id, userId: session.user.id, name, publicKey })
      .returning();
    return project;
  });

export const getProjectFn = createServerFn({ method: "GET" })
  .validator((data: { projectId: string }) => data)
  .handler(async ({ data }) => {
    const session = await requireSession();
    const [project] = await db
      .select()
      .from(projects)
      .where(
        and(
          eq(projects.id, data.projectId),
          eq(projects.userId, session.user.id),
        ),
      );
    return project ?? null;
  });

export const deleteProjectFn = createServerFn({ method: "POST" })
  .validator((data: { projectId: string }) => data)
  .handler(async ({ data }) => {
    const session = await requireSession();
    await db
      .delete(projects)
      .where(
        and(
          eq(projects.id, data.projectId),
          eq(projects.userId, session.user.id),
        ),
      );
  });
