import type { Resume } from "@/lib/schema";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-5">
      <h2 className="border-b border-line pb-1 text-[11px] font-semibold tracking-[0.14em] text-accent uppercase">
        {title}
      </h2>
      <div className="mt-2 space-y-3">{children}</div>
    </section>
  );
}

function EntryHeader({ left, right }: { left: string; right: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3">
      <h3 className="text-[13px] font-semibold">{left}</h3>
      {right ? <span className="text-[11px] text-muted">{right}</span> : null}
    </div>
  );
}

function Bullets({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <ul className="mt-1 space-y-1">
      {items.map((item, index) => (
        <li key={index} className="relative pl-4 text-[12.5px] leading-relaxed before:absolute before:left-1 before:content-['·']">
          {item}
        </li>
      ))}
    </ul>
  );
}

const join = (...parts: string[]) => parts.filter(Boolean).join("  ·  ");

/** The tailored resume, rendered roughly as it will export and print. */
export function ResumePreview({ resume }: { resume: Resume }) {
  const { contact } = resume;
  return (
    <article className="print-sheet mx-auto max-w-[52rem] rounded-lg border border-line bg-surface p-8 shadow-sm sm:p-10">
      <header className="text-center">
        <h1 className="text-2xl font-bold tracking-tight text-accent">{contact.name || "Unnamed candidate"}</h1>
        {contact.headline ? <p className="mt-1 text-[13px] text-muted">{contact.headline}</p> : null}
        <p className="mt-2 text-[11px] text-muted">
          {join(contact.location, contact.email, contact.phone, ...contact.links)}
        </p>
      </header>

      {resume.summary ? (
        <Section title="Summary">
          <p className="text-[12.5px] leading-relaxed">{resume.summary}</p>
        </Section>
      ) : null}

      {resume.experience.length > 0 ? (
        <Section title="Experience">
          {resume.experience.map((job, index) => (
            <div key={index}>
              <EntryHeader
                left={[job.title, job.company].filter(Boolean).join(" — ")}
                right={join(job.location, [job.start, job.end].filter(Boolean).join(" – "))}
              />
              <Bullets items={job.bullets} />
            </div>
          ))}
        </Section>
      ) : null}

      {resume.projects.length > 0 ? (
        <Section title="Projects">
          {resume.projects.map((project, index) => (
            <div key={index}>
              <EntryHeader left={project.name} right={project.link} />
              {project.description ? <p className="mt-1 text-[12.5px] leading-relaxed">{project.description}</p> : null}
              <Bullets items={project.bullets} />
            </div>
          ))}
        </Section>
      ) : null}

      {resume.skills.length > 0 ? (
        <Section title="Skills">
          {resume.skills.map((group, index) => (
            <p key={index} className="text-[12.5px] leading-relaxed">
              <span className="font-semibold">{group.category}: </span>
              {group.items.join(", ")}
            </p>
          ))}
        </Section>
      ) : null}

      {resume.education.length > 0 ? (
        <Section title="Education">
          {resume.education.map((school, index) => (
            <div key={index}>
              <EntryHeader
                left={school.institution}
                right={join(
                  [school.degree, school.field].filter(Boolean).join(", "),
                  [school.start, school.end].filter(Boolean).join(" – "),
                )}
              />
              <Bullets items={school.details} />
            </div>
          ))}
        </Section>
      ) : null}

      {resume.certifications.length > 0 ? (
        <Section title="Certifications">
          <Bullets items={resume.certifications} />
        </Section>
      ) : null}
    </article>
  );
}
