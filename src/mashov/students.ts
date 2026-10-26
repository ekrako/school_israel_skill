import type { StudentRef } from "../core/students.ts";

export interface MashovStudent extends StudentRef {
  readonly classCode: string | undefined;
  readonly classNum: number | undefined;
}

type Json = Readonly<Record<string, unknown>>;

const isObject = (value: unknown): value is Json =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const text = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;

/**
 * Reads the account's students from the login response: a parent's children under
 * `accessToken.children`, or a student's own `credential.userId`.
 */
export function studentsFromLogin(body: unknown): readonly MashovStudent[] {
  if (!isObject(body)) return [];
  const accessToken = isObject(body.accessToken) ? body.accessToken : {};
  const children = Array.isArray(accessToken.children) ? accessToken.children : [];
  const fromChildren = children.filter(isObject).flatMap(childToStudent);
  if (fromChildren.length > 0) return fromChildren;

  const credential = isObject(body.credential) ? body.credential : {};
  const ownId = text(credential.userId) ?? text(accessToken.userId);
  if (ownId === undefined) return [];
  const name = text(accessToken.displayName) ?? text(credential.displayName) ?? "";
  return [{ id: ownId, name, classCode: undefined, classNum: undefined }];
}

function childToStudent(child: Json): MashovStudent[] {
  const id = text(child.childGuid);
  if (id === undefined) return [];
  const name = [text(child.privateName), text(child.familyName)].filter(Boolean).join(" ");
  return [
    {
      id,
      name,
      classCode: text(child.classCode),
      classNum: typeof child.classNum === "number" ? child.classNum : undefined,
    },
  ];
}
