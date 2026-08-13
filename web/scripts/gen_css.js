const config = {
colors: {
"on-tertiary-fixed": "#1d1b1a",
"surface-container-high": "#e8e8e8",
"inverse-primary": "#c8c6c5",
"on-background": "#1a1c1c",
"on-tertiary-container": "#868381",
"on-primary-fixed-variant": "#474646",
"on-error-container": "#93000a",
"on-secondary": "#ffffff",
"error-container": "#ffdad6",
"primary-fixed-dim": "#c8c6c5",
"on-secondary-container": "#63646c",
"on-primary": "#ffffff",
"on-surface": "#1a1c1c",
"on-secondary-fixed-variant": "#46464e",
"on-tertiary-fixed-variant": "#484645",
"surface-variant": "#e2e2e2",
"surface-dim": "#dadada",
"on-secondary-fixed": "#1a1b22",
"primary-fixed": "#e5e2e1",
"surface-tint": "#5f5e5e",
"secondary": "#5d5e66",
"secondary-fixed-dim": "#c6c5cf",
"inverse-on-surface": "#f0f1f1",
"on-primary-container": "#858383",
"tertiary-container": "#1d1b1a",
"surface-container": "#eeeeee",
"surface": "#f9f9f9",
"surface-container-lowest": "#ffffff",
"secondary-fixed": "#e3e1ec",
"surface-bright": "#f9f9f9",
"background": "#f9f9f9",
"primary": "#000000",
"error": "#ba1a1a",
"on-error": "#ffffff",
"on-surface-variant": "#444748",
"on-primary-fixed": "#1c1b1b",
"inverse-surface": "#2f3131",
"surface-container-highest": "#e2e2e2",
"outline-variant": "#c4c7c7",
"secondary-container": "#e3e1ec",
"outline": "#747878",
"on-tertiary": "#ffffff",
"tertiary": "#000000",
"primary-container": "#1c1b1b",
"tertiary-fixed-dim": "#cac6c3",
"tertiary-fixed": "#e6e1df",
"surface-container-low": "#f3f3f3"
},
spacing: {
"stack-sm": "8px",
"margin-desktop": "40px",
"stack-md": "16px",
"gutter": "16px",
"margin-mobile": "20px",
"container-max": "1200px",
"stack-lg": "32px"
},
fontFamily: {
"headline-md": "Fraunces",
"body-md": "Inter",
"display-lg": "Fraunces",
"description": "Inter",
"body-lg": "Inter",
"display-lg-mobile": "Fraunces",
"label-caps": "Inter"
},
fontSize: {
"headline-md": ["24px", { lineHeight: "1.3", fontWeight: "500" }],
"body-md": ["16px", { lineHeight: "1.5", fontWeight: "400" }],
"display-lg": ["48px", { lineHeight: "1.1", letterSpacing: "-0.02em", fontWeight: "600" }],
"description": ["14px", { lineHeight: "1.5", fontWeight: "400" }],
"body-lg": ["18px", { lineHeight: "1.6", fontWeight: "400" }],
"display-lg-mobile": ["32px", { lineHeight: "1.2", letterSpacing: "-0.01em", fontWeight: "600" }],
"label-caps": ["12px", { lineHeight: "1.2", letterSpacing: "0.05em", fontWeight: "600" }]
}
};
let out = '';
for (const [k,v] of Object.entries(config.colors)) out += `  --color-${k}: ${v};\n`;
for (const [k,v] of Object.entries(config.spacing)) out += `  --spacing-${k}: ${v};\n`;
for (const [k,v] of Object.entries(config.fontFamily)) out += `  --font-${k}: "${v}", sans-serif;\n`;
for (const [k,v] of Object.entries(config.fontSize)) {
  out += `  --text-${k}: ${v[0]};\n`;
  out += `  --text-${k}--line-height: ${v[1].lineHeight};\n`;
  out += `  --text-${k}--font-weight: ${v[1].fontWeight};\n`;
  if (v[1].letterSpacing) out += `  --text-${k}--letter-spacing: ${v[1].letterSpacing};\n`;
}
console.log(out);
