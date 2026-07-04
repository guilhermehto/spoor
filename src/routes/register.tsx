import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { signUp } from "~/lib/auth-client";
import { signupOpenFn } from "~/server/signup-status";
import { Button } from "~/components/ui/button";

export const Route = createFileRoute("/register")({
  loader: () => signupOpenFn(),
  component: RegisterPage,
});

function RegisterPage() {
  const { open } = Route.useLoaderData();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await signUp.email({ name, email, password });
      if (result.error) {
        const msg = result.error.message ?? "";
        if (msg.includes("signup_disabled") || msg.includes("signup disabled")) {
          setError("Signup is disabled — an admin account already exists.");
        } else {
          setError(msg || "Registration failed");
        }
      } else {
        await navigate({ to: "/dashboard" });
      }
    } catch {
      setError("An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  }

  // Race case (user registers between loader and submit) is still handled by
  // the signup_disabled branch in handleSubmit above.
  if (!open) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-background p-8">
        <div className="w-full max-w-sm space-y-6 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Registration is closed
          </h1>
          <p className="text-sm text-muted-foreground">
            An admin account already exists.
          </p>
          <p className="text-sm text-muted-foreground">
            <Link to="/login" className="underline hover:text-foreground">
              Sign in
            </Link>
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background p-8">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Create your Spoor account
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            First-time setup only — one admin account allowed.
          </p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <label
              htmlFor="name"
              className="text-sm font-medium text-foreground"
            >
              Name
            </label>
            <input
              id="name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="Your name"
            />
          </div>
          <div className="space-y-1">
            <label
              htmlFor="email"
              className="text-sm font-medium text-foreground"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="you@example.com"
            />
          </div>
          <div className="space-y-1">
            <label
              htmlFor="password"
              className="text-sm font-medium text-foreground"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="••••••••"
            />
          </div>
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Creating account…" : "Create account"}
          </Button>
        </form>
        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link to="/login" className="underline hover:text-foreground">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
