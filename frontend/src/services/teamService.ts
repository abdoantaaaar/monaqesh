import { type State, type User } from "./data";
import { post } from "./api";
import { coursePath } from "./workspace";
export const teamService = {
  find: (s: State, u: User, c: string) =>
    s.teams.find((t) => t.courseId === c && t.members.includes(u.id)),
  create: (c: string, name: string) =>
    post(`${coursePath(c)}/teams`, { name, project_title: name, project_description: "" }),
  join: (c: string, code: string) => post(`${coursePath(c)}/teams/join`, { code }),
};
