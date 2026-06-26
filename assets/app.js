"use strict";

// ---------- Theme ----------
(function initTheme() {
  var saved = localStorage.getItem("theme") || "sepia";
  document.documentElement.setAttribute("data-theme", saved);
  document.addEventListener("DOMContentLoaded", function () {
    var sel = document.getElementById("theme-select");
    if (!sel) return;
    sel.value = saved;
    sel.addEventListener("change", function () {
      document.documentElement.setAttribute("data-theme", sel.value);
      localStorage.setItem("theme", sel.value);
    });
  });
})();

function app() { return document.getElementById("app"); }
var MANIFEST = null, VOCAB_WORDS = null;

function loadManifest() {
  if (MANIFEST) return Promise.resolve(MANIFEST);
  return fetch("data/manifest.json").then(function (r) { return r.json(); }).then(function (m) { MANIFEST = m; return m; });
}

// load vocab headwords once, for cross-referencing in the chrono view
function loadVocabWords() {
  if (VOCAB_WORDS) return Promise.resolve(VOCAB_WORDS);
  return loadManifest().then(function (m) {
    return Promise.all((m.vocab || []).map(function (v) {
      return fetch("data/vocab/" + v.slug + ".json").then(function (r) { return r.json(); })
        .then(function (d) { return { slug: v.slug, rows: d.rows, columns: d.columns }; }).catch(function () { return null; });
    }));
  }).then(function (sets) {
    var words = [];
    sets.filter(Boolean).forEach(function (s) {
      // headword column: "Nomen" if present, else first column
      var hi = s.columns.indexOf("Nomen"); if (hi < 0) hi = s.columns.indexOf("Infinitiv"); if (hi < 0) hi = s.columns.indexOf("Adjektiv"); if (hi < 0) hi = 0;
      s.rows.forEach(function (row) { var w = (row[hi] || "").trim(); if (w.length >= 4) words.push({ w: w, slug: s.slug }); });
    });
    words.sort(function (a, b) { return b.w.length - a.w.length; }); // longest first for matching
    VOCAB_WORDS = words; return words;
  });
}

function setActiveNav(name) {
  document.querySelectorAll(".site-nav a").forEach(function (a) {
    a.classList.toggle("active", a.getAttribute("data-nav") === name);
  });
}

function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]; }); }
function norm(s) { return String(s == null ? "" : s).trim().toLowerCase().replace(/\s+/g, " "); }
function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

// ---------- Home ----------
function viewHome() {
  setActiveNav(null);
  app().innerHTML =
    '<h1 class="page-title">Willkommen 👋</h1>' +
    '<p class="page-lead">Dein Deutschkurs A2/B1 — das Buch, der Kursverlauf, Grammatiknotizen und Wortschatz.</p>' +
    '<div class="card-grid">' +
    '<a class="tile" href="#/buch"><div class="tile-icon">📖</div><div class="tile-title">Buch</div><div class="tile-meta">Lektionstexte + Übungen, L19–L30</div></a>' +
    '<a class="tile" href="#/chronologisch"><div class="tile-icon">🗓️</div><div class="tile-title">Chronologisch</div><div class="tile-meta">Der Kurs nach Datum (Mitschriften)</div></a>' +
    '<a class="tile" href="#/notizen"><div class="tile-icon">📒</div><div class="tile-title">Notizen</div><div class="tile-meta">Grammatik-Themenseiten</div></a>' +
    '<a class="tile" href="#/vocab"><div class="tile-icon">🔤</div><div class="tile-title">Vocab</div><div class="tile-meta">Verben · Nomen · Adjektive</div></a>' +
    '</div>';
}

// ---------- Buch ----------
function viewBuch() {
  setActiveNav("buch");
  loadManifest().then(function (m) {
    var cards = (m.lessons || []).map(function (l) {
      return '<a class="tile" href="#/lektion/' + encodeURIComponent(l.id) + '">' +
        '<div class="tile-cat">' + esc(l.id) + '</div>' +
        '<div class="tile-title">' + esc(l.title) + '</div>' +
        '<div class="tile-meta">' + esc(l.kursbuch || "") + (l.items ? " · " + l.items + " Übungen" : "") + '</div>' +
        '</a>';
    }).join("");
    app().innerHTML = '<h1 class="page-title">Das Buch</h1>' +
      '<p class="page-lead">Jede Lektion: erst der Kursbuchtext, dann die Übungen dazu.</p>' +
      '<div class="card-grid">' + cards + '</div>';
  });
}

// turn the raw transcription markdown into nicer prose:
//  - drop the leading HTML comment
//  - convert "## PDF page N (Kursbuch S. X)" into a page divider
function formatBookMd(md) {
  return md
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/^##\s*PDF page\s*\d+\s*\(Kursbuch\s*(S\.?\s*\d+)\)\s*$/gim, "\n---\n\n### 📄 Kursbuch $1\n");
}

function viewLektion(id) {
  setActiveNav("buch");
  app().innerHTML = '<p>Lädt…</p>';
  // prefer the structured "proper book" JSON; fall back to raw md + exercise json
  fetch("data/book/" + id + ".json").then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; })
    .then(function (book) {
      if (book && book.blocks) { renderBookBlocks(book); return; }
      return viewLektionFallback(id);
    });
}

function renderBookBlocks(book) {
  var html = '<a class="back-link" href="#/buch">← Alle Lektionen</a>' +
    '<h1 class="page-title">' + esc(book.id) + " · " + esc(book.title) + '</h1>' +
    '<p class="page-lead">' + esc(book.kursbuch || "") + (book.theme ? '<br>' + esc(book.theme) : "") + '</p>' +
    '<div class="ex-toolbar"><button class="btn primary" data-act-all="check">Alle prüfen</button><button class="btn" data-act-all="reveal">Alle Lösungen</button><button class="btn" data-act-all="clear">Zurücksetzen</button></div>' +
    '<div class="book-page">';
  (book.blocks || []).forEach(function (b) {
    if (b.t === "h") html += '<h2 class="book-h">' + esc(b.text) + '</h2>';
    else if (b.t === "text") html += '<div class="prose book-prose">' + marked.parse(b.md || "") + '</div>';
    else if (b.t === "note") html += '<div class="callout"><div class="callout-label">' + esc(b.label || "Info") + '</div><div class="prose">' + marked.parse(b.md || "") + '</div></div>';
    else if (b.t === "task") html += '<div class="task"><div class="task-label">' + esc(b.label || "Aufgabe") + '</div>' + (b.instruction ? '<p class="task-instr">' + esc(b.instruction) + '</p>' : "") + (b.md ? '<div class="prose">' + marked.parse(b.md) + '</div>' : "") + '</div>';
    else if (b.t === "ex" || b.t === "match" || b.t === "transform") html += renderExerciseBlocks([b]);
  });
  html += '</div>';
  app().innerHTML = html;
  wireExercises(app());
}

function viewLektionFallback(id) {
  return Promise.all([
    fetch("data/book/" + id + ".md").then(function (r) { return r.ok ? r.text() : null; }).catch(function () { return null; }),
    fetch("data/exercises/" + id + ".json").then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; })
  ]).then(function (res) {
    var md = res[0], ex = res[1];
    if (md == null && ex == null) {
      app().innerHTML = '<a class="back-link" href="#/buch">← Alle Lektionen</a><p class="muted-note">Diese Lektion ist noch nicht verfügbar.</p>';
      return;
    }
    var title = (ex && ex.title) || id;
    var kb = (ex && ex.kursbuch) || "";
    var html = '<a class="back-link" href="#/buch">← Alle Lektionen</a>' +
      '<h1 class="page-title">' + esc(id) + " · " + esc(title) + '</h1>' +
      (kb ? '<p class="page-lead">' + esc(kb) + '</p>' : "");
    if (md != null) html += '<div class="prose book-prose">' + marked.parse(formatBookMd(md)) + '</div>';
    if (ex) html += '<h2 class="lektion-uebungen" id="lek-ueb">Übungen</h2>' + exercisesToHTML(ex);
    app().innerHTML = html;
    if (ex) wireExercises(app());
  });
}

// ---------- Übungen (quick-drill, exercises only) ----------
function viewUebungen() {
  setActiveNav("uebungen");
  loadManifest().then(function (m) {
    var cards = (m.lessons || []).map(function (l) {
      return '<a class="tile" href="#/uebung/' + encodeURIComponent(l.id) + '">' +
        '<div class="tile-cat">' + esc(l.id) + '</div>' +
        '<div class="tile-title">' + esc(l.title) + '</div>' +
        '<div class="tile-meta">' + (l.items ? l.items + " Übungen" : "") + '</div></a>';
    }).join("");
    app().innerHTML = '<h1 class="page-title">Übungen</h1>' +
      '<p class="page-lead">Nur die Lückentexte — schnelles Drillen, pro Lektion.</p>' +
      '<div class="card-grid">' + cards + '</div>';
  });
}

function viewUebung(id) {
  setActiveNav("uebungen");
  app().innerHTML = '<p>Lädt…</p>';
  fetch("data/exercises/" + id + ".json").then(function (r) { if (!r.ok) throw new Error("404"); return r.json(); })
    .then(function (ex) {
      app().innerHTML = '<a class="back-link" href="#/uebungen">← Alle Übungen</a>' +
        '<h1 class="page-title">' + esc(ex.title) + '</h1>' +
        '<p class="page-lead">' + esc(ex.id) + (ex.kursbuch ? " · " + esc(ex.kursbuch) : "") + '</p>' +
        exercisesToHTML(ex);
      wireExercises(app());
    }).catch(function () {
      app().innerHTML = '<a class="back-link" href="#/uebungen">← Alle Übungen</a><p class="muted-note">Diese Übung wird gerade erstellt.</p>';
    });
}

// ---------- Chronologisch ----------
function viewChrono() {
  setActiveNav("chrono");
  app().innerHTML = '<p>Lädt…</p>';
  Promise.all([
    fetch("data/chrono.json").then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }),
    loadVocabWords().catch(function () { return []; })
  ]).then(function (res) {
    var data = res[0];
    if (!data || !data.lectures || !data.lectures.length) {
      app().innerHTML = '<h1 class="page-title">Chronologisch</h1><p class="muted-note">Der Kursverlauf wird gerade aufgebaut.</p>';
      return;
    }
    var navLinks = data.lectures.map(function (l) {
      return '<a href="#/chronologisch" data-jump="lec-' + l.id + '"><span class="cn-date">' + esc(l.date) + '</span><span class="cn-nr">Sitzung ' + l.nr + '</span></a>';
    }).join("");

    var sections = data.lectures.map(function (l) {
      var s = '<section class="lecture" id="lec-' + esc(l.id) + '">';
      s += '<h2 class="lecture-head"><span class="lecture-date">' + esc(l.date) + '</span> Sitzung ' + l.nr + (l.title ? ' · ' + esc(l.title) : "") + '</h2>';
      // related book pages + vocab chips
      var refs = "";
      (l.kbLessons || []).forEach(function (lid) {
        refs += '<a class="chip chip-book" href="#/lektion/' + encodeURIComponent(lid) + '">' + esc(lid) + '</a>';
      });
      if (l.contentMd) {
        vocabChipsFor(l.contentMd).forEach(function (c) {
          refs += '<a class="chip chip-vocab" href="#/vocab/' + c.slug + '/' + encodeURIComponent(c.w) + '">' + esc(c.w) + '</a>';
        });
      }
      if (refs) s += '<div class="chip-row">' + refs + '</div>';
      if (l.contentMd) s += '<div class="prose">' + marked.parse(l.contentMd) + '</div>';
      if (l.exercises && l.exercises.length) {
        s += '<h3 class="lecture-ueb">Übungen aus dem Material</h3>' + renderExerciseBlocks(l.exercises);
      }
      s += '</section>';
      return s;
    }).join("");

    app().innerHTML = '<h1 class="page-title">Chronologisch</h1>' +
      '<p class="page-lead">Der ganze Kurs nach Datum — Mitschriften, mit Übungen aus den Handouts und Links zu Buch &amp; Wortschatz.</p>' +
      '<div class="chrono-layout"><nav class="chrono-nav">' + navLinks + '</nav><div class="chrono-main">' + sections + '</div></div>';

    wireExercises(app());
    app().querySelectorAll(".chrono-nav a").forEach(function (a) {
      a.addEventListener("click", function (e) {
        e.preventDefault();
        var el = document.getElementById(a.getAttribute("data-jump"));
        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
        app().querySelectorAll(".chrono-nav a").forEach(function (x) { x.classList.remove("active"); });
        a.classList.add("active");
      });
    });
  });
}

function vocabChipsFor(text) {
  if (!VOCAB_WORDS) return [];
  var found = [], seen = {};
  for (var i = 0; i < VOCAB_WORDS.length && found.length < 8; i++) {
    var e = VOCAB_WORDS[i];
    var key = e.w.toLowerCase();
    if (seen[key]) continue;
    var re = new RegExp("(^|[^A-Za-zÄÖÜäöüß])" + escapeRe(e.w) + "([^A-Za-zÄÖÜäöüß]|$)");
    if (re.test(text)) { found.push(e); seen[key] = 1; }
  }
  return found;
}

// ---------- Notizen ----------
function viewNotizen() {
  setActiveNav("notizen");
  loadManifest().then(function (m) {
    var cards = (m.notes || []).map(function (n) {
      return '<a class="tile" href="#/note/' + encodeURIComponent(n.slug) + '">' +
        '<div class="tile-cat">' + esc(n.category || "") + '</div>' +
        '<div class="tile-title">' + esc(n.icon ? n.icon + " " : "") + esc(n.title) + '</div>' +
        '</a>';
    }).join("");
    app().innerHTML = '<h1 class="page-title">Notizen</h1>' +
      '<p class="page-lead">Grammatik-Themenseiten aus deinem Notion-Hub.</p>' +
      '<div class="card-grid">' + (cards || '<p class="muted-note">Noch keine Notizen.</p>') + '</div>';
  });
}

function viewNote(slug) {
  setActiveNav("notizen");
  app().innerHTML = '<p>Lädt…</p>';
  fetch("data/notes/" + slug + ".md").then(function (r) {
    if (!r.ok) throw new Error("not found");
    return r.text();
  }).then(function (md) {
    app().innerHTML = '<a class="back-link" href="#/notizen">← Alle Notizen</a><div class="prose">' + marked.parse(md) + '</div>';
  }).catch(function () {
    app().innerHTML = '<a class="back-link" href="#/notizen">← Alle Notizen</a><p class="muted-note">Diese Notiz wird gerade übertragen.</p>';
  });
}

// ---------- Vocab ----------
function viewVocabIndex() {
  setActiveNav("vocab");
  loadManifest().then(function (m) {
    var cards = (m.vocab || []).map(function (v) {
      return '<a class="tile" href="#/vocab/' + encodeURIComponent(v.slug) + '">' +
        '<div class="tile-icon">' + esc(v.icon || "🔤") + '</div>' +
        '<div class="tile-title">' + esc(v.title) + '</div>' +
        '<div class="tile-meta">' + (v.count ? v.count + " Einträge" : "Datenbank") + '</div>' +
        '</a>';
    }).join("");
    app().innerHTML = '<h1 class="page-title">Wortschatz</h1>' +
      '<p class="page-lead">Deine Vokabel-Datenbanken — tippe auf einer Liste zum Filtern.</p>' +
      '<div class="card-grid">' + (cards || '<p class="muted-note">Kein Wortschatz.</p>') + '</div>';
  });
}

function viewVocab(slug, q) {
  setActiveNav("vocab");
  app().innerHTML = '<p>Lädt…</p>';
  fetch("data/vocab/" + slug + ".json").then(function (r) {
    if (!r.ok) throw new Error("not found");
    return r.json();
  }).then(function (v) { renderVocab(v, q); }).catch(function () {
    app().innerHTML = '<a class="back-link" href="#/vocab">← Wortschatz</a><p class="muted-note">Diese Liste wird gerade übertragen.</p>';
  });
}

function renderVocab(v, q) {
  var head = '<a class="back-link" href="#/vocab">← Wortschatz</a>' +
    '<h1 class="page-title">' + esc(v.icon ? v.icon + " " : "") + esc(v.title) + '</h1>' +
    '<p class="page-lead">' + (v.rows ? v.rows.length : 0) + ' Einträge · tippe zum Filtern.</p>' +
    '<input class="gap" id="vocab-filter" style="width:100%;max-width:360px;margin-bottom:16px;" placeholder="filtern…" autocomplete="off">';
  var thead = '<tr>' + (v.columns || []).map(function (c) { return '<th>' + esc(c) + '</th>'; }).join("") + '</tr>';
  function bodyRows(rows) {
    return rows.map(function (row) {
      return '<tr>' + row.map(function (cell) { return '<td>' + esc(cell) + '</td>'; }).join("") + '</tr>';
    }).join("");
  }
  app().innerHTML = head + '<div class="prose"><table><thead>' + thead + '</thead><tbody id="vocab-body">' + bodyRows(v.rows || []) + '</tbody></table></div>';
  var input = document.getElementById("vocab-filter");
  var body = document.getElementById("vocab-body");
  function apply() {
    var query = norm(input.value);
    var filtered = (v.rows || []).filter(function (row) {
      return !query || row.some(function (cell) { return norm(cell).indexOf(query) !== -1; });
    });
    body.innerHTML = filtered.length ? bodyRows(filtered)
      : '<tr><td class="vocab-empty" colspan="' + (v.columns || []).length + '">Keine Treffer für „' + esc(input.value.trim()) + '".</td></tr>';
  }
  input.addEventListener("input", apply);
  if (q) { input.value = q; apply(); }
}

// worked-example box (Beispiel), markdown-rendered
function exampleBox(md) {
  return '<div class="ex-example"><span class="ex-example-label">Beispiel</span><div class="prose">' + marked.parse(String(md)) + '</div></div>';
}

// word bank (Wortkasten): the words a learner should use to fill the gaps
function wordBank(words) {
  return '<div class="word-bank"><span class="word-bank-label">Wähle aus</span>' +
    words.map(function (w) { return '<span class="wb-word">' + esc(w) + '</span>'; }).join("") + '</div>';
}

// render a list of exercise blocks ({t:"ex"|"match"|"transform"}); also tolerates
// a legacy section ({heading, items:[{prompt,answer}]}) by treating it as a fill block
function renderExerciseBlocks(blocks) {
  return (blocks || []).map(function (b) {
    if (b.t === "match") return matchToHTML(b);
    if (b.t === "transform") return transformToHTML(b);
    var items = (b.items || []).map(function (i) {
      return { prompt: (i.q != null ? i.q : i.prompt), answer: (i.a != null ? i.a : i.answer), hint: i.hint };
    });
    var sec = { sections: [{ heading: b.heading || "", instruction: b.instruction, example: b.example, bank: b.bank, items: items }] };
    return '<div class="ex-block">' + exercisesToHTML(sec, { toolbar: false }) + '</div>';
  }).join("");
}

// ---------- Matching / ordering ----------
function matchToHTML(b) {
  var opts = (b.options || []).map(function (o) { return '<option value="' + esc(o) + '">' + esc(o) + '</option>'; }).join("");
  var rows = (b.rows || []).map(function (r) {
    return '<div class="match-row" data-answer="' + esc(r.answer) + '">' +
      '<select class="match-sel"><option value="">–</option>' + opts + '</select>' +
      '<span class="match-text">' + esc(r.text) + '</span>' +
      '<span class="feedback"></span></div>';
  }).join("");
  return '<div class="match-block">' + (b.instruction ? '<p class="ex-instr">' + esc(b.instruction) + '</p>' : "") +
    (b.example ? exampleBox(b.example) : "") + rows +
    '<div class="ex-actions"><button class="btn" data-act="check">Prüfen</button>' +
    '<button class="btn" data-act="reveal">Lösung</button></div></div>';
}

// ---------- Transformation (free response + reveal model answer) ----------
function transformToHTML(b) {
  var items = (b.items || []).map(function (i) {
    return '<div class="transform-item">' +
      '<p class="ex-prompt">' + esc(i.prompt) + '</p>' +
      '<textarea class="transform-input" rows="1" placeholder="Schreib deine Lösung …"></textarea>' +
      '<div class="ex-actions"><button class="btn" data-act="reveal">Lösung zeigen</button></div>' +
      '<div class="transform-sol" hidden>' + marked.parse(String(i.solution || "")) + '</div></div>';
  }).join("");
  return '<div class="transform-block">' + (b.instruction ? '<p class="ex-instr">' + esc(b.instruction) + '</p>' : "") +
    (b.example ? exampleBox(b.example) : "") + items + '</div>';
}

// ---------- Exercise engine (shared) ----------
function exercisesToHTML(ex, opts) {
  opts = opts || {};
  var html = opts.toolbar === false ? "" :
    '<div class="ex-toolbar"><button class="btn primary" data-act-all="check">Alle prüfen</button><button class="btn" data-act-all="reveal">Alle Lösungen</button><button class="btn" data-act-all="clear">Zurücksetzen</button></div>';
  var idx = 0;
  (ex.sections || []).forEach(function (sec) {
    html += '<div class="ex-section">' + (sec.heading ? '<h2>' + esc(sec.heading) + '</h2>' : "");
    if (sec.instruction) html += '<p class="ex-instr">' + esc(sec.instruction) + '</p>';
    if (sec.example) html += exampleBox(sec.example);
    if (sec.bank && sec.bank.length) html += wordBank(sec.bank);
    (sec.items || []).forEach(function (it) {
      var answers = Array.isArray(it.answer) ? it.answer : [it.answer];
      var ai = 0;
      var prompt = esc(it.prompt).replace(/_{2,}/g, function () {
        var a = answers[ai] || ""; ai++;
        return '<input class="gap" data-answer="' + esc(a) + '" autocomplete="off" autocapitalize="off" spellcheck="false">';
      });
      html += '<div class="ex-item">' +
        '<p class="ex-prompt">' + prompt + '</p>' +
        (it.hint ? '<p class="ex-hint">💡 ' + esc(it.hint) + '</p>' : "") +
        '<div class="ex-actions"><button class="btn" data-act="check">Prüfen</button>' +
        '<button class="btn" data-act="reveal">Lösung</button><span class="feedback"></span></div></div>';
      idx++;
    });
    html += '</div>';
  });
  return html;
}

function checkGap(input) {
  var acceptable = String(input.getAttribute("data-answer")).split("|").map(norm);
  var ok = acceptable.indexOf(norm(input.value)) !== -1;
  input.classList.toggle("correct", ok);
  input.classList.toggle("wrong", !ok);
  return ok;
}
function revealGap(input) {
  input.value = String(input.getAttribute("data-answer")).split("|")[0];
  input.classList.add("correct"); input.classList.remove("wrong");
}

function wireExercises(root) {
  root.querySelectorAll(".ex-item").forEach(function (item) {
    var gaps = item.querySelectorAll(".gap");
    var fb = item.querySelector(".feedback");
    item.querySelectorAll("[data-act]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        if (btn.getAttribute("data-act") === "reveal") {
          gaps.forEach(revealGap); fb.textContent = ""; fb.className = "feedback";
        } else {
          var all = true; gaps.forEach(function (g) { if (!checkGap(g)) all = false; });
          fb.textContent = all ? "✓ Richtig" : "✗ Noch nicht";
          fb.className = "feedback " + (all ? "ok" : "no");
        }
      });
    });
    gaps.forEach(function (g) { g.addEventListener("keydown", function (e) { if (e.key === "Enter") checkGap(g); }); });
  });

  // matching / ordering blocks
  root.querySelectorAll(".match-block").forEach(function (block) {
    var rows = block.querySelectorAll(".match-row");
    block.querySelectorAll("[data-act]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var reveal = btn.getAttribute("data-act") === "reveal";
        rows.forEach(function (row) {
          var sel = row.querySelector(".match-sel"), ans = row.getAttribute("data-answer"), fb = row.querySelector(".feedback");
          if (reveal) { sel.value = ans; sel.classList.add("correct"); sel.classList.remove("wrong"); fb.textContent = ""; }
          else {
            var ok = norm(sel.value) === norm(ans);
            sel.classList.toggle("correct", ok); sel.classList.toggle("wrong", !ok);
            fb.textContent = ok ? "✓" : "✗"; fb.className = "feedback " + (ok ? "ok" : "no");
          }
        });
      });
    });
  });

  // transformation blocks (free response + reveal model answer)
  root.querySelectorAll(".transform-item").forEach(function (item) {
    var ta = item.querySelector(".transform-input");
    if (ta) ta.addEventListener("input", function () { ta.style.height = "auto"; ta.style.height = ta.scrollHeight + "px"; });
    item.querySelectorAll("[data-act=reveal]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var sol = item.querySelector(".transform-sol");
        sol.hidden = !sol.hidden;
        btn.textContent = sol.hidden ? "Lösung zeigen" : "Lösung verbergen";
      });
    });
  });

  // global toolbar: click every per-unit check / reveal button in scope
  root.querySelectorAll("[data-act-all=check]").forEach(function (ca) {
    ca.addEventListener("click", function () {
      (ca.closest("section") || root).querySelectorAll("[data-act=check]").forEach(function (b) { b.click(); });
    });
  });
  root.querySelectorAll("[data-act-all=reveal]").forEach(function (ra) {
    ra.addEventListener("click", function () {
      (ra.closest("section") || root).querySelectorAll(".transform-sol[hidden]").forEach(function (s) { s.hidden = false; });
      (ra.closest("section") || root).querySelectorAll(".ex-item [data-act=reveal], .match-block [data-act=reveal]").forEach(function (b) { b.click(); });
    });
  });
  root.querySelectorAll("[data-act-all=clear]").forEach(function (cl) {
    cl.addEventListener("click", function () {
      var scope = cl.closest("section") || root;
      scope.querySelectorAll(".gap").forEach(function (g) { g.value = ""; g.classList.remove("correct", "wrong"); });
      scope.querySelectorAll(".match-sel").forEach(function (s) { s.value = ""; s.classList.remove("correct", "wrong"); });
      scope.querySelectorAll(".transform-input").forEach(function (t) { t.value = ""; t.style.height = "auto"; });
      scope.querySelectorAll(".transform-sol").forEach(function (s) { s.hidden = true; });
      scope.querySelectorAll(".transform-item [data-act=reveal]").forEach(function (b) { b.textContent = "Lösung zeigen"; });
      scope.querySelectorAll(".feedback").forEach(function (fb) { fb.textContent = ""; fb.className = "feedback"; });
    });
  });
}

// ---------- Router ----------
function route() {
  var h = location.hash.replace(/^#/, "") || "/";
  var parts = h.split("/").filter(Boolean);
  window.scrollTo(0, 0);
  document.body.setAttribute("data-view", parts[0] || "home");
  var SECT = { buch: "Buch", lektion: "Lektion", chronologisch: "Chronologisch", uebungen: "Übungen", uebung: "Übung", notizen: "Notizen", note: "Notiz", vocab: "Wortschatz" };
  var pt = SECT[parts[0]] || "";
  if (pt && parts[1]) pt += " " + decodeURIComponent(parts[1]);
  document.title = (pt ? pt + " · " : "") + "Deutsch lernen A2/B1";
  if (parts.length === 0) return viewHome();
  switch (parts[0]) {
    case "buch": return viewBuch();
    case "lektion": return viewLektion(decodeURIComponent(parts[1] || ""));
    case "chronologisch": return viewChrono();
    case "uebungen": return viewUebungen();
    case "uebung": return viewUebung(decodeURIComponent(parts[1] || ""));
    case "notizen": return viewNotizen();
    case "note": return viewNote(decodeURIComponent(parts[1] || ""));
    case "vocab": return parts[1] ? viewVocab(decodeURIComponent(parts[1]), parts[2] ? decodeURIComponent(parts[2]) : "") : viewVocabIndex();
    default: return viewHome();
  }
}

window.addEventListener("hashchange", route);
window.addEventListener("DOMContentLoaded", route);
