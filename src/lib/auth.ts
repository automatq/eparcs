import { auth } from "@clerk/nextjs/server";

/**
 * Get the authenticated user's ID.
 * Returns null userId if not authenticated.
 */
export async function getAuth() {
  const { userId } = await auth();
  return { userId };
}

/**
 * Require authentication or return a 401 Response.
 * Use in API routes: const err = await requireAuth(); if (err) return err;
 */
export async function requireAuth() {
  const { userId } = await getAuth();
  if (!userId) {
    return {
      error: new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
      userId: null,
    };
  }
  return { error: null, userId };
}
