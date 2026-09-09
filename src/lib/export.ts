import type { Resume } from "./schema";

function dateRange(start: string, end: string): string {
  return [start, end].filter(Boolean).join(" – ");
}

function headerLine(resume: Resume): string {
  const { email, phone, location, links } = resume.contact;
  return [location, email, phone, ...links].filter(Boolean).join(" · ");
}

export function toMarkdown(resume: Resume): string {
  const out: string[] = [];
  out.push(`# ${resume.contact.name}`.trim());
  if (resume.contact.headline) out.push(`**${resume.contact.headline}**`);
  const header = headerLine(resume);
  if (header) out.push(header);

  if (resume.summary) out.push("", "## Summary", "", resume.summary);

  if (resume.experience.length) {
    out.push("", "## Experience");
    for (const job of resume.experience) {
      out.push("", `### ${[job.title, job.company].filter(Boolean).join(" — ")}`);
      const meta = [job.location, dateRange(job.start, job.end)].filter(Boolean).join(" · ");
      if (meta) out.push(`*${meta}*`);
      out.push("", ...job.bullets.map((bullet) => `- ${bullet}`));
    }
  }

  if (resume.projects.length) {
    out.push("", "## Projects");
    for (const project of resume.projects) {
      out.push("", `### ${project.name}${project.link ? ` — ${project.link}` : ""}`);
      if (project.description) out.push("", project.description);
      if (project.bullets.length) out.push("", ...project.bullets.map((bullet) => `- ${bullet}`));
    }
  }

  if (resume.skills.length) {
    out.push("", "## Skills", "");
    for (const group of resume.skills) out.push(`- **${group.category}:** ${group.items.join(", ")}`);
  }

  if (resume.education.length) {
    out.push("", "## Education");
    for (const school of resume.education) {
      out.push("", `### ${school.institution}`);
      const meta = [[school.degree, school.field].filter(Boolean).join(", "), dateRange(school.start, school.end)]
        .filter(Boolean)
        .join(" · ");
      if (meta) out.push(`*${meta}*`);
      if (school.details.length) out.push("", ...school.details.map((detail) => `- ${detail}`));
    }
  }

  if (resume.certifications.length) {
    out.push("", "## Certifications", "", ...resume.certifications.map((cert) => `- ${cert}`));
  }

  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

/** Plain text, which is what most ATS ingestion pipelines actually read. */
export function toPlainText(resume: Resume): string {
  return toMarkdown(resume)
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/^- /gm, "• ");
}

export function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || "resume"
  );
}
