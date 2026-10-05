import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Plus, Users, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useMonaqesh } from "./context";
import {
  Modal,
  EmptyState,
  Avatar,
  StatusBadge,
  TeamCode,
  ProjectStatusStepper,
  FileUpload,
} from "./components";
import { type Course, type Team, gradeKey } from "@/services/data";
import { teamService } from "@/services/teamService";
import { projectService } from "@/services/projectService";
import { post, patch, remove, downloadFile } from "@/services/api";
import { teamPath } from "@/services/workspace";
import { ReportEditor } from "./report";
export function TeamMembers({ team }: { team: Team }) {
  const { state } = useMonaqesh();
  return (
    <div className="member-grid">
      {team.members.map((id) => (
        <div className="member" key={id}>
          <Avatar name={state.users[id]?.name || id} />
          <div>
            <strong>{state.users[id]?.name || id}</strong>
            <small>
              {team.leaderId === id ? "Team Leader" : "Member"} · {state.users[id]?.universityId}
            </small>
          </div>
        </div>
      ))}
    </div>
  );
}
export function ProjectArea({ course }: { course: Course }) {
  const { state } = useMonaqesh();
  const u = state.user;
  const [view, setView] = useState<string | null>(null);
  if (!u) return null;
  const teams = state.teams.filter((t) => t.courseId === course.id);
  const own = teamService.find(state, u, course.id);
  if (u.role === "STUDENT")
    return own ? <TeamDetails key={own.id} team={own} /> : <NoTeam course={course} />;
  const selected = teams.find((t) => t.id === view);
  return selected ? (
    <>
      <Button variant="link" onClick={() => setView(null)}>
        ← Back to Project Teams
      </Button>
      <TeamDetails key={selected.id} team={selected} />
    </>
  ) : (
    <>
      <div className="section-heading">
        <h2>Project Teams</h2>
        <span className="small-note">{teams.length} teams</span>
      </div>
      {teams.length ? (
        <div className="team-grid">
          {teams.map((team) => (
            <article className="team-card" key={team.id}>
              <div className="flex justify-between">
                <span className="eyebrow">{team.name}</span>
                <StatusBadge>{team.status}</StatusBadge>
              </div>
              <h3>{team.title}</h3>
              <p>{team.description || "Project details are being prepared."}</p>
              <div className="flex gap-3 mt-5">
                <Users size={16} />
                {team.members.length} members
              </div>
              <div className="team-card-foot">
                <span className="small-note">
                  {team.locked ? "Final submission locked" : "Preparing submission"}
                </span>
                <Button variant="outline" onClick={() => setView(team.id)}>
                  View Team
                </Button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          title="No teams yet"
          message="Designated students can create teams after enrolling."
        />
      )}
    </>
  );
}
function NoTeam({ course }: { course: Course }) {
  const { mutate } = useMonaqesh();
  const [mode, setMode] = useState<"create" | "join" | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <>
      <EmptyState title="Project Team" message="You are not part of a team in this course.">
        <div className="flex gap-3 justify-center">
          {course.canCreateTeam && (
            <Button
              onClick={() => {
                setMode("create");
                setError("");
              }}
            >
              <Plus />
              Create Team
            </Button>
          )}
          {course.canJoinTeam && (
            <Button
              variant="outline"
              onClick={() => {
                setMode("join");
                setError("");
              }}
            >
              <Users />
              Join Team
            </Button>
          )}
        </div>
        {!course.canCreateTeam && course.canJoinTeam && (
          <p className="small-note mt-4">The doctor selects students who may create teams.</p>
        )}
      </EmptyState>
      <Modal
        open={!!mode}
        onClose={() => setMode(null)}
        title={mode === "create" ? "Create your team" : "Join a team"}
        description={
          mode === "create"
            ? "Choose a team name. Add project details after creation."
            : "Enter the code exactly as shared by the team leader."
        }
      >
        <form
          className="modal-form"
          onSubmit={async (e) => {
            e.preventDefault();
            const d = new FormData(e.currentTarget);
            setBusy(true);
            setError("");
            try {
              await mutate(() =>
                mode === "create"
                  ? teamService.create(course.id, String(d.get("value")).trim())
                  : teamService.join(course.id, String(d.get("value")).trim()),
              );
              setMode(null);
              toast.success(
                mode === "create"
                  ? "Team created. Your code is shown in the team page."
                  : "Joined team.",
              );
            } catch (e) {
              setError(e instanceof Error ? e.message : "Operation failed.");
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="field">
            <label htmlFor="team-value">{mode === "create" ? "Team Name" : "Team Code"}</label>
            <input id="team-value" name="value" required maxLength={mode === "create" ? 100 : 30} />
          </div>
          {error && (
            <p role="alert" className="error-note">
              {error}
            </p>
          )}
          <div className="modal-actions">
            <Button type="button" variant="outline" onClick={() => setMode(null)}>
              Cancel
            </Button>
            <Button disabled={busy}>
              {busy ? "Saving…" : mode === "create" ? "Create Team" : "Join Team"}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
export function TeamDetails({ team }: { team: Team }) {
  const { state, mutate } = useMonaqesh();
  const u = state.user;
  const course = state.courses.find((c) => c.id === team.courseId);
  const [draft, setDraft] = useState({ title: team.title, description: team.description });
  const [files, setFiles] = useState<Record<string, File>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [contribution, setContribution] = useState(u ? team.contributions[u.id] || "" : "");
  const [newLeader, setNewLeader] = useState("");
  if (!u || !course) return null;
  const leader = u.role === "STUDENT" && team.leaderId === u.id;
  const editable = leader && !team.locked;
  const access = u.role === "STUDENT" || course.permissions.can_view_reports;
  const run = async (action: () => Promise<unknown>, message: string) => {
    setBusy(true);
    setError("");
    try {
      await mutate(action);
      toast.success(message);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Operation failed.");
    } finally {
      setBusy(false);
    }
  };
  const save = async (submit: boolean) => {
    setBusy(true);
    setError("");
    try {
      await mutate(() => projectService.save(team, draft, files, submit));
      setFiles({});
      toast.success(submit ? "Final submission confirmed and locked." : "Draft and files saved.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <div className="content-section">
        <div className="section-heading">
          <h2>{team.name}</h2>
          <StatusBadge>{team.status}</StatusBadge>
        </div>
        {team.code && (
          <>
            <p className="small-note">Share this code with your team members.</p>
            <TeamCode code={team.code} />
          </>
        )}
        <ProjectStatusStepper team={team} />
        <h3 className="mb-4">Team Members</h3>
        <TeamMembers team={team} />
        {u.role === "STUDENT" && !team.locked && (
          <>
            <div className="field mt-5">
              <label htmlFor="contribution">Your Contribution</label>
              <textarea
                id="contribution"
                maxLength={2000}
                value={contribution}
                onChange={(e) => setContribution(e.target.value)}
              />
              <Button
                disabled={busy || !contribution.trim()}
                variant="outline"
                onClick={() =>
                  run(
                    () =>
                      patch(`${teamPath(team.courseId, team.id)}/my-contribution`, {
                        contribution,
                      }),
                    "Contribution saved.",
                  )
                }
              >
                Save Contribution
              </Button>
            </div>
            {leader ? (
              <div className="flex flex-wrap gap-3 mt-4">
                <select
                  aria-label="New team leader"
                  value={newLeader}
                  onChange={(e) => setNewLeader(e.target.value)}
                >
                  <option value="">Choose new leader</option>
                  {team.members
                    .filter((id) => id !== u.id)
                    .map((id) => (
                      <option key={id} value={id}>
                        {state.users[id]?.name}
                      </option>
                    ))}
                </select>
                <Button
                  disabled={busy || !newLeader}
                  variant="outline"
                  onClick={() =>
                    run(
                      () =>
                        post(`${teamPath(team.courseId, team.id)}/transfer-leadership`, {
                          student_id: Number(newLeader),
                        }),
                      "Leadership transferred.",
                    )
                  }
                >
                  Transfer Leadership
                </Button>
                {team.members.length === 1 && !team.submissionId && (
                  <Button
                    disabled={busy}
                    variant="destructive"
                    onClick={() => {
                      if (window.confirm("Delete this team?"))
                        void run(() => remove(teamPath(team.courseId, team.id)), "Team deleted.");
                    }}
                  >
                    Delete Team
                  </Button>
                )}
              </div>
            ) : (
              <Button
                disabled={busy}
                variant="outline"
                className="mt-4"
                onClick={() => {
                  if (window.confirm("Leave this team?"))
                    void run(() => post(`${teamPath(team.courseId, team.id)}/leave`), "Left team.");
                }}
              >
                Leave Team
              </Button>
            )}
          </>
        )}
        {team.locked && (
          <p className="small-note mt-4">
            The final submission has locked project files and team membership.
          </p>
        )}
      </div>
      {access ? (
        <section className="content-section">
          <div className="section-heading">
            <h2>Project Submission</h2>
            <span className="badge">
              {team.version ? "Version " + team.version : "No submission yet"}
            </span>
          </div>
          {editable ? (
            <form
              className="space-y-5"
              onSubmit={(e) => {
                e.preventDefault();
                if (
                  window.confirm("Confirm final submission? Files and membership will be locked.")
                )
                  void save(true);
              }}
            >
              <div className="field">
                <label htmlFor="project-title">Project Title</label>
                <input
                  id="project-title"
                  value={draft.title}
                  onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                  required
                  maxLength={160}
                />
              </div>
              <div className="field">
                <label htmlFor="project-description">Project Description</label>
                <textarea
                  id="project-description"
                  value={draft.description}
                  onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
                  maxLength={5000}
                />
              </div>
              <div className="info-grid">
                {(
                  [
                    { kind: "documentation", label: "Documentation (required)", ext: ".pdf" },
                    { kind: "source_code", label: "Source Code (required)", ext: ".zip" },
                    { kind: "readme", label: "README (required)", ext: ".txt,.md" },
                    { kind: "presentation", label: "Presentation (optional)", ext: ".pdf,.pptx" },
                  ] as const
                ).map((item) => (
                  <FileUpload
                    key={item.kind}
                    label={item.label}
                    extension={item.ext}
                    file={files[item.kind] || team.files.find((f) => f.kind === item.kind)}
                    onFile={(file) => setFiles((f) => ({ ...f, [item.kind]: file }))}
                  />
                ))}
              </div>
              <p className="small-note">
                Selected files upload when you save. Required: ZIP source, PDF documentation and
                TXT/MD README.
              </p>
              <div className="flex justify-end gap-3">
                <Button
                  disabled={busy || !draft.title.trim()}
                  type="button"
                  variant="outline"
                  onClick={() => save(false)}
                >
                  {busy ? "Saving…" : "Save Draft & Files"}
                </Button>
                <Button disabled={busy} type="submit">
                  Confirm Final Submission
                </Button>
              </div>
            </form>
          ) : (
            <>
              <dl className="info-grid">
                <div>
                  <dt>Project Title</dt>
                  <dd>{team.title}</dd>
                </div>
                <div>
                  <dt>Submission Created</dt>
                  <dd>
                    {team.submittedAt
                      ? new Date(team.submittedAt).toLocaleString()
                      : "Not submitted"}
                  </dd>
                </div>
                <div className="col-span-2">
                  <dt>Description</dt>
                  <dd>{team.description || "Not added"}</dd>
                </div>
              </dl>
            </>
          )}
          {team.files.map((f) => (
            <div className="file-row" key={f.id}>
              <div>
                <span>{f.name}</span>
                <small>{(f.size / 1048576).toFixed(2)} MB</small>
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Download ${f.name}`}
                onClick={async () => {
                  try {
                    await downloadFile(
                      `${teamPath(team.courseId, team.id)}/submissions/${f.submissionId}/files/${f.id}/download`,
                      f.name,
                    );
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : "Download failed.");
                  }
                }}
              >
                <Download size={15} />
              </Button>
            </div>
          ))}
        </section>
      ) : (
        <p className="small-note">
          Your course permissions do not include project files or reports.
        </p>
      )}
      {error && (
        <p role="alert" className="error-note">
          {error}
        </p>
      )}
      {access && (
        <>
          <div className="section-heading">
            <h2>Discussion Reports</h2>
            <Button variant="outline" asChild>
              <Link to="/reports/$teamId" params={{ teamId: team.id }}>
                View Reports
              </Link>
            </Button>
          </div>
          {u.role !== "STUDENT" && course.permissions.can_manage_grades && team.locked && (
            <ReportEditor team={team} />
          )}
        </>
      )}
    </>
  );
}
