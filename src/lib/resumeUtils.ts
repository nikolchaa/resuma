import { ResumeData } from "@/lib/resumesStore";

export const formatResumeTxt = (content: ResumeData["content"]): string => {
  let textOutput = "";

  // === Personal ===
  if (content.personal) {
    textOutput += "===============================\n";
    textOutput += "          PERSONAL\n";
    textOutput += "===============================\n";

    const { fullName, location, email, phone, website, github, linkedin } =
      content.personal;
    if (fullName) textOutput += `Name: ${fullName}\n`;
    if (location) textOutput += `Location: ${location}\n`;
    if (email) textOutput += `Email: ${email}\n`;
    if (phone) textOutput += `Phone: ${phone}\n`;
    if (website) textOutput += `Website: ${website}\n`;
    if (linkedin) textOutput += `LinkedIn: ${linkedin}\n`;
    if (github) textOutput += `GitHub: ${github}\n`;
    textOutput += "\n";
  }

  // === Education ===
  if (content.education?.length) {
    textOutput += "===============================\n";
    textOutput += "          EDUCATION\n";
    textOutput += "===============================\n";

    content.education.forEach((edu) => {
      if (edu.degree) textOutput += `${edu.degree}\n`;
      if (edu.school || edu.location)
        textOutput += `${edu.school || ""}${
          edu.location ? `, ${edu.location}` : ""
        }\n`;
      if (edu.date?.from || edu.date?.to)
        textOutput += `${edu.date.from || ""}${
          edu.date.to ? ` – ${edu.date.to}` : ""
        }\n`;
      if (edu.gpa) textOutput += `GPA: ${edu.gpa}\n`;
      if (edu.courses?.length)
        textOutput += `Courses: ${edu.courses.join(", ")}\n`;
      textOutput += "\n";
    });
  }

  // === Experience ===
  if (content.experience?.length) {
    textOutput += "===============================\n";
    textOutput += "         EXPERIENCE\n";
    textOutput += "===============================\n";

    content.experience.forEach((exp) => {
      if (exp.jobTitle) textOutput += `${exp.jobTitle}\n`;
      if (exp.company || exp.location)
        textOutput += `${exp.company || ""}${
          exp.location ? `, ${exp.location}` : ""
        }\n`;
      if (exp.date?.from || exp.date?.to)
        textOutput += `${exp.date.from || ""}${
          exp.date.to ? ` – ${exp.date.to}` : ""
        }\n`;
      if (exp.description) textOutput += `${exp.description}\n`;
      if (exp.notes?.length) {
        textOutput += "Notes:\n";
        exp.notes.forEach((note) => (textOutput += `- ${note}\n`));
      }
      textOutput += "\n";
    });
  }

  // === Projects ===
  if (content.projects?.length) {
    textOutput += "===============================\n";
    textOutput += "          PROJECTS\n";
    textOutput += "===============================\n";

    content.projects.forEach((proj) => {
      if (proj.name) textOutput += `${proj.name}\n`;
      if (proj.date?.from) textOutput += `${proj.date.from}\n`;
      if (proj.description) textOutput += `${proj.description}\n`;
      if (proj.technologies?.length)
        textOutput += `Technologies: ${proj.technologies.join(", ")}\n`;
      if (proj.link) textOutput += `Link: ${proj.link}\n`;
      textOutput += "\n";
    });
  }

  // === Skills ===
  if (content.skills?.length) {
    textOutput += "===============================\n";
    textOutput += "          SKILLS\n";
    textOutput += "===============================\n";

    content.skills.forEach((skill) => {
      if (skill.category && skill.items?.length) {
        textOutput += `${skill.category}: ${skill.items.join(", ")}\n`;
      }
    });
    textOutput += "\n";
  }

  // === Awards ===
  if (content.awards?.length) {
    textOutput += "===============================\n";
    textOutput += "          AWARDS\n";
    textOutput += "===============================\n";

    content.awards.forEach((award) => {
      if (award.title) textOutput += `${award.title}\n`;
      if (award.organizer || award.location)
        textOutput += `${award.organizer || ""}${
          award.location ? `, ${award.location}` : ""
        }\n`;
      if (award.date?.from) textOutput += `${award.date.from}\n`;
      if (award.description) textOutput += `${award.description}\n`;
      textOutput += "\n";
    });
  }

  return textOutput;
};

export const cleanSpecialCharacters = (text: string): string => {
  const manualMap: Record<string, string> = {
    đ: "dj",
    Đ: "Dj",
  };

  return text
    .replace(/[đĐ]/g, (match) => manualMap[match] || match)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
};
