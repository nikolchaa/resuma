import { ResumeData } from "@/lib/resumesStore";
import { Professional } from "./Themes/Professional";
import { Modern } from "./Themes/Modern";
import { Compact } from "./Themes/Compact";
import { AppLanguage } from "@/lib/i18n";

/***
 *
 *  ResumePreview Component
 *
 *  This component renders a resume preview based on the provided data and theme.
 *  It supports multiple themes, with "professional" being the default.
 *
 *  This way, more themes can be added in the future without modifying this component.
 *
 * ***/

export const ResumePreview = ({
  data,
  format,
  language = "en",
}: {
  data: ResumeData;
  format?: "A4" | "LETTER";
  language?: AppLanguage;
}) => {
  const theme = data.theme ?? "professional";

  switch (theme) {
    case "professional":
      return <Professional data={data} format={format} language={language} />;
    case "modern":
      return <Modern data={data} format={format} language={language} />;
    case "compact":
      return <Compact data={data} format={format} language={language} />;
    default:
      return <Professional data={data} format={format} language={language} />;
  }
};
