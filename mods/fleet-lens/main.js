import { h_flex, ScrollHandle, v_flex } from "gpui-base";
import { View } from "gpui-kit";
import {
  appHome,
  checking,
  closeOverlay,
  exec,
  focused,
  nextCommand,
  notify,
  props,
  readTextFile,
  run,
  terminals,
  theme,
  watchFolder,
  window,
} from "herdr";
import { actionFor } from "./keys.js";
import {
  columns,
  filterRows,
  itemIndex,
  liveSessionTerminal,
  needYou,
  primaryUrl,
  rows,
  withSections,
} from "./model.js";
import { goPlan, hostKind, readStream, sessionGroups, wakeCommand } from "./sessions.js";
import { sidebar } from "./sidebar.js";
import {
  FALLBACK_REFRESH_MS,
  listCommand,
  mergeKinds,
  openUrlCommand,
  PLUGINS,
  readKinds,
  readList,
  readPluginKinds,
  storeWatchDir,
  UNWATCHED_REFRESH_MS,
  VERSION,
} from "./source.js";
import {
  detail,
  footer,
  header,
  PREVIEW_MIN_PX,
  previewPane,
  RAIL_WIDTH,
  rail,
  table,
  tableWidth,
  trail,
  why,
  widths,
} from "./view.js";
import { toYaml } from "./yaml.js";

const PAGE = 10;
const WAKE_TIMEOUT_MS = 180000;

const execute = async ({ command, args }) => exec(command, args);

export default class FleetLens extends View {
  init(_props, cx) {
    this.sessionsView = props()?.view === "sessions";
    this.waking = new Set();
    this.collapsed = new Set(["settled"]);
    this.pending = null;
    this.kinds = [{ kind: "Task" }];
    this.kind = "Task";
    this.objects = {};
    this.selected = {};
    this.mode = "list";
    this.cursor = 0;
    this.query = "";
    this.filtering = false;
    this.width = 0;
    this.error = null;
    this.loading = true;
    this.watching = false;
    this.store = null;
    this.version = null;
    this.handle = cx.focus_handle();
    if (!this.sessionsView) this.handle.focus();
    this.rowScroll = ScrollHandle.new();
    this.detailScroll = ScrollHandle.new();
    if (checking()) return;
    if (!this.sessionsView) cx.timer.after(150, () => this.handle.focus());
    this.listenForCommands(cx);
    cx.spawn(async (cx) => {
      this.store = await this.readStore();
      await this.load();
      cx.notify();
      const dir = storeWatchDir(this.store);
      if (dir) this.watchStore(dir, cx);
      cx.timer.every(dir ? FALLBACK_REFRESH_MS : UNWATCHED_REFRESH_MS, (cx) => {
        if (window()?.visible !== false) this.refresh(cx);
      });
    });
  }

  close() {
    this.watch?.cancel();
  }

  async readStore() {
    try {
      const text = await readTextFile(`${appHome()}/mods/fleet-lens/config.json`);
      return JSON.parse(text).store ?? null;
    } catch {
      return null;
    }
  }

  listenForCommands(cx) {
    cx.spawn(async (cx) => {
      for (;;) {
        if ((await nextCommand()) === "focus") this.handle.focus();
        cx.notify();
      }
    });
  }

  watchStore(dir, cx) {
    this.watching = true;
    cx.spawn(async (cx) => {
      for (;;) {
        this.watch = watchFolder(dir);
        try {
          await this.watch;
        } catch (error) {
          this.watching = false;
          this.error = `store watch stopped: ${error.message}`;
          cx.notify();
          return;
        }
        await this.load();
        cx.notify();
      }
    });
  }

  refresh(cx) {
    this.loading = true;
    cx.notify();
    cx.spawn(async (cx) => {
      await this.load();
      cx.notify();
    });
  }

  async load() {
    const errors = [];
    try {
      if (!this.sessionsView) {
        const [core, custom] = await Promise.all([
          execute(VERSION).then(readKinds),
          execute(PLUGINS).then(readPluginKinds),
        ]);
        if (core.ok) this.version = core.version;
        else errors.push(core.error);
        if (!custom.ok) errors.push(`plugins: ${custom.error}`);
        const known = this.kinds.map((k) => k.kind);
        const names = mergeKinds(core.ok ? core.kinds : known, custom.ok ? custom.kinds : []);
        this.kinds = names.map((kind) => ({ kind }));
        if (!this.kinds.some((k) => k.kind === this.kind)) this.showKind("Task");
      }
      const lists = await Promise.all(
        this.kinds.map(async ({ kind }) => [kind, readList(await execute(listCommand(kind)))]),
      );
      for (const [kind, read] of lists) {
        if (read.ok) this.objects[kind] = read.objects;
        else errors.push(`${kind}: ${read.error}`);
      }
    } catch (error) {
      errors.push(`fleet could not run: ${error.message}`);
    }
    this.kinds = this.kinds.map(({ kind }) => ({ kind, count: this.objects[kind]?.length }));
    this.error = errors[0] ?? null;
    this.loading = false;
  }

  snapshot() {
    const all = rows(this.kind, this.objects[this.kind], {
      now: Date.now(),
      terminals: terminals(),
    });
    const list = filterRows(all, this.query);
    const selected = Math.min(this.selected[this.kind] ?? 0, Math.max(0, list.length - 1));
    this.selected[this.kind] = selected;
    return {
      kind: this.kind,
      kinds: this.kinds,
      columns: columns(this.kind),
      rows: list,
      items: withSections(list),
      total: all.length,
      selected,
      cursor: this.cursor,
      query: this.query,
      filtering: this.filtering,
      error: this.error,
      loading: this.loading,
      watching: this.watching,
      version: this.version,
      needYou: needYou(all),
    };
  }

  select(s, index) {
    if (s.rows.length === 0) return;
    const at = Math.min(s.rows.length - 1, Math.max(0, index));
    this.selected[this.kind] = at;
    this.rowScroll.scroll_to_item(Math.max(0, itemIndex(s.items, at)));
  }

  moveCursor(count, to) {
    this.cursor = Math.min(count - 1, Math.max(0, to));
    this.detailScroll.scroll_to_item(this.cursor);
  }

  stepKind(by) {
    const names = this.kinds.map((k) => k.kind);
    const at = names.indexOf(this.kind);
    this.showKind(names[(at + by + names.length) % names.length]);
  }

  showKind(kind) {
    this.kind = kind;
    this.mode = "list";
    this.cursor = 0;
    this.query = "";
    this.filtering = false;
  }

  follow(link) {
    const keepReading = this.mode === "detail";
    this.showKind(link.kind);
    const list = rows(link.kind, this.objects[link.kind], { terminals: terminals() });
    const at = list.findIndex((r) => r.name === link.name);
    if (at >= 0) this.selected[link.kind] = at;
    if (keepReading && at >= 0) this.mode = "detail";
  }

  closeLens() {
    const overlay = props()?.overlay;
    if (overlay) closeOverlay(overlay);
  }

  goToSession(task, cx) {
    if (!task) return;
    const plan = goPlan(task, terminals());
    if (plan.action === "focus") {
      run("agent.focus", { terminal: plan.terminal });
      this.closeLens();
    } else if (plan.action === "wake") {
      this.wake(task, cx);
    }
  }

  wake(task, cx) {
    const { name, uid } = task.metadata;
    if (this.waking.has(uid)) return;
    this.waking.add(uid);
    cx.notify();
    cx.spawn(async (cx) => {
      try {
        const { command, args } = wakeCommand(name);
        const read = readStream(await exec(command, args, { timeout: WAKE_TIMEOUT_MS }));
        if (!read.ok) throw new Error(read.error);
        if (hostKind(task) === "herdr") this.pending = { uid, task };
        notify({ title: `${name} is running again`, level: "success" });
      } catch (error) {
        notify({ title: `Could not wake ${name}`, body: error.message, level: "error" });
      }
      this.waking.delete(uid);
      await this.load();
      cx.notify();
    });
  }

  resolvePending() {
    const pending = this.pending;
    if (!pending) return;
    const terminal = liveSessionTerminal(pending.task, terminals());
    if (!terminal) return;
    this.pending = null;
    run("agent.focus", { terminal });
    this.closeLens();
  }

  openUrl(url) {
    const opener = openUrlCommand(window()?.platform, url);
    if (!opener) return;
    exec(opener.command, opener.args).catch((error) =>
      notify({
        title: "Could not open the link",
        body: `${url}: ${error.message}`,
        level: "error",
      }),
    );
  }

  read(row) {
    if (!row) return;
    this.mode = "detail";
    this.cursor = 0;
    this.detailScroll.scroll_to_item(0);
  }

  editFilter(e, cx) {
    const key = e.keystroke;
    if (key === "escape") {
      this.query = "";
      this.filtering = false;
    } else if (key === "enter" || key === "down" || key === "up") {
      this.filtering = false;
    } else if (key === "backspace") {
      this.query = this.query.slice(0, -1);
    } else if (
      e.key_char &&
      e.key_char.length === 1 &&
      !e.modifiers?.control &&
      !e.modifiers?.platform
    ) {
      this.query += e.key_char;
    } else {
      return;
    }
    this.selected[this.kind] = 0;
    cx.stop_propagation();
    cx.notify();
  }

  act(action, s, cx) {
    const row = s.rows[s.selected];
    const reading = this.mode === "detail";
    const count = reading ? toYaml(row?.object ?? {}).length : 0;
    const move = (to) => (reading ? this.moveCursor(count, to) : this.select(s, to));
    const at = reading ? this.cursor : s.selected;
    const actions = {
      down: () => move(at + 1),
      up: () => move(at - 1),
      pageDown: () => move(at + PAGE),
      pageUp: () => move(at - PAGE),
      first: () => move(0),
      last: () => move(Number.MAX_SAFE_INTEGER),
      nextKind: () => this.stepKind(1),
      prevKind: () => this.stepKind(-1),
      open: () => this.read(row),
      back: () => {
        this.mode = "list";
      },
      close: () => {
        if (this.query) this.query = "";
        else this.closeLens();
      },
      refresh: () => this.refresh(cx),
      session: () => this.goToSession(row?.object, cx),
      wake: () => row && this.wake(row.object, cx),
      openUrl: () => row && this.openUrl(primaryUrl(row)),
      filter: () => {
        this.filtering = true;
      },
    };
    actions[action]?.();
    cx.notify();
  }

  listView(t, s, row, handlers) {
    const w = widths(s.columns, s.rows);
    const room = this.width - RAIL_WIDTH - tableWidth(w);
    const showPreview = s.rows.length > 0 && (this.width === 0 || room >= PREVIEW_MIN_PX);
    const center = v_flex()
      .min_h(0)
      .when(showPreview, (el) => el.w(tableWidth(w)).flex_none())
      .when(!showPreview, (el) => el.flex_1())
      .child(table(t, s, w, handlers))
      .when(!showPreview && Boolean(row?.why), (el) => el.child(why(t, row)))
      .when(s.rows.length > 0, (el) =>
        el.child(
          trail(t, row, (link, cx) => {
            this.follow(link);
            cx.notify();
          }),
        ),
      );
    return h_flex()
      .items_stretch()
      .flex_1()
      .min_h(0)
      .child(center)
      .when(showPreview, (el) => el.child(previewPane(t, s, row, handlers)));
  }

  renderSessions(t) {
    const tasks = this.objects.Task ?? [];
    const space = focused()?.space ?? "";
    const s = {
      groups: sessionGroups(tasks, terminals(), this.waking),
      collapsed: this.collapsed,
      currentSpaces: new Set([space]),
      loading: this.loading && tasks.length === 0,
      error: this.error,
    };
    return sidebar(t, s, {
      onGo: (item, cx) => {
        this.goToSession(item.task, cx);
        cx.notify();
      },
      onToggle: (key, cx) => {
        if (this.collapsed.has(key)) this.collapsed.delete(key);
        else this.collapsed.add(key);
        cx.notify();
      },
      onLens: () => run("mod.open", { name: "fleet-lens" }),
    });
  }

  sessionAction(row) {
    if (row?.object?.kind !== "Task") return null;
    if (this.waking.has(row.object.metadata.uid)) return { label: "Waking…", key: null };
    const action = goPlan(row.object, terminals()).action;
    const labels = {
      focus: "Go to session  s",
      wake: "Wake  w",
    };
    return labels[action] ? { label: labels[action], key: action === "wake" ? "w" : "s" } : null;
  }

  render() {
    const t = theme();
    this.resolvePending();
    if (this.sessionsView) return this.renderSessions(t);
    const s = this.snapshot();
    const row = s.rows[s.selected];
    const reading = this.mode === "detail" && row;
    const onKey = (e, cx) => {
      if (this.filtering) return this.editFilter(e, cx);
      const action = actionFor(reading ? "detail" : "list", e.keystroke);
      if (!action) return;
      cx.stop_propagation();
      this.act(action, s, cx);
    };
    const handlers = {
      scroll: reading ? this.detailScroll : this.rowScroll,
      url: row ? primaryUrl(row) : null,
      onUrl: (url) => this.openUrl(url),
      onRow: (i, e, cx) => {
        const again = i === s.selected || e.click_count > 1;
        this.select(s, i);
        if (again) this.read(s.rows[i]);
        cx.notify();
      },
      onRead: (cx) => {
        this.read(row);
        cx.notify();
      },
      session: this.sessionAction(row),
      onSession: (cx) => {
        this.goToSession(row?.object, cx);
        cx.notify();
      },
    };
    const main = reading
      ? detail(t, s, row, toYaml(row.object), handlers)
      : this.listView(t, s, row, handlers);
    return v_flex()
      .id("fleet-lens")
      .size_full()
      .bg(t.surface)
      .text_color(t.foreground)
      .text_size(13)
      .track_focus(this.handle)
      .on_key_down(onKey)
      .on_mouse_down("left", () => this.handle.focus())
      .on_size_change((size, cx) => {
        if (Math.abs(size.width - this.width) < 1) return;
        this.width = size.width;
        cx.notify();
      })
      .child(
        header(t, s, (_e, cx) => {
          this.filtering = true;
          this.handle.focus();
          cx.notify();
        }),
      )
      .when(Boolean(this.error), (el) =>
        el.child(
          h_flex()
            .px(16)
            .py(6)
            .bg(t.raised)
            .text_color(t.ansi1)
            .child(s.rows.length ? `! ${this.error} (showing the last answer)` : `! ${this.error}`),
        ),
      )
      .child(
        h_flex()
          .items_stretch()
          .flex_1()
          .min_h(0)
          .child(
            rail(t, s, (kind, cx) => {
              this.showKind(kind);
              cx.notify();
            }),
          )
          .child(main),
      )
      .child(
        footer(t, reading ? "detail" : "list", this.store, (key, cx) =>
          onKey({ keystroke: key }, cx),
        ),
      );
  }
}
