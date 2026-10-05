export type Role = "DOCTOR" | "TA" | "STUDENT";
export type User = { id: string; universityId: string; name: string; email: string; role: Role };
export type Assessment = {
  id: string;
  kind: string;
  name: string;
  max: number;
  average: number | null;
  graded: number;
};
export type Course = {
  id: string;
  name: string;
  code: string;
  semester: string;
  year: string;
  description: string;
  students: number;
  studentIds: string[];
  leaders: string[];
  tas: string[];
  taPermissions: Record<string, { can_manage_grades: boolean; can_view_reports: boolean }>;
  doctor: string;
  tone: string;
  published: boolean;
  enrollmentOpen: boolean;
  teamsOpen: boolean;
  minTeamSize: number;
  maxTeamSize: number;
  canCreateTeam: boolean;
  canJoinTeam: boolean;
  permissions: { can_manage_grades: boolean; can_view_reports: boolean; can_publish: boolean };
  assessments: Assessment[];
};
export type StoredFile = {
  id: string;
  submissionId: string;
  kind: string;
  name: string;
  size: number;
};
export type Report = {
  id: string;
  studentId: string;
  version: number;
  status: string;
  summary: string;
  createdAt: string;
  questions: { question: string; answer: string; result: string; feedback: string }[];
};
export type Team = {
  id: string;
  courseId: string;
  name: string;
  code: string | null;
  leaderId: string;
  members: string[];
  contributions: Record<string, string>;
  title: string;
  description: string;
  files: StoredFile[];
  status: "Draft" | "Submitted" | "Completed";
  released: boolean;
  locked: boolean;
  submittedAt: string | null;
  version: number;
  submissionId: string | null;
  reports: Report[];
};
export type State = {
  user: User | null;
  users: Record<string, User>;
  courses: Course[];
  myCourseIds: string[];
  registrations: Record<string, string[]>;
  grades: Record<string, number>;
  published: Record<string, boolean>;
  teams: Team[];
  readNotifications: boolean;
};
export const gradeKey = (course: string, assessment: string, student: string) =>
  `${course}:${assessment}:${student}`;
export const initialState = (): State => ({
  user: null,
  users: {},
  courses: [],
  myCourseIds: [],
  registrations: {},
  grades: {},
  published: {},
  teams: [],
  readNotifications: true,
});
