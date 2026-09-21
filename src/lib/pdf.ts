import PDFDocument from "pdfkit";
import type { Resume } from "./schema";

const ACCENT = "#1F3A5F";
const MUTED = "#5A6472";
const RULE = "#C7CDD6";
const INK = "#1B1F24";

const MARGIN = 46;
const BODY = 9.5;

/** Enough room left on the page to be worth starting a new entry. */
function needsRoom(doc: PDFKit.PDFDocument, points: number): boolean {
  return doc.y + points > doc.page.height - doc.page.margins.bottom;
}

function sectionHeading(doc: PDFKit.PDFDocument, title: string) {
  if (needsRoom(doc, 56)) doc.addPage();
  doc.moveDown(0.7);
  // No letter-spacing: it renders prettily but an ATS extracting the text reads
  // "S U M M A RY" instead of "SUMMARY", and being parseable beats being pretty.
  doc.font("Helvetica-Bold").fontSize(9).fillColor(ACCENT).text(title.toUpperCase());
  const y = doc.y + 2.5;
  doc
    .moveTo(doc.page.margins.left, y)
    .lineTo(doc.page.width - doc.page.margins.right, y)
    .lineWidth(0.6)
    .strokeColor(RULE)
    .stroke();
  doc.y = y + 5;
}

/** A bold title on the left with its dates and location right-aligned on the same line. */
function entryHeader(doc: PDFKit.PDFDocument, left: string, right: string) {
  if (needsRoom(doc, 44)) doc.addPage();
  const { left: x } = doc.page.margins;
  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const top = doc.y;

  doc.font("Helvetica-Bold").fontSize(10).fillColor(INK);
  const leftHeight = doc.heightOfString(left, { width: width * 0.62 });
  doc.text(left, x, top, { width: width * 0.62 });

  if (right) {
    doc.font("Helvetica").fontSize(8.5).fillColor(MUTED).text(right, x, top + 1, { width, align: "right" });
  }
  doc.y = top + leftHeight + 1.5;
}

function bullets(doc: PDFKit.PDFDocument, items: string[]) {
  if (items.length === 0) return;
  const { left: x } = doc.page.margins;
  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  doc.font("Helvetica").fontSize(BODY).fillColor(INK);

  for (const item of items) {
    if (needsRoom(doc, 22)) doc.addPage();
    const top = doc.y;
    doc.text("•", x + 2, top, { width: 10 });
    doc.text(item, x + 12, top, { width: width - 12, align: "left", lineGap: 1.2 });
    doc.y += 2.5;
  }
}

function paragraph(doc: PDFKit.PDFDocument, text: string) {
  doc
    .font("Helvetica")
    .fontSize(BODY)
    .fillColor(INK)
    .text(text, doc.page.margins.left, doc.y, {
      width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
      lineGap: 1.2,
    });
}

const join = (...parts: string[]) => parts.filter(Boolean).join("  ·  ");
const dates = (start: string, end: string) => [start, end].filter(Boolean).join(" – ");

/**
 * Render the resume as a PDF.
 *
 * Drawn directly with pdfkit rather than by printing HTML through a headless
 * browser: no Chromium binary to ship, so this runs anywhere the app does,
 * including serverless. The built-in Helvetica means no font files either.
 */
export async function toPdfBuffer(resume: Resume): Promise<Buffer> {
  const doc = new PDFDocument({
    size: "LETTER",
    margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
    info: { Title: `${resume.contact.name} — Resume`, Author: resume.contact.name, Creator: "Resume Tailor" },
    autoFirstPage: true,
  });

  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const finished = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  const { contact } = resume;
  const width = doc.page.width - MARGIN * 2;

  doc.font("Helvetica-Bold").fontSize(19).fillColor(ACCENT).text(contact.name || "Resume", { align: "center" });
  if (contact.headline) {
    doc.moveDown(0.15);
    doc.font("Helvetica").fontSize(10.5).fillColor(MUTED).text(contact.headline, { align: "center", width });
  }
  const details = join(contact.location, contact.email, contact.phone, ...contact.links);
  if (details) {
    doc.moveDown(0.25);
    doc.font("Helvetica").fontSize(8.5).fillColor(MUTED).text(details, { align: "center", width });
  }

  if (resume.summary) {
    sectionHeading(doc, "Summary");
    paragraph(doc, resume.summary);
  }

  if (resume.experience.length) {
    sectionHeading(doc, "Experience");
    for (const job of resume.experience) {
      entryHeader(
        doc,
        [job.title, job.company].filter(Boolean).join(" — "),
        join(job.location, dates(job.start, job.end)),
      );
      bullets(doc, job.bullets);
      doc.moveDown(0.35);
    }
  }

  if (resume.projects.length) {
    sectionHeading(doc, "Projects");
    for (const project of resume.projects) {
      entryHeader(doc, project.name, project.link);
      if (project.description) paragraph(doc, project.description);
      bullets(doc, project.bullets);
      doc.moveDown(0.35);
    }
  }

  if (resume.skills.length) {
    sectionHeading(doc, "Skills");
    for (const group of resume.skills) {
      if (needsRoom(doc, 22)) doc.addPage();
      const top = doc.y;
      doc.font("Helvetica-Bold").fontSize(BODY).fillColor(INK).text(`${group.category}: `, MARGIN, top, {
        continued: true,
      });
      doc.font("Helvetica").fillColor(INK).text(group.items.join(", "), { width, lineGap: 1.2 });
      doc.y += 2;
    }
  }

  if (resume.education.length) {
    sectionHeading(doc, "Education");
    for (const school of resume.education) {
      entryHeader(
        doc,
        school.institution,
        join([school.degree, school.field].filter(Boolean).join(", "), dates(school.start, school.end)),
      );
      bullets(doc, school.details);
      doc.moveDown(0.35);
    }
  }

  if (resume.certifications.length) {
    sectionHeading(doc, "Certifications");
    bullets(doc, resume.certifications);
  }

  doc.end();
  return finished;
}
