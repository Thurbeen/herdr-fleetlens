# herdr-fleetlens

**Fleet Lens** for the [Herdr app](https://herdr.dev): a keyboard-first float that browses every Fleet resource kind, in the spirit of [thurbox-fleetlens](https://github.com/Thurbeen/thurbox-fleetlens), with Herdr's live sessions on top.

![Fleet Lens: a request typed into VEGA becomes three worker Tasks in herdr; the Lens lists them under VEGA, the one asking a Question first; Fleet pauses the idle sessions and w wakes one](https://github.com/Thurbeen/herdr-fleetlens/releases/download/media/fleet-lens.gif)

The clip is a real run, recorded by `demo/record.sh` in a sandbox: a request is typed into [VEGA](https://github.com/Thurbeen/vega), which applies one worker Task per repository, run by logged-in `claude` agents in herdr. The Lens then shows them, Fleet idle-pauses them, and `w` wakes one. The working stretches are sped up. The [video](https://github.com/Thurbeen/herdr-fleetlens/releases/download/media/fleet-lens.mp4) is the same take, sharper.

Fleet's `herdr/local` runtime runs each Task as a herdr-core terminal labelled `fleet.key=fleet.<uid>`. The Lens joins on that label, so every Task row shows its live Herdr status, and `s` jumps straight to its session.

## Fleet Sessions sidebar

Fleet pauses idle sessions (`pauseAfterMs` on a TaskConfig, 30 minutes on `default`). A paused herdr session loses its terminal, so it drops out of Herdr's own lists.

The `fleet` layout is a copy of Herdr's `main` layout with the Agents list replaced by **Fleet Sessions**. It shows every Task's session, live or paused, named by its Task, under the Thurbeen emblem. The groups are:

- **Needs you**
- **Live**
- **Paused**: every paused session, finished ones with their outcome
- **Settled**: finished work, folded

Clicking a session goes to it:

- A live herdr session is focused.
- A paused session is woken through `fleet attach --wake`. Its new terminal is focused once Herdr sees it.
- A runtime-mux session (badge `mux`, on a `mux/…` host) can be woken, but it isn't shown inside Herdr. Its `fleet attach` stream speaks runtime-mux's framed viewer protocol (what thurbox consumes), not a raw terminal. The only other route would be attaching to runtime-mux's private tmux windows on the live thurbox server. Open live mux sessions in thurbox.

The Lens offers the same actions: `s` goes to the session, `w` wakes it, and the preview button follows whichever applies.

## Install

```sh
./install.sh --home ~/.config/herdr-app --store ~/.local/share/fleet/store-v1
```

Open the Lens from the palette (**Fleet: open Lens**), from the sidebar's **Lens** button, or with `herdr-app do mod.open --name fleet-lens`. Switch to the sessions sidebar with `herdr-app do layout.switch --name fleet`.

- `--home` is required. Nothing is written anywhere else.
- `--store` is Fleet's `data.dir`. The Lens re-reads Fleet whenever the store changes. Without `--store` it polls every 5 s.

## Use

| Key                                         | Does                             |
| ------------------------------------------- | -------------------------------- |
| `j` / `k`, `↓` / `↑`                        | Move, or scroll a resource       |
| `PgDn` / `PgUp`, `g` / `G`, `Home` / `End`  | Ten rows, or to the first / last |
| `tab` / `shift+tab`, `Ctrl+L` / `Ctrl+H`    | Next / previous kind             |
| `enter`, click a selected row, double-click | Read the resource                |
| `s`                                         | Go to the Task's Herdr session   |
| `R`                                         | Ask fleet again now              |
| `esc`, `q`                                  | Back from a resource, or close   |

Rows that need a person come first:

- `!` means NeedsAttention.
- `?` means an unanswered Question.

Then open work, then settled, newest first.

| Task column           | From                                                       |
| --------------------- | ---------------------------------------------------------- |
| PHASE, AGENT, SESSION | `status.phase`, `status.agentState`, `status.sessionState` |
| HERDR                 | the live Herdr agent status of the Task's terminal         |
| GEN                   | brief generation / spec generation, red when they differ   |
| RESULT, CR            | `status.result.outcome`, declared ChangeRequests           |

A ChangeRequest gets CHANGE (`owner/repo#N` or `group/project!N`). Every other kind gets COND (condition glyphs) and SYNC (`±` when status lags spec).

The line under the table names what the row needs, and links what it names: its TaskConfig, its declared ChangeRequests, its parent (`↑`) and its children (`↓`). Clicking a link follows it.

The table is split into **Needs you**, **Open** and **Settled** sections.

The **preview** on the right follows the selection. It shows:

- the row's phase and live Herdr status
- buttons for its session, its link and the full read
- cards for attention, every open Question in full, the request and brief, the result with its summary and clickable artifacts, change requests, and answered Questions

Other kinds show their conditions. When the float is too narrow for the preview, the line under the table says why the row needs you.

`enter` reads the whole object as syntax-coloured YAML, with a line cursor.

The rail lists Fleet's core kinds (`fleet version --json`), then every kind a plugin serves (`fleet list plugins --json`), such as ReviewSource or Ticket. Both lists are re-read whenever the store changes, and every 30 s otherwise, so a newly installed plugin's kinds appear on their own.

The Lens reads Fleet only through `fleet version`, `fleet list plugins`, `fleet list <kind>` and `fleet attach --wake` (the one write, used to wake a session).

Every action is also an app command, `fleet-lens.<action>`, which `keys.json` can bind or `herdr-app do` can run while the Lens is open: `down`, `up`, `pageDown`, `pageUp`, `first`, `last`, `nextKind`, `prevKind`, `open`, `back`, `close`, `refresh`, `session`, `wake`, `openUrl`, `filter`.

## Develop

```sh
npm ci
prek run --all-files
```

`prek run` covers Biome, `node --test`, and `herdr-app check` against a temporary `HERDR_APP_HOME`.

`demo/record.sh` re-records the clip into `media/`, which git ignores. The clip lives on the `media` prerelease instead, so recordings never enter the history: replace it with `gh release upload media media/fleet-lens.gif media/fleet-lens.mp4 --clobber`. `demo/encode.sh <take dir> media` re-encodes a take kept with `KEEP=1` without running the agents again. It needs Xvfb, ffmpeg, herdr-core, herdr-app, Fleet with `runtime-herdr`, and a logged-in `claude`: the agents do real work and spend real quota. It keeps apart from the machine's own Fleet and herdr through a scratch Fleet config and store, a herdr-core session and a herdr-app home of its own, and a private display, and it removes them on exit.
