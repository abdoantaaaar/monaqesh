import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useMonaqesh } from "./context";
import { AppShell, PageHeader, Avatar, StatusBadge, roleLabel } from "./components";
import { post, clearTokens } from "@/services/api";
export function ProfilePage() {
  const { state } = useMonaqesh();
  const u = state.user;
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const security = async (action: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await action();
      clearTokens();
      window.dispatchEvent(new Event("monaqesh-signed-out"));
      navigate({ to: "/" });
      toast.success("All sessions ended. Sign in again.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Operation failed.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <AppShell>
      {u && (
        <div className="profile-layout">
          <PageHeader
            title="My Profile"
            description="Your university account and session security."
          />
          <div className="profile-head">
            <Avatar name={u.name} large />
            <div>
              <h2>{u.name}</h2>
              <StatusBadge>{roleLabel(u.role)}</StatusBadge>
            </div>
          </div>
          <dl className="info-grid">
            <div>
              <dt>Full Name</dt>
              <dd>{u.name}</dd>
            </div>
            <div>
              <dt>University Email</dt>
              <dd>{u.email}</dd>
            </div>
            <div>
              <dt>University ID</dt>
              <dd>{u.universityId}</dd>
            </div>
            <div>
              <dt>Role</dt>
              <dd>{roleLabel(u.role)}</dd>
            </div>
          </dl>
          <section className="content-section mt-8">
            <h3 className="mb-4">Change Password</h3>
            <form
              className="modal-form"
              onSubmit={(e) => {
                e.preventDefault();
                const d = new FormData(e.currentTarget);
                void security(() =>
                  post("/api/auth/change-password", {
                    current_password: d.get("current"),
                    new_password: d.get("new"),
                  }),
                );
              }}
            >
              <div className="field">
                <label htmlFor="current-password">Current Password</label>
                <input
                  id="current-password"
                  name="current"
                  type="password"
                  autoComplete="current-password"
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="new-password">New Password (at least 12 characters)</label>
                <input
                  id="new-password"
                  name="new"
                  type="password"
                  autoComplete="new-password"
                  minLength={12}
                  maxLength={256}
                  required
                />
              </div>
              <Button disabled={busy}>Change Password</Button>
            </form>
          </section>
          <Button
            disabled={busy}
            variant="outline"
            onClick={() => security(() => post("/api/auth/logout-all"))}
          >
            Log Out of All Sessions
          </Button>
        </div>
      )}
    </AppShell>
  );
}
