import { createServerFn } from "@tanstack/react-start";
import { randomBytes } from "node:crypto";
import { eq, and } from "drizzle-orm";
import { db } from "~/db/index";
import { projects } from "~/db/schema";
import { requireSession } from "~/server/session";

function generatePublicKey(): string {
  return randomBytes(16).toString("hex");
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
