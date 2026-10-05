// Runs against a new temporary SQLite database. Never uses your Neon credentials.
import { createRequire } from "node:module";
import { spawn, execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import assert from "node:assert/strict";
const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const require = createRequire(join(root, "frontend/package.json"));
const { chromium } = require("playwright");
const python = process.env.PYTHON_BIN || "python";
const temp = mkdtempSync(join(tmpdir(), "monaqesh-check-"));
const backend = join(root, "backend"),
  frontend = join(root, "frontend");
const env = {
  ...process.env,
  DATABASE_URL: `sqlite:///${join(temp, "test.db").replaceAll("\\", "/")}`,
  SECRET_KEY: randomBytes(32).toString("hex"),
  UPLOAD_DIR: join(temp, "uploads"),
  CORS_ORIGINS: JSON.stringify(["http://127.0.0.1:5173"]),
  VITE_API_URL: "http://127.0.0.1:8000",
};
const processes = [];
let browser;
const start = (cmd, args, cwd) => {
  const p = spawn(cmd, args, { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
  let log = "";
  p.stdout.on("data", (x) => (log += x));
  p.stderr.on("data", (x) => (log += x));
  p.on("error", (e) => (log += e));
  processes.push(p);
  return () => log;
};
async function waitServer(url, log) {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(url, { signal: AbortSignal.timeout(1500) })).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("Server unavailable " + url + "\n" + log());
}
async function click(page, name) {
  await page.getByRole("button", { name, exact: true }).click();
}
async function login(page, id) {
  await page.goto("http://127.0.0.1:5173/");
  await page.waitForFunction(
    () =>
      document.querySelector("form") &&
      Object.keys(document.querySelector("form")).some((k) =>
        k.startsWith("__reactProps"),
      ),
  );
  await page.getByLabel("University Email / ID").fill(id);
  await page.getByLabel("Password", { exact: true }).fill(id + "@sis");
  await click(page, "Login");
  await page.waitForURL("**/dashboard");
}
async function openProject(page) {
  await page.getByRole("tab", { name: "Project", exact: true }).click();
}
try {
  execFileSync(python, ["-m", "alembic", "upgrade", "head"], {
    cwd: backend,
    env,
    stdio: "pipe",
  });
  execFileSync(python, ["-m", "app.cli", "seed-demo"], {
    cwd: backend,
    env,
    stdio: "pipe",
  });
  execFileSync(
    python,
    [
      "-c",
      `import zipfile; z=zipfile.ZipFile(r'${join(temp, "source.zip")}','w'); z.writestr('main.py','print("demo")'); z.close()`,
    ],
    { env },
  );
  writeFileSync(
    join(temp, "document.pdf"),
    "%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF",
  );
  writeFileSync(join(temp, "README.md"), "# Integration project\n");
  const beLog = start(
    python,
    ["-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8000"],
    backend,
  );
  const feLog = start(
    process.execPath,
    ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", "5173"],
    frontend,
  );
  console.log("Starting disposable backend/frontend");
  await waitServer("http://127.0.0.1:8000/health", beLog);
  console.log("Backend ready");
  await waitServer("http://127.0.0.1:5173/", feLog);
  console.log("Frontend ready");
  browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  const contexts = await Promise.all([
    browser.newContext(),
    browser.newContext(),
    browser.newContext(),
    browser.newContext(),
  ]);
  const [doctor, ta, student, member] = await Promise.all(
    contexts.map((c) => c.newPage()),
  );
  const errors = [];
  for (const p of [doctor, ta, student, member]) {
    p.on("pageerror", (e) => {
      errors.push(e.message);
      console.error("BROWSER ERROR", e.message);
    });
    p.on("console", (m) => {
      if (m.type() === "error") console.error("CONSOLE", m.text());
    });
    p.on("requestfailed", (r) =>
      console.error("FAILED REQUEST", r.url(), r.failure()?.errorText),
    );
    p.on("dialog", (d) => d.accept());
  }
  await login(doctor, "heba");
  console.log("PASS: professor login");
  await click(doctor, "Create Course");
  let dialog = doctor.getByRole("dialog");
  await dialog.getByLabel("Course Name").fill("Integration AI");
  await dialog.getByLabel("Course Code").fill("INT101");
  await dialog.getByLabel("Description").fill("Live integration check");
  await dialog
    .getByRole("button", { name: "Create Course", exact: true })
    .click();
  await doctor.getByRole("link", { name: "Open Course" }).click();
  await click(doctor, "Publish Course");
  await doctor.getByRole("button", { name: "Unpublish Course" }).waitFor();
  await click(doctor, "Add TA");
  dialog = doctor.getByRole("dialog");
  await dialog.getByRole("textbox").fill("noha");
  await dialog.getByRole("button", { name: "Search", exact: true }).click();
  await dialog.getByRole("button", { name: "Add", exact: true }).click();
  await doctor.getByText("noha@rst.edu.eg", { exact: true }).waitFor();
  console.log("PASS: course creation/publication and TA assignment");
  const courseUrl = doctor.url();
  for (const [p, id] of [
    [student, "2301141"],
    [member, "2301142"],
  ]) {
    await login(p, id);
    await p
      .getByRole("link", { name: "Course Registration", exact: true })
      .click();
    await click(p, "Register");
    await p.getByText("Registered", { exact: true }).waitFor();
    await p.goto(courseUrl);
    await p
      .getByRole("heading", { name: "Integration AI", exact: true })
      .waitFor();
  }
  await doctor.reload();
  await doctor.getByRole("tab", { name: "Students", exact: true }).click();
  await doctor
    .getByRole("row")
    .filter({ hasText: "Ahmed Mohamed" })
    .getByRole("button", { name: "Allow Create Team" })
    .click();
  await doctor.getByRole("button", { name: "Revoke Create Team" }).waitFor();
  await student.reload();
  await openProject(student);
  await click(student, "Create Team");
  dialog = student.getByRole("dialog");
  await dialog.getByLabel("Team Name").fill("Live Team");
  await dialog
    .getByRole("button", { name: "Create Team", exact: true })
    .click();
  await student
    .getByRole("heading", { name: "Live Team", exact: true })
    .waitFor();
  const code = await student.locator(".project-code strong").innerText();
  assert(code.length > 5);
  await openProject(member);
  await click(member, "Join Team");
  dialog = member.getByRole("dialog");
  await dialog.getByLabel("Team Code").fill(code);
  await dialog.getByRole("button", { name: "Join Team", exact: true }).click();
  await member
    .getByRole("heading", { name: "Live Team", exact: true })
    .waitFor();
  assert.equal(await member.locator(".project-code").count(), 0);
  console.log("PASS: leader selection and join code (hidden from members)");
  await student.reload();
  await openProject(student);
  await student
    .getByLabel("Project Title", { exact: true })
    .fill("Real Project");
  await student
    .getByLabel("Project Description", { exact: true })
    .fill("Actual uploads and individual reports.");
  await student
    .getByLabel("Documentation (required)", { exact: true })
    .setInputFiles(join(temp, "document.pdf"));
  await student
    .getByLabel("Source Code (required)", { exact: true })
    .setInputFiles(join(temp, "source.zip"));
  await student
    .getByLabel("README (required)", { exact: true })
    .setInputFiles(join(temp, "README.md"));
  await click(student, "Save Draft & Files");
  await student
    .getByRole("button", { name: "Download document.pdf" })
    .waitFor();
  await click(student, "Confirm Final Submission");
  await student
    .getByText(
      "The final submission has locked project files and team membership.",
      { exact: true },
    )
    .waitFor();
  assert.equal(
    await student.getByRole("button", { name: "Save Draft & Files" }).count(),
    0,
  );
  const downloadPromise = student.waitForEvent("download");
  await student.getByRole("button", { name: "Download README.md" }).click();
  const download = await downloadPromise;
  const downloaded = await download.path();
  assert.equal(readFileSync(downloaded, "utf8"), "# Integration project\n");
  console.log(
    "PASS: real PDF/ZIP/README uploads, final lock and actual file download",
  );
  await login(ta, "noha");
  await ta.goto(courseUrl);
  await openProject(ta);
  await click(ta, "View Team");
  for (const name of ["Ahmed Mohamed", "Kareem Ali"]) {
    await ta.getByLabel("Report student").selectOption({ label: name });
    await ta
      .getByLabel("Report summary")
      .fill("Completed discussion for " + name);
    await ta
      .getByLabel("question 1", { exact: true })
      .fill("Explain your implementation");
    await ta
      .getByLabel("answer 1", { exact: true })
      .fill("I implemented and tested my module");
    await ta.getByLabel("feedback 1", { exact: true }).fill("Clear answer");
    await click(ta, "Save Report Version");
    await ta
      .getByText("Report recorded. Publish the project grade after approval.", {
        exact: true,
      })
      .waitFor();
  }
  await ta.goto(courseUrl);
  await ta.getByRole("tab", { name: "Assessments", exact: true }).click();
  const projectCard = ta
    .locator(".assessment-card")
    .filter({ has: ta.getByRole("heading", { name: "Project", exact: true }) });
  await projectCard.getByRole("link", { name: "Manage Grades" }).click();
  await ta.getByLabel("Grade for Ahmed Mohamed").fill("87");
  await ta.getByLabel("Grade for Kareem Ali").fill("76");
  await click(ta, "Save Changes");
  await ta
    .getByText("Grades saved. The doctor must publish them.", { exact: true })
    .waitFor();
  console.log("PASS: TA manual reports and individual grade entry");
  await doctor.goto(courseUrl);
  await doctor.getByRole("tab", { name: "Assessments", exact: true }).click();
  await doctor
    .locator(".assessment-card")
    .filter({
      has: doctor.getByRole("heading", { name: "Project", exact: true }),
    })
    .getByRole("link", { name: "Manage Grades" })
    .click();
  await click(doctor, "Publish Recorded Grades");
  await doctor.getByText("Grades published.", { exact: true }).waitFor();
  await student.goto(courseUrl);
  await student.getByRole("tab", { name: "Grades", exact: true }).click();
  await student
    .getByRole("row")
    .filter({ hasText: "Project" })
    .getByText("87", { exact: true })
    .waitFor();
  await openProject(student);
  await student.getByRole("link", { name: "View Reports" }).click();
  await student
    .getByRole("heading", { name: "Ahmed Mohamed", exact: true })
    .waitFor();
  assert.equal(
    await student
      .getByRole("heading", { name: "Kareem Ali", exact: true })
      .count(),
    0,
  );
  await member.goto(courseUrl);
  await member.getByRole("tab", { name: "Grades", exact: true }).click();
  await member
    .getByRole("row")
    .filter({ hasText: "Project" })
    .getByText("76", { exact: true })
    .waitFor();
  console.log(
    "PASS: professor publishing, persisted grades and student report privacy",
  );
  await student.evaluate(() => {
    const t = JSON.parse(sessionStorage.getItem("monaqesh-tokens"));
    t.access_token = "expired-access-token";
    sessionStorage.setItem("monaqesh-tokens", JSON.stringify(t));
  });
  await student.reload();
  await student
    .getByRole("heading", { name: "Ahmed Mohamed", exact: true })
    .waitFor();
  const refreshed = await student.evaluate(
    () => JSON.parse(sessionStorage.getItem("monaqesh-tokens")).access_token,
  );
  assert.notEqual(refreshed, "expired-access-token");
  console.log("PASS: token refresh on session restore");
  const denied = await student.evaluate(async () => {
    const t = JSON.parse(sessionStorage.getItem("monaqesh-tokens"));
    return (
      await fetch("http://127.0.0.1:8000/api/courses", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + t.access_token,
        },
        body: JSON.stringify({
          title: "Forbidden",
          code: "NO",
          semester: "Fall",
        }),
      })
    ).status;
  });
  assert.equal(denied, 403);
  await doctor.goto(courseUrl);
  await doctor.getByLabel("Manage grades", { exact: true }).click();
  await doctor.waitForFunction(
    () =>
      Array.from(document.querySelectorAll("label"))
        .find((x) => x.textContent.trim() === "Manage grades")
        ?.querySelector("input")?.checked === false,
  );
  await doctor.getByLabel("View reports & files", { exact: true }).click();
  await doctor.waitForFunction(
    () =>
      Array.from(document.querySelectorAll("label"))
        .find((x) => x.textContent.trim() === "View reports & files")
        ?.querySelector("input")?.checked === false,
  );
  await ta.goto(courseUrl);
  await ta.getByRole("tab", { name: "Assessments", exact: true }).click();
  await ta
    .locator(".assessment-card")
    .filter({ has: ta.getByRole("heading", { name: "Project", exact: true }) })
    .getByRole("link", { name: "View Grades" })
    .click();
  assert(await ta.getByLabel("Grade for Ahmed Mohamed").isDisabled());
  assert.equal(
    await ta.getByRole("button", { name: "Publish Recorded Grades" }).count(),
    0,
  );
  await ta.goto(courseUrl);
  await openProject(ta);
  await click(ta, "View Team");
  await ta
    .getByText(
      "Your course permissions do not include project files or reports.",
      { exact: true },
    )
    .waitFor();
  console.log(
    "PASS: changed TA permissions enforce read-only grades and hide project files",
  );
  const oldAccess = await member.evaluate(
    () => JSON.parse(sessionStorage.getItem("monaqesh-tokens")).access_token,
  );
  await member.getByRole("button", { name: "Log out", exact: true }).click();
  await member.waitForURL("http://127.0.0.1:5173/");
  const revoked = await fetch("http://127.0.0.1:8000/api/auth/me", {
    headers: { Authorization: "Bearer " + oldAccess },
  });
  assert.equal(revoked.status, 401);
  console.log("PASS: logout revokes the server session");
  await doctor.setViewportSize({ width: 390, height: 844 });
  await doctor.goto(courseUrl);
  await doctor
    .getByRole("heading", { name: "Integration AI", exact: true })
    .waitFor();
  await doctor.getByRole("button", { name: "Open navigation" }).click();
  await doctor.getByRole("link", { name: "My Courses", exact: true }).waitFor();
  assert.deepEqual(errors, []);
  console.log(
    "PASS: server permission enforcement, mobile navigation and no browser runtime errors",
  );
  console.log(
    "ALL LIVE INTEGRATION CHECKS PASSED (temporary SQLite database).",
  );
} catch (e) {
  if (browser) {
    for (const c of browser.contexts())
      for (const p of c.pages())
        console.error(
          "PAGE",
          p.url(),
          (
            await p
              .locator("body")
              .innerText()
              .catch(() => "")
          ).slice(0, 2500),
        );
  }
  throw e;
} finally {
  if (browser) await browser.close();
  for (const p of processes) p.kill();
  rmSync(temp, { recursive: true, force: true });
}
