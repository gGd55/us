/* ===========================================================
   相册主逻辑
   =========================================================== */

(function () {
  "use strict";

  const $ = (sel) => document.querySelector(sel);

  // ---------- 基础信息 ----------
  const nameText =
    (CONFIG.hisName || "我") + " & " + (CONFIG.herName || "你");

  $("#brandNames").textContent = nameText;
  $("#footerNames").textContent = nameText;
  $("#heroTitle").textContent = CONFIG.heroTitle || "我们";
  $("#heroNote").textContent = CONFIG.heroNote || "";
  $("#heroKicker").textContent = CONFIG.heroKicker || "";
  $("#aboutText").textContent = CONFIG.aboutText || "";

  const start = new Date(CONFIG.startDate + "T00:00:00");
  $("#footerDate").textContent = CONFIG.startDate;

  function daysBetween(a, b) {
    const MS = 86400000;
    const d1 = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
    const d2 = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
    return Math.max(0, Math.round((d2 - d1) / MS));
  }

  // 天数：先落下真实值，动画只是"锦上添花"。
  // 这样即使 rAF 被节流（后台标签页 / 省电模式），数字也不会卡在 0。
  (function countUp() {
    const target = daysBetween(start, new Date());
    const el = $("#daysNum");
    el.textContent = String(target);

    const reduce = window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || !window.requestAnimationFrame || target === 0) return;

    const dur = 1100;
    let raf = 0;
    const t0 = performance.now();
    const ease = (t) => 1 - Math.pow(1 - t, 3);

    function finish() {
      cancelAnimationFrame(raf);
      el.textContent = String(target);
    }

    function step(now) {
      const p = Math.min(1, (now - t0) / dur);
      el.textContent = String(Math.round(target * ease(p)));
      if (p < 1) raf = requestAnimationFrame(step);
      else finish();
    }

    // 保底：无论动画是否跑完，1.6 秒后一定是真实值
    setTimeout(finish, dur + 500);
    raf = requestAnimationFrame(step);
  })();

  // ---------- 数据整理 ----------
  const photos = (typeof PHOTOS !== "undefined" ? PHOTOS : [])
    .filter((p) => p && p.file)
    .map((p) => ({
      file: p.file,
      title: p.title || "",
      date: p.date || "",
      time: p.time || "",
      tags: Array.isArray(p.tags) ? p.tags : [],
      // 之前漏了这几个字段，导致缩略图永远用不上
      thumb: p.thumb || "",
      view: p.view || "",
      w: p.w || 0,
      h: p.h || 0,
      show: p.show,
    }))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  // 提供给放映模块
  window.__GALLERY_PHOTOS = photos;

  const gallerySections = $("#gallerySections");
  const emptyState = $("#emptyState");
  const filtersEl = $("#filters");

  if (!photos.length) {
    emptyState.hidden = false;
    return;
  }

  // ---------- 标签筛选 ----------
  const allTags = [];
  photos.forEach((p) =>
    p.tags.forEach((t) => {
      if (!allTags.includes(t)) allTags.push(t);
    })
  );

  let activeTag = "全部";
  let visible = photos.slice(); // 当前可见的照片（灯箱导航用）

  function buildFilters() {
    const list = ["全部"].concat(allTags);
    filtersEl.innerHTML = "";
    list.forEach((tag) => {
      const b = document.createElement("button");
      b.className = "chip";
      b.type = "button";
      b.textContent = tag;
      b.setAttribute("role", "tab");
      b.setAttribute("aria-selected", String(tag === activeTag));
      b.addEventListener("click", () => {
        activeTag = tag;
        [...filtersEl.children].forEach((c) =>
          c.setAttribute("aria-selected", String(c.textContent === tag))
        );
        render();
      });
      filtersEl.appendChild(b);
    });
  }

  // ---------- 渲染 ----------
  function formatDate(iso, time) {
    if (!iso) return "";
    const [y, m, d] = iso.split("-");
    const base = y + "." + m + "." + d;
    return time ? base + " " + time : base;
  }

  function cardHTML(p, idx) {
    return (
      '<figure class="card" data-idx="' + idx + '" tabindex="0" role="button" ' +
      'aria-label="查看：' + (p.title || "照片") + '">' +
        '<div class="card-frame">' +
          '<img src="' + (p.thumb || p.file) + '"' +
            (p.thumb && p.view ? ' srcset="' + p.thumb + " 640w, " + p.view + " 1200w" +
              '" sizes="(max-width: 720px) 46vw, 24vw"' : "") +
            ' alt="' + (p.title || "我们的照片") + '" loading="lazy" decoding="async"' +
            (p.w && p.h ? ' width="' + p.w + '" height="' + p.h + '"' : "") +
            ' data-full="' + p.file + '">' +
        "</div>" +
        '<figcaption class="card-cap">' +
          '<span class="t">' + (p.title || "&nbsp;") + "</span>" +
          "<span> " + formatDate(p.date, p.time) + "</span>" +
        "</figcaption>" +
      "</figure>"
    );
  }

  function render() {
    visible = activeTag === "全部"
      ? photos.slice()
      : photos.filter((p) => p.tags.includes(activeTag));

    // 按年分组（倒序）
    const byYear = new Map();
    visible.forEach((p) => {
      const y = (p.date || "").slice(0, 4) || "未标注日期";
      if (!byYear.has(y)) byYear.set(y, []);
      byYear.get(y).push(p);
    });

    const years = [...byYear.keys()].sort((a, b) => (a < b ? 1 : -1));

    gallerySections.innerHTML = years
      .map((y) => {
        const list = byYear.get(y);
        const cards = list
          .map((p) => cardHTML(p, visible.indexOf(p)))
          .join("");
        return (
          '<section class="year-block">' +
            '<h2 class="year-head">' +
              '<span class="year-num">' + y + "</span>" +
              '<span class="year-rule"></span>' +
              '<span class="year-count">' + list.length + " 张</span>" +
            "</h2>" +
            '<div class="grid">' + cards + "</div>" +
          "</section>"
        );
      })
      .join("");

    // 图片载入 / 失败占位
    gallerySections.querySelectorAll(".card").forEach((card) => {
      const img = card.querySelector("img");
      const frame = card.querySelector(".card-frame");

      const ok = () => img.classList.add("is-loaded");
      const fail = () => frame.classList.add("is-missing");

      if (img.complete) {
        img.naturalWidth > 0 ? ok() : fail();
      } else {
        img.addEventListener("load", ok, { once: true });
        img.addEventListener("error", fail, { once: true });
      }

      const idx = Number(card.dataset.idx);
      card.addEventListener("click", () => openLightbox(idx));
      card.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openLightbox(idx);
        }
      });
    });

    emptyState.hidden = visible.length > 0;
  }

  // ---------- 灯箱 ----------
  const lb = $("#lightbox");
  const lbImg = $("#lbImg");
  const lbTitle = $("#lbTitle");
  const lbDate = $("#lbDate");
  const lbIndex = $("#lbIndex");
  let cur = 0;
  let lastFocus = null;

  function paintLightbox() {
    const p = visible[cur];
    if (!p) return;
    lbImg.src = p.view || p.file;
    lbImg.alt = p.title || "我们的照片";
    lbTitle.textContent = p.title || "";
    lbDate.textContent = formatDate(p.date, p.time);
    lbIndex.textContent = cur + 1 + " / " + visible.length;
  }

  function openLightbox(idx) {
    cur = Math.max(0, Math.min(visible.length - 1, idx));
    lastFocus = document.activeElement;
    paintLightbox();
    lb.hidden = false;
    requestAnimationFrame(() => lb.classList.add("is-open"));
    document.body.style.overflow = "hidden";
    $("#lbClose").focus();
  }

  function closeLightbox() {
    lb.classList.remove("is-open");
    document.body.style.overflow = "";
    setTimeout(() => {
      lb.hidden = true;
      if (lastFocus && lastFocus.focus) lastFocus.focus();
    }, 260);
  }

  function step(dir) {
    if (!visible.length) return;
    cur = (cur + dir + visible.length) % visible.length;
    paintLightbox();
  }

  $("#lbClose").addEventListener("click", closeLightbox);
  $("#lbPrev").addEventListener("click", () => step(-1));
  $("#lbNext").addEventListener("click", () => step(1));
  lb.addEventListener("click", (e) => {
    if (e.target === lb) closeLightbox();
  });

  document.addEventListener("keydown", (e) => {
    if (lb.hidden) return;
    if (e.key === "Escape") closeLightbox();
    else if (e.key === "ArrowLeft") step(-1);
    else if (e.key === "ArrowRight") step(1);
  });

  // 触摸滑动
  let touchX = null;
  lb.addEventListener("touchstart", (e) => {
    touchX = e.changedTouches[0].clientX;
  }, { passive: true });
  lb.addEventListener("touchend", (e) => {
    if (touchX === null) return;
    const dx = e.changedTouches[0].clientX - touchX;
    if (Math.abs(dx) > 45) step(dx > 0 ? -1 : 1);
    touchX = null;
  }, { passive: true });

  // ---------- 顶栏滚动状态 ----------
  const header = $(".site-header");
  const onScroll = () => header.classList.toggle("is-scrolled", window.scrollY > 24);
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  // ---------- 启动 ----------
  buildFilters();
  render();
})();


/* ===========================================================
   背景音乐 + 全屏放映
   点"放映"= 请求全屏 + 放音乐 + 自动轮播照片
   =========================================================== */
(function showAndMusic() {
  "use strict";

  const bgm = document.getElementById("bgm");
  const btn = document.getElementById("musicBtn");
  const labelEl = document.getElementById("musicLabel");
  const gate = document.getElementById("gate");
  const gateBtn = document.getElementById("gateBtn");
  if (!bgm || !btn) return;

  const showEl = document.getElementById("show");
  const stageA = document.getElementById("showA");
  const stageB = document.getElementById("showB");
  const capEl = document.getElementById("showCap");
  const titleEl = document.getElementById("showTitle");
  const metaEl = document.getElementById("showMeta");
  const countEl = document.getElementById("showCount");
  const barEl = document.getElementById("showBar");
  const exitBtn = document.getElementById("showExit");
  const toggleBtn = document.getElementById("showToggle");
  const hintEl = document.getElementById("showHint");

  const MUTE_KEY = "us-music-muted";
  const reduceMotion = window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const CFG = (typeof CONFIG !== "undefined") ? CONFIG : {};
  const SET = (CFG.show && typeof CFG.show === "object") ? CFG.show : {};

  const DUR = Math.min(30000, Math.max(1500, (Number(SET.duration) || 5) * 1000));
  const TARGET = Math.min(1, Math.max(0, typeof SET.volume === "number" ? SET.volume : 0.5));
  const ORDER = SET.order || "asc";
  const MOTION = SET.motion || "kenburns";
  const AUTO_START = SET.autoStart !== false;
  const names = (CFG.hisName || "我") + " & " + (CFG.herName || "你");
  const gateNames = document.getElementById("gateNames");
  if (gateNames) gateNames.textContent = names;

  // ---------- 音乐 ----------
  function paintBtn() {
    const playing = !bgm.paused;
    btn.classList.toggle("is-playing", playing);
    btn.setAttribute("aria-pressed", String(playing));
    if (labelEl) labelEl.textContent = playing ? "暂停" : (showing ? "继续" : "放映");
  }

  function fadeTo(target, ms) {
    return new Promise((resolve) => {
      if (reduceMotion || !ms) { bgm.volume = target; return resolve(); }
      const from = bgm.volume;
      const t0 = performance.now();
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        bgm.volume = target;
        resolve();
      };
      setTimeout(finish, ms + 400);   // rAF 被节流时的兜底
      (function step(now) {
        if (done) return;
        const p = Math.min(1, (now - t0) / ms);
        bgm.volume = Math.max(0, Math.min(1, from + (target - from) * p));
        if (p < 1) requestAnimationFrame(step); else finish();
      })(t0);
    });
  }

  async function playMusic() {
    try {
      if (bgm.paused) { bgm.volume = 0; await bgm.play(); }
      paintBtn();
      await fadeTo(TARGET, 1400);
      localStorage.setItem(MUTE_KEY, "0");
    } catch (e) {
      paintBtn();
    }
  }

  function pauseMusic() {
    fadeTo(0, 350).then(() => { bgm.pause(); paintBtn(); });
    localStorage.setItem(MUTE_KEY, "1");
  }

  // ---------- 放映 ----------
  let slides = [];
  let idx = 0;
  let timer = null;
  let showing = false;
  let paused = false;
  let elapsed = 0;
  let slideStart = 0;
  let front = null;
  let back = null;
  let wakeLock = null;
  let hintTimer = null;
  let autoPaused = false;     // 因切后台/息屏被自动暂停

  function formatDate(iso, time) {
    if (!iso) return "";
    const [y, m, d] = iso.split("-");
    return y + "." + m + "." + d + (time ? " " + time : "");
  }

  function buildSlides() {
    // show === false 的照片不进放映
    const src = (window.__GALLERY_PHOTOS || []).filter((p) => !p.removed && p.show !== false);

    const key = (p) => (p.date || "") + " " + (p.time || "");
    slides = src.slice().sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));

    if (ORDER === "desc") slides.reverse();
    else if (ORDER === "random") {
      for (let i = slides.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [slides[i], slides[j]] = [slides[j], slides[i]];
      }
    }
  }

  function preload(i) {
    const p = slides[i];
    if (!p) return;
    const im = new Image();
    im.src = p.view || p.file;
  }

  function paintSlide() {
    const p = slides[idx];
    if (!p || !front) return;

    // 双缓冲：back 先设好图，再交替 z-index
    back.style.backgroundImage = 'url("' + (p.view || p.file) + '")';
    back.style.zIndex = 2;
    front.style.zIndex = 1;

    back.classList.add("is-on");
    front.classList.remove("is-on", "is-zoom");
    if (!reduceMotion && MOTION === "kenburns") {
      setTimeout(() => back.classList.add("is-zoom"), 60);
    }

    const tmp = front; front = back; back = tmp;

    if (p.title) {
      titleEl.textContent = p.title;
      titleEl.style.display = "";
    } else {
      titleEl.textContent = "";
      titleEl.style.display = "none";
    }
    metaEl.textContent = formatDate(p.date, p.time);
    countEl.textContent = (idx + 1) + " / " + slides.length;
    capEl.classList.add("is-on");

    preload((idx + 1) % slides.length);
  }

  function runBar(ms) {
    if (!barEl) return;
    barEl.style.transition = "none";
    barEl.style.width = "0%";
    void barEl.offsetWidth;
    barEl.style.transition = "width " + ms + "ms linear";
    barEl.style.width = "100%";
  }

  function schedule() {
    clearTimeout(timer);
    elapsed = 0;
    slideStart = performance.now();
    runBar(DUR);
    timer = setTimeout(() => {
      idx = (idx + 1) % slides.length;
      paintSlide();
      schedule();
    }, DUR);
  }

  function pauseShow() {
    if (!showing || paused) return;
    paused = true;
    clearTimeout(timer);
    elapsed += performance.now() - slideStart;
    const bar = barEl;
    if (bar) {
      const w = bar.getBoundingClientRect().width;
      const pct = bar.parentElement.getBoundingClientRect().width || 1;
      bar.style.transition = "none";
      bar.style.width = Math.min(100, (w / pct) * 100) + "%";
    }
    showEl.classList.add("is-paused");
    if (toggleBtn) toggleBtn.textContent = "▶";
    pauseMusic();
  }

  function resumeShow() {
    if (!showing || !paused) return;
    paused = false;
    showEl.classList.remove("is-paused");
    if (toggleBtn) toggleBtn.textContent = "❚❚";
    playMusic();
    const remain = Math.max(600, DUR - elapsed);
    slideStart = performance.now();
    const bar = barEl;
    if (bar) {
      const from = parseFloat(bar.style.width) || 0;
      bar.style.transition = "none";
      bar.style.width = from + "%";
      void bar.offsetWidth;
      bar.style.transition = "width " + remain + "ms linear";
      bar.style.width = "100%";
    }
    clearTimeout(timer);
    timer = setTimeout(() => {
      idx = (idx + 1) % slides.length;
      paintSlide();
      schedule();
    }, remain);
  }

  async function enterFullscreen() {
    const el = document.documentElement;
    try {
      if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: "hide" });
      else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
    } catch (e) { /* iOS 不支持元素全屏，靠覆盖层 */ }
  }

  async function exitFullscreen() {
    try {
      if (document.fullscreenElement && document.exitFullscreen) await document.exitFullscreen();
      else if (document.webkitFullscreenElement && document.webkitExitFullscreen) document.webkitExitFullscreen();
    } catch (e) {}
  }

  async function lockScreen() {
    try {
      if ("wakeLock" in navigator && !wakeLock) {
        wakeLock = await navigator.wakeLock.request("screen");
        wakeLock.addEventListener("release", () => { wakeLock = null; });
      }
    } catch (e) {}
  }

  function releaseScreen() {
    try { if (wakeLock) { wakeLock.release(); wakeLock = null; } } catch (e) {}
  }

  async function startShow() {
    buildSlides();
    if (!slides.length) return;

    idx = 0;
    showing = true;
    paused = false;
    showEl.hidden = false;
    showEl.setAttribute("aria-hidden", "false");
    showEl.classList.toggle("is-cut", MOTION === "cut");
    showEl.classList.toggle("is-fade", MOTION === "fade");
    void showEl.offsetWidth;          // 强制重排，保证从 opacity:0 开始过渡
    showEl.classList.add("is-open");  // 不依赖 rAF（被节流会导致整层透明）

    // 兜底：CSS 过渡若没跑起来，700ms 后强制可见，绝不留透明层
    setTimeout(() => {
      if (parseFloat(getComputedStyle(showEl).opacity) < 0.9) {
        showEl.style.transition = "none";
        showEl.style.opacity = "1";
      }
    }, 700);

    front = stageA;
    back = stageB;
    front.style.zIndex = 1;
    back.style.zIndex = 2;
    paintSlide();

    showEl.classList.remove("is-paused", "is-idle");
    if (toggleBtn) toggleBtn.textContent = "❚❚";
    hintTimer = setTimeout(() => showEl.classList.add("is-idle"), 3600);

    document.body.style.overflow = "hidden";

    await playMusic();
    enterFullscreen();
    lockScreen();
    schedule();
    paintBtn();
  }

  function exitShow() {
    if (!showing) return;
    showing = false;
    paused = false;
    clearTimeout(timer);
    clearTimeout(hintTimer);
    showEl.classList.remove("is-open", "is-paused", "is-idle");
    setTimeout(() => {
      showEl.hidden = true;
      showEl.setAttribute("aria-hidden", "true");
      stageA.classList.remove("is-on", "is-zoom");
      stageB.classList.remove("is-on", "is-zoom");
      stageA.style.backgroundImage = "";
      stageB.style.backgroundImage = "";
      showEl.style.transition = "";
      showEl.style.opacity = "";
    }, 500);
    exitFullscreen();
    releaseScreen();
    pauseMusic();
    document.body.style.overflow = "";
    paintBtn();
  }

  // ---------- 交互 ----------
  const navShow = document.getElementById("navShow");
  if (navShow) {
    navShow.addEventListener("click", (e) => {
      e.preventDefault();
      if (!showing) startShow();
    });
  }

  btn.addEventListener("click", () => {
    if (showing) {
      paused ? resumeShow() : pauseShow();
    } else if (bgm.paused) {
      startShow();          // ← 点音乐 = 开始放映
    } else {
      pauseMusic();         // 只想安静看照片
    }
  });

  if (exitBtn) exitBtn.addEventListener("click", (e) => { e.stopPropagation(); exitShow(); });
  if (toggleBtn) toggleBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    paused ? resumeShow() : pauseShow();
  });

  if (showEl) {
    showEl.addEventListener("click", (e) => {
      if (e.target === showEl || e.target.classList.contains("show-slide")) {
        paused ? resumeShow() : pauseShow();
      }
    });
  }

  document.addEventListener("keydown", (e) => {
    if (!showing) return;
    if (e.key === "Escape") exitShow();
    else if (e.key === " ") { e.preventDefault(); paused ? resumeShow() : pauseShow(); }
    else if (e.key === "ArrowRight") { idx = (idx + 1) % slides.length; paintSlide(); schedule(); }
    else if (e.key === "ArrowLeft") { idx = (idx - 1 + slides.length) % slides.length; paintSlide(); schedule(); }
  });

  // 退出全屏不结束放映（覆盖层还在）
  document.addEventListener("fullscreenchange", () => {
    if (!document.fullscreenElement && showing) releaseScreen();
  });

  // 播放到结尾（2:00）兜底：不让它安静下来
  bgm.addEventListener("ended", () => {
    if (!bgm.paused) return;
    bgm.currentTime = 0;
    if (showing || localStorage.getItem(MUTE_KEY) === "0") playMusic();
  });

  // 被系统打断（来电、别的 App 抢音频）后，回到前台自动续
  bgm.addEventListener("pause", () => {
    if (!showing || paused || document.hidden) return;
    setTimeout(() => {
      if (showing && !paused && bgm.paused && !document.hidden) playMusic();
    }, 400);
  });

  // ---------- 入场 ----------
  function enter(withMusic) {
    gate.classList.add("is-hidden");
    document.body.style.overflow = "";
    setTimeout(() => { gate.style.display = "none"; }, 900);
    if (!withMusic) return;
    if (AUTO_START) startShow();  // 音乐一起，自动全屏放映
    else playMusic();             // 只看相册，音乐照放
  }

  const muted = localStorage.getItem(MUTE_KEY) === "1";
  if (muted) enter(false);
  else document.body.style.overflow = "hidden";

  if (gateBtn) gateBtn.addEventListener("click", (e) => { e.stopPropagation(); enter(true); });
  if (gate) {
    gate.addEventListener("click", (e) => { if (e.target === gate) enter(true); });
    document.addEventListener("keydown", (e) => {
      if (gate.classList.contains("is-hidden")) return;
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); enter(true); }
    });
  }

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      // 切走：暂停，并记住是"被动暂停"，回来要自动续上
      if (showing && !paused) { pauseShow(); autoPaused = true; }
      else if (!bgm.paused) { bgm.pause(); paintBtn(); autoPaused = true; }
    } else {
      // 回来：重新申请屏幕常亮
      lockScreen();
      if (autoPaused) {
        autoPaused = false;
        if (showing && paused) resumeShow();
        else if (!showing && bgm.paused) playMusic();
      }
    }
  });

  paintBtn();
})();
