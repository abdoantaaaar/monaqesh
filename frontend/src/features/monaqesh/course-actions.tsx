import type { ApiUser, ApiAudit } from "@/services/contracts";
import { useState } from "react";
import { Plus, UserPlus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useMonaqesh } from "./context";
import { Modal, SearchInput, Avatar, ConfirmDialog } from "./components";
import { courseService } from "@/services/courseService";
import { api, patch } from "@/services/api";
import { mapUser, coursePath } from "@/services/workspace";
import { type Course, type User } from "@/services/data";
export function CreateCourse() {
  const { state, mutate } = useMonaqesh();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  if (state.user?.role !== "DOCTOR") return null;
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus size={16} />
        Create Course
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Create a new course"
        description="Courses start as drafts. Publish the course when ready."
      >
        <form
          className="modal-form"
          onSubmit={async (e) => {
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            setBusy(true);
            setError("");
            try {
              await mutate(() =>
                courseService.create({
                  name: String(data.get("name")).trim(),
                  code: String(data.get("code")).trim(),
                  semester: String(data.get("semester")),
                  description: String(data.get("description")).trim(),
                }),
              );
              toast.success("Course created as a draft.");
              setOpen(false);
            } catch (err) {
              setError(err instanceof Error ? err.message : "Unable to create course.");
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="field">
            <label htmlFor="course-name">Course Name</label>
            <input id="course-name" name="name" required maxLength={120} />
          </div>
          <div className="field">
            <label htmlFor="course-code">Course Code</label>
            <input id="course-code" name="code" required maxLength={30} />
          </div>
          <div className="field">
            <label htmlFor="semester">Semester</label>
            <input id="semester" name="semester" defaultValue="Fall 2026" required maxLength={40} />
          </div>
          <div className="field">
            <label htmlFor="course-desc">Description</label>
            <textarea id="course-desc" name="description" maxLength={5000} />
          </div>
          {error && (
            <p role="alert" className="error-note">
              {error}
            </p>
          )}
          <div className="modal-actions">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button disabled={busy}>{busy ? "Creating…" : "Create Course"}</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
export function TeachingAssistants({ course }: { course: Course }) {
  const { state, mutate } = useMonaqesh();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [candidates, setCandidates] = useState<User[]>([]);
  const [removeId, setRemove] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const isDoctor = state.user?.role === "DOCTOR";
  const add = async (ta: User) => {
    setBusy(true);
    try {
      await mutate(() => courseService.setTA(course.id, ta.universityId, true));
      setOpen(false);
      toast.success("Teaching assistant assigned.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to assign TA.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <div className="section-heading">
        <h2>
          Teaching Assistants <small>{course.tas.length} assigned</small>
        </h2>
        {isDoctor && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setError("");
              setOpen(true);
            }}
          >
            <UserPlus size={14} />
            Add TA
          </Button>
        )}
      </div>
      <div className="member-grid">
        {course.tas.map((id) => {
          const ta = state.users[id];
          return (
            ta && (
              <div className="member" key={id}>
                <Avatar name={ta.name} />
                <div className="flex-1">
                  <strong>{ta.name}</strong>
                  <small>{ta.email}</small>
                </div>
                {isDoctor && course.taPermissions[id] && (
                  <div className="flex flex-col gap-2">
                    <label className="small-note">
                      <input
                        type="checkbox"
                        disabled={busy}
                        checked={course.taPermissions[id]!.can_manage_grades}
                        onChange={async (e) => {
                          const value = e.target.checked;
                          setBusy(true);
                          try {
                            await mutate(() =>
                              patch(`${coursePath(course.id)}/tas/${id}`, {
                                ...course.taPermissions[id],
                                can_manage_grades: value,
                              }),
                            );
                          } catch (e) {
                            toast.error(e instanceof Error ? e.message : "Update failed.");
                          } finally {
                            setBusy(false);
                          }
                        }}
                      />{" "}
                      Manage grades
                    </label>
                    <label className="small-note">
                      <input
                        type="checkbox"
                        disabled={busy}
                        checked={course.taPermissions[id]!.can_view_reports}
                        onChange={async (e) => {
                          const value = e.target.checked;
                          setBusy(true);
                          try {
                            await mutate(() =>
                              patch(`${coursePath(course.id)}/tas/${id}`, {
                                ...course.taPermissions[id],
                                can_view_reports: value,
                              }),
                            );
                          } catch (e) {
                            toast.error(e instanceof Error ? e.message : "Update failed.");
                          } finally {
                            setBusy(false);
                          }
                        }}
                      />{" "}
                      View reports & files
                    </label>
                  </div>
                )}
                {isDoctor && (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove ${ta.name}`}
                    onClick={() => setRemove(id)}
                  >
                    <Trash2 size={14} />
                  </Button>
                )}
              </div>
            )
          );
        })}
      </div>
      {!course.tas.length && <p className="small-note">No teaching assistants assigned yet.</p>}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Add a teaching assistant"
        description="Search existing university accounts."
      >
        <form
          className="flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              const rows = await api<ApiUser[]>(
                `/api/courses/ta-candidates?q=${encodeURIComponent(search)}`,
              );
              setCandidates(rows.map(mapUser));
            } catch (e) {
              setError(e instanceof Error ? e.message : "Search failed.");
            } finally {
              setBusy(false);
            }
          }}
        >
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Name, email or university ID (2+ characters)"
          />
          <Button disabled={busy || search.trim().length < 2}>Search</Button>
        </form>
        {error && (
          <p role="alert" className="error-note">
            {error}
          </p>
        )}
        {candidates
          .filter((t) => !course.tas.includes(t.id))
          .map((ta) => (
            <div className="flex justify-between items-center py-3" key={ta.id}>
              <div>
                <strong>{ta.name}</strong>
                <p className="small-note">{ta.email}</p>
              </div>
              <Button disabled={busy} onClick={() => add(ta)}>
                Add
              </Button>
            </div>
          ))}
      </Modal>
      <ConfirmDialog
        open={!!removeId}
        onClose={() => setRemove(null)}
        title="Remove teaching assistant?"
        message="Their access to this course will be removed."
        onConfirm={async () => {
          if (!removeId) return;
          await mutate(() => courseService.setTA(course.id, removeId, false));
          toast.success("TA removed.");
        }}
      />
    </>
  );
}
export function CourseControls({ course }: { course: Course }) {
  const { state, mutate } = useMonaqesh();
  const [busy, setBusy] = useState(false);
  const [auditOpen, setAuditOpen] = useState(false);
  const [auditRows, setAuditRows] = useState<ApiAudit[]>([]);
  if (state.user?.role !== "DOCTOR") return null;
  const change = async (body: unknown) => {
    setBusy(true);
    try {
      await mutate(() => courseService.update(course.id, body));
      toast.success("Course settings saved.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unable to update course.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="content-section">
      <div className="section-heading">
        <h3>Course Settings</h3>
        <Button
          variant="outline"
          onClick={async () => {
            try {
              setAuditRows(await api<ApiAudit[]>(`${coursePath(course.id)}/audit?limit=50`));
              setAuditOpen(true);
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Unable to load activity.");
            }
          }}
        >
          View Activity
        </Button>
      </div>
      <Modal
        open={auditOpen}
        onClose={() => setAuditOpen(false)}
        title="Course Activity"
        description="Latest 50 recorded course operations."
      >
        {auditRows.map((row) => (
          <div className="activity" key={row.id}>
            <div>
              <strong>{row.action}</strong>
              <p className="small-note">
                {state.users[String(row.actor_id)]?.name || "User " + row.actor_id} ·{" "}
                {new Date(row.created_at).toLocaleString()}
              </p>
            </div>
          </div>
        ))}
      </Modal>
      <div className="flex flex-wrap gap-3">
        <Button disabled={busy} onClick={() => change({ is_published: !course.published })}>
          {course.published ? "Unpublish Course" : "Publish Course"}
        </Button>
        <Button
          disabled={busy}
          variant="outline"
          onClick={() => change({ enrollment_open: !course.enrollmentOpen })}
        >
          {course.enrollmentOpen ? "Close Registration" : "Open Registration"}
        </Button>
        <Button
          disabled={busy}
          variant="outline"
          onClick={() => change({ teams_open: !course.teamsOpen })}
        >
          {course.teamsOpen ? "Close Team Formation" : "Open Team Formation"}
        </Button>
      </div>
      <form
        className="modal-form mt-4"
        onSubmit={(e) => {
          e.preventDefault();
          const d = new FormData(e.currentTarget);
          void change({ min_team_size: Number(d.get("min")), max_team_size: Number(d.get("max")) });
        }}
      >
        <div className="flex flex-wrap gap-3 items-end">
          <div className="field">
            <label>Minimum team size</label>
            <input
              name="min"
              aria-label="Minimum team size"
              type="number"
              min={1}
              max={20}
              defaultValue={course.minTeamSize}
              required
            />
          </div>
          <div className="field">
            <label>Maximum team size</label>
            <input
              name="max"
              aria-label="Maximum team size"
              type="number"
              min={1}
              max={20}
              defaultValue={course.maxTeamSize}
              required
            />
          </div>
          <Button variant="outline" disabled={busy}>
            Save Size Rules
          </Button>
        </div>
      </form>
      <p className="small-note mt-3">Size rules can be changed before teams are created.</p>
    </div>
  );
}
