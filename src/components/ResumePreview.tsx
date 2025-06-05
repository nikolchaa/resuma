import { ResumeData } from "@/lib/resumesStore";
import { Professional } from "./Themes/Professional";
import { Modern } from "./Themes/Modern";
import { Compact } from "./Themes/Compact";

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
}: {
  data: ResumeData;
  format?: "A4" | "LETTER";
}) => {
  const theme = data.theme ?? "professional";

  switch (theme) {
    case "professional":
      return <Professional data={data} format={format} />;
    case "modern":
      return <Modern data={data} format={format} />;
    case "compact":
      return <Compact data={data} format={format} />;
    default:
      return <Professional data={data} format={format} />;
  }
};
