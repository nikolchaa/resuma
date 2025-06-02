import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
} from "@react-pdf/renderer";
import { ResumeData } from "@/lib/resumesStore";
import figtree_bold from "@/assets/fonts/Figtree-Bold.ttf";
import figtree_light from "@/assets/fonts/Figtree-Light.ttf";

Font.register({
  family: "Figtree",
  src: figtree_bold,
  fontWeight: "bold",
});

Font.register({
  family: "Figtree",
  src: figtree_light,
  fontWeight: "normal",
});

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontSize: 11,
    fontFamily: "Figtree",
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

export const ResumePreview = ({
  data,
  format,
}: {
  data: ResumeData;
  format?: "A4" | "LETTER";
}) => {
  return (
    <Document
      title={data.title || "Resume"}
      author={data.content?.personal?.fullName || "Unknown"}
      subject='Resume'
      creator='Resuma'
      producer='Resuma PDF Renderer'
    >
      <Page size={format ?? "A4"} style={styles.page}>
        {/* Header */}
        {data.content?.personal && (
          <View>
            <Text style={styles.name}>{data.content.personal.fullName}</Text>
            <Text style={styles.contact}>
              {[
                data.content.personal.email,
                data.content.personal.location,
                data.content.personal.phone,
              ]
                .filter((item) => item && item.trim() !== "")
                .join(" | ")}
            </Text>
            {(data.content.personal.linkedin ||
              data.content.personal.github ||
              data.content.personal.website) && (
              <Text style={styles.contact}>
                {[
                  data.content.personal.linkedin,
                  data.content.personal.github,
                  data.content.personal.website,
                ]
                  .filter((item) => item && item.trim() !== "")
                  .join(" | ")}
              </Text>
            )}
          </View>
        )}

        {/* Education */}
        {data.content?.education && data.content.education.length > 0 && (
          <View>
            <Text style={styles.sectionHeader}>Education</Text>
            {data.content.education.map((edu, idx) => (
              <View key={idx} style={styles.subItem}>
                <View style={styles.row}>
                  <Text style={styles.bold}>{edu.degree}</Text>
                  <Text style={styles.bold}>{edu.school}</Text>
                </View>
                <Text style={styles.small}>
                  {edu.location} | {edu.date.from} – {edu.date.to || "Present"}
                </Text>
                {edu.gpa && <Text style={styles.small}>GPA: {edu.gpa}</Text>}
                {edu.courses && edu.courses.length > 0 && (
                  <Text style={styles.small}>
                    Courses: {edu.courses.join(", ")}
                  </Text>
                )}
              </View>
            ))}
          </View>
        )}

        {/* Experience */}
        {data.content?.experience && data.content.experience.length > 0 && (
          <View>
            <Text style={styles.sectionHeader}>Experience</Text>
            {data.content.experience.map((exp, idx) => (
              <View key={idx} style={styles.subItem}>
                <View style={styles.row}>
                  <Text style={styles.bold}>{exp.jobTitle}</Text>
                  <Text style={styles.bold}>{exp.company}</Text>
                </View>
                <Text style={styles.small}>
                  {exp.location} | {exp.date.from} – {exp.date.to || "Present"}
                </Text>
                {exp.description && (
                  <Text style={styles.text}>{exp.description}</Text>
                )}
                {exp.notes && exp.notes.length > 0 && (
                  <Text style={styles.text}>• {exp.notes.join("\n• ")}</Text>
                )}
              </View>
            ))}
          </View>
        )}

        {/* Projects */}
        {data.content?.projects && data.content.projects.length > 0 && (
          <View>
            <Text style={styles.sectionHeader}>Projects</Text>
            {data.content.projects.map((proj, idx) => (
              <View key={idx} style={styles.subItem}>
                <Text style={styles.bold}>{proj.name}</Text>
                {proj.link && (
                  <Text style={styles.small}>
                    {proj.date.from && `${proj.date.from} |`} {proj.link}
                  </Text>
                )}
                <Text style={styles.text}>{proj.description}</Text>
                {proj.technologies && proj.technologies.length > 0 && (
                  <Text style={styles.small}>
                    Tech: {proj.technologies.join(", ")}
                  </Text>
                )}
              </View>
            ))}
          </View>
        )}

        {/* Awards */}
        {data.content?.awards && data.content.awards.length > 0 && (
          <View>
            <Text style={styles.sectionHeader}>Awards</Text>
            {data.content.awards.map((award, idx) => (
              <View key={idx} style={styles.subItem}>
                <View style={styles.row}>
                  <Text style={styles.bold}>{award.title}</Text>
                  <Text style={styles.bold}>
                    {award.organizer} | {award.location}
                  </Text>
                </View>
                <Text style={styles.small}>{award.date.from}</Text>
                {award.description && (
                  <Text style={styles.text}>{award.description}</Text>
                )}
              </View>
            ))}
          </View>
        )}

        {/* Skills */}
        {data.content?.skills && data.content.skills.length > 0 && (
          <View>
            <Text style={styles.sectionHeader}>Skills</Text>
            {data.content.skills.map((group, idx) => (
              <View key={idx} style={styles.subItem}>
                <Text style={styles.bold}>{group.category}</Text>
                <Text style={styles.small}>{group.items.join(", ")}</Text>
              </View>
            ))}
          </View>
        )}
      </Page>
    </Document>
  );
};
