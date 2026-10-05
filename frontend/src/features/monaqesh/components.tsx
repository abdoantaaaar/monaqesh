import { useState, type ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  ArrowRight,
  BookOpen,
  LayoutDashboard,
  ClipboardCheck,
  UserRound,
  LogOut,
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  Bell,
  Menu,
  CalendarDays,
  Users,
  Search,
  Check,
  Inbox,
  Copy,
  FileText,
  UploadCloud,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { useMonaqesh } from "./context";
import { type Course, type Team } from "@/services/data";
export const roleLabel = (role: string) =>
  role === "DOCTOR" ? "Doctor" : role === "TA" ? "Teaching Assistant" : "Student";
export function Brand() {
  return (
    <div className="brand">
      <svg
        className="brand-mark"
        width="29"
        height="29"
        viewBox="0 0 40 40"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M7 32V11l13 10 13-10v21M7 11V8h13v13m0 0V8h13v3"
          stroke="currentColor"
          strokeWidth="2.3"
          strokeLinejoin="round"
        />
      </svg>
      <span className="brand-word">Monaqesh</span>
    </div>
  );
}
export function Avatar({ name, large = false }: { name: string; large?: boolean }) {
  return (
    <span className={`avatar ${large ? "large" : ""}`} aria-label={name}>
      {name
        .replace("Dr. ", "")
        .split(" ")
        .map((n) => n[0])
        .slice(0, 2)
        .join("")}
    </span>
  );
}
export function StatusBadge({ children }: { children: ReactNode }) {
  const text = String(children);
  const cls = ["Registered", "Completed", "Graded", "Correct"].includes(text)
    ? "success"
    : ["Pending", "Not Graded", "Partially Correct", "Draft"].includes(text)
      ? "warning"
      : text === "Incorrect"
        ? "danger"
        : "primary";
  return (
    <span className={`badge ${cls}`}>
      {["Completed", "Graded", "Registered"].includes(text) && <Check size={10} />} {children}
    </span>
  );
}
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="page-header">
      <div>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions}
    </div>
  );
}
export function StatCard({
  label,
  value,
  caption,
  icon: Icon,
  tone = "rose",
}: {
  label: string;
  value: string | number;
  caption?: string;
  icon: typeof BookOpen;
  tone?: string;
}) {
  return (
    <div className="stat-card">
      <div className="stat-top">
        <span>{label}</span>
        <span className={`stat-icon tone-${tone}`}>
          <Icon size={16} />
        </span>
      </div>
      <div className="stat-value">{value}</div>
      <p className="stat-caption">{caption}</p>
    </div>
  );
}
export function SearchInput({
  value,
  onChange,
  placeholder = "Search…",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="search-wrap">
      <Search size={15} />
      <input
        aria-label={placeholder}
        className="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}
export function EmptyState({
  title,
  message,
  children,
}: {
  title: string;
  message: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <Inbox size={33} strokeWidth={1.3} />
      <h3>{title}</h3>
      <p>{message}</p>
      {children}
    </div>
  );
}
export function LoadingState() {
  return (
    <div className="main-content" aria-label="Loading" aria-busy="true">
      <div className="skeleton h-9 w-64 mb-8" />
      <div className="stats-grid">
        {[1, 2, 3, 4].map((n) => (
          <div key={n} className="skeleton h-32" />
        ))}
      </div>
      <div className="course-grid">
        {[1, 2, 3, 4].map((n) => (
          <div key={n} className="skeleton h-60" />
        ))}
      </div>
    </div>
  );
}
export function ErrorState({
  message = "Unable to load data.",
  retry,
}: {
  message?: string;
  retry?: () => void;
}) {
  return (
    <EmptyState title="Something went wrong." message={message}>
      {retry && <Button onClick={retry}>Try again</Button>}
    </EmptyState>
  );
}
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="modal-panel">
        <DialogTitle className="text-xl">{title}</DialogTitle>
        <DialogDescription>{description || " "}</DialogDescription>
        {children}
      </DialogContent>
    </Dialog>
  );
}
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  message: string;
}) {
  return (
    <Modal open={open} onClose={onClose} title={title} description={message}>
      <div className="modal-actions">
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="destructive"
          onClick={async () => {
            try {
              await onConfirm();
              onClose();
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Operation failed.");
            }
          }}
        >
          Confirm
        </Button>
      </div>
    </Modal>
  );
}
export function CourseCard({ course, action }: { course: Course; action?: ReactNode }) {
  return (
    <article className="course-card">
      <div className={`course-cover tone-${course.tone}`}>
        <span className="course-code">{course.code}</span>
        <span>{course.semester}</span>
      </div>
      <div className="course-body">
        <h3>{course.name}</h3>
        <p>{course.doctor}</p>
        <div className="course-meta">
          <span>
            <Users size={13} />
            {course.students} students
          </span>
          <span>
            <UserRound size={13} />
            {course.tas.length} TAs
          </span>
        </div>
      </div>
      <div className="course-footer">
        {action || (
          <>
            <StatusBadge>{course.published ? "Published" : "Draft"}</StatusBadge>
            <Link to="/courses/$courseId" params={{ courseId: course.id }}>
              Open Course <ArrowRight size={14} />
            </Link>
          </>
        )}
      </div>
    </article>
  );
}
export function ProjectStatusStepper({ team }: { team: Team }) {
  const stages = [
    "Team Created",
    "Members Joined",
    "Final Submission",
    "Report Recorded",
    "Grade Published",
  ];
  const index = team.released
    ? 4
    : team.status === "Completed"
      ? 3
      : team.locked
        ? 2
        : team.members.length > 1
          ? 1
          : 0;
  return (
    <div className="stepper">
      {stages.map((stage, i) => (
        <div key={stage} className={`step ${i < index ? "done" : i === index ? "current" : ""}`}>
          <span className="step-dot">{i < index ? <Check size={14} /> : i + 1}</span>
          <span>{stage}</span>
        </div>
      ))}
    </div>
  );
}
export async function copyCode(code: string) {
  try {
    await navigator.clipboard.writeText(code);
    toast.success("Team code copied.");
  } catch {
    toast.error("Unable to copy. Your team code is " + code);
  }
}
export function TeamCode({ code }: { code: string }) {
  return (
    <div className="project-code">
      <strong>{code}</strong>
      <Button
        size="icon"
        variant="ghost"
        aria-label="Copy team code"
        title="Copy team code"
        onClick={() => copyCode(code)}
      >
        <Copy size={15} />
      </Button>
    </div>
  );
}
export function FileUpload({
  label,
  extension,
  file,
  onFile,
}: {
  label: string;
  extension: ".pdf" | ".zip" | ".txt,.md" | ".pdf,.pptx";
  file?: { name: string; size: number } | undefined;
  onFile: (f: File) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const accept = (f: File) => {
    if (!extension.split(",").some((ext) => f.name.toLowerCase().endsWith(ext))) {
      toast.error(`Please upload a ${extension.toUpperCase()} file.`);
      return;
    }
    if (f.size > 25 * 1024 * 1024) {
      toast.error("File must be smaller than 25 MB.");
      return;
    }
    onFile(f);
  };
  return (
    <div className="field">
      <label>{label}</label>
      <label
        className="upload-zone"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const f = e.dataTransfer.files[0];
          if (f) accept(f);
        }}
      >
        <input
          type="file"
          className="sr-only"
          aria-label={label}
          accept={extension}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) accept(f);
          }}
        />
        {file ? <FileText size={22} /> : <UploadCloud size={22} />}
        <p>{file ? file.name : "Choose a file or drag it here"}</p>
        <small>
          {uploading ? "Selecting…" : `${extension.slice(1).toUpperCase()} · Up to 25 MB`}
        </small>
        {uploading && (
          <div className="upload-progress">
            <span />
          </div>
        )}
      </label>
    </div>
  );
}
export function AppShell({ children }: { children: ReactNode }) {
  const { state, setState, ready, logout: signOut, loading, error, refresh } = useMonaqesh();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [collapsed, setCollapsed] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const u = state.user;
  const logout = async () => {
    try {
      await signOut();
      navigate({ to: "/" });
    } catch (e) {
      navigate({ to: "/" });
      toast.error(e instanceof Error ? e.message : "Logout failed.");
    }
  };
  if (!ready) return <LoadingState />;
  if (error)
    return (
      <div className="main-content">
        <ErrorState
          message={error}
          retry={() => {
            void refresh().catch(() => {});
          }}
        />
        <Button variant="outline" onClick={logout}>
          Return to Login
        </Button>
      </div>
    );
  if (!u)
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-5">
        <Brand />
        <h2>Sign in to continue</h2>
        <Button asChild>
          <Link to="/">Return to Login</Link>
        </Button>
      </div>
    );
  const section = pathname.includes("reports")
    ? "Discussion Report"
    : pathname.includes("registration")
      ? "Course Registration"
      : pathname.includes("grading")
        ? "Grading"
        : pathname.includes("profile")
          ? "Profile"
          : pathname.includes("courses")
            ? "My Courses"
            : "Dashboard";
  return (
    <div className={`app-shell ${collapsed ? "collapsed" : ""} ${drawer ? "drawer-open" : ""}`}>
      <Button
        className="drawer-backdrop"
        aria-label="Close navigation"
        onClick={() => setDrawer(false)}
      />
      <aside className="sidebar">
        <Brand />
        <div className="sidebar-sub">ACADEMIC WORKSPACE</div>
        <p className="nav-label">WORKSPACE</p>
        <nav>
          <Link className="nav-item" to="/dashboard" onClick={() => setDrawer(false)}>
            <LayoutDashboard size={17} />
            <span>Dashboard</span>
          </Link>
          <Link className="nav-item" to="/courses" onClick={() => setDrawer(false)}>
            <BookOpen size={17} />
            <span>My Courses</span>
          </Link>
          {u.role !== "STUDENT" && (
            <Link className="nav-item" to="/grading" onClick={() => setDrawer(false)}>
              <ClipboardCheck size={17} />
              <span>Grading</span>
            </Link>
          )}
          {u.role === "STUDENT" && (
            <Link className="nav-item" to="/registration" onClick={() => setDrawer(false)}>
              <ClipboardCheck size={17} />
              <span>Course Registration</span>
            </Link>
          )}
          <Link className="nav-item" to="/profile" onClick={() => setDrawer(false)}>
            <UserRound size={17} />
            <span>Profile</span>
          </Link>
        </nav>
        <Button
          className="sidebar-collapse"
          size="icon"
          variant="outline"
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-label="Toggle sidebar"
          onClick={() => setCollapsed((v) => !v)}
        >
          <ChevronLeft size={13} />
        </Button>
        <div className="sidebar-bottom">
          <div className="semester-note">
            <div className="flex items-center gap-2 mb-1">
              <CalendarDays size={13} />
              Academic Workspace
            </div>
            <small>Courses and project discussions</small>
          </div>
          <div className="sidebar-user">
            <Avatar name={u.name} />
            <div>
              <strong>{u.name}</strong>
              <small>{roleLabel(u.role)}</small>
            </div>
          </div>
          <Button variant="ghost" className="sidebar-logout" onClick={logout}>
            <LogOut size={16} />
            <span>Log out</span>
          </Button>
        </div>
      </aside>
      <div className="app-main">
        <header className="topbar">
          <div className="flex items-center gap-3">
            <Button
              size="icon"
              variant="ghost"
              className="mobile-menu"
              aria-label="Open navigation"
              onClick={() => setDrawer(true)}
            >
              <Menu size={19} />
            </Button>
            <div className="breadcrumbs">
              <span>Workspace</span>
              <ChevronRight size={12} />
              <span className="text-foreground">{section}</span>
            </div>
          </div>
          <div className="topbar-right">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon" variant="ghost" aria-label="Notifications" className="relative">
                  <Bell size={18} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="notification-list">
                <h3>Notifications</h3>
                <p className="small-note p-3">No notification service is configured yet.</p>
              </DropdownMenuContent>
            </DropdownMenu>
            <span className="h-7 border-l border-border" />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="top-user h-auto py-1">
                  <Avatar name={u.name} />
                  <div>
                    <strong>{u.name}</strong>
                    <small>{roleLabel(u.role)}</small>
                  </div>
                  <ChevronDown size={12} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem asChild>
                  <Link to="/profile">
                    <UserRound />
                    My profile
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={logout}>
                  <LogOut />
                  Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <main className="main-content">
          {loading && (
            <p role="status" className="small-note mb-3">
              Refreshing workspace…
            </p>
          )}
          {children}
          <footer className="app-footer">
            <span>
              © 2026 <span className="footer-mark">Monaqesh.</span> All rights reserved.
            </span>
            <span>Thoughtful learning. Meaningful discussion.</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
