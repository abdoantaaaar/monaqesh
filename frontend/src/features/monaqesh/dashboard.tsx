import { Link } from "@tanstack/react-router";
import { BookOpen, Users, FolderOpen, ClipboardCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMonaqesh } from "./context";
import { AppShell, PageHeader, StatCard, CourseCard, StatusBadge, EmptyState } from "./components";
import { CreateCourse } from "./course-actions";
import { gradeKey } from "@/services/data";
export function DashboardPage() {
  return (
    <AppShell>
      <DashboardContent />
    </AppShell>
  );
}
function DashboardContent() {
  const { state } = useMonaqesh();
  const u = state.user;
  if (!u) return null;
  const courses = state.courses.filter((c) => state.myCourseIds.includes(c.id));
  return (
    <>
      <PageHeader
        title={`Welcome back, ${u.name}.`}
        description="Your courses, teams and published results."
        actions={<CreateCourse />}
      />
      <div className="stats-grid">
        <StatCard
          label={u.role === "STUDENT" ? "Registered Courses" : "Assigned Courses"}
          value={courses.length}
          icon={BookOpen}
        />
        <StatCard label="Project Teams" value={state.teams.length} icon={FolderOpen} tone="sage" />
        <StatCard
          label={u.role === "STUDENT" ? "Published Grades" : "Recorded Grades"}
          value={Object.keys(state.grades).length}
          icon={ClipboardCheck}
          tone="taupe"
        />
        {u.role !== "STUDENT" && (
          <StatCard
            label="Course Enrollments"
            value={courses.reduce((sum, c) => sum + c.students, 0)}
            icon={Users}
            tone="mauve"
          />
        )}
      </div>
      <div className="dashboard-grid">
        <div>
          <div className="section-heading">
            <h2>My Courses</h2>
            <Button variant="ghost" asChild>
              <Link to="/courses">View all</Link>
            </Button>
          </div>
          <div className="course-grid">
            {courses.map((c) => (
              <CourseCard course={c} key={c.id} />
            ))}
          </div>
          {!courses.length && (
            <EmptyState
              title="No courses yet"
              message={
                u.role === "DOCTOR"
                  ? "Create a course to get started."
                  : u.role === "STUDENT"
                    ? "Browse available courses and register."
                    : "Your doctor can assign you to a course."
              }
            />
          )}
          <section className="dashboard-bottom">
            <div className="section-heading">
              <h2>Project Teams</h2>
            </div>
            {state.teams.map((t) => (
              <div className="project-mini" key={t.id}>
                <div>
                  <p>{t.title || t.name}</p>
                  <small>
                    {t.name} · {courses.find((c) => c.id === t.courseId)?.name}
                  </small>
                </div>
                <StatusBadge>{t.status}</StatusBadge>
                <Link to="/courses/$courseId" params={{ courseId: t.courseId }}>
                  View Course
                </Link>
              </div>
            ))}
            {!state.teams.length && <p className="small-note">No teams in your workspace.</p>}
          </section>
        </div>
        <aside className="dashboard-aside">
          <section className="side-section">
            <div className="section-heading">
              <h2>{u.role === "STUDENT" ? "Published Results" : "Course Status"}</h2>
            </div>
            {u.role === "STUDENT"
              ? courses.flatMap((c) =>
                  c.assessments
                    .filter((a) => state.grades[gradeKey(c.id, a.id, u.id)] !== undefined)
                    .map((a) => (
                      <div className="activity" key={`${c.id}-${a.id}`}>
                        <div className="flex-1">
                          <p>{a.name}</p>
                          <small>{c.name}</small>
                        </div>
                        <strong>
                          {state.grades[gradeKey(c.id, a.id, u.id)]} / {a.max}
                        </strong>
                      </div>
                    )),
                )
              : courses.map((c) => (
                  <div className="activity" key={c.id}>
                    <div className="flex-1">
                      <p>{c.name}</p>
                      <small>{c.semester}</small>
                    </div>
                    <StatusBadge>{c.published ? "Published" : "Draft"}</StatusBadge>
                  </div>
                ))}
          </section>
        </aside>
      </div>
    </>
  );
}
