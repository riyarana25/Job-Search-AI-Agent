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
  if (discover.status === "running") lines.push("Checking for new jobs: " + discover.detail);
  else if (discover.detail) lines.push("Check: " + discover.detail);
  if (discover.error) lines.push("Check error: " + discover.error);

  if (score.status === "running") lines.push("Scoring: " + score.detail);
  else if (score.detail) lines.push("Score: " + score.detail);
  if (score.error) lines.push("Score error: " + score.error);

  if (lines.length) {
    banner.classList.remove("hidden");
    banner.textContent = lines.join(" — ");
    const tone = running
      ? "np-pop bg-amber-300 text-zinc-900 animate-pulse"
      : discover.error || score.error
      ? "np-pop bg-[#e10600] text-white"
      : "np-pop bg-emerald-400 text-zinc-900";
    banner.className = "mb-6 np-card px-4 py-3 text-sm font-semibold " + tone;
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
  if (score >= 75) return "bg-emerald-400 text-zinc-900";
  if (score >= 50) return "bg-amber-300 text-zinc-900";
  return "bg-[#e10600] text-white";
}

function renderJobList(jobs) {
  const list = document.getElementById("job-list");
  if (!list) return;
  if (!jobs.length) {
    list.innerHTML =
      '<div class="text-center py-16 rounded-2xl border-2 border-dashed border-zinc-300 dark:border-zinc-700 text-zinc-400 font-medium np-enter"><div class="np-flag-strip max-w-[220px] mx-auto mb-4"></div>Nothing scored yet. Click "Check for new jobs" then "Score new jobs" to get started.</div>';
    return;
  }
  list.innerHTML = jobs
    .map(
      (job, i) => `
    <div class="job-card np-card np-enter bg-white dark:bg-zinc-900 p-5" data-job-id="${job.id}" style="animation-delay: ${i * 40}ms">
      <div class="flex items-start justify-between gap-4">
        <div class="min-w-0">
          <div class="flex items-center gap-2 flex-wrap">
            <a href="${escapeAttr(job.url)}" target="_blank" rel="noopener" class="font-bold hover:underline decoration-[#e10600] decoration-[3px] underline-offset-2">${escapeHtml(job.title)}</a>
            <span class="np-plate np-pop ${fitBadgeClass(job.fit_score)}"><span class="np-plate-num">${job.fit_score}</span><span class="np-plate-cap">fit</span></span>
          </div>
          <div class="text-sm font-medium text-zinc-500 dark:text-zinc-400 mt-0.5">${escapeHtml(job.company)} &middot; ${escapeHtml(job.location)} &middot; ${escapeHtml(job.source)}</div>
          <p class="text-sm text-zinc-600 dark:text-zinc-300 mt-2">${escapeHtml(job.fit_reasoning)}</p>
          ${
            job.matched_skills && job.matched_skills.length
              ? `<div class="mt-2.5 flex flex-wrap gap-1.5">${job.matched_skills
                  .map((s) => `<span class="text-xs font-semibold px-2 py-0.5 rounded-full border border-zinc-300 dark:border-zinc-600 bg-zinc-50 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300">${escapeHtml(s)}</span>`)
                  .join("")}</div>`
              : ""
          }
        </div>
        <div class="flex flex-col gap-2.5 shrink-0">
          <button onclick="setJobStatus('${job.id}', 'interested')" class="np-btn np-pop bg-emerald-400 text-zinc-900 px-3 py-1.5 text-xs">Interested</button>
          <button onclick="setJobStatus('${job.id}', 'skipped')" class="np-btn bg-white dark:bg-zinc-800 px-3 py-1.5 text-xs">Skip</button>
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
  div.className = "row-card np-enter grid grid-cols-6 gap-2";
  div.innerHTML = `
    <input class="input col-span-2" data-k="institution" placeholder="Institution" value="${escapeAttr(edu.institution)}">
    <input class="input col-span-2" data-k="degree" placeholder="Degree" value="${escapeAttr(edu.degree)}">
    <input class="input col-span-2" data-k="field" placeholder="Field of study" value="${escapeAttr(edu.field)}">
    <input class="input" data-k="start_date" placeholder="Start (YYYY-MM)" value="${escapeAttr(edu.start_date)}">
    <input class="input" data-k="end_date" placeholder="End (YYYY-MM)" value="${escapeAttr(edu.end_date)}">
    <input class="input" data-k="gpa" placeholder="GPA" value="${escapeAttr(edu.gpa)}">
    <button type="button" onclick="this.closest('.row-card').remove()" class="col-span-6 text-xs font-bold text-rose-500 text-left hover:underline decoration-2">Remove</button>
  `;
  return div;
}

function makeExperienceRow(exp = {}) {
  const div = document.createElement("div");
  div.className = "row-card np-enter space-y-2";
  div.innerHTML = `
    <div class="grid grid-cols-5 gap-2">
      <input class="input col-span-2" data-k="company" placeholder="Company" value="${escapeAttr(exp.company)}">
      <input class="input col-span-2" data-k="title" placeholder="Title" value="${escapeAttr(exp.title)}">
      <input class="input" data-k="location" placeholder="Location" value="${escapeAttr(exp.location)}">
      <input class="input" data-k="start_date" placeholder="Start (YYYY-MM)" value="${escapeAttr(exp.start_date)}">
      <input class="input" data-k="end_date" placeholder="End (YYYY-MM)" value="${escapeAttr(exp.end_date)}">
    </div>
    <textarea class="input w-full" data-k="bullets" rows="3" placeholder="One bullet per line">${(exp.bullets || []).join("\n")}</textarea>
    <button type="button" onclick="this.closest('.row-card').remove()" class="text-xs font-bold text-rose-500 hover:underline decoration-2">Remove</button>
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
  div.className = "row-card np-enter grid grid-cols-5 gap-2";
  div.innerHTML = `
    <input class="input col-span-2" data-k="name" placeholder="Company name" value="${escapeAttr(entry.name)}">
    <input class="input col-span-2" data-k="token" placeholder="${kind} token" value="${escapeAttr(entry.token)}">
    <button type="button" onclick="this.closest('.row-card').remove()" class="text-xs font-bold text-rose-500 hover:underline decoration-2">Remove</button>
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
