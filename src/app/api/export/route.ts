import { NextRequest, NextResponse } from "next/server";
import { toDocxBuffer } from "@/lib/docx";
import { toPdfBuffer } from "@/lib/pdf";
import { slugify, toMarkdown, toPlainText } from "@/lib/export";
import { ResumeSchema } from "@/lib/schema";
import { errorResponse } from "@/lib/http";

export const runtime = "nodejs";

const FORMATS = ["pdf", "docx", "md", "txt"] as const;
type Format = (typeof FORMATS)[number];

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { resume?: unknown; format?: string };
    const parsed = ResumeSchema.safeParse(body.resume);
    if (!parsed.success) {
      return NextResponse.json({ error: "Missing or malformed resume data." }, { status: 400 });
    }
    const format = (body.format ?? "pdf") as Format;
    if (!FORMATS.includes(format)) {
      return NextResponse.json({ error: `Unsupported format "${body.format}".` }, { status: 400 });
    }

    const resume = parsed.data;
    const filename = `${slugify(resume.contact.name)}-resume.${format}`;
    const headers = {
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    };

    if (format === "pdf") {
      const buffer = await toPdfBuffer(resume);
      return new NextResponse(new Uint8Array(buffer), {
        headers: { ...headers, "Content-Type": "application/pdf" },
      });
    }

    if (format === "docx") {
      const buffer = await toDocxBuffer(resume);
      return new NextResponse(new Uint8Array(buffer), {
        headers: {
          ...headers,
          "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        },
      });
    }

    const text = format === "md" ? toMarkdown(resume) : toPlainText(resume);
    return new NextResponse(text, { headers: { ...headers, "Content-Type": "text/plain; charset=utf-8" } });
  } catch (error) {
    return errorResponse(error);
  }
}
