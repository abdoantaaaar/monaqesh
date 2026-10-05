import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { BookOpen, TrendingUp, Save, ClipboardCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useMonaqesh } from "./context";
import {
  AppShell,
  PageHeader,
  SearchInput,
  Avatar,
  StatusBadge,
  StatCard,
  EmptyState,
} from "./components";
import { gradeKey, type Course } from "@/services/data";
import { gradeService } from "@/services/gradeService";
import { courseService } from "@/services/courseService";
import { patch } from "@/services/api";
import { coursePath } from "@/services/workspace";
export function AssessmentCards({ course }: { course: Course }) {
  return (
    <div className="assessment-list">
      {course.assessments.map((a) => (
        <article className="assessment-card" key={a.id}>
          <div className="flex justify-between items-center">
            <h3>{a.name}</h3>
            <ClipboardCheck size={16} />
          </div>
          <div className="assessment-metrics">
            <div>
              <small>Max Grade</small>
              <strong>{a.max}</strong>
            </div>
            <div>
              <small>Recorded Average</small>
              <strong>{a.average?.toFixed(1) ?? "—"}</strong>
            </div>
            <div>
              <small>Students Graded</small>
              <strong>
                {a.graded} / {course.students}
              </strong>
            </div>
          </div>
          {
            <Button asChild variant="outline" size="sm">
              <Link
                to="/courses/$courseId/grades/$assessmentId"
                params={{ courseId: course.id, assessmentId: a.id }}
              >
                {course.permissions.can_manage_grades ? "Manage Grades" : "View Grades"}
              </Link>
            </Button>
          }
        </article>
      ))}
    </div>
  );
}
export function StudentGrades({ course }: { course: Course }) {
  const { state } = useMonaqesh();
  const u = state.user;
  if (!u) return null;
  return (
    <>
      <div className="section-heading">
        <h2>Your Grades</h2>
        <span className="small-note">Published results only</span>
      </div>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Assessment</th>
              <th>Grade</th>
              <th>Max Grade</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {course.assessments.map((a) => {
              const g = state.grades[gradeKey(course.id, a.id, u.id)];
              return (
                <tr key={a.id}>
                  <td>{a.name}</td>
                  <td>{g ?? "—"}</td>
                  <td>{a.max}</td>
                  <td>
                    <StatusBadge>{g !== undefined ? "Published" : "Pending"}</StatusBadge>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
export function GradeResultsPage({
  courseId,
  assessmentId,
}: {
  courseId: string;
  assessmentId: string;
}) {
  const { state } = useMonaqesh();
  const c = state.courses.find((c) => c.id === courseId);
  const a = c?.assessments.find((a) => a.id === assessmentId);
  return (
    <AppShell>
      {c && a && state.user?.role !== "STUDENT" ? (
        <>
          <Button variant="link" asChild className="px-0 mb-4">
            <Link to="/courses/$courseId" params={{ courseId }}>
              ← Back to {c.name}
            </Link>
          </Button>
          <PageHeader title={`${a.name} Results`} description={`${c.name} · ${c.code}`} />
          <GradeTable course={c} assessmentId={assessmentId} />
        </>
      ) : (
        <EmptyState
          title="Results unavailable"
          message="You do not have access to this assessment."
        />
      )}
    </AppShell>
  );
}
export function GradeTable({ course, assessmentId }: { course: Course; assessmentId: string }) {
  const { state, mutate } = useMonaqesh();
  const editable = course.permissions.can_manage_grades;
  const a = course.assessments.find((a) => a.id === assessmentId);
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  if (!a) return null;
  const students = course.studentIds.map((id) => state.users[id]!);
  const filtered = students.filter((s) =>
    `${s.name} ${s.universityId}`.toLowerCase().includes(search.toLowerCase()),
  );
  const values = students
    .map((s) => state.grades[gradeKey(course.id, a.id, s.id)])
    .filter((n): n is number => n !== undefined);
  const save = async (ids: string[]) => {
    const grades = Object.fromEntries(
      ids
        .filter((id) => draft[id] !== undefined)
        .map((id) => [id, (draft[id] ?? "").trim() === "" ? NaN : Number(draft[id])]),
    );
    if (!Object.keys(grades).length) {
      toast.info("No changes to save.");
      return;
    }
    if (Object.values(grades).some((n) => !Number.isFinite(n) || n < 0 || n > a.max)) {
      toast.error(`Grade must be between 0 and ${a.max}.`);
      return;
    }
    setBusy(true);
    try {
      await mutate(() => gradeService.save(course.id, a.id, grades));
      setDraft((d) => Object.fromEntries(Object.entries(d).filter(([id]) => !ids.includes(id))));
      toast.success("Grades saved. The doctor must publish them.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unable to save.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <div className="stats-grid">
        <StatCard
          label="Students"
          value={students.length}
          icon={BookOpen}
          caption={`${values.length} recorded grades`}
        />
        <StatCard
          label="Average"
          value={a.average?.toFixed(1) ?? "—"}
          icon={TrendingUp}
          caption={`Out of ${a.max}`}
        />
      </div>
      <div className="toolbar">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search student name or university ID…"
        />
        <Button disabled={busy || !editable} onClick={() => save(students.map((s) => s.id))}>
          <Save size={15} />
          Save Changes
        </Button>
        {course.permissions.can_publish && (
          <Button
            disabled={busy || !values.length || Object.keys(draft).length > 0}
            variant="outline"
            onClick={async () => {
              setBusy(true);
              try {
                await mutate(() =>
                  gradeService.publish(
                    course.id,
                    a.id,
                    students
                      .filter((s) => state.grades[gradeKey(course.id, a.id, s.id)] !== undefined)
                      .map((s) => s.id),
                  ),
                );
                toast.success("Grades published.");
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Unable to publish grades.");
              } finally {
                setBusy(false);
              }
            }}
          >
            Publish Recorded Grades
          </Button>
        )}
      </div>
      {course.permissions.can_publish && a.graded === 0 && (
        <form
          className="flex gap-3 mb-5"
          onSubmit={async (e) => {
            e.preventDefault();
            const d = new FormData(e.currentTarget);
            setBusy(true);
            try {
              await mutate(() =>
                patch(`${coursePath(course.id)}/assessments/${a.id}`, {
                  max_score: Number(d.get("max")),
                }),
              );
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Unable to update maximum.");
            } finally {
              setBusy(false);
            }
          }}
        >
          <input
            aria-label="Maximum grade"
            name="max"
            type="number"
            min="0.01"
            step="0.01"
            defaultValue={a.max}
            required
          />
          <Button disabled={busy} variant="outline">
            Set Maximum Grade
          </Button>
        </form>
      )}
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Student</th>
              <th>University ID</th>
              <th>Grade</th>
              <th>Max</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((s) => {
              const key = gradeKey(course.id, a.id, s.id);
              return (
                <tr key={s.id}>
                  <td>
                    <div className="person-cell">
                      <Avatar name={s.name} />
                      <strong>{s.name}</strong>
                    </div>
                  </td>
                  <td>{s.universityId}</td>
                  <td>
                    <input
                      disabled={!editable}
                      className="grade-input"
                      type="number"
                      min={0}
                      max={a.max}
                      step="0.01"
                      aria-label={`Grade for ${s.name}`}
                      value={draft[s.id] ?? state.grades[key] ?? ""}
                      onChange={(e) => setDraft((d) => ({ ...d, [s.id]: e.target.value }))}
                    />
                  </td>
                  <td>{a.max}</td>
                  <td>
                    <StatusBadge>
                      {state.published[key]
                        ? "Published"
                        : state.grades[key] !== undefined
                          ? "Draft"
                          : "Pending"}
                    </StatusBadge>
                  </td>
                  <td>
                    <Button
                      disabled={busy || !editable}
                      variant="outline"
                      size="sm"
                      onClick={() => save([s.id])}
                    >
                      Save
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!filtered.length && (
          <EmptyState
            title="No students found"
            message="Students must register in this course first."
          />
        )}
      </div>
    </>
  );
}
export function GradingPage() {
  const { state } = useMonaqesh();
  const u = state.user;
  const courses = u
    ? courseService.list(state, u).filter((c) => c.permissions.can_manage_grades)
    : [];
  return (
    <AppShell>
      <PageHeader title="Grading" description="Record grades, then publish approved results." />
      {courses.length ? (
        <div className="space-y-8">
          {courses.map((c) => (
            <section key={c.id}>
              <div className="section-heading">
                <h2>{c.name}</h2>
              </div>
              <AssessmentCards course={c} />
            </section>
          ))}
        </div>
      ) : (
        <EmptyState
          title="No grading access"
          message="Your course permissions do not include managing grades."
        />
      )}
    </AppShell>
  );
}
