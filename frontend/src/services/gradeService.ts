import { api, post } from "./api";
import { coursePath } from "./workspace";
export const gradeService = {
  async save(courseId: string, assessmentId: string, values: Record<string, number>) {
    for (const [id, score] of Object.entries(values)) {
      if (!Number.isFinite(score)) throw new Error("Enter a valid grade.");
      await api(`${coursePath(courseId)}/assessments/${assessmentId}/grades/${id}`, {
        method: "PUT",
        body: JSON.stringify({ score, feedback: "" }),
      });
    }
  },
  publish: (c: string, a: string, ids: string[]) =>
    post(`${coursePath(c)}/assessments/${a}/publish`, { student_ids: ids.map(Number) }),
};
