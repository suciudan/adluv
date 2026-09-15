import { ImageResponse } from "next/og";

import { appConfig } from "@adluv/config";

export const alt = `${appConfig.name} social preview`;
export const contentType = "image/png";
export const size = {
  width: 1200,
  height: 630,
};

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          alignItems: "stretch",
          background: "#09090f",
          color: "white",
          display: "flex",
          height: "100%",
          padding: "56px",
          position: "relative",
          width: "100%",
        }}
      >
        <div
          style={{
            background:
              "radial-gradient(circle at top left, rgba(139, 92, 246, 0.32), transparent 34%), linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.01))",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: "36px",
            display: "flex",
            flex: 1,
            flexDirection: "column",
            justifyContent: "space-between",
            overflow: "hidden",
            padding: "56px",
            position: "relative",
          }}
        >
          <div
            style={{
              alignItems: "center",
              display: "flex",
              gap: "18px",
            }}
          >
            <div
              style={{
                alignItems: "center",
                background: "rgba(139, 92, 246, 0.12)",
                borderRadius: "24px",
                display: "flex",
                height: "72px",
                justifyContent: "center",
                width: "72px",
              }}
            >
              <div
                style={{
                  background: "#8b5cf6",
                  borderRadius: "999px",
                  display: "flex",
                  height: "18px",
                  width: "18px",
                }}
              />
            </div>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "10px",
              }}
            >
              <div
                style={{
                  color: "rgba(255,255,255,0.72)",
                  display: "flex",
                  fontSize: "26px",
                  fontWeight: 500,
                  letterSpacing: "0.02em",
                  textTransform: "uppercase",
                }}
              >
                {appConfig.name}
              </div>
              <div
                style={{
                  display: "flex",
                  fontSize: "72px",
                  lineHeight: 1,
                }}
              >
                AI-native ad intelligence
              </div>
            </div>
          </div>

          <div
            style={{
              color: "rgba(255,255,255,0.72)",
              display: "flex",
              fontSize: "34px",
              lineHeight: 1.35,
              maxWidth: "920px",
            }}
          >
            {appConfig.tagline}
          </div>

          <div
            style={{
              alignItems: "center",
              display: "flex",
              gap: "16px",
            }}
          >
            {["LinkedIn", "Meta", "Google"].map((label) => (
              <div
                key={label}
                style={{
                  alignItems: "center",
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: "999px",
                  color: "rgba(255,255,255,0.82)",
                  display: "flex",
                  fontSize: "24px",
                  padding: "14px 22px",
                }}
              >
                {label}
              </div>
            ))}
          </div>
        </div>
      </div>
    ),
    size,
  );
}
