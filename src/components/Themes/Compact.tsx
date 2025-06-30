import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Link,
} from "@react-pdf/renderer";
import { ResumeData } from "@/lib/resumesStore";
import "@/lib/pdfFonts";

export const Compact = ({
  data,
  format,
}: {
  data: ResumeData;
  format?: "A4" | "LETTER";
}) => {
  const fontFamily =
    data.font === "inter"
      ? "Inter"
      : data.font === "spaceGrotesk"
      ? "Space Grotesk"
      : "Figtree";

  const styles = StyleSheet.create({
    page: {
      padding: 40,
      fontSize: 11,
      fontFamily,
      backgroundColor: "#ffffff",
      color: "#414141",
    },
    name: {
      fontSize: 18,
      fontWeight: "bold",
      textTransform: "uppercase",
      marginBottom: 2,
    },
    contactLine: {
      fontSize: 9,
      marginBottom: 2,
    },
    contactLink: {
      textDecoration: "none",
      color: "#1f2937",
    },
    hr: {
      borderBottomWidth: 1,
      borderBottomColor: "#888888",
      marginTop: 8,
    },
    sectionTitle: {
      fontSize: 14,
      fontWeight: "bold",
      marginTop: 10,
      marginBottom: 4,
      textTransform: "uppercase",
    },
    sectionItem: {
      marginBottom: 6,
    },
    subText: {
      fontSize: 9,
    },
    bold: {
      fontWeight: "bold",
    },
  });

  const { personal, education, experience, projects, skills, awards } =
    data.content;

  return (
    <Document
      title={data.title || "Resume"}
      author={personal.fullName || "Unknown"}
      subject='Resume'
      creator='Resuma'
      producer='Resuma PDF Renderer'
    >
      <Page size={format ?? "A4"} style={styles.page}>
        {/* Header */}
        <Text style={styles.name}>{personal.fullName}</Text>
        <Text style={styles.contactLine}>
          {[personal.location, personal.phone].filter(Boolean).join("  •  ")}
        </Text>

        <Text style={styles.contactLine}>
          {[
            personal.email,
            personal.website,
            personal.linkedin,
            personal.github,
          ]
            .filter(Boolean)
            .map(
              (item, i, arr) => `${item}${i < arr.length - 1 ? "  •  " : ""}`
            )
            .join("")}
        </Text>

        <View style={styles.hr} />

        {/* Education */}
        {education.length > 0 && (
          <View>
            <Text style={styles.sectionTitle}>Education</Text>
            {education.map((edu, i) => (
              <View key={i} style={styles.sectionItem}>
                <Text style={styles.bold}>
                  {edu.degree} — {edu.school}
                </Text>
                <Text style={styles.subText}>
                  {edu.location} · {edu.date.from} - {edu.date.to || "Present"}
                </Text>
                {edu.gpa && <Text style={styles.subText}>GPA: {edu.gpa}</Text>}
                {edu.courses && edu.courses.length > 0 && (
                  <Text style={styles.subText}>
                    Relevant Coursework: {edu.courses.join(", ")}
                  </Text>
                )}
              </View>
            ))}
          </View>
        )}

        {/* Experience */}
        {experience.length > 0 && (
          <View>
            <Text style={styles.sectionTitle}>Experience</Text>
            {experience.map((exp, i) => (
              <View key={i} style={styles.sectionItem}>
                <Text style={styles.bold}>
                  {exp.jobTitle} — {exp.company}
                </Text>
                <Text style={styles.subText}>
                  {exp.location} · {exp.date.from} - {exp.date.to || "Present"}
                </Text>
                <Text style={styles.subText}>{exp.description}</Text>
                {exp.notes && exp.notes.length > 0 && (
                  <View>
                    {exp.notes.map((note, j) => (
                      <Text key={j} style={styles.subText}>
                        • {note}
                      </Text>
                    ))}
                  </View>
                )}
              </View>
            ))}
          </View>
        )}

        {/* Projects */}
        {projects.length > 0 && (
          <View>
            <Text style={styles.sectionTitle}>Projects</Text>
            {projects.map((proj, i) => (
              <View key={i} style={styles.sectionItem}>
                <Text style={styles.bold}>
                  {proj.name}
                  {proj.link && (
                    <Text>
                      {" — "}
                      <Link src={proj.link} style={styles.contactLink}>
                        {proj.link}
                      </Link>
                    </Text>
                  )}
                </Text>
                <Text style={styles.subText}>{proj.date.from}</Text>
                <Text style={styles.subText}>{proj.description}</Text>
                {proj.technologies && proj.technologies.length > 0 && (
                  <Text style={styles.subText}>
                    Tech: {proj.technologies.join(", ")}
                  </Text>
                )}
              </View>
            ))}
          </View>
        )}

        {/* Awards */}
        {awards.length > 0 && (
          <View>
            <Text style={styles.sectionTitle}>Awards</Text>
            {awards.map((award, i) => (
              <View key={i} style={styles.sectionItem}>
                <Text style={styles.bold}>
                  {award.title} — {award.organizer}
                </Text>
                <Text style={styles.subText}>
                  {award.location} · {award.date.from}
                </Text>
                <Text style={styles.subText}>{award.description}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Skills */}
        {skills.length > 0 && (
          <View>
            <Text style={styles.sectionTitle}>Skills</Text>
            {skills.map((skill, i) => (
              <Text key={i} style={styles.subText}>
                <Text style={styles.bold}>{skill.category}: </Text>
                {skill.items.join(", ")}
              </Text>
            ))}
          </View>
        )}
      </Page>
    </Document>
  );
};
