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
      title={data.title?.trim() || "Resume"}
      author={personal.fullName?.trim() || "Unknown"}
      subject='Resume'
      creator='Resuma'
      producer='Resuma PDF Renderer'
    >
      <Page size={format ?? "A4"} style={styles.page}>
        {/* Header */}
        <Text style={styles.name}>{personal.fullName?.trim() || ""}</Text>

        <Text style={styles.contactLine}>
          {[personal.location, personal.phone].map((item, index, array) => {
            const trimmed = item?.trim();
            if (!trimmed) return null;

            const isPhone = index === 1 && /^\+?[0-9()\s\-]+$/.test(trimmed);
            const href = isPhone ? `tel:${trimmed.replace(/\s+/g, "")}` : null;

            return (
              <Text key={index}>
                {href ? (
                  <Link src={href} style={styles.contactLink}>
                    {trimmed}
                  </Link>
                ) : (
                  <Text>{trimmed}</Text>
                )}
                {index < array.length - 1 &&
                  array.slice(index + 1).some((i) => i?.trim()) && (
                    <Text> • </Text>
                  )}
              </Text>
            );
          })}
        </Text>

        <Text style={styles.contactLine}>
          {[
            personal.email,
            personal.website,
            personal.linkedin,
            personal.github,
          ].map((item, index, array) => {
            const trimmed = item?.trim();
            if (!trimmed) return null;

            const isEmail =
              trimmed.includes("@") && !trimmed.startsWith("http");
            const href = isEmail
              ? `mailto:${trimmed}`
              : trimmed.startsWith("http")
              ? trimmed
              : `https://${trimmed}`;

            return (
              <Text key={index}>
                <Link src={href} style={styles.contactLink}>
                  {trimmed}
                </Link>
                {index < array.length - 1 &&
                  array.slice(index + 1).some((i) => i?.trim()) && (
                    <Text> • </Text>
                  )}
              </Text>
            );
          })}
        </Text>

        <View style={styles.hr} />

        {/* Education */}
        {education.length > 0 && (
          <View>
            <Text style={styles.sectionTitle}>Education</Text>
            {education.map((edu, i) => (
              <View key={i} style={styles.sectionItem}>
                <Text style={styles.bold}>
                  {(edu.degree?.trim() || "") +
                    " — " +
                    (edu.school?.trim() || "")}
                </Text>
                <Text style={styles.subText}>
                  {(edu.location?.trim() || "") +
                    " · " +
                    (edu.date?.from?.trim() || "") +
                    " - " +
                    (edu.date?.to?.trim() || "Present")}
                </Text>
                {edu.gpa && (
                  <Text style={styles.subText}>GPA: {edu.gpa?.trim()}</Text>
                )}
                {edu.courses && edu.courses.length > 0 && (
                  <Text style={styles.subText}>
                    Relevant Coursework:{" "}
                    {edu.courses
                      .map((c) => c?.trim())
                      .filter(Boolean)
                      .join(", ")}
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
                  {(exp.jobTitle?.trim() || "") +
                    " — " +
                    (exp.company?.trim() || "")}
                </Text>
                <Text style={styles.subText}>
                  {(exp.location?.trim() || "") +
                    " · " +
                    (exp.date?.from?.trim() || "") +
                    " - " +
                    (exp.date?.to?.trim() || "Present")}
                </Text>
                {exp.description && (
                  <Text style={styles.subText}>
                    {exp.description?.trim() || ""}
                  </Text>
                )}
                {exp.notes && exp.notes.length > 0 && (
                  <View>
                    {exp.notes.map((note, j) => (
                      <Text key={j} style={styles.subText}>
                        • {note?.trim()}
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
                  {proj.name?.trim()}
                  {proj.link && (
                    <Text>
                      {" — "}
                      <Link src={proj.link.trim()} style={styles.contactLink}>
                        {proj.link.trim()}
                      </Link>
                    </Text>
                  )}
                </Text>
                <Text style={styles.subText}>
                  {proj.date?.from?.trim() || ""}
                </Text>
                <Text style={styles.subText}>
                  {proj.description?.trim() || ""}
                </Text>
                {proj.technologies && proj.technologies.length > 0 && (
                  <Text style={styles.subText}>
                    Tech:{" "}
                    {proj.technologies
                      .map((t) => t?.trim())
                      .filter(Boolean)
                      .join(", ")}
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
                  {(award.title?.trim() || "") +
                    " — " +
                    (award.organizer?.trim() || "")}
                </Text>
                <Text style={styles.subText}>
                  {(award.location?.trim() || "") +
                    " · " +
                    (award.date?.from?.trim() || "")}
                </Text>
                <Text style={styles.subText}>
                  {award.description?.trim() || ""}
                </Text>
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
                <Text style={styles.bold}>
                  {skill.category?.trim() || ""}:{" "}
                </Text>
                {skill.items
                  .map((item) => item?.trim())
                  .filter(Boolean)
                  .join(", ")}
              </Text>
            ))}
          </View>
        )}
      </Page>
    </Document>
  );
};
