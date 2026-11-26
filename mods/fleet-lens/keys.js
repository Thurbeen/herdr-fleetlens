const SHARED = {
  j: "down",
  down: "down",
  k: "up",
  up: "up",
  g: "first",
  home: "first",
  "shift-g": "last",
  end: "last",
  pagedown: "pageDown",
  pageup: "pageUp",
  tab: "nextKind",
  "ctrl-l": "nextKind",
  "shift-tab": "prevKind",
  "ctrl-h": "prevKind",
  "shift-r": "refresh",
  s: "session",
  o: "openUrl",
  w: "wake",
};

const MODES = {
  list: { ...SHARED, enter: "open", escape: "close", q: "close", "/": "filter" },
  detail: { ...SHARED, enter: "back", escape: "back", q: "back" },
};

export function actionFor(mode, keystroke) {
  return MODES[mode]?.[keystroke] ?? null;
}

export const HINTS = {
  list: [
    { key: "j", label: "j/k move" },
    { key: "tab", label: "tab kind" },
    { key: "enter", label: "enter read" },
    { key: "/", label: "/ filter" },
    { key: "s", label: "s session" },
    { key: "w", label: "w wake" },
    { key: "o", label: "o open link" },
    { key: "shift-r", label: "R refresh" },
    { key: "escape", label: "esc close" },
  ],
  detail: [
    { key: "j", label: "j/k scroll" },
    { key: "g", label: "g/G top/end" },
    { key: "s", label: "s session" },
    { key: "o", label: "o open link" },
    { key: "escape", label: "esc back" },
  ],
};
