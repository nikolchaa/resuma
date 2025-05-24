// ResumePDFDocument.tsx
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
} from "@react-pdf/renderer";
import { ResumeData } from "@/lib/resumesStore";
import figtree from "@/assets/fonts/Figtree-Variable.ttf";

Font.register({
  family: "Figtree",
  src: figtree,
});

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontSize: 12,
    fontFamily: "Figtree",
    backgroundColor: "#ffffff",
    color: "#1f2937",
  },
  section: {
    marginBottom: 20,
    paddingBottom: 10,
    borderBottom: "1pt solid #e5e7eb",
  },
  heading: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 8,
    color: "#1f2937",
  },
  label: {
    fontWeight: "bold",
    color: "#374151",
    marginBottom: 2,
  },
  text: {
    marginBottom: 4,
  },
});

export const ResumePDFDocument = ({ data }: { data: ResumeData }) => (
  <Document>
    {/* Page 1: Personal Info */}
    <Page size='A4' style={styles.page}>
      <View style={styles.section}>
        <Text style={styles.heading}>{data.title || "Untitled Resume"}</Text>
        {data.content?.personal && (
          <>
            <Text style={styles.label}>Name:</Text>
            <Text style={styles.text}>{data.content.personal.fullName}</Text>
            <Text style={styles.label}>Email:</Text>
            <Text style={styles.text}>{data.content.personal.email}</Text>
            {data.content.personal.location && (
              <>
                <Text style={styles.label}>Location:</Text>
                <Text style={styles.text}>
                  {data.content.personal.location}
                </Text>
              </>
            )}
          </>
        )}
      </View>
    </Page>

    {/* Page 2: Experience */}
    <Page size='A4' style={styles.page}>
      <View style={styles.section}>
        <Text style={styles.heading}>Experience</Text>
        {data.content?.experience && data.content.experience.length > 0 ? (
          data.content.experience.map((item, index) => (
            <View key={index} style={{ marginBottom: 10 }}>
              <Text style={styles.label}>{item.jobTitle}</Text>
              <Text style={styles.text}>{item.company}</Text>
              <Text style={styles.text}>{item.description}</Text>
            </View>
          ))
        ) : (
          <Text style={styles.text}>No experience listed.</Text>
        )}
      </View>
    </Page>

    {/* Page 3: Projects */}
    <Page size='A4' style={styles.page}>
      <View style={styles.section}>
        <Text style={styles.heading}>Projects</Text>
        {data.content?.projects && data.content.projects.length > 0 ? (
          data.content.projects.map((project, index) => (
            <View key={index} style={{ marginBottom: 10 }}>
              <Text style={styles.label}>{project.name}</Text>
              <Text style={styles.text}>{project.description}</Text>
            </View>
          ))
        ) : (
          <Text style={styles.text}>No projects listed.</Text>
        )}
      </View>
    </Page>
  </Document>
  // this is a simplified version, just for testing purposes
);
