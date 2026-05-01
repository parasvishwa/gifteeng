import {
  BadRequestException,
  PipeTransform,
  type ArgumentMetadata,
} from "@nestjs/common";
import type { ZodSchema } from "zod";

/**
 * ZodValidationPipe — validates request data against a Zod schema.
 *
 * IMPORTANT: Only runs on `body` and `query` metadata types. When @UsePipes
 * is applied at controller/method level, Nest runs the pipe against EVERY
 * parameter — including @Param("key") strings. Without this gate, a body
 * schema like `z.object({value: z.any()})` would try to validate the string
 * param "ai_text_api_key" and fail with "Expected object, received string".
 */
export class ZodValidationPipe implements PipeTransform {
  constructor(private schema: ZodSchema) {}

  transform(value: unknown, metadata: ArgumentMetadata) {
    // Only validate body / query payloads. Params, customs, and primitives
    // pass through untouched — callers that need to validate those should
    // attach a dedicated pipe at that specific param.
    if (metadata.type !== "body" && metadata.type !== "query") {
      return value;
    }
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        message: "Validation failed",
        errors: result.error.flatten(),
      });
    }
    return result.data;
  }
}
