/**
 * Record templates, read-only (the registry is app config:
 * ../config/record-templates.ts).
 *
 * GET /api/v1/academies/:academyId/record-templates   members (record:read)
 *
 * `?recordType=academic|athletic`, `?latest=true` for only the newest version
 * of each template. Not paginated: the list is a handful of static entries.
 * Each entry carries `jsonSchema` (JSON Schema 2020-12, from the Zod schema)
 * for the client to render the form, and `metrics` for progress charts.
 */
import { z } from "zod";

import { requireAcademyAccess } from "../access";
import {
  isLatestVersion,
  RECORD_TEMPLATES,
  type RecordTemplate,
} from "../config/record-templates";
import { apiHandler, json } from "../handler";
import { parseQuery } from "../validation";

const querySchema = z.object({
  recordType: z.enum(["academic", "athletic"]).optional(),
  latest: z.enum(["true", "false"]).optional(),
});

const serializeTemplate = (template: RecordTemplate) => ({
  key: template.key,
  recordType: template.recordType,
  schemaVersion: template.schemaVersion,
  label: template.label,
  description: template.description,
  latest: isLatestVersion(template),
  metrics: template.metrics,
  jsonSchema: z.toJSONSchema(template.schema, {
    io: "input",
    unrepresentable: "any",
  }),
});

let serialized: ReturnType<typeof serializeTemplate>[] | undefined;

const allTemplates = () => {
  serialized ??= RECORD_TEMPLATES.map(serializeTemplate);
  return serialized;
};

export const listRecordTemplates = apiHandler(async (ctx) => {
  await requireAcademyAccess(ctx, { record: ["read"] });
  const query = parseQuery(querySchema, ctx.request);
  const data = allTemplates().filter(
    (template) =>
      (!query.recordType || template.recordType === query.recordType) &&
      (query.latest !== "true" || template.latest)
  );
  return json({ data });
});
