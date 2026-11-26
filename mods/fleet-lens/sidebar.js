import { h_flex, v_flex } from "gpui-base";
import { div, image } from "gpui-kit";
import { GROUP_TITLES } from "./sessions.js";
import { tint } from "./view.js";

const SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const EMBLEM = "mods/fleet-lens/thurbeen-emblem.png";
const EMBLEM_RATIO = 1144 / 280;

function stateColor(t, state) {
  const colors = {
    working: t.working,
    blocked: t.blocked,
    done: t.done,
    idle: t.idle,
    paused: t.dim,
    waking: t.accent,
    stopped: t.dim,
  };
  return colors[state] ?? t.unknown ?? t.dim;
}

function stateMark(t, state) {
  const color = stateColor(t, state);
  if (state === "waking") return div().w(10).text_size(11).text_color(color).frames(SPINNER, 90);
  if (state === "paused") {
    const bar = () => div().w(2).h(8).rounded(1).bg(color);
    return h_flex().w(10).gap(2).child(bar()).child(bar());
  }
  const d = div().size(7).rounded(4).bg(color);
  return div()
    .w(10)
    .flex()
    .items_center()
    .child(state === "working" ? d.loop("opacity", { from: 0.25, to: 1, period: 1100 }) : d);
}

const outcomeColor = (t, outcome) =>
  ({ shipped: t.ansi2, stuck: t.ansi3, failed: t.ansi1 })[outcome] ?? t.muted;

const badge = (text, fg, bg) =>
  div().px(5).rounded(4).text_size(10.5).text_color(fg).bg(bg).flex_none().child(text);

function itemRow(t, item, s, handlers) {
  const current = Boolean(item.space) && s.currentSpaces.has(item.space);
  const markerColor = item.marker === "!" ? t.ansi1 : t.ansi3;
  const action = item.plan.action;
  return h_flex()
    .id(`ses-${item.uid}`)
    .mx(6)
    .px(8)
    .py(5)
    .gap(8)
    .rounded(6)
    .items_center()
    .when(current, (el) => el.bg(t.selected))
    .when(action !== "none", (el) =>
      el
        .cursor_pointer()
        .hover((st) => st.bg(t.hover))
        .on_click((_e, cx) => handlers.onGo(item, cx)),
    )
    .child(stateMark(t, item.state))
    .child(
      div()
        .flex_1()
        .min_w(0)
        .truncate()
        .text_size(12.5)
        .text_color(item.state === "paused" || item.state === "stopped" ? t.muted : t.foreground)
        .child(item.name),
    )
    .when(Boolean(item.marker), (el) =>
      el.child(badge(item.marker, markerColor, tint(markerColor, "22"))),
    )
    .when(Boolean(item.outcome) && item.group === "paused", (el) =>
      el.child(badge(item.outcome, outcomeColor(t, item.outcome), t.raised)),
    )
    .when(item.kind === "mux", (el) => el.child(badge("mux", t.dim, t.raised)))
    .when(action === "wake" && item.state !== "waking", (el) =>
      el.child(
        div()
          .id(`ses-wake-${item.uid}`)
          .px(6)
          .rounded(4)
          .text_size(11)
          .flex_none()
          .text_color(t.accent)
          .bg(t.raised)
          .hover((st) => st.bg(t.hover))
          .on_click((_e, cx) => {
            cx.stop_propagation();
            handlers.onGo(item, cx);
          })
          .child("Wake"),
      ),
    );
}

function groupHeader(t, group, collapsed, onToggle) {
  const color = { needs: t.blocked, live: t.accent, paused: t.muted, settled: t.dim }[group.key];
  return h_flex()
    .id(`ses-group-${group.key}`)
    .px(14)
    .pt(10)
    .pb(3)
    .gap(6)
    .items_center()
    .cursor_pointer()
    .text_size(10.5)
    .on_click((_e, cx) => onToggle(group.key, cx))
    .child(
      div()
        .w(8)
        .text_color(t.dim)
        .child(collapsed ? "▸" : "▾"),
    )
    .child(div().font_semibold().text_color(color).child(GROUP_TITLES[group.key].toUpperCase()))
    .child(div().text_color(t.dim).child(String(group.items.length)));
}

export function sidebar(t, s, handlers) {
  const total = s.groups.reduce((n, g) => n + g.items.length, 0);
  return v_flex()
    .id("fleet-sessions")
    .size_full()
    .min_h(0)
    .bg(t.chrome)
    .child(
      h_flex()
        .px(14)
        .pt(10)
        .pb(6)
        .gap(8)
        .items_center()
        .border_t(1)
        .border_color(t.border)
        .child(
          image(EMBLEM)
            .h(20)
            .w(20 * EMBLEM_RATIO)
            .flex_none(),
        )
        .child(div().flex_1())
        .child(
          div()
            .id("ses-lens")
            .px(7)
            .py(2)
            .rounded(5)
            .cursor_pointer()
            .text_size(11)
            .text_color(t.muted)
            .hover((st) => st.bg(t.hover).text_color(t.foreground))
            .on_click((_e, cx) => handlers.onLens(cx))
            .child("Lens ◈"),
        ),
    )
    .child(
      h_flex()
        .px(14)
        .gap(6)
        .items_center()
        .text_size(10.5)
        .text_color(t.dim)
        .child(div().font_semibold().child("FLEET SESSIONS"))
        .child(div().child(String(total)))
        .when(s.loading, (el) => el.child(div().text_color(t.accent).frames(SPINNER, 90)))
        .when(Boolean(s.error), (el) => el.child(div().text_color(t.ansi1).child("◌ stale"))),
    )
    .child(
      v_flex()
        .id("ses-list")
        .flex_1()
        .min_h(0)
        .pb(8)
        .overflow_y_scrollbar()
        .when(total === 0 && !s.loading, (el) =>
          el.child(div().px(14).py(10).text_size(12).text_color(t.dim).child("No Fleet sessions")),
        )
        .children(
          s.groups.flatMap((group) => {
            const collapsed = s.collapsed.has(group.key);
            return [
              groupHeader(t, group, collapsed, handlers.onToggle),
              ...(collapsed ? [] : group.items.map((item) => itemRow(t, item, s, handlers))),
            ];
          }),
        ),
    );
}
