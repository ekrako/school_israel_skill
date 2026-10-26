import { type App, type CommandContext, intOption, stringOption } from "../core/commands.ts";
import { forEachStudent, selectStudents } from "../core/students.ts";
import { MashovClient, STUDENT_SECTIONS, type StudentSection } from "./client.ts";
import { readMashovConfig } from "./config.ts";
import type { MashovStudent } from "./students.ts";

const DEFAULT_TAKE = 20;

interface Session {
  readonly client: MashovClient;
  readonly students: readonly MashovStudent[];
}

async function openSession(context: CommandContext): Promise<Session> {
  const config = readMashovConfig(context.env);
  const client = new MashovClient(context);
  return { client, students: await client.login(config) };
}

function selected(context: CommandContext, session: Session): readonly MashovStudent[] {
  return selectStudents(session.students, stringOption(context.options, "student"));
}

function perStudent(section: StudentSection) {
  return async (context: CommandContext) => {
    const session = await openSession(context);
    const students = await forEachStudent(selected(context, session), async ({ id }) => ({
      data: await session.client.studentSection(id, section),
    }));
    return { students };
  };
}

function page(context: CommandContext) {
  return {
    skip: intOption(context.options, "skip", 0),
    take: intOption(context.options, "take", DEFAULT_TAKE),
  };
}

function matchesQuery(school: unknown, query: string): boolean {
  if (typeof school !== "object" || school === null) return false;
  return Object.values(school).some(
    (value) =>
      (typeof value === "string" || typeof value === "number") && String(value).includes(query),
  );
}

export const mashov: App = {
  options: {
    skip: { type: "string" },
    take: { type: "string" },
    query: { type: "string" },
  },
  commands: {
    students: {
      summary: "List the students on the account (id, name, class).",
      write: false,
      run: async (context) => {
        const { students } = await openSession(context);
        return { students: students.map((student, i) => ({ index: i + 1, ...student })) };
      },
    },
    grades: { summary: "Grades per student.", write: false, run: perStudent("grades") },
    homework: { summary: "Homework per student.", write: false, run: perStudent("homework") },
    timetable: {
      summary: "Weekly timetable per student.",
      write: false,
      run: perStudent("timetable"),
    },
    behavior: {
      summary: "Behavior and attendance events per student.",
      write: false,
      run: perStudent("behave"),
    },
    messages: {
      summary: "Inbox conversations, newest first (--skip, --take).",
      write: false,
      run: async (context) => {
        const { client } = await openSession(context);
        return { conversations: await client.conversations(page(context)) };
      },
    },
    schools: {
      summary: "Public school list for finding a semel (--query filters by name or semel).",
      write: false,
      run: async (context) => {
        const schools = await new MashovClient(context).schools();
        const query = stringOption(context.options, "query");
        if (query === undefined || !Array.isArray(schools)) return { schools };
        return { schools: schools.filter((school) => matchesQuery(school, query)) };
      },
    },
    all: {
      summary: "Every section for each student plus the inbox, with a single login.",
      write: false,
      run: async (context) => {
        const session = await openSession(context);
        const students = await forEachStudent(selected(context, session), async ({ id }) => {
          const [grades, timetable, homework, behavior] = await Promise.all(
            STUDENT_SECTIONS.map((section) => session.client.studentSection(id, section)),
          );
          return { grades, timetable, homework, behavior };
        });
        return { students, conversations: await session.client.conversations(page(context)) };
      },
    },
  },
};
