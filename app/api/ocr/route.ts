import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/lib/supabase"

function parseOcrText(text: string) {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean)

  let extracted_quantity: string | null = null
  let extracted_fee: string | null = null
  let extracted_shipper: string | null = null
  let extracted_block: string | null = null

  for (const line of lines) {
    if ((line.includes("₹") || /Rs\.?\s*\d/i.test(line)) && !extracted_fee) {
      extracted_fee = line
    } else if (/^\d+$/.test(line.replace(/[,\s]/g, "")) && !extracted_quantity) {
      extracted_quantity = line
    } else if (/BLK|BLOCK|blk|block/i.test(line) && !extracted_block) {
      extracted_block = line
    } else if (!extracted_shipper) {
      extracted_shipper = line
    } else if (!extracted_block) {
      extracted_block = line
    }
  }

  return { extracted_shipper, extracted_block, extracted_quantity, extracted_fee }
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { image, language = "en" } = body

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: "API key not configured" }, { status: 500 })
  }

  let rawText = ""
  try {
    const visionRes = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requests: [
            {
              image: { content: image },
              features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
              imageContext: { languageHints: ["hi", "en"] },
            },
          ],
        }),
      }
    )
    const visionData = await visionRes.json()
    rawText = visionData.responses?.[0]?.fullTextAnnotation?.text ?? ""
  } catch {
    return NextResponse.json({ error: "Vision API call failed" }, { status: 502 })
  }

  const parsed = parseOcrText(rawText)

  const { data, error } = await supabase
    .from("ocr_logs")
    .insert({ raw_text: rawText, language, ...parsed })
    .select("id")
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ id: data.id, raw_text: rawText, ...parsed })
}
