import { createCn } from "cn/config";

/**
 * Class merger that knows the brand type scale, so `text-display-sm` is merged
 * as a font size and not mistaken for a colour (which would drop `text-ink`).
 */
export const cn = createCn({
  extend: {
    classGroups: {
      "font-size": [
        { text: ["display-sm", "display-md", "display-lg", "display-xl"] },
      ],
      "font-weight": [{ font: ["regular"] }],
    },
  },
});
