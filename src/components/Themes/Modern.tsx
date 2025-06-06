import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import { ResumeData } from "@/lib/resumesStore";
import "@/lib/pdfFonts";

export const Modern = ({
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
    nameRow: {
      flexDirection: "row",
      justifyContent: "center",
      marginBottom: 4,
    },
    firstName: {
      fontSize: 24,
      fontWeight: "light",
      color: "#5D5D5D",
      textTransform: "uppercase",
    },
    lastName: {
      fontSize: 24,
      fontWeight: "bold",
      color: "#414141",
      marginLeft: 4,
      textTransform: "uppercase",
    },
    location: {
      fontSize: 8,
      color: "#00d9cb",
      fontWeight: "bold",
      textTransform: "uppercase",
      textAlign: "center",
      marginBottom: 3,
    },
    contact: {
      fontSize: 8,
      color: "#999999",
      textAlign: "center",
      marginBottom: 6,
    },
    sectionTitle: {
      fontSize: 14,
      fontWeight: "bold",
      color: "#222222",
      marginTop: 10,
      marginBottom: 4,
      textTransform: "uppercase",
      borderBottomWidth: 1,
      borderColor: "#00d9cb",
      paddingBottom: 2,
    },
    entry: {
      marginBottom: 6,
    },
    entryTitle: {
      fontSize: 10,
      fontWeight: "bold",
      color: "#333333",
    },
    entrySubtitle: {
      fontSize: 9,
      color: "#5D5D5D",
    },
    entryDate: {
      fontSize: 8,
      color: "#5D5D5D",
    },
    entryDescription: {
      fontSize: 9,
      color: "#414141",
      marginTop: 2,
    },
  });

  const { personal, education, experience, projects, awards, skills } =
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
        {/* Personal */}
        <View style={styles.nameRow}>
          <Text style={styles.firstName}>
            {personal.fullName.split(" ")[0]}
          </Text>
          <Text style={styles.lastName}>
            {personal.fullName.split(" ").slice(1).join(" ")}
          </Text>
        </View>
        {personal.location && (
          <Text style={styles.location}>{personal.location}</Text>
        )}
        <Text style={styles.contact}>
          {[
            personal.email,
            personal.phone,
            personal.website,
            personal.linkedin,
            personal.github,
          ]
            .filter(Boolean)
            .join("  |  ")}
        </Text>

        {/* Education */}
        {education.length > 0 && (
          <View>
            <Text style={styles.sectionTitle}>Education</Text>
            {education.map((edu, i) => (
              <View key={i} style={styles.entry}>
                <Text style={styles.entryTitle}>{edu.school}</Text>
                <Text style={styles.entrySubtitle}>
                  {edu.degree} — {edu.location}
                </Text>
                <Text style={styles.entryDate}>
                  {edu.date.from} - {edu.date.to || "Present"}
                </Text>
                {edu.gpa && (
                  <Text style={styles.entryDescription}>GPA: {edu.gpa}</Text>
                )}
                {edu.courses && edu.courses?.length > 0 && (
                  <Text style={styles.entryDescription}>
                    Courses: {edu.courses.join(", ")}
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
              <View key={i} style={styles.entry}>
                <Text style={styles.entryTitle}>{exp.jobTitle}</Text>
                <Text style={styles.entrySubtitle}>
                  {exp.company} — {exp.location}
                </Text>
                <Text style={styles.entryDate}>
                  {exp.date.from} - {exp.date.to || "Present"}
                </Text>
                <Text style={styles.entryDescription}>{exp.description}</Text>
                {exp.notes && exp.notes?.length > 0 && (
                  <Text style={styles.entryDescription}>
                    • {exp.notes.join("\n• ")}
                  </Text>
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
              <View key={i} style={styles.entry}>
                <Text style={styles.entryTitle}>{proj.name}</Text>
                <Text style={styles.entrySubtitle}>
                  {proj.date.from}
                  {proj.link ? ` — ${proj.link}` : ""}
                </Text>
                <Text style={styles.entryDescription}>{proj.description}</Text>
                <Text style={styles.entryDescription}>
                  Tech: {proj.technologies.join(", ")}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Awards */}
        {awards.length > 0 && (
          <View>
            <Text style={styles.sectionTitle}>Awards</Text>
            {awards.map((award, i) => (
              <View key={i} style={styles.entry}>
                <Text style={styles.entryTitle}>{award.title}</Text>
                <Text style={styles.entrySubtitle}>
                  {award.organizer} — {award.location}
                </Text>
                <Text style={styles.entryDate}>{award.date.from}</Text>
                <Text style={styles.entryDescription}>{award.description}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Skills */}
        {skills.length > 0 && (
          <View>
            <Text style={styles.sectionTitle}>Skills</Text>
            {skills.map((skill, i) => (
              <View key={i} style={styles.entry}>
                <Text style={styles.entryTitle}>{skill.category}</Text>
                <Text style={styles.entryDescription}>
                  {skill.items.join(", ")}
                </Text>
              </View>
            ))}
          </View>
        )}
      </Page>
    </Document>
  );
};
