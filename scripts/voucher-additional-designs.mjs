// Image-reference designs are separate from the unchanged thirty-page PDF.
const widthMm = Number((5.6 * 25.4).toFixed(2));
const heightMm = Number((8.5 * 25.4).toFixed(2));
const name = "ইসলাম কম্পিউটার্স";

export const additionalDesigns = {
  version: 1,
  printSizes: [{ id: 20, widthMm: 142.24, heightMm: 210.82, label: "৫.৬ × ৮.৩ ইঞ্চি" }],
  templates: [
    {
      id: 31,
      page: 31,
      name,
      variant: "৫.৬ × ৮.৫ ইঞ্চি; এক কপি",
      copies: 1,
      rotation: 0,
      pageWidthMm: 210,
      pageHeightMm: 297,
      voucher: { widthMm, heightMm },
      source: {
        kind: "image",
        file: "Islam Coputer.jpg",
        sha256: "8dd79e96c9d72fd8b4c0483e008170194df7a2eb3e50e8e048ceb018045058fd",
      },
    },
  ],
  pages: [
    {
      id: 31,
      templateId: 31,
      name,
      pageWidthMm: 210,
      pageHeightMm: 297,
      copies: [
        {
          leftMm: (210 - widthMm) / 2,
          topMm: (297 - heightMm) / 2,
          widthMm,
          heightMm,
          rotation: 0,
        },
      ],
    },
  ],
  logos: [
    {
      id: "islam-computers",
      src: "/voucher-assets/logos/islam-computers.png",
      kind: "logo",
      selector: ".logo-islam-computers",
      targetPages: [31],
      width: 135,
      height: 156,
      sha256: "0ec441153a5412c730bfd71315eaade9e4c98171e3e8f85099ff557163706d14",
      crop: {
        space: "source-image",
        bounds: [87, 111, 222, 267],
        sourceWidth: 1686,
        sourceHeight: 2554,
      },
    },
  ],
};
