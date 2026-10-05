import { useState } from "react";
import { useMonaqesh } from "./context";
import {
  AppShell,
  PageHeader,
  CourseCard,
  SearchInput,
  EmptyState,
  ConfirmDialog,
  StatusBadge,
} from "./components";
import { CreateCourse } from "./course-actions";
import { courseService } from "@/services/courseService";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
export function CoursesPage() {
  const { state } = useMonaqesh();
  const [search, setSearch] = useState("");
  const u = state.user;
  const courses = u
    ? courseService
        .list(state, u)
        .filter((c) => `${c.name} ${c.code}`.toLowerCase().includes(search.toLowerCase()))
    : [];
  return (
    <AppShell>
      <PageHeader
        title={u?.role === "TA" ? "Assigned Courses" : "My Courses"}
        description="Your spaces for learning, collaboration, and meaningful discussion."
        actions={<CreateCourse />}
      />
      <div className="toolbar">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search courses by name or code…"
        />
        <span className="small-note">{courses.length} courses</span>
      </div>
      {courses.length ? (
        <div className="registration-grid">
          {courses.map((c) => (
            <CourseCard course={c} key={c.id} />
          ))}
        </div>
      ) : (
        <EmptyState
          title="No courses available."
          message={
            search
              ? "Try a different course name or code."
              : "Your courses will appear here when assigned or registered."
          }
        >
          {u?.role === "STUDENT" && (
            <Button asChild>
              <Link to="/registration">Browse Available Courses</Link>
            </Button>
          )}
        </EmptyState>
      )}
    </AppShell>
  );
}
export function RegistrationPage() {
  const { state, mutate } = useMonaqesh();
  const [search, setSearch] = useState("");
  const [drop, setDrop] = useState<string | null>(null);
  const u = state.user;
  const courses = state.courses.filter((c) =>
    `${c.name} ${c.code} ${c.doctor}`.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <AppShell>
      {u?.role === "STUDENT" ? (
        <>
          <PageHeader
            title="Available Courses"
            description="Choose the courses that inspire your next academic chapter."
          />
          <div className="toolbar">
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="Search available courses…"
            />
            <span className="small-note">Available and registered courses</span>
          </div>
          <div className="registration-grid">
            {courses.map((c) => {
              const registered = (state.registrations[u.id] || []).includes(c.id);
              return (
                <CourseCard
                  course={c}
                  key={c.id}
                  action={
                    registered ? (
                      <>
                        <StatusBadge>Registered</StatusBadge>
                        <Button size="sm" variant="ghost" onClick={() => setDrop(c.id)}>
                          Drop Course
                        </Button>
                      </>
                    ) : (
                      <>
                        <span className="small-note">Open for registration</span>
                        <Button
                          size="sm"
                          onClick={async () => {
                            try {
                              await mutate(() => courseService.register(c.id, true));
                              toast.success(`Registered in ${c.name}.`);
                            } catch (e) {
                              toast.error(e instanceof Error ? e.message : "Registration failed.");
                            }
                          }}
                        >
                          Register
                        </Button>
                      </>
                    )
                  }
                />
              );
            })}
          </div>
          {!courses.length && (
            <EmptyState title="No courses available." message="Try a different search." />
          )}
          <ConfirmDialog
            open={!!drop}
            onClose={() => setDrop(null)}
            title="Drop this course?"
            message="This course will be removed from My Courses. You must leave your team first. Dropping is blocked after grades are recorded."
            onConfirm={async () => {
              if (drop) {
                await mutate(() => courseService.register(drop, false));
                toast.success("Course dropped successfully.");
              }
            }}
          />
        </>
      ) : (
        <EmptyState
          title="Student workspace"
          message="Course registration is available to students only."
        />
      )}
    </AppShell>
  );
}
