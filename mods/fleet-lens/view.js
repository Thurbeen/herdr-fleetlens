import { h_flex, v_flex } from "gpui-base";
import { div, image } from "gpui-kit";
import { settings } from "herdr";
import { HINTS } from "./keys.js";
import { preview, SECTION_TITLES } from "./model.js";

const CHAR_PX = 7.6;
const NAME_MAX = 44;
const RAIL_PX = 200;
const CLEAR = "#00000000";
const MARK = "mods/fleet-lens/thurbeen-mark.png";
const SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const KIND_GLYPH = {
  Task: "◆",
  TaskConfig: "⚙",
  EnvProvider: "⚿",
  ChangeRequest: "⑂",
  Conversation: "✉",
  Listener: "◎",
  CronTask: "◷",
  Board: "▤",
};

export const RAIL_WIDTH = RAIL_PX;
export const PREVIEW_MIN_PX = 440;
const TABLE_CHROME_PX = 64;

export const tableWidth = (w) => w.reduce((sum, n) => sum + n, TABLE_CHROME_PX);

const mono = () => settings()?.font_family ?? "JetBrains Mono";
const glyph = (kind) => KIND_GLYPH[kind] ?? "•";

export const tint = (color, alpha = "24") =>
  typeof color === "string" && /^#[0-9a-f]{6}$/i.test(color) ? `${color}${alpha}` : color;

export function toneColor(t, tone) {
  const tones = {
    ok: t.ansi2,
    warn: t.ansi3,
    bad: t.ansi1,
    muted: t.muted,
    working: t.working,
    blocked: t.blocked,
    done: t.done,
    idle: t.idle,
  };
  return tones[tone] ?? null;
}

const pill = (text, color, id) =>
  h_flex()
    .id(id)
    .px(8)
    .py(2)
    .gap(6)
    .items_center()
    .rounded(999)
    .bg(tint(color, "22"))
    .border(1)
    .border_color(tint(color, "55"))
    .text_size(11.5)
    .text_color(color)
    .child(text);

const dot = (color, pulse) => {
  const d = div().size(7).rounded(4).bg(color);
  return pulse ? d.loop("opacity", { from: 0.25, to: 1, period: 1100 }) : d;
};

const button = (t, id, label, primary, onClick) =>
  div()
    .id(id)
    .px(10)
    .py(5)
    .rounded(6)
    .cursor_pointer()
    .text_size(12)
    .bg(primary ? t.solid : t.raised)
    .text_color(primary ? t.solid_foreground : t.foreground)
    .hover((st) => (primary ? st.opacity(0.85) : st.bg(t.hover)))
    .on_click(onClick)
    .child(label);

function sessionButton(t, id, handlers) {
  const { label, key } = handlers.session;
  if (!key) {
    return div()
      .id(id)
      .px(10)
      .py(5)
      .rounded(6)
      .text_size(12)
      .bg(t.raised)
      .text_color(t.accent)
      .child(label)
      .loop("opacity", { from: 0.5, to: 1, period: 900 });
  }
  return button(t, id, label, true, (_e, cx) => handlers.onSession(cx));
}

function filterField(t, s, onClick) {
  const active = s.filtering;
  return h_flex()
    .id("lens-filter")
    .w(260)
    .px(10)
    .py(4)
    .gap(6)
    .items_center()
    .rounded(7)
    .cursor_pointer()
    .bg(t.surface)
    .border(1)
    .border_color(active ? t.accent : t.border)
    .on_click(onClick)
    .child(
      div()
        .text_color(active ? t.accent : t.dim)
        .child("⌕"),
    )
    .child(
      div()
        .truncate()
        .text_size(12)
        .text_color(s.query ? t.foreground : t.dim)
        .child(s.query || (active ? "" : "filter  /")),
    )
    .when(active, (el) =>
      el.child(div().w(1).h(14).bg(t.accent).loop("opacity", { from: 0, to: 1, period: 900 })),
    )
    .child(div().flex_1());
}

export function header(t, s, onFilter) {
  const live = s.error
    ? pill("◌ stale", t.ansi1, "hdr-live")
    : pill("", t.ansi2, "hdr-live")
        .child(dot(t.ansi2, s.watching))
        .child(s.watching ? "live" : "polling");
  const shown = s.query ? `${s.rows.length} of ${s.total}` : String(s.total);
  return h_flex()
    .id("lens-header")
    .h(52)
    .px(16)
    .gap(12)
    .items_center()
    .bg(t.chrome)
    .border_b(1)
    .border_color(t.border)
    .child(image(MARK).w(24).h(24).rounded(6).flex_none())
    .child(div().text_size(15).font_semibold().child("Fleet Lens"))
    .child(
      div()
        .text_size(11.5)
        .text_color(t.dim)
        .child(`fleet ${s.version ?? "…"}`),
    )
    .when(s.loading, (el) => el.child(div().text_color(t.accent).frames(SPINNER, 90)))
    .child(div().flex_1())
    .child(filterField(t, s, onFilter))
    .when(s.needYou > 0, (el) => el.child(pill(`${s.needYou} need you`, t.blocked, "hdr-need")))
    .child(pill(`${shown} ${s.kind}${s.total === 1 ? "" : "s"}`, t.accent, "hdr-count"))
    .child(live);
}

export function rail(t, s, onKind) {
  return v_flex()
    .id("lens-rail")
    .w(RAIL_PX)
    .flex_none()
    .py(10)
    .gap(1)
    .bg(t.chrome)
    .border_r(1)
    .border_color(t.border)
    .child(div().px(18).pb(6).text_size(10.5).text_color(t.dim).child("KINDS"))
    .children(
      s.kinds.map((k) => {
        const on = k.kind === s.kind;
        const quiet = k.count === 0;
        const tone = on ? t.accent : quiet ? t.dim : t.muted;
        return h_flex()
          .id(`kind-${k.kind}`)
          .mx(8)
          .px(8)
          .py(6)
          .gap(9)
          .rounded(7)
          .items_center()
          .cursor_pointer()
          .when(on, (el) => el.bg(t.selected))
          .hover((st) => st.bg(t.hover))
          .on_click((_e, cx) => onKind(k.kind, cx))
          .child(
            div()
              .w(3)
              .h(14)
              .rounded(2)
              .bg(on ? t.accent : CLEAR),
          )
          .child(div().w(14).text_color(tone).child(glyph(k.kind)))
          .child(
            div()
              .flex_1()
              .truncate()
              .text_color(on ? t.foreground : tone)
              .when(on, (el) => el.font_semibold())
              .child(k.kind),
          )
          .child(
            div()
              .px(6)
              .rounded(999)
              .text_size(11)
              .when(on, (el) => el.bg(tint(t.accent, "22")))
              .text_color(on ? t.accent : t.dim)
              .child(k.count === undefined ? "·" : String(k.count)),
          );
      }),
    );
}

export function widths(columns, rows) {
  const chars = columns.map((title, i) =>
    Math.max(title.length, ...rows.map((r) => r.cells[i]?.text.length ?? 0)),
  );
  chars[0] = Math.min(chars[0], NAME_MAX);
  return chars.map((n, i) => (n + 2) * CHAR_PX + (columns[i] === "HERDR" ? 14 : 0));
}

function cellView(t, cell, title, width, stale) {
  const color = stale ? t.dim : (toneColor(t, cell.tone) ?? t.foreground);
  const el = h_flex().w(width).flex_none().gap(6).items_center().overflow_hidden();
  if (title === "HERDR" && cell.text !== "-") el.child(dot(color, cell.text === "working"));
  return el.child(
    div()
      .truncate()
      .text_color(cell.text === "-" ? t.dim : color)
      .child(cell.text),
  );
}

function emptyState(t, s) {
  let state = [glyph(s.kind), `No ${s.kind}s yet`, "tab shows the next kind"];
  if (s.query) state = ["⌕", `No ${s.kind} matches “${s.query}”`, "esc clears the filter"];
  if (s.error) state = ["◌", "Fleet did not answer", "R asks again"];
  if (s.loading) state = ["⠿", "Asking fleet…", ""];
  const [mark, title, hint] = state;
  return v_flex()
    .flex_1()
    .items_center()
    .justify_center()
    .gap(8)
    .child(div().text_size(34).text_color(t.dim).child(mark))
    .child(div().text_size(14).text_color(t.muted).child(title))
    .when(Boolean(hint), (el) => el.child(div().text_size(12).text_color(t.dim).child(hint)));
}

function sectionRow(t, item) {
  const color = { needs: t.blocked, open: t.accent, settled: t.dim }[item.key];
  return h_flex()
    .id(`section-${item.key}`)
    .px(16)
    .pt(12)
    .pb(4)
    .gap(8)
    .items_center()
    .text_size(10.5)
    .child(div().size(6).rounded(3).bg(color))
    .child(div().font_semibold().text_color(color).child(SECTION_TITLES[item.key].toUpperCase()))
    .child(div().text_color(t.dim).child(String(item.count)))
    .child(div().flex_1().h(1).bg(t.border));
}

export function table(t, s, w, handlers) {
  if (s.rows.length === 0) return emptyState(t, s);
  const head = h_flex()
    .id("lens-thead")
    .font_family(mono())
    .px(14)
    .py(7)
    .text_size(10.5)
    .text_color(t.dim)
    .border_b(1)
    .border_color(t.border)
    .child(div().w(20).flex_none())
    .children(s.columns.map((title, i) => div().w(w[i]).flex_none().child(title)));
  const markerColor = { "!": t.ansi1, "?": t.ansi3 };
  const rowView = (row, i) => {
    const on = i === s.selected;
    return h_flex()
      .id(`row-${s.kind}-${row.name}`)
      .px(14)
      .py(4)
      .items_center()
      .cursor_pointer()
      .border_l(2)
      .border_color(on ? t.accent : CLEAR)
      .when(on, (el) => el.bg(t.selected))
      .hover((st) => st.bg(t.hover))
      .on_click((e, cx) => handlers.onRow(i, e, cx))
      .child(
        div()
          .w(20)
          .flex_none()
          .font_semibold()
          .text_color(markerColor[row.marker] ?? t.dim)
          .child(row.marker ?? ""),
      )
      .children(row.cells.map((cell, j) => cellView(t, cell, s.columns[j], w[j], s.error)));
  };
  const body = v_flex()
    .id("lens-rows")
    .font_family(mono())
    .text_size(12.5)
    .flex_1()
    .min_h(0)
    .pb(8)
    .overflow_y_scrollbar()
    .track_scroll(handlers.scroll)
    .children(
      s.items.map((item) =>
        item.type === "section" ? sectionRow(t, item) : rowView(s.rows[item.index], item.index),
      ),
    );
  return v_flex().flex_1().min_h(0).child(head).child(body);
}

export function why(t, row) {
  const color = row.marker === "!" ? t.ansi1 : t.ansi3;
  return h_flex()
    .id("lens-why")
    .mx(12)
    .mt(8)
    .px(10)
    .py(6)
    .gap(8)
    .rounded(6)
    .bg(tint(color, "1a"))
    .border(1)
    .border_color(tint(color, "44"))
    .child(div().font_semibold().text_color(color).child(row.marker))
    .child(div().flex_1().truncate().child(row.why));
}

const linkLabel = (r) => {
  if (r.role === "parent") return `↑ ${r.name}`;
  if (r.role === "child") return `↓ ${r.name}`;
  return `${glyph(r.kind)} ${r.kind}/${r.name}`;
};

export function trail(t, row, onLink) {
  const related = row?.related ?? [];
  return h_flex()
    .id("lens-trail")
    .px(14)
    .py(8)
    .gap(6)
    .items_center()
    .flex_wrap()
    .border_t(1)
    .border_color(t.border)
    .text_size(11.5)
    .child(
      div()
        .text_color(t.dim)
        .child(related.length ? "→" : "→ no links"),
    )
    .children(
      related.map((r, i) =>
        div()
          .id(`rel-${i}`)
          .px(8)
          .py(2)
          .rounded(5)
          .cursor_pointer()
          .bg(t.raised)
          .text_color(t.accent)
          .hover((st) => st.bg(t.hover))
          .on_click((_e, cx) => onLink(r, cx))
          .child(linkLabel(r)),
      ),
    );
}

function previewItem(t, section, color, item, i, onUrl) {
  const line = h_flex()
    .id(`pv-${section.title}-${i}`)
    .w_full()
    .min_w(0)
    .gap(8)
    .items_start()
    .when(Boolean(item.label), (el) =>
      el.child(
        div()
          .px(6)
          .flex_none()
          .rounded(4)
          .text_size(11.5)
          .bg(tint(color, "2a"))
          .text_color(color)
          .child(item.label),
      ),
    );
  if (item.url) {
    return line
      .cursor_pointer()
      .text_color(t.accent)
      .hover((st) => st.opacity(0.75))
      .on_click(() => onUrl(item.url))
      .child(div().flex_1().min_w(0).truncate().child(`↗ ${item.text}`));
  }
  return line.child(
    div()
      .flex_1()
      .min_w(0)
      .text_color(item.dim ? t.muted : t.foreground)
      .child(item.text),
  );
}

function previewSection(t, section, onUrl) {
  const color = toneColor(t, section.tone) ?? t.muted;
  return v_flex()
    .id(`pv-${section.title}`)
    .w_full()
    .min_w(0)
    .p(12)
    .gap(7)
    .rounded(9)
    .bg(section.tone ? tint(color, "12") : t.raised)
    .border(1)
    .border_color(section.tone ? tint(color, "3a") : t.border)
    .child(
      h_flex()
        .gap(8)
        .items_center()
        .child(
          div()
            .text_size(10.5)
            .font_semibold()
            .text_color(color)
            .child(section.title.toUpperCase()),
        )
        .when(Boolean(section.outcome), (el) =>
          el.child(pill(section.outcome, color, "pv-outcome")),
        ),
    )
    .children(section.items.map((item, i) => previewItem(t, section, color, item, i, onUrl)));
}

function previewHead(t, s, row, handlers) {
  const phase = row.cells.find((_c, i) => s.columns[i] === "PHASE");
  const liveColor = toneColor(t, row.live) ?? t.muted;
  return v_flex()
    .px(16)
    .pt(14)
    .pb(12)
    .gap(8)
    .border_b(1)
    .border_color(t.border)
    .child(
      div()
        .text_size(11)
        .text_color(t.dim)
        .child(`${glyph(s.kind)} ${s.kind}`),
    )
    .child(div().text_size(15).font_semibold().child(row.name))
    .child(
      h_flex()
        .gap(6)
        .flex_wrap()
        .when(Boolean(phase && phase.text !== "-"), (el) =>
          el.child(pill(phase.text, toneColor(t, phase.tone) ?? t.muted, "pv-phase")),
        )
        .when(Boolean(row.live), (el) =>
          el.child(
            pill("", liveColor, "pv-live")
              .child(dot(liveColor, row.live === "working"))
              .child(`herdr ${row.live}`),
          ),
        ),
    )
    .child(
      h_flex()
        .gap(6)
        .pt(2)
        .when(Boolean(handlers.session), (el) => el.child(sessionButton(t, "pv-session", handlers)))
        .when(Boolean(handlers.url), (el) =>
          el.child(button(t, "pv-open", "Open link  o", false, () => handlers.onUrl(handlers.url))),
        )
        .child(button(t, "pv-read", "Read  ↵", false, (_e, cx) => handlers.onRead(cx))),
    );
}

export function previewPane(t, s, row, handlers) {
  const pane = v_flex()
    .id("lens-preview")
    .flex_1()
    .min_w(PREVIEW_MIN_PX)
    .border_l(1)
    .border_color(t.border)
    .bg(t.chrome);
  if (!row) return pane;
  const sections = preview(row);
  return pane.child(previewHead(t, s, row, handlers)).child(
    v_flex()
      .id("lens-preview-body")
      .flex_1()
      .min_w(0)
      .min_h(0)
      .p(12)
      .gap(10)
      .overflow_y_scrollbar()
      .text_size(12.5)
      .when(sections.length === 0, (el) =>
        el.child(
          div().p(8).text_color(t.dim).child("Nothing to report. Enter reads the whole object."),
        ),
      )
      .children(sections.map((section) => previewSection(t, section, handlers.onUrl))),
  );
}

export function footer(t, mode, store, onHint) {
  return h_flex()
    .id("lens-footer")
    .h(32)
    .px(12)
    .gap(2)
    .items_center()
    .bg(t.chrome)
    .border_t(1)
    .border_color(t.border)
    .text_size(11.5)
    .children(
      HINTS[mode].map((h) =>
        div()
          .id(`hint-${h.key}`)
          .px(8)
          .py(2)
          .rounded(5)
          .cursor_pointer()
          .text_color(t.muted)
          .hover((st) => st.bg(t.hover).text_color(t.foreground))
          .on_click((_e, cx) => onHint(h.key, cx))
          .child(h.label),
      ),
    )
    .child(div().flex_1())
    .child(
      div()
        .text_color(t.dim)
        .truncate()
        .child(store ? `watching ${store}` : "no store watch: polling every 5 s"),
    );
}

function yamlLine(t, text, i, on) {
  const match = text.match(/^(\s*(?:- )?)([^\s:"'][^:]*:)(\s.*)?$/);
  const valueColor = (v) => {
    const s = (v ?? "").trim();
    if (s === "null" || s === "[]" || s === "{}") return t.dim;
    if (/^(true|false|-?\d+(\.\d+)?)$/.test(s)) return t.ansi5;
    if (/^"?https?:\/\//.test(s)) return t.accent;
    return t.foreground;
  };
  const keep = (s) => s.replace(/^ +/, (sp) => " ".repeat(sp.length));
  return h_flex()
    .id(`yaml-${i}`)
    .px(16)
    .font_family(mono())
    .text_size(12)
    .border_l(2)
    .border_color(on ? t.accent : CLEAR)
    .when(on, (el) => el.bg(t.selected))
    .child(
      div()
        .w(48)
        .flex_none()
        .text_color(on ? t.accent : t.dim)
        .child(String(i + 1)),
    )
    .child(
      match
        ? h_flex()
            .flex_1()
            .child(div().child(keep(match[1])))
            .child(div().text_color(t.accent).child(match[2]))
            .child(
              div()
                .flex_1()
                .text_color(valueColor(match[3]))
                .child(match[3] ?? ""),
            )
        : div().flex_1().child(keep(text)),
    );
}

export function detail(t, s, row, lines, handlers) {
  return v_flex()
    .flex_1()
    .min_h(0)
    .child(
      h_flex()
        .id("lens-detail-title")
        .px(16)
        .py(10)
        .gap(10)
        .items_center()
        .border_b(1)
        .border_color(t.border)
        .child(div().text_color(t.dim).child(glyph(s.kind)))
        .child(
          div().text_size(14).font_semibold().text_color(t.accent).child(`${s.kind}/${row.name}`),
        )
        .child(
          div()
            .text_size(11.5)
            .text_color(t.dim)
            .child(`yaml · line ${s.cursor + 1} of ${lines.length}`),
        )
        .child(div().flex_1())
        .when(Boolean(handlers.url), (el) =>
          el.child(
            button(t, "detail-open", "Open link  o", false, () => handlers.onUrl(handlers.url)),
          ),
        )
        .when(Boolean(handlers.session), (el) =>
          el.child(sessionButton(t, "detail-session", handlers)),
        ),
    )
    .child(
      v_flex()
        .id("lens-detail")
        .flex_1()
        .min_h(0)
        .py(8)
        .overflow_y_scrollbar()
        .track_scroll(handlers.scroll)
        .children(lines.map((line, i) => yamlLine(t, line, i, i === s.cursor))),
    );
}
