import { describe, expect, it } from "vitest";
import { readWebtopConfig } from "../../skills/israel-school/src/webtop/config.ts";
import {
  fromDashboard,
  fromPupilCard,
  isNoHomework,
} from "../../skills/israel-school/src/webtop/homework.ts";
import { messagesFromInbox } from "../../skills/israel-school/src/webtop/messages.ts";
import { studentsFromDashboard } from "../../skills/israel-school/src/webtop/students.ts";

describe("Webtop config", () => {
  it("needs a webToken or a saved bio login", () => {
    expect(() => readWebtopConfig({})).toThrow("SMARTSCHOOL_WEB_TOKEN is not set.");
    expect(readWebtopConfig({ SMARTSCHOOL_BIO_LOGIN: "bio" }).bio).toEqual({
      bioLogin: "bio",
      deviceId: "",
      selectedUser: "",
      uniqueId: "",
    });
  });

  it("URL-decodes a token copied in encoded form", () => {
    expect(readWebtopConfig({ SMARTSCHOOL_WEB_TOKEN: "a%2Bb%3D" }).webToken).toBe("a+b=");
    expect(() => readWebtopConfig({ SMARTSCHOOL_WEB_TOKEN: "%E0%A4%A" })).toThrow(
      "not a valid cookie value",
    );
  });
});

describe("studentsFromDashboard", () => {
  it("reads the server's `childrens` list and skips entries without an id", () => {
    const data = {
      childrens: [
        {
          id: "enc-1",
          firstName: "Noa",
          lastName: "Levi",
          classCode: 7,
          classNum: 2,
          studyYear: 2027,
        },
        { firstName: "No id" },
      ],
    };
    expect(studentsFromDashboard(data)).toEqual([
      { id: "enc-1", name: "Noa Levi", classCode: 7, classNum: 2, studyYear: 2027 },
    ]);
  });

  it("returns no students for an unrecognised payload", () => {
    expect(studentsFromDashboard(null)).toEqual([]);
    expect(studentsFromDashboard({ other: 1 })).toEqual([]);
  });
});

describe("homework extraction", () => {
  it("treats teachers' ways of writing 'none' as no homework", () => {
    for (const value of ["", "  ", "אין", "אין שיעורי בית.", "ללא", "None", "-", "--", "."]) {
      expect(isNoHomework(value), value).toBe(true);
    }
    expect(isNoHomework("עמוד 12 תרגילים 1-4")).toBe(false);
  });

  it("reads the week view and keeps the day's date", () => {
    const data = [
      {
        date: "2026-10-25",
        hoursData: [
          {
            scheduale: [
              { homeWork: "עמוד 12", subject_name: "מתמטיקה", teacher: "כהן", descClass: "" },
            ],
          },
          { scheduale: [{ homeWork: "אין", subject_name: "אנגלית" }] },
        ],
      },
    ];
    expect(fromPupilCard(data)).toEqual([
      {
        date: "2026-10-25",
        subject: "מתמטיקה",
        teacher: "כהן",
        homework: "עמוד 12",
        description: "",
      },
    ]);
  });

  it("reads today's dashboard rows and lets nested lessons inherit the date", () => {
    const data = {
      dataTable: [
        { lesson: "היסטוריה", teacher: "לוי", homeworkData: "לקרוא פרק 3" },
        { lesson: "ספורט", homeworkData: "" },
      ],
      days: [{ date: "2026-10-26", lessons: [{ subject: 'תנ"ך', homework: "פסוקים 1-5" }] }],
    };
    expect(fromDashboard(data)).toEqual([
      { date: "", subject: "היסטוריה", teacher: "לוי", homework: "לקרוא פרק 3", description: "" },
      { date: "2026-10-26", subject: 'תנ"ך', teacher: "", homework: "פסוקים 1-5", description: "" },
    ]);
  });
});

describe("messagesFromInbox", () => {
  it("reads the sender from the misnamed student fields, last name first", () => {
    const rows = [
      {
        messageId: 42,
        subject: " טיול שנתי ",
        student_F_name: "דוד",
        student_L_name: "כהן",
        sendingDate: "2026-10-20T08:00:00",
        hasRead: 0,
        filesWereAttached: 1,
      },
    ];
    expect(messagesFromInbox(rows)).toEqual([
      {
        id: 42,
        subject: "טיול שנתי",
        sender: "כהן דוד",
        sentAt: "2026-10-20T08:00:00",
        hasRead: false,
        hasFiles: true,
      },
    ]);
  });
});
