import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
} from "docx";
import type { Resume } from "./schema";

const ACCENT = "1F3A5F";

function sectionHeading(text: string): Paragraph {
  return new Paragraph({
    spacing: { before: 240, after: 80 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "C7CDD6", space: 2 } },
    children: [new TextRun({ text: text.toUpperCase(), bold: true, size: 22, color: ACCENT, characterSpacing: 20 })],
  });
}

function bullet(text: string): Paragraph {
  return new Paragraph({ text, bullet: { level: 0 }, spacing: { after: 60 }, style: "body" });
}

function roleLine(left: string, right: string): Paragraph[] {
  const paragraphs = [
    new Paragraph({ spacing: { before: 120 }, children: [new TextRun({ text: left, bold: true, size: 21 })] }),
  ];
  if (right) {
    paragraphs.push(
      new Paragraph({ spacing: { after: 40 }, children: [new TextRun({ text: right, italics: true, size: 19, color: "5A6472" })] }),
    );
  }
  return paragraphs;
}

/** Render a resume as a clean, single-column, ATS-parseable .docx. */
export async function toDocxBuffer(resume: Resume): Promise<Buffer> {
  const body: Paragraph[] = [];
  const { contact } = resume;

  body.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 40 },
      children: [new TextRun({ text: contact.name, bold: true, size: 34, color: ACCENT })],
    }),
  );
  if (contact.headline) {
    body.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 40 },
        children: [new TextRun({ text: contact.headline, size: 22, color: "5A6472" })],
      }),
    );
  }
  const details = [contact.location, contact.email, contact.phone, ...contact.links].filter(Boolean).join("  ·  ");
  if (details) {
    body.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 120 },
        children: [new TextRun({ text: details, size: 18, color: "5A6472" })],
      }),
    );
  }

  if (resume.summary) {
    body.push(sectionHeading("Summary"), new Paragraph({ text: resume.summary, style: "body" }));
  }

  if (resume.experience.length) {
    body.push(sectionHeading("Experience"));
    for (const job of resume.experience) {
      body.push(
        ...roleLine(
          [job.title, job.company].filter(Boolean).join(" — "),
          [job.location, [job.start, job.end].filter(Boolean).join(" – ")].filter(Boolean).join("  ·  "),
        ),
        ...job.bullets.map(bullet),
      );
    }
  }

  if (resume.projects.length) {
    body.push(sectionHeading("Projects"));
    for (const project of resume.projects) {
      body.push(...roleLine(project.name, project.link));
      if (project.description) body.push(new Paragraph({ text: project.description, style: "body" }));
      body.push(...project.bullets.map(bullet));
    }
  }

  if (resume.skills.length) {
    body.push(sectionHeading("Skills"));
    for (const group of resume.skills) {
      body.push(
        new Paragraph({
          spacing: { after: 60 },
          children: [
            new TextRun({ text: `${group.category}: `, bold: true, size: 20 }),
            new TextRun({ text: group.items.join(", "), size: 20 }),
          ],
        }),
      );
    }
  }

  if (resume.education.length) {
    body.push(sectionHeading("Education"));
    for (const school of resume.education) {
      body.push(
        ...roleLine(
          school.institution,
          [[school.degree, school.field].filter(Boolean).join(", "), [school.start, school.end].filter(Boolean).join(" – ")]
            .filter(Boolean)
            .join("  ·  "),
        ),
        ...school.details.map(bullet),
      );
    }
  }

  if (resume.certifications.length) {
    body.push(sectionHeading("Certifications"), ...resume.certifications.map(bullet));
  }

  const document = new Document({
    creator: "Resume Tailor",
    title: `${contact.name} — Resume`,
    styles: {
      default: { document: { run: { font: "Calibri", size: 20, color: "1B1F24" } } },
      paragraphStyles: [
        { id: "body", name: "Body", basedOn: "Normal", quickFormat: true, paragraph: { spacing: { after: 80, line: 264 } } },
      ],
    },
    sections: [
      {
        properties: { page: { margin: { top: 720, bottom: 720, left: 720, right: 720 } } },
        children: body,
      },
    ],
  });

  return Buffer.from(await Packer.toBuffer(document));
}

export { HeadingLevel };
