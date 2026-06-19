(() => {
  "use strict";

  const MARK_CLASS = "persian-rtl-fix";
  // Arabic, Arabic Supplement, Arabic Extended-A, Arabic Presentation Forms A/B
  const PERSIAN_RE = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/;
  const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "PRE", "CODE", "SVG", "TEXTAREA", "INPUT"]);
  // Real block-level containers — each one becomes a single, self-contained bidi unit.
  const BLOCK_SELECTOR =
    "p, div, li, td, th, h1, h2, h3, h4, h5, h6, blockquote, section, article, " +
    "header, footer, dd, dt, figcaption, summary";
  // Only used when a text node has no block-level ancestor at all (rare).
  const INLINE_FALLBACK_SELECTOR = BLOCK_SELECTOR + ", span, a, button, label";

  let enabled = true;
  const pending = new Set();
  let rafScheduled = false;

  function hasPersian(text) {
    return !!text && PERSIAN_RE.test(text);
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
    if (text && text.length < 40000 && hasPersian(text)) {
      if (el.dir !== "auto") el.dir = "auto";
      el.classList.add(MARK_CLASS);
    }
  }

  function removeFix(el) {
    el.classList.remove(MARK_CLASS);
    if (el.dir === "auto") el.removeAttribute("dir");
  }

  function flush() {
    rafScheduled = false;
    if (!enabled) {
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
    if (!enabled) return;
    const value = "value" in el ? el.value : "";
    if (hasPersian(value)) {
      if (el.dir !== "auto") el.dir = "auto";
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
    if (!enabled) return;
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

  function init() {
    chrome.storage.sync.get({ enabled: true }, (data) => {
      enabled = data.enabled !== false;
      if (enabled) scanInitial(document.body);
      else disableAll();
    });
  }

  chrome.storage.onChanged.addListener((changes) => {
    if (!changes.enabled) return;
    enabled = changes.enabled.newValue !== false;
    if (enabled) scanInitial(document.body);
    else disableAll();
  });

  startObserving();
  if (document.body) init();
  else document.addEventListener("DOMContentLoaded", init, { once: true });
})();
