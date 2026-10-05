import { useState, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ArrowRight, Eye, EyeOff, LockKeyhole, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

import { useMonaqesh } from "./context";
import { Brand, Modal } from "./components";
export function LoginPage() {
  const { state, login, ready, error: workspaceError, refresh } = useMonaqesh();
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [forgot, setForgot] = useState(false);
  useEffect(() => {
    if (ready && state.user) navigate({ to: "/dashboard" });
  }, [ready, state.user, navigate]);
  return (
    <div className="login">
      <section className="login-art">
        <Brand />
        <div className="login-art-head">
          <span className="eyebrow">IDEAS DESERVE A CONVERSATION</span>
          <h1>Monaqesh</h1>
          <p>
            Smart University Project
            <br />
            Discussion &amp; Evaluation
          </p>
        </div>
        <div className="dialogue-composition" aria-hidden="true">
          <div className="composition-grid" />
          <div className="dialogue-outline dialogue-one" />
          <div className="dialogue-outline dialogue-two" />
          <div className="dialogue-solid" />
          <div className="composition-axis">
            <span>01 — EXPLORE</span>
            <span>02 — DISCUSS</span>
            <span>03 — EVALUATE</span>
          </div>
          <div className="composition-caption">
            A space for ideas.
            <br />A place to grow.
          </div>
        </div>
        <div className="login-art-foot">
          <span>KNOWLEDGE, IN CONVERSATION.</span>
          <span>EST. 2026</span>
        </div>
      </section>
      <section className="login-form-side">
        <div className="login-form">
          <div className="eyebrow">YOUR ACADEMIC WORKSPACE</div>
          <h2>Welcome back.</h2>
          <p>Sign in to continue your academic journey.</p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setError("");
              setBusy(true);
              try {
                await login(identifier, password);
                navigate({ to: "/dashboard" });
              } catch (err) {
                setError(err instanceof Error ? err.message : "Unable to sign in.");
              } finally {
                setBusy(false);
              }
            }}
          >
            <div className="field">
              <label htmlFor="university-id">University Email / ID</label>
              <input
                id="university-id"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="Enter your university email or ID"
                autoComplete="username"
                required
              />
            </div>
            <div className="field">
              <div className="flex items-center justify-between">
                <label htmlFor="password">Password</label>
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="px-0 h-auto text-xs"
                  onClick={() => setForgot(true)}
                >
                  Forgot Password?
                </Button>
              </div>
              <div className="input-icon">
                <input
                  id="password"
                  type={visible ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  required
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={visible ? "Hide password" : "Show password"}
                  onClick={() => setVisible((v) => !v)}
                >
                  {visible ? <EyeOff size={16} /> : <Eye size={16} />}
                </Button>
              </div>
            </div>
            {(error || workspaceError) && (
              <div role="alert" className="error-note">
                {error || workspaceError}
              </div>
            )}
            <Button disabled={busy || !ready} className="login-submit" type="submit">
              {busy ? (
                <>
                  <LoaderCircle className="animate-spin" />
                  Signing in…
                </>
              ) : (
                <>
                  Login <ArrowRight size={16} />
                </>
              )}
            </Button>
          </form>
          <div className="login-security">
            <LockKeyhole size={12} />
            <span>Your university. Your secure workspace.</span>
          </div>
        </div>
        <div className="login-footer">© 2026 Monaqesh · All rights reserved.</div>
      </section>
      <Modal
        open={forgot}
        onClose={() => setForgot(false)}
        title="Reset your university password"
        description="For assistance with your university credentials, please contact your university’s IT support office."
      >
        <Button onClick={() => setForgot(false)}>Back to Login</Button>
      </Modal>
    </div>
  );
}
