import { Font } from "@react-pdf/renderer";
import figtree_bold from "@/assets/fonts/Figtree-Bold.ttf";
import figtree_light from "@/assets/fonts/Figtree-Light.ttf";
import inter_light from "@/assets/fonts/Inter-Light.ttf";
import inter_bold from "@/assets/fonts/Inter-Bold.ttf";
import space_grotesk_light from "@/assets/fonts/SpaceGrotesk-Light.ttf";
import space_grotesk_bold from "@/assets/fonts/SpaceGrotesk-Bold.ttf";

// Figtree
Font.register({
  family: "Figtree",
  src: figtree_light,
  fontWeight: "normal",
});
Font.register({
  family: "Figtree",
  src: figtree_bold,
  fontWeight: "bold",
});

// Inter
Font.register({
  family: "Inter",
  src: inter_light,
  fontWeight: "normal",
});
Font.register({
  family: "Inter",
  src: inter_bold,
  fontWeight: "bold",
});

// Space Grotesk
Font.register({
  family: "Space Grotesk",
  src: space_grotesk_light,
  fontWeight: "normal",
});
Font.register({
  family: "Space Grotesk",
  src: space_grotesk_bold,
  fontWeight: "bold",
});
