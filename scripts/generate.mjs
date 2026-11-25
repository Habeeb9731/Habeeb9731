#!/usr/bin/env node
// GitHub profile skin generator — zero dependencies (Node 18+).
//   Live:     GITHUB_TOKEN=... node scripts/generate.mjs
//   Offline:  node scripts/generate.mjs --data data/snapshot.json
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "assets");
const cfg = JSON.parse(await readFile(join(ROOT, "skin.config.json"), "utf8"));

const THEMES = {
  lime:  { accent: "#c6f432", grid: ["#262626", "#3a4519", "#62801f", "#97c02b", "#c6f432"] },
  mint:  { accent: "#7cf2c2", grid: ["#262626", "#1d4536", "#2f7d60", "#55c193", "#7cf2c2"] },
  coral: { accent: "#ff8a65", grid: ["#262626", "#4a2a20", "#8a4632", "#d0684a", "#ff8a65"] },
};
const T = THEMES[cfg.theme] ?? THEMES.lime;
const GRID = T.grid;
const FONT = `Urbanist,'Plus Jakarta Sans',Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif`;
const MONO = `ui-monospace,SFMono-Regular,'SF Mono',Menlo,Consolas,monospace`;

// ---------- data ----------
async function fetchLive() {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("GITHUB_TOKEN not set (or pass --data <file>)");
  const query = `query($login:String!){ user(login:$login){
    name login createdAt avatarUrl(size:200)
    followers{totalCount}
    repositories(ownerAffiliations:OWNER, privacy:PUBLIC, first:100, orderBy:{field:PUSHED_AT,direction:DESC}){
      totalCount
      nodes{ name description isFork stargazerCount url
        primaryLanguage{name color}
        languages(first:10, orderBy:{field:SIZE,direction:DESC}){ edges{ size node{name color} } } } }
    contributionsCollection{ contributionCalendar{ totalContributions
      weeks{ contributionDays{ date contributionCount } } } } } }`;
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { Authorization: `bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables: { login: cfg.login } }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  const u = json.data.user;
  const repos = u.repositories.nodes;
  const own = repos.filter((r) => !r.isFork);
  // languageMode "repos": count each repo's primary language once; "bytes": GitHub's code-size totals
  const langs = {};
  if (cfg.languageMode === "bytes") {
    for (const r of own) for (const e of r.languages.edges) {
      langs[e.node.name] ??= { size: 0, color: e.node.color };
      langs[e.node.name].size += e.size;
    }
  } else {
    for (const r of own.slice(0, cfg.recentRepos || own.length)) if (r.primaryLanguage) {
      langs[r.primaryLanguage.name] ??= { size: 0, color: r.primaryLanguage.color };
      langs[r.primaryLanguage.name].size += 1;
    }
  }
  let avatar = null;
  try {
    const img = await fetch(u.avatarUrl);
    avatar = `data:${img.headers.get("content-type") || "image/png"};base64,${Buffer.from(await img.arrayBuffer()).toString("base64")}`;
  } catch {}
  return {
    name: u.name, login: u.login, createdAt: u.createdAt, avatar,
    followers: u.followers.totalCount,
    publicRepos: u.repositories.totalCount,
    stars: own.reduce((s, r) => s + r.stargazerCount, 0),
    languages: Object.entries(langs).map(([name, v]) => ({ name, weight: v.size, color: v.color })),
    repos: repos.map((r) => ({ name: r.name, description: r.description, stars: r.stargazerCount, fork: r.isFork,
      language: r.primaryLanguage?.name ?? null, color: r.primaryLanguage?.color ?? null })),
    days: u.contributionsCollection.contributionCalendar.weeks.flatMap((w) =>
      w.contributionDays.map((d) => ({ date: d.date, count: d.contributionCount }))),
  };
}

async function loadSnapshot(file) {
  const s = JSON.parse(await readFile(file, "utf8"));
  // expand sparse calendar {from,to,nonZero:{date:count}} into full days
  const days = [];
  for (let d = new Date(s.calendar.from + "T00:00:00Z"); d <= new Date(s.calendar.to + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + 1)) {
    const key = d.toISOString().slice(0, 10);
    days.push({ date: key, count: s.calendar.nonZero[key] ?? 0 });
  }
  return { ...s, days };
}

const argData = process.argv.indexOf("--data");
const D = argData > -1 ? await loadSnapshot(join(ROOT, process.argv[argData + 1])) : await fetchLive();
// a local avatar file (avatar.jpg / avatar.png in the repo root) wins over the GitHub avatar
for (const f of ["avatar.jpg", "avatar.jpeg", "avatar.png", "avatar.webp"]) {
  try { const b = await readFile(join(ROOT, f)); D.avatar = `data:image/${f.split(".")[1].replace("jpg", "jpeg")};base64,${b.toString("base64")}`; break; } catch {}
}

// ---------- derived stats ----------
const total = D.days.reduce((s, d) => s + d.count, 0);
const activeDays = D.days.filter((d) => d.count > 0).length;
let longest = 0, run = 0;
for (const d of D.days) { run = d.count ? run + 1 : 0; longest = Math.max(longest, run); }
let current = 0;
for (let i = D.days.length - 1; i >= 0; i--) {
  if (D.days[i].count) current++;
  else if (i === D.days.length - 1) continue; // today not counted yet
  else break;
}
const busiest = D.days.reduce((a, b) => (b.count > a.count ? b : a), D.days[0]);
const sinceYear = new Date(D.createdAt).getUTCFullYear();
const langTotal = D.languages.reduce((s, l) => s + l.weight, 0) || 1;
const langs = [...D.languages].sort((a, b) => b.weight - a.weight);
const topLangs = langs.slice(0, 5).map((l) => ({ ...l, pct: (l.weight / langTotal) * 100 }));
const otherPct = 100 - topLangs.reduce((s, l) => s + l.pct, 0);
if (otherPct > 0.5) topLangs.push({ name: "Other", pct: otherPct, color: "#6e7681" });

// ---------- svg helpers ----------
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt = (n) => n.toLocaleString("en-US");
const tw = (s, size) => [...String(s)].length * size * 0.58;
const fmtDate = (iso) => new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const clip = (s, max) => { s = String(s ?? ""); return s.length > max ? s.slice(0, max - 1).trimEnd() + "…" : s; };
function wrap(s, maxChars, lines) {
  const out = [""];
  for (const w of String(s ?? "").split(/\s+/)) {
    if ((out.at(-1) + " " + w).trim().length > maxChars) { if (out.length === lines) { out[lines - 1] = clip(out[lines - 1] + " " + w, maxChars); break; } out.push(w); }
    else out[out.length - 1] = (out.at(-1) + " " + w).trim();
  }
  return out;
}
const A = T.accent, INK = "#141414", CARD = "#1b1b1b", RAISED = "#262626", MUTED = "#8a8a8a";

function frame(w, h, body, id) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" fill="none" role="img">
<defs>
  <pattern id="${id}h" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="9" stroke="#fff" stroke-opacity=".028" stroke-width="1"/></pattern>
  <clipPath id="${id}c"><rect width="${w}" height="${h}" rx="28"/></clipPath>
</defs>
<style>
  .t{font-family:${FONT};fill:#f2f2f2}
  .mut{fill:${MUTED}}.ink{fill:${INK}}
  .num{font-weight:300;letter-spacing:-1px}
  .in{animation:in .6s cubic-bezier(.2,.7,.2,1) both}
  .up{transform-box:fill-box;transform-origin:bottom;animation:up .8s cubic-bezier(.2,.7,.2,1) both}
  .rt{transform-box:fill-box;transform-origin:left;animation:rt .8s cubic-bezier(.2,.7,.2,1) both}
  @keyframes in{from{opacity:0}to{opacity:1}}
  @keyframes up{from{transform:scaleY(0)}to{transform:scaleY(1)}}
  @keyframes rt{from{transform:scaleX(0)}to{transform:scaleX(1)}}
  @media (prefers-reduced-motion:reduce){*{animation:none!important}}
</style>
<g clip-path="url(#${id}c)"><rect width="${w}" height="${h}" fill="${CARD}"/><rect width="${w}" height="${h}" fill="url(#${id}h)"/>${body}</g>
</svg>`;
}
const arrowBtn = (cx, cy, r = 24) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${A}"/>
  <path d="M${cx - r * 0.25} ${cy + r * 0.25}L${cx + r * 0.25} ${cy - r * 0.25}M${cx - r * 0.17} ${cy - r * 0.25}H${cx + r * 0.25}V${cy + r * 0.17}" stroke="${INK}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`;
const checkPill = (x, y, label) => {
  const w = tw(label, 11) + 50;
  return `<g transform="translate(${x} ${y})"><rect width="${w}" height="30" rx="15" fill="#f4f4f4"/>
  <circle cx="15" cy="15" r="10" fill="${INK}"/><path d="M10.8 15.2l2.8 2.6 5-5.4" stroke="#fff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
  <text class="t ink" x="33" y="19.2" font-size="11" font-weight="600">${esc(label)}</text></g>`;
};
const tooltip = (cx, y, label, light = true) => {
  const w = tw(label, 11) + 18;
  return `<g transform="translate(${cx - w / 2} ${y})"><rect width="${w}" height="22" rx="7" fill="${light ? "#f4f4f4" : "#3a3a3a"}"/>
  <text class="t${light ? " ink" : ""}" x="${w / 2}" y="15" font-size="11" font-weight="600" text-anchor="middle">${esc(label)}</text></g>`;
};
const stamp = (w, h) => `<text class="t mut" x="${w - 28}" y="${h - 16}" font-size="9" text-anchor="end" opacity=".55">updated ${new Date().toISOString().slice(0, 10)}</text>`;

// ---------- cards ----------
function profileCard() {
  const W = 840, H = 318;
  const initials = (cfg.displayName || D.name || D.login).split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  const avatar = D.avatar
    ? `<clipPath id="pav"><circle cx="96" cy="96" r="50"/></clipPath><image href="${D.avatar}" x="46" y="46" width="100" height="100" clip-path="url(#pav)" preserveAspectRatio="xMidYMid slice"/>`
    : `<circle cx="96" cy="96" r="50" fill="${A}"/><text class="t ink" x="96" y="107" font-size="30" font-weight="700" text-anchor="middle">${esc(initials)}</text>`;
  // language pills with lime count badges
  const counts = {}; for (const l of langs) counts[l.name] = l.weight;
  let cx = 180;
  const pills = langs.slice(0, 4).map((l) => {
    const badge = String(Math.round((l.weight / langTotal) * 100)) + "%";
    const bw = tw(badge, 9.5) + 16, w = tw(l.name, 11.5) + bw + 32;
    const g = `<g transform="translate(${cx} 150)"><rect width="${w}" height="28" rx="14" fill="#3a3a3a"/>
      <text class="t" x="13" y="18.5" font-size="11.5" font-weight="500">${esc(l.name)}</text>
      <rect x="${w - bw - 6}" y="6" width="${bw}" height="16" rx="8" fill="${A}"/>
      <text class="t ink" x="${w - bw / 2 - 6}" y="17.5" font-size="9.5" font-weight="700" text-anchor="middle">${badge}</text></g>`;
    cx += w + 8; return g;
  }).join("");
  const stats = [["Contributions", fmt(total)], ["Public repos", fmt(D.publicRepos)], ["Active days", fmt(activeDays)], ["Best streak", `${longest}d`]];
  const colW = (W - 56) / 4;
  const statSvg = stats.map(([l, v], i) => `<g class="in" style="animation-delay:${0.1 + i * 0.07}s">
    <text class="t mut" x="${28 + i * colW}" y="244" font-size="12">${l}</text>
    <text class="t num" x="${28 + i * colW}" y="286" font-size="34">${esc(v)}</text></g>`).join("");
  const body = `
  <rect x="28" y="28" width="136" height="136" rx="22" fill="${RAISED}"/>
  ${avatar}
  <text class="t" x="180" y="64" font-size="30" font-weight="500" letter-spacing="-.4">${esc(cfg.displayName || D.name)}</text>
  <text class="t mut" x="180" y="90" font-size="13">@${esc(D.login)}  ·  ${esc([cfg.location, cfg.website].filter(Boolean).join("  ·  "))}</text>
  <text class="t" x="180" y="122" font-size="13.5" fill="#d6d6d6">${esc(clip(cfg.tagline, 88))}</text>
  ${pills}
  ${cfg.badge ? checkPill(W - 96 - tw(cfg.badge, 11) - 50, 37, cfg.badge) : ""}
  ${arrowBtn(W - 56, 52)}
  <line x1="28" y1="210" x2="${W - 28}" y2="210" stroke="#fff" stroke-opacity=".08"/>
  ${statSvg}`;
  return frame(W, H, body, "p");
}

function activityCard() {
  const W = 840, H = 262, cell = 11, gap = 3;
  const first = new Date(D.days[0].date + "T00:00:00Z").getUTCDay();
  const padded = [...Array(first).fill(null), ...D.days];
  const weeks = []; for (let i = 0; i < padded.length; i += 7) weeks.push(padded.slice(i, i + 7));
  const gw = weeks.length * (cell + gap) - gap;
  const ox = Math.round((W - gw) / 2), oy = 118;
  const nz = D.days.map((d) => d.count).filter(Boolean).sort((a, b) => a - b);
  const q = (p) => nz[Math.min(nz.length - 1, Math.floor(p * nz.length))] ?? 1;
  const [q1, q2, q3] = [q(0.25), q(0.5), q(0.75)];
  const lvl = (c) => (c === 0 ? 0 : c > q3 ? 4 : c > q2 ? 3 : c > q1 ? 2 : 1);
  let months = "", lastM = -1, lastWi = -9, tip = "";
  const cells = weeks.map((wk, wi) => wk.map((d, di) => {
    if (!d) return "";
    const m = new Date(d.date + "T00:00:00Z").getUTCMonth();
    if (m !== lastM && wi < weeks.length - 2 && wi - lastWi >= 3) {
      months += `<text class="t mut" x="${ox + wi * (cell + gap)}" y="${oy - 10}" font-size="10">${new Date(d.date).toLocaleString("en", { month: "short", timeZone: "UTC" })}</text>`;
      lastM = m; lastWi = wi;
    }
    const x = ox + wi * (cell + gap), y = oy + di * (cell + gap), L = lvl(d.count);
    if (d === busiest) tip = tooltip(x + cell / 2, oy - 46, `${fmtDate(d.date)} · ${d.count}`) + `<line x1="${x + cell / 2}" y1="${oy - 24}" x2="${x + cell / 2}" y2="${y}" stroke="#f4f4f4" stroke-opacity=".5" stroke-dasharray="2 2"/>`;
    return `<rect x="${x}" y="${y}" width="${cell}" height="${cell}" rx="3" fill="${GRID[L]}"${L ? ` class="in" style="animation-delay:${(wi * 0.012).toFixed(3)}s"` : ""}><title>${d.date}: ${d.count}</title></rect>`;
  }).join("")).join("");
  const legend = GRID.map((c, i) => `<rect x="${W - 120 + i * 15}" y="${H - 34}" width="11" height="11" rx="3" fill="${c}"/>`).join("");
  const body = `
  ${checkPill(28, 26, "Activity map")}
  <text class="t num" x="${W - 28}" y="58" font-size="34" text-anchor="end">${fmt(total)}</text>
  <text class="t mut" x="${W - 28}" y="78" font-size="11" text-anchor="end">contributions in the last year</text>
  ${months}${cells}${tip}
  <text class="t mut" x="28" y="${H - 24}" font-size="11">${activeDays} active days  ·  current streak ${current}d</text>
  <text class="t mut" x="${W - 128}" y="${H - 25}" font-size="10" text-anchor="end">Less</text>${legend}
  <text class="t mut" x="${W - 40}" y="${H - 25}" font-size="10">More</text>`;
  return frame(W, H, body, "a");
}

function languagesCard() {
  const W = 413, H = 300;
  const top = topLangs.filter((l) => l.name !== "Other").slice(0, 5);
  const max = Math.max(...top.map((l) => l.pct));
  const bars = top.map((l, i) => {
    const y = 104 + i * 38, w = Math.max(tw(l.name, 11.5) + 26, ((W - 56 - 56) * l.pct) / max);
    return `<rect class="rt" style="animation-delay:${i * 0.07}s" x="28" y="${y}" width="${w}" height="28" rx="6" fill="${A}" fill-opacity="${1 - i * 0.13}"/>
    <text class="t ink" x="40" y="${y + 18.5}" font-size="11.5" font-weight="700">${esc(l.name)}</text>
    <text class="t mut" x="${28 + w + 10}" y="${y + 18.5}" font-size="11.5">${l.pct.toFixed(1)}%</text>`;
  }).join("");
  const body = `
  <text class="t mut" x="28" y="40" font-size="12">Top language${cfg.recentRepos && cfg.languageMode !== "bytes" ? ` · last ${cfg.recentRepos} repos` : ""}</text>
  <text class="t num" x="28" y="76" font-size="34">${esc(top[0]?.name ?? "—")}</text>
  ${arrowBtn(W - 52, 52)}
  ${bars}`;
  return frame(W, H, body, "l");
}

function momentumCard() {
  const W = 413, H = 300;
  const recent = D.days.slice(-7 * 22);
  const wk = []; for (let i = 0; i < recent.length; i += 7) wk.push(recent.slice(i, i + 7).reduce((s, d) => s + d.count, 0));
  const mx = Math.max(1, ...wk), hi = wk.lastIndexOf(mx);
  const bw = 6, step = (W - 56) / wk.length, base = 214;
  const bars = wk.map((v, i) => {
    const h = Math.max(8, Math.sqrt(v / mx) * 112), x = 28 + i * step + (step - bw) / 2;
    return `<rect class="up" style="animation-delay:${i * 0.03}s" x="${x}" y="${base - h}" width="${bw}" height="${h}" rx="3" fill="${i === hi ? A : "#4a4a4a"}"><title>${v} contributions</title></rect>`;
  }).join("");
  const hx = 28 + hi * step + step / 2, hh = Math.max(8, 112);
  const body = `
  <text class="t" x="28" y="44" font-size="19" font-weight="500">Momentum</text>
  <text class="t mut" x="28" y="64" font-size="11">weekly contributions · last ${wk.length} weeks</text>
  ${bars}
  ${tooltip(hx, base - hh - 30, `${mx} / wk`)}
  <text class="t num" x="28" y="${H - 30}" font-size="40">${fmt(total + D.publicRepos)}</text>
  <text class="t mut" x="${28 + tw(fmt(total + D.publicRepos), 40) * 0.92 + 10}" y="${H - 30}" font-size="11">total impact</text>
  <text class="t mut" x="${W - 28}" y="${H - 30}" font-size="11" text-anchor="end">best streak ${longest}d</text>`;
  return frame(W, H, body, "s");
}

function repoCard(name, idx) {
  const r = D.repos.find((x) => x.name.toLowerCase() === name.toLowerCase()) ?? { name };
  const W = 413, H = 180;
  const desc = cfg.descriptionOverrides?.[r.name] ?? r.description ?? (r.language ? `A ${r.language} project.` : "");
  const lines = wrap(desc, 46, 2);
  const lang = r.language ?? "Repo";
  const lw = tw(lang, 11) + 30;
  const body = `
  <text class="t mut" x="28" y="42" font-size="12">#${String(idx + 1).padStart(2, "0")}</text>
  <text class="t" x="28" y="74" font-size="21" font-weight="500" letter-spacing="-.3">${esc(clip(r.name, 26))}</text>
  ${lines.map((l, i) => `<text class="t mut" x="28" y="${102 + i * 17}" font-size="12">${esc(l)}</text>`).join("")}
  <g transform="translate(28 ${H - 44})"><rect width="${lw}" height="24" rx="12" fill="#3a3a3a"/>
    <circle cx="13" cy="12" r="4" fill="${r.color || A}"/><text class="t" x="22" y="16" font-size="11">${esc(lang)}</text></g>
  ${r.stars ? `<text class="t mut" x="${28 + lw + 12}" y="${H - 28}" font-size="11">★ ${fmt(r.stars)}</text>` : ""}
  ${arrowBtn(W - 50, 50, 22)}`;
  return frame(W, H, body, "r" + idx);
}

// ---------- write ----------
await mkdir(OUT, { recursive: true });
const files = { "profile.svg": profileCard(), "activity.svg": activityCard(), "languages.svg": languagesCard(), "momentum.svg": momentumCard() };
cfg.featured.forEach((n, i) => (files[`repo-${n}.svg`] = repoCard(n, i)));
for (const [n, svg] of Object.entries(files)) await writeFile(join(OUT, n), svg);
console.log(`wrote ${Object.keys(files).length} cards · ${total} contributions · ${activeDays} active days · streak ${current}/${longest}${D.avatar ? " · avatar embedded" : " · no avatar (initials)"}`);
