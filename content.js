(() => {
  "use strict";

  const MARK_CLASS = "persian-rtl-fix";
  // Arabic, Arabic Supplement, Arabic Extended-A, Arabic Presentation Forms A/B
  const PERSIAN_COUNT_RE = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/g;
  const LATIN_COUNT_RE = /[A-Za-z]/g;
  const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "PRE", "CODE", "SVG", "TEXTAREA", "INPUT"]);
  // Real block-level containers — each one becomes a single, self-contained bidi unit.
  const BLOCK_SELECTOR =
    "p, div, li, td, th, h1, h2, h3, h4, h5, h6, blockquote, section, article, " +
    "header, footer, dd, dt, figcaption, summary";
  // Only used when a text node has no block-level ancestor at all (rare).
  const INLINE_FALLBACK_SELECTOR = BLOCK_SELECTOR + ", span, a, button, label";
  const CLAUDE_HOST_RE = /(^|\.)claude\.ai$/i;

  let userEnabled = true;
  let scope = "all"; // "all" | "claude-only"
  let active = true;
  const pending = new Set();
  let rafScheduled = false;

  function isClaudeHost() {
    return CLAUDE_HOST_RE.test(location.hostname);
  }

  function computeActive() {
    return userEnabled && (scope === "all" || isClaudeHost());
  }

  // dir="auto" picks direction from the first strong character only, which
  // flips an otherwise-Persian block to LTR whenever it happens to start
  // with a Latin term (a product name, a markdown-bold word, etc). Counting
  // letters and picking the majority script gives a much more stable result
  // for headings/list items that mix the two scripts.
  function dominantDirection(text) {
    const persianCount = (text.match(PERSIAN_COUNT_RE) || []).length;
    if (persianCount === 0) return null;
    const latinCount = (text.match(LATIN_COUNT_RE) || []).length;
    return persianCount >= latinCount ? "rtl" : "ltr";
  }

  function nearestBlock(node) {
    const el = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
    if (!el) return null;
    if (SKIP_TAGS.has(el.tagName)) return null;
    if (el.closest("pre, code, script, style, svg")) return null;
    return el.closest(BLOCK_SELECTOR) || el.closest(INLINE_FALLBACK_SELECTOR);
  }

  function applyFix(el) {
    if (!el || el.tagName === "BODY" || el.tagName === "HTML") return;
    const text = el.textContent;
    if (!text || text.length >= 40000) return;
    const dir = dominantDirection(text);
    if (!dir) return;
    if (el.dir !== dir) el.dir = dir;
    el.classList.add(MARK_CLASS);
  }

  function removeFix(el) {
    el.classList.remove(MARK_CLASS);
    el.removeAttribute("dir");
  }

  function flush() {
    rafScheduled = false;
    if (!active) {
      pending.clear();
      return;
    }
    for (const el of pending) applyFix(el);
    pending.clear();
  }

  function schedule(el) {
    if (!el) return;
    pending.add(el);
    if (!rafScheduled) {
      rafScheduled = true;
      requestAnimationFrame(flush);
    }
  }

  function fixFormField(el) {
    if (!active) return;
    const value = "value" in el ? el.value : "";
    const dir = dominantDirection(value);
    if (dir) {
      if (el.dir !== dir) el.dir = dir;
      el.classList.add(MARK_CLASS);
    } else {
      removeFix(el);
    }
  }

  function scanInitial(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_SKIP;
        const parent = node.parentElement;
        if (!parent || SKIP_TAGS.has(parent.tagName)) return NodeFilter.FILTER_SKIP;
        if (parent.closest("pre, code, script, style, svg")) return NodeFilter.FILTER_SKIP;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    let node;
    while ((node = walker.nextNode())) {
      const block = nearestBlock(node);
      if (block) schedule(block);
    }
    root.querySelectorAll("input, textarea").forEach(fixFormField);
  }

  const observer = new MutationObserver((mutations) => {
    if (!active) return;
    for (const m of mutations) {
      if (m.type === "characterData") {
        const block = nearestBlock(m.target);
        if (block) schedule(block);
      } else if (m.type === "childList") {
        m.addedNodes.forEach((n) => {
          if (n.nodeType === Node.TEXT_NODE) {
            const block = nearestBlock(n);
            if (block) schedule(block);
          } else if (n.nodeType === Node.ELEMENT_NODE) {
            scanInitial(n);
          }
        });
      }
    }
  });

  function startObserving() {
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    document.addEventListener(
      "input",
      (e) => {
        const t = e.target;
        if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) fixFormField(t);
      },
      true
    );
  }

  function disableAll() {
    document.querySelectorAll("." + MARK_CLASS).forEach(removeFix);
  }

  function applySettings() {
    const wasActive = active;
    active = computeActive();
    if (active) scanInitial(document.body);
    else if (wasActive) disableAll();
  }

  function init() {
    chrome.storage.local.get({ enabled: true, scope: "all" }, (data) => {
      userEnabled = data.enabled !== false;
      scope = data.scope === "claude-only" ? "claude-only" : "all";
      applySettings();
    });
  }

  chrome.storage.onChanged.addListener((changes) => {
    if (!changes.enabled && !changes.scope) return;
    if (changes.enabled) userEnabled = changes.enabled.newValue !== false;
    if (changes.scope) scope = changes.scope.newValue === "claude-only" ? "claude-only" : "all";
    applySettings();
  });

  startObserving();
  if (document.body) init();
  else document.addEventListener("DOMContentLoaded", init, { once: true });
})();
