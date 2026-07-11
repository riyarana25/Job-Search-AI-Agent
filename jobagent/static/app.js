// ---------- generic fetch helpers ----------
async function postJSON(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

async function getJSON(url) {
  const res = await fetch(url);
  return res.json();
}

function escapeHtml(s) {
  const div = document.createElement("div");
  div.textContent = s == null ? "" : s;
  return div.innerHTML;
}

function escapeAttr(s) {
  return (s == null ? "" : String(s)).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

// ---------- dashboard: discover/score run + live status ----------
async function runTask(task) {
  const btn = document.getElementById("btn-" + task);
  if (btn) btn.disabled = true;
  await postJSON("/api/" + task);
  pollStatus();
}

async function pollStatus() {
  const banner = document.getElementById("status-banner");
  if (!banner) return;

  const state = await getJSON("/api/status");
  const discover = state.discover;
  const score = state.score;
  const running = discover.status === "running" || score.status === "running";

  const lines = [];
  if (discover.status === "running") lines.push("Discovering: " + discover.detail);
  else if (discover.detail) lines.push("Discover: " + discover.detail);
  if (discover.error) lines.push("Discover error: " + discover.error);

  if (score.status === "running") lines.push("Scoring: " + score.detail);
  else if (score.detail) lines.push("Score: " + score.detail);
  if (score.error) lines.push("Score error: " + score.error);

  if (lines.length) {
    banner.classList.remove("hidden");
    banner.textContent = lines.join(" — ");
    const tone = running
      ? "border-accent-300 bg-accent-50 text-accent-700 dark:border-accent-700 dark:bg-accent-500/10 dark:text-accent-400"
      : discover.error || score.error
      ? "border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-700 dark:bg-rose-500/10 dark:text-rose-400"
      : "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400";
    banner.className = "mb-6 rounded-lg border px-4 py-3 text-sm " + tone;
  } else {
    banner.classList.add("hidden");
  }

  const btnDiscover = document.getElementById("btn-discover");
  const btnScore = document.getElementById("btn-score");
  if (btnDiscover) btnDiscover.disabled = discover.status === "running";
  if (btnScore) btnScore.disabled = score.status === "running";

  if (!running && window.__wasRunning) refreshJobs();
  window.__wasRunning = running;
}

async function refreshJobs() {
  const data = await getJSON("/api/jobs?status=scored");
  const setCount = (id, v) => {
    const el = document.getElementById(id);
    if (el) el.textContent = v;
  };
  setCount("count-new", data.counts.new);
  setCount("count-scored", data.counts.scored);
  setCount("count-interested", data.counts.interested);
  setCount("count-skipped", data.counts.skipped);
  renderJobList(data.jobs);
}

function fitBadgeClass(score) {
  if (score >= 75) return "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400";
  if (score >= 50) return "bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400";
  return "bg-rose-100 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400";
}

function renderJobList(jobs) {
  const list = document.getElementById("job-list");
  if (!list) return;
  if (!jobs.length) {
    list.innerHTML =
      '<div class="text-center py-16 text-slate-400 border border-dashed border-slate-300 dark:border-slate-700 rounded-xl">Nothing scored yet. Click "Check for new jobs" then "Score new jobs" above.</div>';
    return;
  }
  list.innerHTML = jobs
    .map(
      (job) => `
    <div class="job-card rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5" data-job-id="${job.id}">
      <div class="flex items-start justify-between gap-4">
        <div class="min-w-0">
          <div class="flex items-center gap-2 flex-wrap">
            <a href="${escapeAttr(job.url)}" target="_blank" rel="noopener" class="font-medium hover:underline">${escapeHtml(job.title)}</a>
            <span class="text-xs px-2 py-0.5 rounded-full ${fitBadgeClass(job.fit_score)}">fit ${job.fit_score}</span>
          </div>
          <div class="text-sm text-slate-500 dark:text-slate-400 mt-0.5">${escapeHtml(job.company)} &middot; ${escapeHtml(job.location)} &middot; ${escapeHtml(job.source)}</div>
          <p class="text-sm text-slate-600 dark:text-slate-300 mt-2">${escapeHtml(job.fit_reasoning)}</p>
          ${
            job.matched_skills && job.matched_skills.length
              ? `<div class="mt-2 flex flex-wrap gap-1">${job.matched_skills
                  .map((s) => `<span class="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">${escapeHtml(s)}</span>`)
                  .join("")}</div>`
              : ""
          }
        </div>
        <div class="flex flex-col gap-2 shrink-0">
          <button onclick="setJobStatus('${job.id}', 'interested')" class="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700">Interested</button>
          <button onclick="setJobStatus('${job.id}', 'skipped')" class="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800">Skip</button>
        </div>
      </div>
    </div>
  `
    )
    .join("");
}

async function setJobStatus(jobId, status) {
  await postJSON(`/api/jobs/${jobId}/status`, { status });
  const card = document.querySelector(`.job-card[data-job-id="${jobId}"]`);
  if (card) card.remove();
  refreshJobs();
}

// ---------- profile form ----------
function makeEducationRow(edu = {}) {
  const div = document.createElement("div");
  div.className = "row-card grid grid-cols-6 gap-2";
  div.innerHTML = `
    <input class="input col-span-2" data-k="institution" placeholder="Institution" value="${escapeAttr(edu.institution)}">
    <input class="input col-span-2" data-k="degree" placeholder="Degree" value="${escapeAttr(edu.degree)}">
    <input class="input col-span-2" data-k="field" placeholder="Field of study" value="${escapeAttr(edu.field)}">
    <input class="input" data-k="start_date" placeholder="Start (YYYY-MM)" value="${escapeAttr(edu.start_date)}">
    <input class="input" data-k="end_date" placeholder="End (YYYY-MM)" value="${escapeAttr(edu.end_date)}">
    <input class="input" data-k="gpa" placeholder="GPA" value="${escapeAttr(edu.gpa)}">
    <button type="button" onclick="this.closest('.row-card').remove()" class="col-span-6 text-xs text-rose-500 text-left hover:underline">Remove</button>
  `;
  return div;
}

function makeExperienceRow(exp = {}) {
  const div = document.createElement("div");
  div.className = "row-card space-y-2";
  div.innerHTML = `
    <div class="grid grid-cols-5 gap-2">
      <input class="input col-span-2" data-k="company" placeholder="Company" value="${escapeAttr(exp.company)}">
      <input class="input col-span-2" data-k="title" placeholder="Title" value="${escapeAttr(exp.title)}">
      <input class="input" data-k="location" placeholder="Location" value="${escapeAttr(exp.location)}">
      <input class="input" data-k="start_date" placeholder="Start (YYYY-MM)" value="${escapeAttr(exp.start_date)}">
      <input class="input" data-k="end_date" placeholder="End (YYYY-MM)" value="${escapeAttr(exp.end_date)}">
    </div>
    <textarea class="input w-full" data-k="bullets" rows="3" placeholder="One bullet per line">${(exp.bullets || []).join("\n")}</textarea>
    <button type="button" onclick="this.closest('.row-card').remove()" class="text-xs text-rose-500 hover:underline">Remove</button>
  `;
  return div;
}

function addRow(kind, data = {}) {
  const container = document.getElementById(kind + "-rows");
  const row = kind === "education" ? makeEducationRow(data) : makeExperienceRow(data);
  container.appendChild(row);
}

function initProfileForm(profile) {
  (profile.education || []).forEach((e) => addRow("education", e));
  (profile.experience || []).forEach((e) => addRow("experience", e));
  if (!(profile.education || []).length) addRow("education");
  if (!(profile.experience || []).length) addRow("experience");
}

function collectRows(kind) {
  const rows = document.querySelectorAll(`#${kind}-rows .row-card`);
  return Array.from(rows)
    .map((row) => {
      const obj = {};
      row.querySelectorAll("[data-k]").forEach((el) => {
        if (el.tagName === "TEXTAREA") {
          obj[el.dataset.k] = el.value
            .split("\n")
            .map((s) => s.trim())
            .filter(Boolean);
        } else {
          obj[el.dataset.k] = el.value.trim();
        }
      });
      return obj;
    })
    .filter((obj) => Object.values(obj).some((v) => (Array.isArray(v) ? v.length : v)));
}

function setByPath(obj, path, value) {
  const parts = path.split(".");
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    cur[parts[i]] = cur[parts[i]] || {};
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = value;
}

const COMMA_FIELDS = new Set([
  "preferences.target_titles",
  "preferences.target_locations",
  "skills.languages",
  "skills.frameworks",
  "skills.tools",
]);

function buildProfilePayload() {
  const data = {};
  document.querySelectorAll("#profile-form [data-field]").forEach((el) => {
    const path = el.dataset.field;
    let value;
    if (el.type === "checkbox") {
      value = el.checked;
    } else if (COMMA_FIELDS.has(path)) {
      value = el.value.split(",").map((s) => s.trim()).filter(Boolean);
    } else {
      value = el.value.trim();
    }
    setByPath(data, path, value);
  });
  data.education = collectRows("education");
  data.experience = collectRows("experience");
  return data;
}

async function saveProfile() {
  const data = buildProfilePayload();
  const status = document.getElementById("save-status");
  status.textContent = "Saving...";
  await postJSON("/profile", data);
  status.textContent = "Saved " + new Date().toLocaleTimeString();
}

async function uploadResume() {
  const input = document.getElementById("resume-file");
  const statusEl = document.getElementById("upload-status");
  if (!input.files.length) {
    statusEl.textContent = "Choose a file first.";
    return;
  }
  const btn = document.getElementById("btn-upload");
  btn.disabled = true;
  statusEl.textContent = "Extracting with Claude...";
  const formData = new FormData();
  formData.append("file", input.files[0]);
  try {
    const res = await fetch("/profile/resume", { method: "POST", body: formData });
    const data = await res.json();
    btn.disabled = false;
    if (data.error) {
      statusEl.textContent = "Error: " + data.error;
      return;
    }
    applyExtractedProfile(data.extracted);
    statusEl.textContent = "Extracted — review the fields below, then Save profile.";
  } catch (e) {
    btn.disabled = false;
    statusEl.textContent = "Error: " + e;
  }
}

function applyExtractedProfile(extracted) {
  const contact = extracted.contact || {};
  Object.keys(contact).forEach((k) => {
    const el = document.querySelector(`[data-field="contact.${k}"]`);
    if (el) el.value = contact[k] || "";
  });

  const skills = extracted.skills || {};
  ["languages", "frameworks", "tools"].forEach((k) => {
    const el = document.querySelector(`[data-field="skills.${k}"]`);
    if (el && skills[k]) el.value = skills[k].join(", ");
  });

  document.getElementById("education-rows").innerHTML = "";
  (extracted.education || []).forEach((e) => addRow("education", e));
  if (!(extracted.education || []).length) addRow("education");

  document.getElementById("experience-rows").innerHTML = "";
  (extracted.experience || []).forEach((e) => addRow("experience", e));
  if (!(extracted.experience || []).length) addRow("experience");
}

// ---------- companies form ----------
function makeCompanyRow(kind, entry = {}) {
  const div = document.createElement("div");
  div.className = "row-card grid grid-cols-5 gap-2";
  div.innerHTML = `
    <input class="input col-span-2" data-k="name" placeholder="Company name" value="${escapeAttr(entry.name)}">
    <input class="input col-span-2" data-k="token" placeholder="${kind} token" value="${escapeAttr(entry.token)}">
    <button type="button" onclick="this.closest('.row-card').remove()" class="text-xs text-rose-500 hover:underline">Remove</button>
  `;
  return div;
}

function addCompanyRow(kind, data = {}) {
  const container = document.getElementById(kind + "-rows");
  container.appendChild(makeCompanyRow(kind, data));
}

function initCompaniesForm(companies) {
  (companies.greenhouse || []).forEach((e) => addCompanyRow("greenhouse", e));
  (companies.lever || []).forEach((e) => addCompanyRow("lever", e));
}

function collectCompanyRows(kind) {
  const rows = document.querySelectorAll(`#${kind}-rows .row-card`);
  return Array.from(rows)
    .map((row) => {
      const obj = {};
      row.querySelectorAll("[data-k]").forEach((el) => (obj[el.dataset.k] = el.value.trim()));
      return obj;
    })
    .filter((o) => o.name && o.token);
}

async function saveCompanies() {
  const data = {
    greenhouse: collectCompanyRows("greenhouse"),
    lever: collectCompanyRows("lever"),
    title_keywords: document
      .getElementById("title-keywords")
      .value.split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    location_keywords: document
      .getElementById("location-keywords")
      .value.split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  };
  const status = document.getElementById("save-status");
  status.textContent = "Saving...";
  await postJSON("/companies", data);
  status.textContent = "Saved " + new Date().toLocaleTimeString();
}
