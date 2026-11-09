// User-selected print dimensions override the reference measurements without
// changing the original PDF catalogue or its saved editable field identifiers.
export function applyPrintSizes(templates, pages, preferences = []) {
  const sizes = new Map(preferences.map((entry) => [entry.id, entry]));
  return {
    templates: templates.map((template) => {
      const size = sizes.get(template.id);
      if (!size) return template;
      return {
        ...template,
        printSize: { widthMm: size.widthMm, heightMm: size.heightMm, label: size.label },
        variant: `${template.variant}; ${size.label}`,
        voucher: { ...template.voucher, widthMm: size.widthMm, heightMm: size.heightMm },
      };
    }),
    pages: pages.map((page) => {
      const size = sizes.get(page.id);
      if (!size) return page;
      return {
        ...page,
        copies: page.copies.map((copy) => ({
          ...copy,
          leftMm: (210 - size.widthMm) / 2,
          topMm: (297 - size.heightMm) / 2,
          widthMm: size.widthMm,
          heightMm: size.heightMm,
          rotation: 0,
        })),
      };
    }),
  };
}
