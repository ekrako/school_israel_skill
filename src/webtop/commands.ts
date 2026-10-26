import {
  type App,
  type CommandContext,
  intOption,
  signedIntOption,
  stringOption,
} from "../core/commands.ts";
import { forEachStudent, selectStudents } from "../core/students.ts";
import { WebtopClient } from "./client.ts";
import { readWebtopConfig } from "./config.ts";
import { fromDashboard, fromPupilCard } from "./homework.ts";
import { messagesFromInbox } from "./messages.ts";
import { studentsFromDashboard, type WebtopStudent } from "./students.ts";

const LESSONS_MODULE_ID = 11;

interface Session {
  readonly client: WebtopClient;
  readonly students: readonly WebtopStudent[];
}

function connect(context: CommandContext): WebtopClient {
  return new WebtopClient(context, readWebtopConfig(context.env));
}

async function openSession(context: CommandContext): Promise<Session> {
  const client = connect(context);
  const students = studentsFromDashboard(await client.call("dashboard/InitDashboard"));
  return { client, students };
}

function selected(context: CommandContext, session: Session): readonly WebtopStudent[] {
  return selectStudents(session.students, stringOption(context.options, "student"));
}

function week(client: WebtopClient, student: WebtopStudent, weekIndex: number) {
  return client.call("PupilCard/GetPupilLessonsAndHomework", {
    classCode: student.classCode,
    moduleID: LESSONS_MODULE_ID,
    studentID: student.id,
    studentName: student.name,
    studyYear: student.studyYear,
    viewType: 0,
    weekIndex,
  });
}

const grades = (client: WebtopClient, student: WebtopStudent) =>
  client.call("dashboard/GetGrades", { id: student.id, ClassCode: student.classCode });

const discipline = (client: WebtopClient, student: WebtopStudent) =>
  client.call("dashboard/GetPupilDiciplineEvents", {
    id: student.id,
    ClassCode: student.classCode,
  });

async function inbox(client: WebtopClient, context: CommandContext) {
  const data = await client.call("messageBox/GetMessagesInbox", {
    PageId: intOption(context.options, "page", 1),
    LabelId: 0,
    HasRead: context.options.unread === true ? false : null,
    SearchQuery: stringOption(context.options, "query") ?? "",
  });
  return messagesFromInbox(data);
}

function perStudent<R extends object>(
  load: (client: WebtopClient, student: WebtopStudent, context: CommandContext) => Promise<R>,
) {
  return async (context: CommandContext) => {
    const session = await openSession(context);
    const students = await forEachStudent(selected(context, session), (student) =>
      load(session.client, student, context),
    );
    return { students };
  };
}

const weekIndex = (context: CommandContext) => signedIntOption(context.options, "week", 0);

export const webtop: App = {
  secrets: ["SMARTSCHOOL_WEB_TOKEN", "SMARTSCHOOL_BIO_LOGIN"],
  options: {
    week: { type: "string" },
    page: { type: "string" },
    unread: { type: "boolean" },
    query: { type: "string" },
  },
  commands: {
    check: {
      summary: "Check that the Webtop session is still valid.",
      write: false,
      run: async (context) => {
        const client = connect(context);
        await client.call("dashboard/CheckToken");
        return { valid: true, renewed: client.renewed };
      },
    },
    students: {
      summary: "List the students on the account (id, name, class, study year).",
      write: false,
      run: async (context) => {
        const { students } = await openSession(context);
        return { students: students.map((student, i) => ({ index: i + 1, ...student })) };
      },
    },
    grades: {
      summary: "Grades per student.",
      write: false,
      run: perStudent(async (client, student) => ({ data: await grades(client, student) })),
    },
    homework: {
      summary: "Homework for a week per student (--week=0 this week, --week=-1 last week).",
      write: false,
      run: perStudent(async (client, student, context) => ({
        homework: fromPupilCard(await week(client, student, weekIndex(context))),
      })),
    },
    timetable: {
      summary: "Lessons for a week per student, including homework (--week).",
      write: false,
      run: perStudent(async (client, student, context) => ({
        days: await week(client, student, weekIndex(context)),
      })),
    },
    today: {
      summary: "Today's lessons and homework per student, from the dashboard.",
      write: false,
      run: perStudent(async (client, student) => {
        const lessons = await client.call("dashboard/GetHomeWork", {
          id: student.id,
          ClassCode: student.classCode,
          ClassNumber: student.classNum,
        });
        return { lessons, homework: fromDashboard(lessons) };
      }),
    },
    behavior: {
      summary: "Discipline and attendance events per student.",
      write: false,
      run: perStudent(async (client, student) => ({ data: await discipline(client, student) })),
    },
    messages: {
      summary: "Inbox message list (--page, --unread, --query). Does not open message bodies.",
      write: false,
      run: async (context) => ({ messages: await inbox(connect(context), context) }),
    },
    notifications: {
      summary: "Unread notifications preview.",
      write: false,
      run: async (context) => ({
        notifications: await connect(context).call("Menu/GetPreviewUnreadNotifications"),
      }),
    },
    all: {
      summary: "Grades, week, homework and behavior per student, plus inbox and notifications.",
      write: false,
      run: async (context) => {
        const session = await openSession(context);
        const { client } = session;
        const students = await forEachStudent(selected(context, session), async (student) => {
          const [studentGrades, days, behavior] = await Promise.all([
            grades(client, student),
            week(client, student, weekIndex(context)),
            discipline(client, student),
          ]);
          return { grades: studentGrades, homework: fromPupilCard(days), days, behavior };
        });
        const [messages, notifications] = await Promise.all([
          inbox(client, context),
          client.call("Menu/GetPreviewUnreadNotifications"),
        ]);
        return { students, messages, notifications };
      },
    },
  },
};
