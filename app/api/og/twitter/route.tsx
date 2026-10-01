import { ImageResponse } from "@vercel/og";
import { NextRequest } from "next/server";
import React from "react";
import { parseSharePreviewParams } from "@/app/utils/sharePreviewParams";
import { logger } from "@/app/utils/logger";
import { fetchOgArchetypeImage } from "../_lib/ogImageHelper";

const log = logger.child("api:og-twitter");

const CACHE_CONTROL = "public, s-maxage=86400, stale-while-revalidate=604800";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const { username, transactions, persona, topVibe, vibePercentage, archetypeImage } =
      parseSharePreviewParams(searchParams);

    const baseUrl = req.nextUrl.origin;
    const archetypeImageSrc = await fetchOgArchetypeImage(baseUrl, persona, archetypeImage);

    const imageResponse = new ImageResponse(
      (
        <div
          style={{
            height: "100%",
            width: "100%",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "#000000",
            backgroundImage:
              "radial-gradient(circle at 50% 50%, rgba(5, 64, 32, 0.4) 0%, #000000 80%)",
            color: "white",
            fontFamily: "sans-serif",
            padding: "40px",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              width: "100%",
              height: "100%",
              border: "1px solid rgba(255, 255, 255, 0.2)",
              borderRadius: "40px",
              backgroundColor: "rgba(5, 64, 32, 0.1)",
              backgroundImage:
                "linear-gradient(135deg, rgba(5, 64, 32, 0.2) 0%, rgba(0, 0, 0, 0.8) 100%)",
              padding: "40px",
              position: "relative",
              justifyContent: "space-between",
            }}
          >
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", alignItems: "center", marginBottom: "20px" }}>
                <div
                  style={{
                    width: "12px",
                    height: "12px",
                    borderRadius: "50%",
                    backgroundColor: "#054020",
                    marginRight: "16px",
                  }}
                />
                <span
                  style={{
                    fontSize: "14px",
                    fontWeight: 900,
                    letterSpacing: "0.2em",
                    color: "rgba(255,255,255,0.7)",
                  }}
                >
                  STELLAR WRAPPED 2026
                </span>
              </div>
              <h1
                style={{
                  fontSize: "52px",
                  fontWeight: 900,
                  margin: 0,
                  padding: 0,
                  lineHeight: 1.1,
                }}
              >
                @{username}
              </h1>
            </div>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "16px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  gap: "24px",
                  alignItems: "center",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    backgroundColor: "rgba(255, 255, 255, 0.05)",
                    borderRadius: "16px",
                    padding: "20px",
                    border: "1px solid rgba(255, 255, 255, 0.1)",
                    flex: 1,
                  }}
                >
                  <span
                    style={{
                      fontSize: "12px",
                      fontWeight: 700,
                      color: "rgba(255,255,255,0.6)",
                      marginBottom: "8px",
                    }}
                  >
                    TRANSACTIONS
                  </span>
                  <span style={{ fontSize: "32px", fontWeight: 900, lineHeight: 1 }}>
                    {transactions}
                  </span>
                </div>

                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    backgroundColor: "rgba(255, 255, 255, 0.05)",
                    borderRadius: "16px",
                    padding: "20px",
                    border: "1px solid rgba(255, 255, 255, 0.1)",
                    flex: 1,
                  }}
                >
                  <span
                    style={{
                      fontSize: "12px",
                      fontWeight: 700,
                      color: "rgba(255,255,255,0.6)",
                      marginBottom: "8px",
                    }}
                  >
                    TOP VIBE
                  </span>
                  <span style={{ fontSize: "24px", fontWeight: 900, color: "white" }}>
                    {vibePercentage}% {topVibe}
                  </span>
                </div>
              </div>

              {archetypeImageSrc && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "16px",
                    backgroundColor: "rgba(255, 255, 255, 0.05)",
                    borderRadius: "16px",
                    padding: "16px",
                    border: "1px solid rgba(255, 255, 255, 0.1)",
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- Vercel OG image generation (satori) requires plain <img>; Next.js <Image> is not available in edge runtime */}
                  <img
                    src={archetypeImageSrc}
                    alt={persona}
                    width={48}
                    height={48}
                    style={{ borderRadius: "12px", objectFit: "cover" }}
                  />
                  <span style={{ fontSize: "20px", fontWeight: 900, color: "white" }}>
                    {persona}
                  </span>
                </div>
              )}
            </div>

            <span style={{ fontSize: "12px", fontWeight: 900, color: "rgba(255,255,255,0.5)" }}>
              stellar.org/wrapped
            </span>
          </div>
        </div>
      ) as React.ReactElement,
      {
        width: 1200,
        height: 600,
      }
    );

    imageResponse.headers.set("Cache-Control", CACHE_CONTROL);
    return imageResponse;
  } catch (e) {
    if (e instanceof Error) {
      log.error("Twitter OG image generation failed:", e.message);
    }
    return new Response(`Failed to generate the image`, { status: 500 });
  }
}
