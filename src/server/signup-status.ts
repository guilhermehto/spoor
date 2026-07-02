import { createServerFn } from "@tanstack/react-start";
import { count } from "drizzle-orm";
import { db } from "~/db/index";
import { user } from "~/db/schema";

// No session required: this only reveals whether the instance is claimed,
// which the register page must know pre-auth anyway.
export const signupOpenFn = createServerFn({ method: "GET" }).handler(
  async () => {
    const [row] = await db.select({ total: count(user.id) }).from(user);
    return { open: (row?.total ?? 0) === 0 };
  },
);
