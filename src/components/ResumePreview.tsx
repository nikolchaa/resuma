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
    padding: 30,
    fontSize: 12,
    fontFamily: "Figtree",
  },
  section: {
    marginBottom: 12,
  },
  heading: {
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 6,
  },
  text: {
    marginBottom: 4,
  },
});

export const ResumePDFDocument = ({ data }: { data: ResumeData }) => (
  <Document>
    <Page size={"A4"} style={styles.page}>
      <View style={styles.section}>
        <Text style={styles.heading}>{data.title || "Untitled Resume"}</Text>
        {data.content?.personal && (
          <>
            <Text style={styles.text}>
              Name: {data.content.personal.fullName}
            </Text>
            <Text style={styles.text}>
              Email: {data.content.personal.email}
            </Text>
          </>
        )}
        {/* Add more fields later */}
      </View>
    </Page>
  </Document>
);
