import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  createUser: vi.fn(),
  checkRateLimit: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({ getAll: () => [], set: vi.fn() }),
}));
vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({ auth: { getUser: mocks.getUser } }),
}));
vi.mock("@/lib/supabase-service", () => ({
  getServiceSupabase: () => ({ auth: { admin: { createUser: mocks.createUser } } }),
}));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: mocks.checkRateLimit,
}));
vi.mock("@/lib/org", () => ({ getOrCreateOrgForUser: vi.fn() }));

import { GET } from "@/app/api/auth/guest/route";

describe("guest session creation failures", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    mocks.checkRateLimit.mockResolvedValue(null);
  });

  it("returns an actionable auth code without exposing the raw server error", async () => {
    mocks.createUser.mockResolvedValue({
      data: { user: null },
      error: {
        code: "database_error",
        status: 500,
        message: "Sensitive database detail",
      },
    });

    const response = await GET(
      new NextRequest("https://ai-bid-manager.vercel.app/api/auth/guest"),
    );

    expect(response.status).toBe(503);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({
      error: "Could not create your private guest session.",
      diagnostic: { stage: "create_user", code: "database_error", status: 500 },
    });
    expect(mocks.createUser).toHaveBeenCalledWith(
      expect.objectContaining({
        email: expect.stringMatching(/^guest-[\da-f-]+@ai-bid-manager\.vercel\.app$/),
        email_confirm: true,
        user_metadata: { is_guest: true },
      }),
    );
  });
});
