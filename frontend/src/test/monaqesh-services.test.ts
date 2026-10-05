import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { api, signIn, clearTokens } from "@/services/api";
import { loadWorkspace } from "@/services/workspace";
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
const user = {
  id: 11,
  university_id: "2301141",
  email: "2301141@rst.edu.eg",
  name: "Ahmed",
  role: "student",
};
const tokens = {
  access_token: "access-one",
  refresh_token: "refresh-one",
  token_type: "bearer",
  expires_in: 900,
};
beforeEach(() => {
  clearTokens();
  sessionStorage.clear();
});
afterEach(() => {
  vi.unstubAllGlobals();
});
describe("FastAPI transport", () => {
  it("sends actual credentials to login and uses the issued bearer token", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(json(tokens)).mockResolvedValueOnce(json(user));
    vi.stubGlobal("fetch", fetcher);
    await signIn(user.email, "2301141@sis");
    await api("/api/auth/me");
    expect(fetcher.mock.calls[0]?.[0]).toContain("/api/auth/login");
    expect(JSON.parse(fetcher.mock.calls[0]?.[1].body)).toEqual({
      identifier: user.email,
      password: "2301141@sis",
    });
    expect(fetcher.mock.calls[1]?.[1].headers.get("Authorization")).toBe("Bearer access-one");
  });
  it("rotates tokens once when concurrent requests encounter an expired access token", async () => {
    let refreshed = false;
    let refreshCount = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.endsWith("/login")) return json(tokens);
        if (url.endsWith("/refresh")) {
          refreshCount++;
          await Promise.resolve();
          refreshed = true;
          return json({ ...tokens, access_token: "access-two", refresh_token: "refresh-two" });
        }
        return refreshed ? json(user) : json({ detail: "expired" }, 401);
      }),
    );
    await signIn(user.email, "password");
    const values = await Promise.all([api("/api/auth/me"), api("/api/auth/me")]);
    expect(values).toHaveLength(2);
    expect(refreshCount).toBe(1);
  });
  it("does not turn invalid credentials into a mock login", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ detail: "Invalid credentials" }, 401)));
    await expect(signIn(user.email, "wrong")).rejects.toThrow("Invalid credentials");
    expect(sessionStorage.getItem("monaqesh-tokens")).toBeNull();
  });
  it("preserves actionable validation errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          json({ detail: [{ loc: ["body", "code"], msg: "Field required" }] }, 422),
        ),
    );
    await expect(api("/api/courses", { method: "POST", body: "{}" })).rejects.toThrow(
      "body.code: Field required",
    );
  });
});
describe("authorised workspace", () => {
  it("hydrates only enrolled courses and published student grades without requesting staff data", async () => {
    const visited: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        visited.push(url);
        if (url.endsWith("/me")) return json(user);
        if (url.endsWith("/catalog")) return json([]);
        if (url.endsWith("/api/courses"))
          return json([
            {
              id: 1,
              title: "AI",
              code: "AI",
              semester: "Fall",
              description: "",
              is_published: true,
              enrollment_open: true,
              teams_open: true,
              min_team_size: 2,
              max_team_size: 5,
            },
          ]);
        if (url.endsWith("/api/courses/1"))
          return json({
            professor: { name: "Heba" },
            teaching_assistants: [],
            permissions: {},
            can_create_team: true,
            assessments: [{ id: 10, kind: "quiz1", title: "Quiz 1", max_score: "10" }],
          });
        if (url.endsWith("/my-grades"))
          return json([{ assessment: { id: 10 }, grade: { score: "8" } }]);
        if (url.endsWith("/project"))
          return json({ can_create_team: true, can_join_team: true, team: null });
        throw new Error("Unexpected URL " + url);
      }),
    );
    const state = await loadWorkspace();
    expect(state.user?.id).toBe("11");
    expect(state.user?.universityId).toBe("2301141");
    expect(state.grades["1:10:11"]).toBe(8);
    expect(state.courses[0]?.canCreateTeam).toBe(true);
    expect(visited.some((p) => p.endsWith("/students") || p.endsWith("/teams"))).toBe(false);
  });
});
