import { describe, expect, it, vi } from "vitest";
import {
  type Approver,
  dialogApprover,
  dialogText,
  type Exec,
  type WriteRequest,
  withGrant,
} from "../../skills/israel-school/src/core/approval.ts";

const REQUEST: WriteRequest = {
  method: "POST",
  url: new URL("https://school.test/api/mail/send"),
  body: { text: 'hi"; do shell script "rm -rf ~' },
};

function fakeExec(code: number, stdout = ""): ReturnType<typeof vi.fn<Exec>> {
  return vi.fn<Exec>(async () => ({ code, stdout, stderr: "" }));
}

describe("approval dialog", () => {
  it("names the request and shows the data it would send", () => {
    const text = dialogText(REQUEST);
    expect(text).toContain("POST school.test/api/mail/send");
    expect(text).toContain("rm -rf");
  });

  it("cuts long bodies short", () => {
    const text = dialogText({ ...REQUEST, body: "x".repeat(5000) });
    expect(text.length).toBeLessThan(1000);
  });

  it("passes the text to osascript as an argument, never inside the script", async () => {
    const exec = fakeExec(0, "Allow\n");
    expect(await dialogApprover("darwin", {}, exec)(REQUEST)).toBe("approved");
    const [file, args] = exec.mock.calls[0] ?? [];
    expect(file).toBe("osascript");
    const scriptLines = (args ?? []).slice(0, (args ?? []).indexOf("--"));
    expect(scriptLines.join("\n")).not.toContain("rm -rf");
    expect(args?.at(-1)).toBe(dialogText(REQUEST));
  });

  it.each([
    [1, ""],
    [0, ""],
    [0, "Deny\n"],
  ])("treats Deny, a timeout or anything but Allow as denied (exit %i, %j)", async (code, out) => {
    expect(await dialogApprover("darwin", {}, fakeExec(code, out))(REQUEST)).toBe("denied");
  });

  it("uses zenity without markup on a Linux desktop", async () => {
    const exec = fakeExec(0);
    expect(await dialogApprover("linux", { DISPLAY: ":0" }, exec)(REQUEST)).toBe("approved");
    expect(exec.mock.calls[0]?.[0]).toBe("zenity");
    expect(exec.mock.calls[0]?.[1]).toContain("--no-markup");
    expect(await dialogApprover("linux", { DISPLAY: ":0" }, fakeExec(1))(REQUEST)).toBe("denied");
  });

  it("reports unavailable with no desktop, or when the dialog program is missing", async () => {
    const exec = fakeExec(0);
    expect(await dialogApprover("linux", {}, exec)(REQUEST)).toBe("unavailable");
    expect(await dialogApprover("win32", {}, exec)(REQUEST)).toBe("unavailable");
    expect(exec).not.toHaveBeenCalled();
    const missing: Exec = () => Promise.reject(new Error("ENOENT"));
    expect(await dialogApprover("darwin", {}, missing)(REQUEST)).toBe("unavailable");
  });

  it("shows one dialog at a time", async () => {
    let open = 0;
    let maxOpen = 0;
    const exec: Exec = async () => {
      maxOpen = Math.max(maxOpen, ++open);
      await new Promise((resolve) => setTimeout(resolve, 5));
      open--;
      return { code: 0, stdout: "Allow", stderr: "" };
    };
    const approve = dialogApprover("darwin", {}, exec);
    await Promise.all([approve(REQUEST), approve(REQUEST), approve(REQUEST)]);
    expect(maxOpen).toBe(1);
  });
});

describe("grant", () => {
  it("approves without a dialog while a grant is active", async () => {
    const fallback = vi.fn<Approver>(async () => "denied");
    expect(await withGrant(() => true, fallback)(REQUEST)).toBe("approved");
    expect(fallback).not.toHaveBeenCalled();
  });

  it("falls back to the dialog when there is no grant", async () => {
    const fallback = vi.fn<Approver>(async () => "denied");
    expect(await withGrant(() => false, fallback)(REQUEST)).toBe("denied");
    expect(fallback).toHaveBeenCalledWith(REQUEST);
  });
});
