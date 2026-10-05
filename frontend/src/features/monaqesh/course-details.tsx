import { useState } from "react";
import { BookOpen, Users, UserRound, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMonaqesh } from "./context";
import { AppShell, EmptyState, StatCard, Avatar, StatusBadge, SearchInput } from "./components";
import { TeachingAssistants, CourseControls } from "./course-actions";
import { AssessmentCards, StudentGrades } from "./grades";
import { ProjectArea } from "./project";
import { courseService } from "@/services/courseService";
import { type Course } from "@/services/data";
import { patch } from "@/services/api";
import { coursePath } from "@/services/workspace";
import { toast } from "sonner";
export function CourseDetailsPage({ courseId }: { courseId: string }) {
  const { state } = useMonaqesh();
  const u = state.user;
  const course = state.courses.find((c) => c.id === courseId);
  const [tab, setTab] = useState("Overview");
  const tabs =
    u?.role === "STUDENT"
      ? ["Overview", "Grades", "Project"]
      : ["Overview", "Students", "Assessments", "Project"];
  return (
    <AppShell>
      {course && u && courseService.canAccess(state, u, course) ? (
        <>
          <div className="course-intro">
            <span className="course-code">{course.code}</span>
            <div>
              <h1>{course.name}</h1>
              <p className="small-note mt-1">{course.semester}</p>
            </div>
          </div>
          <div className="tabs" role="tablist" aria-label="Course sections">
            {tabs.map((t) => (
              <Button
                role="tab"
                aria-selected={tab === t}
                className={`tab ${tab === t ? "active" : ""}`}
                variant="ghost"
                onClick={() => setTab(t)}
                key={t}
              >
                {t}
              </Button>
            ))}
          </div>
          <div role="tabpanel">
            {tab === "Overview" && (
              <>
                <div className="content-section">
                  <div className="section-heading">
                    <h2>Course Overview</h2>
                    <StatusBadge>{course.published ? "Published" : "Draft"}</StatusBadge>
                  </div>
                  <dl className="info-grid">
                    <div>
                      <dt>Course Name</dt>
                      <dd>{course.name}</dd>
                    </div>
                    <div>
                      <dt>Course Code</dt>
                      <dd>{course.code}</dd>
                    </div>
                    <div>
                      <dt>Doctor</dt>
                      <dd>{course.doctor}</dd>
                    </div>
                    <div>
                      <dt>Semester</dt>
                      <dd>{course.semester}</dd>
                    </div>
                  </dl>
                  <div className="mt-6">
                    <h3 className="mb-2">About this course</h3>
                    <p className="text-sm text-muted-foreground leading-7 max-w-3xl">
                      {course.description}
                    </p>
                  </div>
                </div>
                {u.role !== "STUDENT" && (
                  <div className="stats-grid">
                    <StatCard
                      label="Students"
                      value={course.students}
                      icon={Users}
                      caption="Enrolled this semester"
                    />
                    <StatCard
                      label="Teaching Assistants"
                      value={course.tas.length}
                      icon={UserRound}
                      tone="sage"
                      caption="Assigned to this course"
                    />
                    <StatCard
                      label="Assessments"
                      value={5}
                      icon={BookOpen}
                      tone="taupe"
                      caption="Learning checkpoints"
                    />
                    <StatCard
                      label="Project Teams"
                      value={state.teams.filter((t) => t.courseId === course.id).length}
                      icon={FolderOpen}
                      tone="mauve"
                      caption="Collaborative projects"
                    />
                  </div>
                )}
                <CourseControls course={course} />
                <TeachingAssistants course={course} />
              </>
            )}
            {tab === "Students" && <StudentTable course={course} />}{" "}
            {tab === "Assessments" && <AssessmentCards course={course} />}{" "}
            {tab === "Grades" && <StudentGrades course={course} />}{" "}
            {tab === "Project" && <ProjectArea course={course} />}
          </div>
        </>
      ) : (
        <EmptyState
          title="Course unavailable"
          message="This course is not currently in your academic workspace."
        />
      )}
    </AppShell>
  );
}
function StudentTable({ course }: { course: Course }) {
  const { state, mutate } = useMonaqesh();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("All statuses");
  const students = course.studentIds
    .map((id) => state.users[id]!)
    .filter(
      (u) =>
        `${u.name} ${u.id} ${u.email}`.toLowerCase().includes(search.toLowerCase()) &&
        status !== "Pending",
    );
  return (
    <>
      <div className="section-heading">
        <h2>Students</h2>
        <span className="small-note">{course.students} enrolled</span>
      </div>
      <div className="toolbar">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search name, student ID, or email…"
        />
        <div className="field">
          <select
            aria-label="Filter student status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option>All statuses</option>
            <option>Registered</option>
            <option>Pending</option>
          </select>
        </div>
      </div>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Student</th>
              <th>Student ID</th>
              <th>Email</th>
              <th>Status</th>
              {state.user?.role === "DOCTOR" && <th>Team Creation</th>}
            </tr>
          </thead>
          <tbody>
            {students.map((s) => (
              <tr key={s.id}>
                <td>
                  <div className="person-cell">
                    <Avatar name={s.name} />
                    <strong>{s.name}</strong>
                  </div>
                </td>
                <td>{s.universityId}</td>
                <td className="text-muted-foreground">{s.email}</td>
                <td>
                  <StatusBadge>Registered</StatusBadge>
                </td>
                {state.user?.role === "DOCTOR" && (
                  <td>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        try {
                          await mutate(() =>
                            patch(`${coursePath(course.id)}/students/${s.id}/leader`, {
                              can_create_team: !course.leaders.includes(s.id),
                            }),
                          );
                        } catch (e) {
                          toast.error(
                            e instanceof Error ? e.message : "Unable to update leader permission.",
                          );
                        }
                      }}
                    >
                      {course.leaders.includes(s.id) ? "Revoke Create Team" : "Allow Create Team"}
                    </Button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {!students.length && (
          <EmptyState
            title="No students found"
            message="Try a different search or status filter."
          />
        )}
      </div>
      <p className="small-note mt-4">
        Showing {students.length} student records · {course.students} enrolled
      </p>
    </>
  );
}
