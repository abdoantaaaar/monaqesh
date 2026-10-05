// Response shapes from backend/docs/openapi.json. IDs are database IDs, not university IDs.
export type ApiUser = {
  id: number;
  university_id: string;
  name: string;
  email?: string;
  role: string;
  can_create_team?: boolean;
};
export type ApiCourse = {
  id: number;
  title: string;
  code: string;
  semester: string;
  description: string;
  is_published: boolean;
  enrollment_open: boolean;
  teams_open: boolean;
  min_team_size: number;
  max_team_size: number;
};
export type ApiPermissions = {
  can_manage_grades: boolean;
  can_view_reports: boolean;
  can_publish: boolean;
};
export type ApiAssessment = { id: number; kind: string; title: string; max_score: string | number };
export type ApiCourseDetail = {
  professor: { name: string };
  student_count: number;
  can_create_team: boolean;
  permissions: Partial<ApiPermissions>;
  ta_permissions: Record<string, Pick<ApiPermissions, "can_manage_grades" | "can_view_reports">>;
  teaching_assistants: ApiUser[];
  assessments: ApiAssessment[];
};
export type ApiGrade = { student_id: number; score: string | number; is_published: boolean };
export type ApiTeam = {
  id: number;
  name: string;
  leader_id: number;
  join_code: string | null;
  project_title: string;
  project_description: string;
  members: { id: number; name: string; university_id: string; contribution: string }[];
};
export type ApiSubmission = {
  submission: { id: number; version: number; is_final: boolean; created_at: string };
  files: { id: number; kind: string; original_name: string; size_bytes: number }[];
};
export type ApiReport = {
  id: number;
  student_id: number;
  version: number;
  status: string;
  summary: string;
  created_at: string;
  questions: { question: string; answer: string; result: string; feedback: string }[];
};
export type ApiAudit = {
  id: number;
  actor_id: number;
  action: string;
  created_at: string;
  details: Record<string, unknown>;
};
