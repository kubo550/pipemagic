import { z, type ZodType } from "zod";

/**
 * Convert a Zod schema to the JSON Schema both providers accept for tool
 * parameters. Tools are defined once in Zod; this is the single translation
 * point. The `$schema` key is dropped — providers don't want it.
 */
export function toJsonSchema(schema: ZodType): Record<string, unknown> {
  const json = z.toJSONSchema(schema) as Record<string, unknown>;
  delete json["$schema"];
  return json;
}
