---
name: israel-school
description: 'Reads a student''s school data from Israel''s two main school apps, Mashov (משו"ב) and SmartSchool Webtop (סמארט סקול): grades, homework, timetable, behavior and attendance events, messages and notifications. Read-only by default, returns JSON, keeps passwords in the OS keychain. Use when the user asks about grades, exams, homework, the timetable, absences, lateness, discipline notes or messages from school, or mentions Mashov, משו"ב, SmartSchool, סמארט סקול or Webtop. Do NOT use for other school systems or for general questions about the Israeli education system.'
license: MIT
compatibility: Requires Node.js 24 or later and a shell. macOS or Linux for keychain secrets and approval dialogs.
---

# Israeli School: Mashov and SmartSchool Webtop

The skill runs `scripts/school` from the skill folder. Every run prints a single JSON document to
stdout. Requires Node 24 or later.

```sh
scripts/school help                      # list the apps and commands
scripts/school mashov <command> [options]
scripts/school webtop <command> [options]
```

If it is not clear which app the school uses, ask the user.

## Mashov commands (`mashov`)

| Command | Returns | Options |
|---|---|---|
| `students` | Students on the account: index, id, name, class | |
| `grades` | Grades | `--student` |
| `homework` | Homework | `--student` |
| `timetable` | Weekly timetable | `--student` |
| `behavior` | Behavior and attendance events: absences, lateness, notes | `--student` |
| `messages` | Inbox conversations, newest first | `--skip`, `--take` (default 20) |
| `schools` | The public school list, to look up a school code (semel). No login needed | `--query` |
| `all` | All data for every student plus the inbox, in one login | `--student`, `--skip`, `--take` |

## SmartSchool commands (`webtop`)

| Command | Returns | Options |
|---|---|---|
| `check` | Whether the session is still valid | |
| `students` | Students on the account: index, id, name, class, school year | |
| `grades` | Grades | `--student` |
| `homework` | A week's homework as a clean list (date, subject, teacher, task) | `--student`, `--week` |
| `timetable` | A week's lessons, homework included, as the server returns them | `--student`, `--week` |
| `today` | Today's lessons and homework, from the dashboard | `--student` |
| `behavior` | Discipline and attendance events | `--student` |
| `messages` | Inbox message list (subject, sender, date, read/unread) | `--page` (from 1), `--unread`, `--query` |
| `notifications` | Preview of unread notifications | |
| `all` | Grades, week, homework and discipline per student, plus messages and notifications | `--student`, `--week`, `--page`, `--unread` |

- `--week=0` is the current week, `--week=-1` the previous one, `--week=1` the next. A negative
  value must be written with `=`.
- `messages` returns only the message list. Opening a message body may mark it as read, so it is
  not part of read-only access.

## Shared options

- `--student` takes an id, an exact full name, or an index (from 1) as listed by `students`.
  Without `--student` the command runs for every student on the account. In SmartSchool the id is
  long and encrypted, so prefer the index.
- When you need more than one kind of data, prefer `all`: fewer calls to the server.

## Output

Success, exit code 0:

```json
{
  "ok": true,
  "app": "mashov",
  "command": "grades",
  "access": "read",
  "write": false,
  "data": { "students": [{ "id": "...", "name": "...", "data": [] }] }
}
```

Most data arrives as the server returns it, unprocessed. Read the actual fields before you
summarize, and do not assume a fixed shape. The exceptions: SmartSchool `homework`, `today` and
`messages` return clean lists, with values such as "אין" or "ללא שיעורי בית" filtered out.

Failure, non-zero exit code:

```json
{ "ok": false, "error": { "type": "config", "message": "...", "hint": "..." } }
```

| `type` | Code | What to do |
|---|---|---|
| `usage` | 2 | Fix the command. `scripts/school help` lists the commands. |
| `config` | 2 | An environment variable is missing or wrong. Tell the user which one, per the `hint`. Do not guess values. |
| `auth` | 3 | Login was rejected or the session expired. Pass the `hint` to the user. Do not retry automatically: repeated failed logins can lock the account. |
| `upstream` | 4 | The server failed, timed out or returned an error. You may retry once. |
| `access_denied` | 5 | The action needs `full` or `unattended`, or the user did not approve it. Do not retry. See "Access levels". |
| `internal` | 1 | A bug in the skill. Tell the user and offer to report it (see "Reporting problems"). |

## Access levels

`SCHOOL_ACCESS` in the environment sets the ceiling:

- `read` (default): read only. Every change is blocked, without asking.
- `full`: calls that change data are allowed too, but each one needs the user's approval.
- `unattended`: calls that change data are allowed without asking, for runs with nobody at the
  computer (for example a scheduled task).

How the user approves a change under `full`:

- **A dialog per call:** before a call that changes data leaves for the server, a dialog opens on
  the user's computer (macOS, or Linux with `zenity`). It shows the URL and the data to be sent,
  with Allow and Deny buttons. No answer within 2 minutes counts as Deny.
- **Time-limited approval:** the user runs `scripts/school grant --minutes 15` in a terminal
  themselves (default 15, up to 120) and types the code shown. Until the time runs out, changes go
  out without a dialog. `scripts/school revoke` cancels the approval at once.

Rules:

- Never change `SCHOOL_ACCESS` and never edit the `.env` file. Only the user decides the access
  level.
- Never run `grant`, never create or edit the approval file, and never try to click or bypass the
  approval dialog. Running `revoke` is allowed.
- Before any command marked `"write": true` in `scripts/school help`, and before any call that
  changes data, describe to the user exactly what will change and where, and get explicit approval
  in the conversation. Approval for one action does not carry to the next. The dialog is an extra
  approval, not a replacement.
- Under `unattended` there is no dialog and no code. Make only changes the user explicitly asked
  for in advance, exactly as asked (for example "mark every new message as read"). Any other change
  waits for a question in the conversation.
- When `access_denied` comes back because the user declined, do not retry. Ask the user what to do.
- When no dialog is available (for example on a remote server), pass the `hint` to the user: they
  can run `grant` themselves.
- `--read-only` limits a single run to reading, even when the access level is `full`.

## Setup

Login details are read from environment variables only. The skill loads the first file that
exists among: `SCHOOL_ENV_FILE`, `~/.config/israel-school/.env`, and `.env` in the skill folder.
`.env.example` lists the names. Only the app the school uses needs to be configured.

Never ask the user to paste a password or token into the conversation. They add it themselves to
the `.env` file, or to the computer's keychain (service `israel-school`, account named after the
variable). `MASHOV_PASSWORD`, `SMARTSCHOOL_WEB_TOKEN` and `SMARTSCHOOL_BIO_LOGIN` are read from
there when the file does not set them. The commands are in the README.

The skill refuses a `.env` file that other users can read. Pass the user the `chmod` command from
the `hint`.

Values containing `#` (common in passwords) must be in single quotes, for example
`MASHOV_PASSWORD='abc#123'`. Unquoted, everything after the `#` is cut off and login fails.

### Mashov

| Variable | Required | Description |
|---|---|---|
| `MASHOV_USERNAME` | Yes | Mashov username |
| `MASHOV_PASSWORD` | Yes | Mashov password |
| `MASHOV_SEMEL` | Yes | School code. Look it up with `scripts/school mashov schools --query <school name>` |
| `MASHOV_YEAR` | No | School year, by the year it ends (תשפ"ז = 2027). Defaults to one computed from the date, rolling over in September |
| `MASHOV_STUDENT_ID` | No | Student id, for when the login response lists no student |

### SmartSchool

Password login is gated by reCAPTCHA, so the skill uses the browser's `webToken` cookie.

| Variable | Required | Description |
|---|---|---|
| `SMARTSCHOOL_WEB_TOKEN` | Yes, unless `SMARTSCHOOL_BIO_LOGIN` is set | The `webToken` cookie value |
| `SMARTSCHOOL_BIO_LOGIN` | No | The browser's saved login, to renew the session automatically |
| `SMARTSCHOOL_UNIQUE_ID`, `SMARTSCHOOL_SELECTED_USER`, `SMARTSCHOOL_DEVICE_ID` | No | Go with `SMARTSCHOOL_BIO_LOGIN` |

How the user gets a token:

1. Open https://webtop.smartschool.co.il (log out first if logged in).
2. To make the token last about half a year instead of 9 hours: in the developer tools console run
   `document.cookie = "saveRememberMe=1; path=/; domain=.smartschool.co.il"`, then log in right
   away.
3. In the developer tools: Application → Cookies → copy the `webToken` value into
   `SMARTSCHOOL_WEB_TOKEN`.

When `SMARTSCHOOL_BIO_LOGIN` is set and the token expires, the skill asks for a new session once
per run. The new session may log the user out of the browser. Renewal is the user's choice: do not
suggest setting it up without explaining this.

## Reporting problems

When the skill does not work as it should, offer the user to report it. For example: an `internal`
error, a command that keeps failing with `upstream` while the site itself works, output that does
not match what the user sees on the site, or an instruction in this file that turned out wrong.
Offer once per problem.

- Reports are opened as issues at https://github.com/ekrako/school_israel_skill/issues/new.
- If the user wants, draft it for them: the command, the error's `type` and `message`, the version
  (`version` in the skill's `package.json`), the OS, and what was expected versus what happened.
- The issue is public. Leave out passwords, tokens, the school code, names, ids, grades and any
  other value from the output. If an example is needed, use made-up values.
- Do not open the issue yourself. Show the draft, and open it only if the user explicitly asks
  after seeing it.
- Report security problems privately, not as an issue:
  https://github.com/ekrako/school_israel_skill/security/advisories/new

## Privacy

- The output contains personal data about minors: names, grades, behavior and messages. Use it only
  to answer the user's question.
- Do not save the output to files, commit it, or send it to an outside service or in a message,
  unless the user explicitly asks.
- Do not read or print the `.env` file, and do not read secrets from the keychain yourself
  (`security`, `secret-tool`).
