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
    color: "#1f2937", // Tailwind gray-800
  },
  section: {
    marginBottom: 20,
    paddingBottom: 10,
    borderBottom: "1pt solid #e5e7eb", // Tailwind gray-200
  },
  heading: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 8,
    color: "#1f2937",
  },
  label: {
    fontWeight: "bold",
    color: "#374151", // Tailwind gray-700
    marginBottom: 2,
  },
  text: {
    marginBottom: 4,
  },
});

export const ResumePDFDocument = ({ data }: { data: ResumeData }) => (
  <Document>
    <Page size='A4' style={styles.page}>
      <View style={styles.section}>
        <Text style={styles.heading}>{data.title || "Untitled Resume"}</Text>
        {data.content?.personal && (
          <>
            <Text style={styles.label}>Name:</Text>
            <Text style={styles.text}>{data.content.personal.fullName}</Text>
            <Text style={styles.label}>Email:</Text>
            <Text style={styles.text}>{data.content.personal.email}</Text>
            {/* Add more fields as you build */}
          </>
        )}
      </View>
    </Page>
  </Document>
);
