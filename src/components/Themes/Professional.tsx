import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import { ResumeData } from "@/lib/resumesStore";
import "@/lib/pdfFonts";

export const Professional = ({
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
      color: "#1f2937",
    },
    name: {
      fontSize: 20,
      textTransform: "uppercase",
      fontWeight: "bold",
      marginBottom: 4,
    },
    contact: {
      fontSize: 10,
      color: "#3f434c",
      marginBottom: 4,
    },
    sectionHeader: {
      fontSize: 12,
      fontWeight: "bold",
      textTransform: "uppercase",
      marginTop: 12,
      marginBottom: 6,
      borderBottomWidth: 1,
      borderColor: "#d1d5db",
      paddingBottom: 2,
    },
    row: {
      flexDirection: "row",
      justifyContent: "space-between",
      marginBottom: 2,
    },
    bold: {
      fontWeight: "bold",
    },
    text: {
      fontSize: 10,
      marginBottom: 2,
    },
    small: {
      fontSize: 9,
      color: "#3f434c",
    },
    subItem: {
      marginBottom: 4,
    },
  });

  return (
    <Document
      title={data.title?.trim() || "Resume"}
      author={data.content?.personal?.fullName?.trim() || "Unknown"}
      subject="Resume"
      creator="Resuma"
      producer="Resuma PDF Renderer"
    >
      <Page size={format ?? "A4"} style={styles.page}>
        {/* Personal */}
        {data.content?.personal && (
          <View>
            <Text style={styles.name}>
              {data.content.personal.fullName?.trim() || ""}
            </Text>
            <Text style={styles.contact}>
              {[data.content.personal.email, data.content.personal.location, data.content.personal.phone]
                .map((item) => item?.trim())
                .filter((item) => item)
                .join(" | ")}
            </Text>

            {(data.content.personal.linkedin ||
              data.content.personal.github ||
              data.content.personal.website) && (
              <Text style={styles.contact}>
                {[data.content.personal.linkedin, data.content.personal.github, data.content.personal.website]
                  .map((item) => item?.trim())
                  .filter((item) => item)
                  .join(" | ")}
              </Text>
            )}
          </View>
        )}

        {/* Education */}
        {data.content?.education?.length > 0 && (
          <View>
            <Text style={styles.sectionHeader}>Education</Text>
            {data.content.education.map((edu, idx) => (
              <View key={idx} style={styles.subItem}>
                <View style={styles.row}>
                  <Text style={styles.bold}>{edu.degree?.trim() || ""}</Text>
                  <Text style={styles.bold}>{edu.school?.trim() || ""}</Text>
                </View>
                <Text style={styles.small}>
                  {(edu.location?.trim() || "") +
                    " | " +
                    (edu.date?.from?.trim() || "") +
                    " – " +
                    (edu.date?.to?.trim() || "Present")}
                </Text>
                {edu.gpa && (
                  <Text style={styles.small}>GPA: {edu.gpa?.trim()}</Text>
                )}
                {edu.courses && edu.courses.length > 0 && (
                  <Text style={styles.small}>
                    Courses:{" "}
                    {edu.courses.map((c) => c?.trim()).filter(Boolean).join(", ")}
                  </Text>
                )}
              </View>
            ))}
          </View>
        )}

        {/* Experience */}
        {data.content?.experience?.length > 0 && (
          <View>
            <Text style={styles.sectionHeader}>Experience</Text>
            {data.content.experience.map((exp, idx) => (
              <View key={idx} style={styles.subItem}>
                <View style={styles.row}>
                  <Text style={styles.bold}>{exp.jobTitle?.trim() || ""}</Text>
                  <Text style={styles.bold}>{exp.company?.trim() || ""}</Text>
                </View>
                <Text style={styles.small}>
                  {(exp.location?.trim() || "") +
                    " | " +
                    (exp.date?.from?.trim() || "") +
                    " – " +
                    (exp.date?.to?.trim() || "Present")}
                </Text>
                {exp.description && (
                  <Text style={styles.text}>{exp.description?.trim()}</Text>
                )}
                {exp.notes && exp.notes.length > 0 && (
                  <Text style={styles.text}>
                    • {exp.notes.map((n) => n?.trim()).filter(Boolean).join("\n• ")}
                  </Text>
                )}
              </View>
            ))}
          </View>
        )}

        {/* Projects */}
        {data.content?.projects?.length > 0 && (
          <View>
            <Text style={styles.sectionHeader}>Projects</Text>
            {data.content.projects.map((proj, idx) => (
              <View key={idx} style={styles.subItem}>
                <Text style={styles.bold}>{proj.name?.trim() || ""}</Text>
                {(proj.link || proj.date?.from) && (
                  <Text style={styles.small}>
                    {proj.date?.from?.trim()
                      ? `${proj.date.from.trim()} | `
                      : ""}
                    {proj.link?.trim() || ""}
                  </Text>
                )}
                <Text style={styles.text}>{proj.description?.trim() || ""}</Text>
                {proj.technologies?.length > 0 && (
                  <Text style={styles.small}>
                    Tech:{" "}
                    {proj.technologies.map((t) => t?.trim()).filter(Boolean).join(", ")}
                  </Text>
                )}
              </View>
            ))}
          </View>
        )}

        {/* Awards */}
        {data.content?.awards?.length > 0 && (
          <View>
            <Text style={styles.sectionHeader}>Awards</Text>
            {data.content.awards.map((award, idx) => (
              <View key={idx} style={styles.subItem}>
                <View style={styles.row}>
                  <Text style={styles.bold}>{award.title?.trim() || ""}</Text>
                  <Text style={styles.bold}>
                    {(award.organizer?.trim() || "") +
                      " | " +
                      (award.location?.trim() || "")}
                  </Text>
                </View>
                <Text style={styles.small}>
                  {award.date?.from?.trim() || ""}
                </Text>
                {award.description && (
                  <Text style={styles.text}>{award.description?.trim()}</Text>
                )}
              </View>
            ))}
          </View>
        )}

        {/* Skills */}
        {data.content?.skills?.length > 0 && (
          <View>
            <Text style={styles.sectionHeader}>Skills</Text>
            {data.content.skills.map((group, idx) => (
              <View key={idx} style={styles.subItem}>
                <Text style={styles.bold}>{group.category?.trim() || ""}</Text>
                <Text style={styles.small}>
                  {group.items.map((i) => i?.trim()).filter(Boolean).join(", ")}
                </Text>
              </View>
            ))}
          </View>
        )}
      </Page>
    </Document>
  );
};
