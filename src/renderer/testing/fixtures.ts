import fs from "fs";
import path from "path";
import type { ResumeData } from "@/lib/resumesStore";
import { FONT_FILES, FontSet } from "../engine/fonts";

/** Loads the app's TTFs from disk (tests run in Node). */
export function loadTestFonts(): FontSet {
  const set = new FontSet();
  for (const f of FONT_FILES) {
    const bytes = fs.readFileSync(path.resolve(__dirname, "../../assets/fonts", f.file));
    set.add(f.family, f.weight, new Uint8Array(bytes));
  }
  return set;
}

export const sampleResume = (): ResumeData => ({
  id: "jane",
  title: "Jane Doe — Engineer",
  updated: "2026-11-23T00:00:00.000Z",
  theme: "professional",
  font: "figtree",
  content: {
    personal: {
      fullName: "Jane Marie Doe",
      email: "jane@doe.dev",
      location: "Belgrade, Serbia",
      phone: "+381 60 123 4567",
      website: "jane.dev",
      linkedin: "linkedin.com/in/janedoe",
      github: "",
    },
    education: [
      {
        school: "University of Belgrade",
        degree: "BSc Computer Science",
        location: "Belgrade",
        gpa: "9.1",
        date: { from: "2015", to: "2019" },
        courses: ["Algorithms", "Compilers", ""],
      },
    ],
    experience: [
      {
        jobTitle: "Software Engineer",
        company: "Acme",
        location: "",
        description: "Built the billing platform used by 2,000 customers; cut invoice time by 40%.",
        date: { from: "2021-03" },
        notes: ["Led a team of 4 engineers.", "Migrated payments to Rust."],
      },
    ],
    projects: [
      {
        name: "Resuma",
        link: "github.com/nikolchaa/resuma",
        date: { from: "2025" },
        description: "Open-source resume builder.",
        technologies: ["Tauri", "React"],
      },
    ],
    skills: [{ category: "Languages", items: ["TypeScript", "Rust", "Go"] }],
    awards: [
      {
        title: "Hackathon winner",
        organizer: "Startit",
        date: { from: "2020" },
        description: "First place out of 40 teams.",
        location: "Novi Sad",
      },
    ],
  },
});
