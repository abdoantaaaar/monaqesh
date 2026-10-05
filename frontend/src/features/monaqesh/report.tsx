import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useMonaqesh } from "./context";
import { AppShell, EmptyState, StatusBadge } from "./components";
import { type Team, gradeKey } from "@/services/data";
import { post } from "@/services/api";
import { teamPath } from "@/services/workspace";
const blankQuestion = () => ({ question: "", answer: "", result: "correct", feedback: "" });
export function ReportEditor({ team }: { team: Team }) {
  const { state, mutate } = useMonaqesh();
  const [student, setStudent] = useState(team.members[0] || "");
  const [summary, setSummary] = useState("");
  const [status, setStatus] = useState("completed");
  const [questions, setQuestions] = useState([blankQuestion()]);
  const [busy, setBusy] = useState(false);
  return (
    <section className="content-section">
      <h3 className="mb-4">Record a Manual Discussion Report</h3>
      <form
        className="modal-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await mutate(() =>
              post(`${teamPath(team.courseId, team.id)}/reports`, {
                student_id: Number(student),
                submission_id: Number(team.submissionId),
                status,
                summary,
                questions,
              }),
            );
            setSummary("");
            setQuestions([blankQuestion()]);
            toast.success("Report recorded. Publish the project grade after approval.");
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Unable to record report.");
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="info-grid">
          <div className="field">
            <label>Student</label>
            <select
              aria-label="Report student"
              value={student}
              onChange={(e) => setStudent(e.target.value)}
            >
              {team.members.map((id) => (
                <option key={id} value={id}>
                  {state.users[id]?.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Discussion Status</label>
            <select
              aria-label="Discussion status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="completed">Completed</option>
              <option value="incomplete">Incomplete</option>
            </select>
          </div>
        </div>
        <div className="field">
          <label>Summary</label>
          <textarea
            aria-label="Report summary"
            required
            maxLength={5000}
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
          />
        </div>
        {questions.map((q, i) => (
          <div className="question" key={i}>
            <h3>Question {i + 1}</h3>
            {(["question", "answer", "feedback"] as const).map((field) => (
              <div className="field" key={field}>
                <label>{field}</label>
                <textarea
                  aria-label={`${field} ${i + 1}`}
                  required={field === "question"}
                  maxLength={field === "answer" ? 5000 : 3000}
                  value={q[field]}
                  onChange={(e) =>
                    setQuestions((rows) =>
                      rows.map((r, j) => (j === i ? { ...r, [field]: e.target.value } : r)),
                    )
                  }
                />
              </div>
            ))}
            <select
              aria-label={`Result ${i + 1}`}
              value={q.result}
              onChange={(e) =>
                setQuestions((rows) =>
                  rows.map((r, j) => (j === i ? { ...r, result: e.target.value } : r)),
                )
              }
            >
              <option value="correct">Correct</option>
              <option value="partial">Partially Correct</option>
              <option value="incorrect">Incorrect</option>
              <option value="not_answered">Not Answered</option>
            </select>
            {questions.length > 1 && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => setQuestions((rows) => rows.filter((_, j) => j !== i))}
              >
                Remove Question
              </Button>
            )}
          </div>
        ))}
        <div className="flex gap-3">
          <Button
            type="button"
            variant="outline"
            disabled={questions.length >= 100}
            onClick={() => setQuestions((rows) => [...rows, blankQuestion()])}
          >
            Add Question
          </Button>
          <Button disabled={busy}>{busy ? "Saving…" : "Save Report Version"}</Button>
        </div>
      </form>
    </section>
  );
}
export function ReportPage({ teamId }: { teamId: string }) {
  const { state } = useMonaqesh();
  const team = state.teams.find((t) => t.id === teamId);
  const course = state.courses.find((c) => c.id === team?.courseId);
  const project = course?.assessments.find((a) => a.kind === "project");
  const latest =
    team?.reports.filter(
      (r) =>
        !team.reports.some((other) => other.studentId === r.studentId && other.version > r.version),
    ) || [];
  return (
    <AppShell>
      {team && course && latest.length ? (
        <>
          <Button variant="link" asChild>
            <Link to="/courses/$courseId" params={{ courseId: course.id }}>
              ← Back to {course.name}
            </Link>
          </Button>
          <div className="report-header">
            <div>
              <span className="eyebrow">MONAQESH · ACADEMIC EVALUATION</span>
              <h1 className="mt-3">Project Discussion Reports</h1>
              <p>
                {team.title} · {team.name} · {course.name}
              </p>
            </div>
          </div>
          {latest.map((report) => {
            const grade = project
              ? state.grades[gradeKey(course.id, project.id, report.studentId)]
              : undefined;
            return (
              <section className="report-section" key={report.id}>
                <div className="section-heading">
                  <div>
                    <h2>{state.users[report.studentId]?.name || "Student"}</h2>
                    <p className="small-note">
                      Version {report.version} · {new Date(report.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <StatusBadge>
                    {report.status === "completed" ? "Completed" : "Incomplete"}
                  </StatusBadge>
                </div>
                <div className="score-block">
                  <small>Project Grade</small>
                  <strong>
                    {grade ?? "—"} <span>/ {project?.max ?? "—"}</span>
                  </strong>
                  <p className="small-note">
                    {project && state.published[gradeKey(course.id, project.id, report.studentId)]
                      ? "Published"
                      : "Awaiting grade publication"}
                  </p>
                </div>
                <h3 className="mt-5">Discussion Summary</h3>
                <p>{report.summary}</p>
                <h3 className="mt-5">Questions & Answers</h3>
                {report.questions.map((q, i) => (
                  <div className="question" key={i}>
                    <div className="flex justify-between">
                      <span className="eyebrow">Question {i + 1}</span>
                      <StatusBadge>
                        {(
                          {
                            correct: "Correct",
                            partial: "Partially Correct",
                            incorrect: "Incorrect",
                            not_answered: "Not Answered",
                          } as Record<string, string>
                        )[q.result] || q.result}
                      </StatusBadge>
                    </div>
                    <h3>{q.question}</h3>
                    <div className="answer-block">
                      <small>Student Answer</small>
                      <p>{q.answer || "No answer recorded"}</p>
                    </div>
                    <p>
                      <strong>Feedback:</strong> {q.feedback || "No additional feedback"}
                    </p>
                  </div>
                ))}
              </section>
            );
          })}
        </>
      ) : (
        <EmptyState
          title="No report available"
          message="Staff record reports after final submission. Students see their own report after the doctor publishes their project grade."
        />
      )}
    </AppShell>
  );
}
