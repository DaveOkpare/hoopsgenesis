/**
 * Names next to user ids in responses. Rows keep their `...ById` fields and
 * gain a sibling object, e.g. `voidedById` + `voidedBy: { id, name }`, the
 * same shape records get from Prisma includes (./v1/records-shared.ts).
 *
 * ```ts
 * const people = await loadPeople(db, rows.flatMap((row) => [row.studentId, row.voidedById]));
 * rows.map((row) => ({ ...row, voidedBy: personRef(people, row.voidedById) }));
 * ```
 *
 * One query per response, however many rows: never look people up per row.
 */
import type { DbClient } from "./scope";

export interface PersonRef {
  id: string;
  name: string;
}

export interface PersonWithImage extends PersonRef {
  image: string | null;
}

export type People = ReadonlyMap<string, PersonWithImage>;

/** The users among `ids` (nulls and repeats are skipped), in one query. */
export const loadPeople = async (
  client: DbClient,
  ids: Iterable<string | null | undefined>
): Promise<People> => {
  const unique = new Set<string>();
  for (const id of ids) {
    if (id) {
      unique.add(id);
    }
  }
  if (unique.size === 0) {
    return new Map();
  }
  const rows = await client.user.findMany({
    where: { id: { in: [...unique] } },
    select: { id: true, name: true, image: true },
  });
  return new Map(rows.map((row) => [row.id, row]));
};

/** `{ id, name }` for a user id, or null for no id (or a user not loaded). */
export const personRef = (
  people: People,
  id: string | null | undefined
): PersonRef | null => {
  const person = id ? people.get(id) : undefined;
  return person ? { id: person.id, name: person.name } : null;
};

/** `{ id, name, image }` for a user id, or null. */
export const personWithImage = (
  people: People,
  id: string | null | undefined
): PersonWithImage | null => {
  const person = id ? people.get(id) : undefined;
  return person
    ? { id: person.id, name: person.name, image: person.image }
    : null;
};
