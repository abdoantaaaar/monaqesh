import { type Team } from "./data";
import { api, post, patch } from "./api";
import { teamPath } from "./workspace";
export const projectService = {
  async save(
    team: Team,
    values: { title: string; description: string },
    files: Record<string, File>,
    submit: boolean,
  ) {
    const path = teamPath(team.courseId, team.id);
    await patch(path, {
      name: team.name,
      project_title: values.title,
      project_description: values.description,
    });
    let submissionId = team.submissionId;
    if (!submissionId) {
      const s = await post<{ id: number }>(`${path}/submissions`);
      submissionId = String(s.id);
    }
    for (const [kind, file] of Object.entries(files)) {
      const form = new FormData();
      form.append("file", file);
      await api(`${path}/submissions/${submissionId}/files/${kind}`, { method: "PUT", body: form });
    }
    if (submit) await post(`${path}/submissions/${submissionId}/finalize`);
  },
};
