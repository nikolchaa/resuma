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

export const buzzwords = [
  "synergy",
  "leverage",
  "disrupt",
  "innovative",
  "passionate",
  "strategic",
  "dynamic",
  "driven",
  "result-oriented",
  "impactful",
  "visionary",
  "forward-thinking",
  "team player",
  "out-of-the-box",
  "motivated",
  "detail-oriented",
  "fast-paced",
  "multi-task",
];

export const detectBuzzwords = (
  content: ResumeData["content"]
): { word: string; count: number }[] => {
  const text = formatResumeTxt(content).toLowerCase();

  const results: { word: string; count: number }[] = [];

  buzzwords.forEach((buzzword) => {
    const regex = new RegExp(`\\b${buzzword}\\b`, "gi");
    const matches = text.match(regex);
    if (matches?.length) {
      results.push({ word: buzzword, count: matches.length });
    }
  });

  return results;
};

export const knownKeywordMap: Record<string, string> = {
  // === TECH SKILLS ===
  react: "react",
  reactjs: "react",
  javascript: "javascript",
  js: "javascript",
  typescript: "typescript",
  ts: "typescript",
  node: "node",
  nodejs: "node",
  express: "express",
  docker: "docker",
  kubernetes: "kubernetes",
  k8s: "kubernetes",
  aws: "aws",
  "amazon web services": "aws",
  azure: "azure",
  gcp: "gcp",
  "google cloud": "gcp",
  tauri: "tauri",
  tailwind: "tailwind",
  tailwindcss: "tailwind",
  html: "html",
  css: "css",
  scss: "css",
  sass: "css",
  graphql: "graphql",
  api: "api",
  rest: "api",
  restful: "api",
  soap: "api",
  postman: "api",
  nextjs: "nextjs",
  next: "nextjs",
  remix: "remix",
  vite: "vite",
  webpack: "webpack",
  babel: "babel",
  python: "python",
  pandas: "python",
  numpy: "python",
  django: "django",
  flask: "flask",
  fastapi: "fastapi",
  java: "java",
  spring: "spring",
  "spring boot": "spring",
  springboot: "spring",
  kotlin: "kotlin",
  rust: "rust",
  go: "go",
  golang: "go",
  cplusplus: "c++",
  "c++": "c++",
  cpp: "c++",
  "c#": "c#",
  "c sharp": "c#",
  dotnet: ".net",
  ".net": ".net",
  sql: "sql",
  mysql: "sql",
  postgresql: "postgresql",
  postgres: "postgresql",
  nosql: "nosql",
  mongodb: "mongodb",
  mongo: "mongodb",
  redis: "redis",
  firebase: "firebase",
  supabase: "supabase",
  prisma: "prisma",
  git: "git",
  github: "github",
  gitlab: "gitlab",
  bitbucket: "bitbucket",
  vscode: "vscode",
  "visual studio code": "vscode",
  figma: "figma",
  "ui design": "figma",
  ux: "ux",
  "user experience": "ux",
  "user interface": "ux",
  seo: "seo",
  ai: "ai",
  artificial: "ai",
  ml: "machine learning",
  "machine learning": "machine learning",
  "deep learning": "machine learning",
  tensorflow: "machine learning",
  pytorch: "machine learning",
  huggingface: "huggingface",
  openai: "openai",
  chatgpt: "openai",
  gpt4: "openai",
  llama: "llama",
  "llama.cpp": "llama",
  ollama: "ollama",
  mistral: "mistral",
  falcon: "falcon",
  langchain: "langchain",
  scikit: "python",
  jupyter: "python",

  // === SOFT SKILLS ===
  leadership: "leadership",
  teamwork: "teamwork",
  "team work": "teamwork",
  "team-work": "teamwork",
  collaboration: "collaboration",
  communication: "communication",
  presentation: "presentation",
  publicspeaking: "presentation",
  "public speaking": "presentation",
  writing: "writing",
  documentation: "documentation",
  "technical writing": "documentation",
  "problem-solving": "problem-solving",
  "problem solving": "problem-solving",
  "critical thinking": "critical thinking",
  "strategic thinking": "strategic thinking",
  initiative: "initiative",
  responsibility: "responsibility",
  accountability: "responsibility",
  adaptability: "adaptability",
  flexibility: "adaptability",
  "time management": "time management",
  organization: "organization",
  organized: "organization",
  planning: "organization",
  prioritization: "organization",
  multitask: "multi-task",
  "multi-task": "multi-task",
  multitasking: "multi-task",
  creativity: "creativity",
  innovation: "creativity",
  curiosity: "creativity",
  motivation: "motivation",
  driven: "motivation",
  proactive: "motivation",
  "self-motivated": "motivation",
  independent: "motivation",
  "fast-paced": "fast-paced",
  "fast paced": "fast-paced",
  "high-paced": "fast-paced",
  "detail-oriented": "detail-oriented",
  "detail oriented": "detail-oriented",
  "attention to detail": "detail-oriented",
  empathy: "empathy",
  compassion: "empathy",
  patience: "empathy",
  learning: "learning",
  growth: "learning",
  mentoring: "mentoring",
  coaching: "mentoring",
  teaching: "mentoring",
  negotiation: "negotiation",
  decisionmaking: "decision making",
  "decision making": "decision making",
  analytical: "analytical",
  research: "research",
  resourceful: "resourceful",
  dependability: "reliability",
  reliability: "reliability",
  autonomy: "autonomy",
  independence: "autonomy",
};

export const matchATSKeywords = (
  content: ResumeData["content"],
  jobDescription: string
): { present: string[]; missing: string[] } => {
  const resumeText = formatResumeTxt(content).toLowerCase();
  const jobWords = jobDescription
    .toLowerCase()
    .split(/\W+/)
    .filter((word) => word.length > 2);

  const presentKeywordsSet = new Set<string>();

  // Map job words to canonical forms
  jobWords.forEach((word) => {
    const canonical = knownKeywordMap[word];
    if (canonical) presentKeywordsSet.add(canonical);
  });

  const present: string[] = [];
  const missing: string[] = [];

  presentKeywordsSet.forEach((keyword) => {
    const regex = new RegExp(`\\b${keyword}\\b`, "gi");
    if (resumeText.match(regex)) {
      present.push(keyword);
    } else {
      missing.push(keyword);
    }
  });

  return { present, missing };
};
