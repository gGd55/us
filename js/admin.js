/* ===========================================================
   相册后台：用 GitHub 当后端
   读：直接拉取仓库里的 js/config.js 与 js/photos.js
   写：逐文件提交（Contents API），自动带上已有 sha
   =========================================================== */
(function () {
  "use strict";

  const OWNER = "gGd55";
  const REPO = "us";
  const BRANCH = "main";
  const API = "https://api.github.com";
  const TOKEN_KEY = "gh-admin-token";

  const $ = (s) => document.querySelector(s);
  const statusEl = $("#status");
  const logEl = () => $("#log");

  function say(msg, kind) {
    statusEl.textContent = msg;
    statusEl.className = "status" + (kind ? " " + kind : "");
  }

  function log(line, box) {
    const el = box || logEl();
    el.hidden = false;
    el.textContent += line + "\n";
    el.scrollTop = el.scrollHeight;
  }

  function getToken() {
    return localStorage.getItem(TOKEN_KEY) || "";
  }

  async function api(path, opts) {
    const res = await fetch(API + path, Object.assign({
      cache: "no-store",
      headers: {
        Authorization: "Bearer " + getToken(),
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    }, opts || {}));
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error("HTTP " + res.status + " " + t.slice(0, 160));
    }
    return res;
  }

  async function getUser() {
    const res = await api("/user");
    return res.json();
  }

  function b64dec(b64) {
    const clean = String(b64).replace(/\s/g, "");
    const bin = atob(clean);
    const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
    return new TextDecoder("utf-8").decode(bytes);
  }

  const shaCache = new Map();

  // 一次请求拿到「内容 + sha」，避免 raw / json 两种 Accept 命中同一缓存
  async function readFileWithSha(path) {
    const res = await api(`/repos/${OWNER}/${REPO}/contents/${path}?ref=${BRANCH}&t=${Date.now()}`);
    const j = await res.json();
    if (Array.isArray(j)) throw new Error(path + " 是目录，不是文件");
    shaCache.set(path, j.sha || null);
    return b64dec(j.content || "");
  }

  async function fileSha(path) {
    if (shaCache.has(path)) return shaCache.get(path);
    try {
      const res = await api(`/repos/${OWNER}/${REPO}/contents/${path}?ref=${BRANCH}&t=${Date.now()}`);
      const j = await res.json();
      shaCache.set(path, j.sha || null);
      return j.sha || null;
    } catch (e) {
      if (String(e.message).indexOf("404") > -1) { shaCache.set(path, null); return null; }
      throw e;
    }
  }

  async function putFile(path, base64, message) {
    const sha = await fileSha(path);
    const body = { message, content: base64, branch: BRANCH };
    if (sha) body.sha = sha;
    const resp = await api(`/repos/${OWNER}/${REPO}/contents/${path}`, {
      method: "PUT",
      headers: { Authorization: "Bearer " + getToken(),
                 Accept: "application/vnd.github+json",
                 "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    try {
      const j = await resp.json();
      if (j && j.content && j.content.sha) shaCache.set(path, j.content.sha);
    } catch (e) {}
  }

  // ---------------- 状态 ----------------
  const state = {
    texts: {},
    show: { order: "asc", duration: 5, motion: "kenburns", autoStart: true, volume: 0.5 },
    photos: [],       // {file,title,date,time,include,isNew,blob,removed}
    dirty: false,
  };

  function b64(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = "";
    bytes.forEach((b) => { bin += String.fromCharCode(b); });
    return btoa(bin);
  }

  function b64buf(buf) {
    const bytes = new Uint8Array(buf);
    let bin = "";
    const CH = 0x8000;
    for (let i = 0; i < bytes.length; i += CH) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
    }
    return btoa(bin);
  }

  // ---------------- 读取 ----------------
  async function load() {
    say("读取中…");
    const cfgText = await readFileWithSha("js/config.js");
    const phText = await readFileWithSha("js/photos.js");

    const CONFIG = new Function(cfgText + "; return CONFIG;")();
    const PHOTOS = new Function(phText + "; return PHOTOS;")();

    state.texts = {
      hisName: CONFIG.hisName || "",
      herName: CONFIG.herName || "",
      startDate: CONFIG.startDate || "",
      heroKicker: CONFIG.heroKicker || "",
      heroTitle: CONFIG.heroTitle || "",
      heroNote: CONFIG.heroNote || "",
      aboutText: CONFIG.aboutText || "",
    };
    Object.keys(state.texts).forEach((k) => {
      const el = $("#" + k);
      if (el) el.value = state.texts[k];
    });

    const s = CONFIG.show || {};
    state.show = {
      order: s.order || "asc",
      duration: Number(s.duration) || 5,
      motion: s.motion || "kenburns",
      autoStart: s.autoStart !== false,
      volume: typeof s.volume === "number" ? s.volume : 0.5,
    };
    $("#showOrder").value = state.show.order;
    $("#showDuration").value = String(state.show.duration);
    $("#showMotion").value = state.show.motion;
    $("#showAuto").value = state.show.autoStart ? "1" : "0";
    $("#showVolume").value = Math.round(state.show.volume * 100);
    $("#volVal").textContent = Math.round(state.show.volume * 100) + "%";

    state.photos = PHOTOS.map((p) => ({
      file: p.file, title: p.title || "", date: p.date || "",
      time: p.time || "", include: p.show !== false,
      isNew: false, removed: false,
    }));

    state.dirty = false;
    render();
    say("已连接", "ok");
  }

  // ---------------- 渲染 ----------------
  function render() {
    const list = $("#photoList");
    list.innerHTML = "";
    state.photos.forEach((p, i) => {
      const li = document.createElement("li");
      li.className = "row" + (p.removed ? " removed" : p.isNew ? " is-new" : "");
      const src = p.blob ? URL.createObjectURL(p.blob) : p.file;
      li.innerHTML =
        '<div class="thumb"><img src="' + src + '" alt="" loading="lazy"></div>' +
        '<div><div class="row-fields">' +
          '<input type="text" data-act="title" placeholder="标题（可空）" value="' + esc(p.title) + '">' +
          '<input type="date" data-act="date" value="' + esc(p.date) + '">' +
        '</div><div class="file">' + esc(p.file) + (p.isNew ? " · 新增" : "") + "</div></div>" +
        '<div class="row-actions">' +
          '<label class="chk"><input type="checkbox" data-act="include"' +
            (p.include ? " checked" : "") + "><span>放映</span></label>" +
          (p.removed
            ? '<button class="mini undo" data-act="undo">恢复</button>'
            : '<button class="mini danger" data-act="remove">删除</button>') +
        "</div>";

      li.querySelector('[data-act="title"]').addEventListener("input", (e) => {
        p.title = e.target.value; state.dirty = true;
      });
      li.querySelector('[data-act="date"]').addEventListener("change", (e) => {
        p.date = e.target.value; state.dirty = true;
      });
      li.querySelector('[data-act="include"]').addEventListener("change", (e) => {
        p.include = e.target.checked; state.dirty = true;
      });
      li.querySelector('[data-act="remove"]').addEventListener("click", () => {
        p.removed = true; state.dirty = true; render();
      });
      const ud = li.querySelector('[data-act="undo"]');
      if (ud) ud.addEventListener("click", () => {
        p.removed = false; state.dirty = true; render();
      });
      list.appendChild(li);
    });

    const alive = state.photos.filter((p) => !p.removed).length;
    $("#countBadge").textContent = alive + " 张";
    $("#newBadge").textContent = "新增 " + state.photos.filter((p) => p.isNew && !p.removed).length;
  }

  function esc(s) {
    return String(s || "").replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  // ---------------- 加照片 ----------------
  function parseDate(name, ms) {
    const m = String(name).match(/(\d{4})[-_.]?(\d{2})[-_.]?(\d{2})(?:[-_.\sT]?(\d{2})[-_.:]?(\d{2}))?/);
    const pad = (n) => String(n).padStart(2, "0");
    if (m) return { date: `${m[1]}-${m[2]}-${m[3]}`, time: m[4] ? `${m[4]}:${m[5]}` : "" };
    const d = new Date(ms || Date.now());
    return { date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
             time: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
  }

  function compress(file, maxSide = 1200, q = 0.82) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        let { width: w, height: h } = img;
        const s = Math.min(1, maxSide / Math.max(w, h));
        if (s < 1) { w = Math.round(w * s); h = Math.round(h * s); }
        const cv = document.createElement("canvas");
        cv.width = w; cv.height = h;
        cv.getContext("2d").drawImage(img, 0, 0, w, h);
        cv.toBlob((b) => (b ? resolve(b) : reject(new Error("编码失败"))), "image/jpeg", q);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("不是有效图片")); };
      img.src = url;
    });
  }

  async function addFiles(files) {
    const arr = Array.from(files).filter((f) => /^image\//.test(f.type));
    for (const f of arr) {
      try {
        const blob = await compress(f);
        const { date, time } = parseDate(f.name, f.lastModified);
        const stamp = date.replace(/-/g, "-") + "_" + (time || "00:00").replace(":", "") + "00";
        state.photos.unshift({
          file: `photos/${stamp}-${Date.now().toString(36).slice(-4)}.jpg`,
          title: "", date, time, include: true, isNew: true, blob, removed: false,
        });
        state.dirty = true;
      } catch (e) {
        log("✗ " + f.name + "：" + e.message, $("#log2"));
      }
    }
    render();
  }

  // ---------------- 保存 ----------------
  function buildConfig() {
    const t = state.texts;
    const q = (s) => JSON.stringify(String(s || ""));
    return `/* 由相册后台生成 */
const CONFIG = {
  hisName: ${q(t.hisName)},
  herName: ${q(t.herName)},
  startDate: ${q(t.startDate)},
  heroKicker: ${q(t.heroKicker)},
  heroTitle: ${q(t.heroTitle)},
  heroNote: ${q(t.heroNote)},
  aboutText: ${q(t.aboutText)},
  show: ${JSON.stringify(state.show, null, 2).replace(/\n/g, "\n  ")},
};
`;
  }

  function buildPhotos() {
    const items = state.photos
      .filter((p) => !p.removed)
      .map((p) => {
        const o = { file: p.file, title: p.title || "", date: p.date || "" };
        if (p.time) o.time = p.time;
        if (p.include === false) o.show = false;
        return o;
      })
      .sort((a, b) => ((a.date + (a.time || "")) < (b.date + (b.time || "")) ? 1 : -1));
    return "// 由相册后台生成\nconst PHOTOS = " + JSON.stringify(items, null, 2) + ";\n";
  }

  async function save() {
    const btn = $("#saveBtn");
    const box = $("#log2");
    box.hidden = false;
    box.textContent = "";
    btn.disabled = true;

    try {
      const newOnes = state.photos.filter((p) => p.isNew && !p.removed);
      log(`① 文案配置…`, box);
      await putFile("js/config.js", b64(buildConfig()), "后台：更新文案与放映设置");

      if (newOnes.length) {
        log(`② 上传 ${newOnes.length} 张新照片…`, box);
        for (const p of newOnes) {
          const buf = await p.blob.arrayBuffer();
          await putFile(p.file, b64buf(buf), "后台：新增照片 " + p.file.split("/").pop());
          p.isNew = false;
          log("   ✓ " + p.file, box);
        }
      }

      log(`③ 照片清单…`, box);
      await putFile("js/photos.js", b64(buildPhotos()), "后台：更新照片清单");

      log(`✅ 完成，等 1 分钟 GitHub Pages 会自动更新`, box);
      say("已发布", "ok");
      state.dirty = false;
    } catch (e) {
      log("❌ 失败：" + e.message, box);
      say("保存失败", "err");
    } finally {
      btn.disabled = false;
    }
  }

  // ---------------- 绑定 ----------------
  function bind() {
    Object.keys({
      hisName: 1, herName: 1, startDate: 1, heroKicker: 1, heroTitle: 1, heroNote: 1, aboutText: 1,
    }).forEach((id) => {
      const el = $("#" + id);
      if (el) el.addEventListener("input", () => {
        state.texts[id] = el.value;
        state.dirty = true;
      });
    });

    ["showOrder", "showDuration", "showMotion", "showAuto", "showVolume"].forEach((id) => {
      const el = $("#" + id);
      if (!el) return;
      const handler = () => {
        state.show = {
          order: $("#showOrder").value,
          duration: Number($("#showDuration").value) || 5,
          motion: $("#showMotion").value,
          autoStart: $("#showAuto").value === "1",
          volume: Number($("#showVolume").value) / 100,
        };
        $("#volVal").textContent = Math.round(state.show.volume * 100) + "%";
        state.dirty = true;
      };
      el.addEventListener("change", handler);
      el.addEventListener("input", handler);
    });

    $("#pickBtn").addEventListener("click", () => $("#fileInput").click());
    $("#fileInput").addEventListener("change", (e) => {
      addFiles(e.target.files); e.target.value = "";
    });

    const dz = $("#dropzone");
    ["dragenter", "dragover"].forEach((ev) => dz.addEventListener(ev, (e) => {
      e.preventDefault(); dz.classList.add("over");
    }));
    ["dragleave", "drop"].forEach((ev) => dz.addEventListener(ev, (e) => {
      e.preventDefault(); dz.classList.remove("over");
    }));
    dz.addEventListener("drop", (e) => {
      if (e.dataTransfer && e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
    });
    window.addEventListener("dragover", (e) => e.preventDefault());
    window.addEventListener("drop", (e) => e.preventDefault());

    $("#saveBtn").addEventListener("click", save);
    $("#reloadBtn").addEventListener("click", () => location.reload());
    $("#forgetBtn").addEventListener("click", () => {
      localStorage.removeItem(TOKEN_KEY);
      location.reload();
    });

    $("#connectBtn").addEventListener("click", async () => {
      const tk = $("#token").value.trim();
      if (!tk) return;
      localStorage.setItem(TOKEN_KEY, tk);
      try {
        const u = await getUser();
        $("#repoHint").textContent = `${u.login}/${REPO}`;
        log("✅ 令牌有效：" + u.login);
        $("#editorArea").hidden = false;
        await load();
      } catch (e) {
        localStorage.removeItem(TOKEN_KEY);
        log("❌ 连接失败：" + e.message);
        say("连接失败", "err");
      }
    });
  }

  (async function init() {
    bind();
    const tk = getToken();
    if (!tk) {
      say("未连接");
      return;
    }
    $("#token").value = tk;
    try {
      const u = await getUser();
      $("#repoHint").textContent = `${u.login}/${REPO}`;
      $("#editorArea").hidden = false;
      await load();
    } catch (e) {
      say("令牌失效", "err");
      log("❌ 自动连接失败：" + e.message);
    }
  })();
})();
