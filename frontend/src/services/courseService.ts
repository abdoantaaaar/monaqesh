import { type State, type User, type Course } from "./data";
import { post, patch, remove } from "./api";
import { coursePath } from "./workspace";
export const courseService = {
  list: (s: State, _u: User) => s.courses.filter((c) => s.myCourseIds.includes(c.id)),
  canAccess: (s: State, _u: User, c: Course) => s.myCourseIds.includes(c.id),
  create: (input: { name: string; code: string; semester: string; description: string }) =>
    post("/api/courses", {
      title: input.name,
      code: input.code,
      semester: input.semester,
      description: input.description,
    }),
  setTA: (id: string, identifier: string, add: boolean) =>
    add
      ? post(`${coursePath(id)}/tas`, {
          identifier,
          can_manage_grades: true,
          can_view_reports: true,
        })
      : remove(`${coursePath(id)}/tas/${identifier}`),
  register: (id: string, add: boolean) =>
    add ? post(`${coursePath(id)}/enroll`) : remove(`${coursePath(id)}/enroll`),
  update: (id: string, body: unknown) => patch(coursePath(id), body),
};
