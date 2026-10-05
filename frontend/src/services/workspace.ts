import type {
  ApiUser,
  ApiCourse,
  ApiCourseDetail,
  ApiTeam,
  ApiGrade,
  ApiSubmission,
  ApiReport,
} from "./contracts";
import { api } from "./api";
import { initialState, gradeKey, type User, type Course, type Team, type State } from "./data";
export const mapUser = (u: ApiUser): User => ({
  id: String(u.id),
  universityId: u.university_id,
  name: u.name,
  email: u.email || "",
  role: u.role === "professor" ? "DOCTOR" : u.role === "ta" ? "TA" : "STUDENT",
});
export const coursePath = (id: string) => `/api/courses/${id}`;
export const teamPath = (c: string, t: string) => `${coursePath(c)}/teams/${t}`;
export async function loadWorkspace(): Promise<State> {
  const user = mapUser(await api<ApiUser>("/api/auth/me"));
  const state = initialState();
  state.user = user;
  state.users[user.id] = user;
  const mine = await api<ApiCourse[]>("/api/courses");
  state.myCourseIds = mine.map((c) => String(c.id));
  state.registrations[user.id] = user.role === "STUDENT" ? [...state.myCourseIds] : [];
  const catalog = user.role === "STUDENT" ? await api<ApiCourse[]>("/api/courses/catalog") : [];
  // Only authorised data is fetched; the browser is never the authority on permissions.
  for (const row of [...mine, ...catalog]) {
    const own = state.myCourseIds.includes(String(row.id));
    const c: Course = {
      id: String(row.id),
      name: row.title,
      code: row.code,
      semester: row.semester,
      year: row.semester,
      description: row.description,
      students: 0,
      studentIds: [],
      leaders: [],
      tas: [],
      taPermissions: {},
      doctor: "Course staff",
      tone: ["rose", "sage", "taupe", "mauve"][state.courses.length % 4]!,
      published: row.is_published,
      enrollmentOpen: row.enrollment_open,
      teamsOpen: row.teams_open,
      minTeamSize: row.min_team_size,
      maxTeamSize: row.max_team_size,
      canCreateTeam: false,
      canJoinTeam: false,
      permissions: { can_manage_grades: false, can_view_reports: false, can_publish: false },
      assessments: [],
    };
    if (own) {
      const detail = await api<ApiCourseDetail>(`${coursePath(c.id)}`);
      c.doctor = detail.professor.name;
      c.students = detail.student_count ?? 0;
      c.canCreateTeam = detail.can_create_team;
      c.permissions = { ...c.permissions, ...detail.permissions };
      c.taPermissions = detail.ta_permissions || {};
      c.tas = detail.teaching_assistants.map((t) => String(t.id));
      detail.teaching_assistants.forEach((t) => {
        state.users[String(t.id)] = mapUser({ ...t, role: "ta" });
      });
      c.assessments = detail.assessments.map((a) => ({
        id: String(a.id),
        kind: a.kind,
        name: a.title,
        max: Number(a.max_score),
        average: null,
        graded: 0,
      }));
      if (user.role === "STUDENT") {
        const grades = await api<{ assessment: { id: number }; grade: ApiGrade | null }[]>(
          `${coursePath(c.id)}/my-grades`,
        );
        for (const g of grades) {
          if (g.grade) {
            const key = gradeKey(c.id, String(g.assessment.id), user.id);
            state.grades[key] = Number(g.grade.score);
            state.published[key] = true;
          }
        }
        const context = await api<{
          can_create_team: boolean;
          can_join_team: boolean;
          team: ApiTeam | null;
        }>(`${coursePath(c.id)}/project`);
        c.canCreateTeam = context.can_create_team;
        c.canJoinTeam = context.can_join_team;
        if (context.team) await hydrateTeam(context.team, c, state);
      } else {
        const students = await api<ApiUser[]>(`${coursePath(c.id)}/students`);
        c.students = students.length;
        c.studentIds = students.map((s) => String(s.id));
        c.leaders = students.filter((s) => s.can_create_team).map((s) => String(s.id));
        students.forEach((s) => {
          state.users[String(s.id)] = mapUser(s);
        });
        {
          for (const a of c.assessments) {
            const results = await api<{
              average: string | number | null;
              graded_count: number;
              grades: ApiGrade[];
            }>(`${coursePath(c.id)}/assessments/${a.id}/grades`);
            a.average = results.average === null ? null : Number(results.average);
            a.graded = results.graded_count;
            for (const g of results.grades) {
              const key = gradeKey(c.id, a.id, String(g.student_id));
              state.grades[key] = Number(g.score);
              state.published[key] = g.is_published;
            }
          }
        }
        const teams = await api<ApiTeam[]>(`${coursePath(c.id)}/teams`);
        for (const t of teams) await hydrateTeam(t, c, state);
      }
    }
    state.courses.push(c);
  }
  return state;
}
async function hydrateTeam(row: ApiTeam, c: Course, state: State) {
  const t: Team = {
    id: String(row.id),
    courseId: c.id,
    name: row.name,
    code: row.join_code,
    leaderId: String(row.leader_id),
    members: row.members.map((m) => String(m.id)),
    contributions: Object.fromEntries(row.members.map((m) => [String(m.id), m.contribution])),
    title: row.project_title,
    description: row.project_description,
    files: [],
    status: "Draft",
    released: false,
    locked: false,
    submittedAt: null,
    version: 0,
    submissionId: null,
    reports: [],
  };
  row.members.forEach((m) => {
    const key = String(m.id);
    state.users[key] = state.users[key] || mapUser({ ...m, role: "student" });
  });
  if (state.user?.role === "STUDENT" || c.permissions.can_view_reports) {
    const submissions = await api<ApiSubmission[]>(`${teamPath(c.id, t.id)}/submissions`);
    const latest = submissions.at(-1);
    if (latest) {
      t.submissionId = String(latest.submission.id);
      t.version = latest.submission.version;
      t.locked = latest.submission.is_final;
      t.status = t.locked ? "Submitted" : "Draft";
      t.submittedAt = latest.submission.created_at;
      t.files = latest.files.map((f) => ({
        id: String(f.id),
        submissionId: String(latest.submission.id),
        kind: f.kind,
        name: f.original_name,
        size: f.size_bytes,
      }));
    }
    const reports = await api<ApiReport[]>(`${teamPath(c.id, t.id)}/reports`);
    t.reports = reports.map((r) => ({
      id: String(r.id),
      studentId: String(r.student_id),
      version: r.version,
      status: r.status,
      summary: r.summary,
      createdAt: r.created_at,
      questions: r.questions,
    }));
    const project = c.assessments.find((a) => a.kind === "project");
    t.released =
      !!project && t.members.some((id) => state.published[gradeKey(c.id, project.id, id)]);
    if (t.reports.some((r) => r.status === "completed")) t.status = "Completed";
  }
  state.teams.push(t);
}
