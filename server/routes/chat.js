// routes/chat.js

const express = require("express");
const router = express.Router();
const fetch = require("node-fetch");
const { auth, checkMessageLimit, premiumOnly } = require("../middleware/auth");

const ADDIS_API_KEY = process.env.ADDIS_API_KEY;

// ==========================================
// NORMALIZATION LAYER
// ==========================================

function extractText(data) {
  if (!data) return null;

  // Direct matches
  if (data.response_text) return data.response_text;
  if (data.response) return data.response;
  if (data.text) return data.text;
  if (data.message && typeof data.message === "string") return data.message;

  // Nested formats
  if (data.data?.response_text) return data.data.response_text;
  if (data.data?.response) return data.data.response;

  // OpenAI-style format
  if (data.choices?.[0]?.message?.content)
    return data.choices[0].message.content;

  return null;
}

// ==========================================
// POST /api/chat
// ==========================================

router.post("/", auth, checkMessageLimit, async (req, res) => {
  try {
    const user = req.user;

    console.log(`💬 Chat request from: ${user.email} (${user.tier})`);
    console.log(`   Message count: ${user.messageCount}/${user.dailyLimit}`);

    const {
      prompt,
      target_language = "am",
      conversation_history = [],
      temperature = 0.7,
    } = req.body;

    if (!prompt || prompt.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: "Message cannot be empty",
      });
    }

    if (prompt.length > 5000) {
      return res.status(400).json({
        success: false,
        error: "Message is too long (max 5000 characters)",
      });
    }

    const validLanguages = ["am", "en", "om", "ti"];
    if (!validLanguages.includes(target_language)) {
      return res.status(400).json({
        success: false,
        error: "Invalid language code",
      });
    }

    if (temperature < 0 || temperature > 1) {
      return res.status(400).json({
        success: false,
        error: "Temperature must be between 0 and 1",
      });
    }

    if (!ADDIS_API_KEY) {
      return res.status(500).json({
        success: false,
        error: "AI service not configured",
      });
    }

    console.log("📡 Sending request to Addis AI...");

    const response = await fetch(
      "https://api.addisassistant.com/api/v1/chat_generate",
      {
        method: "POST",
        headers: {
          "X-API-Key": ADDIS_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt,
          target_language,
          conversation_history,
          generation_config: {
            temperature,
          },
        }),
      },
    );

    console.log(
      "📥 API Response Status:",
      response.status,
      response.statusText,
    );

    const rawText = await response.text();

    if (process.env.NODE_ENV === "development") {
      console.log("📦 Raw API Response:", rawText);
    }

    let data;
    try {
      data = JSON.parse(rawText);
    } catch (parseError) {
      console.error("❌ Failed to parse JSON from Addis AI");
      return res.status(502).json({
        success: false,
        error: "Invalid response from AI service",
      });
    }

    if (!response.ok) {
      console.error("❌ Addis AI returned error:", data);
      return res.status(response.status).json({
        success: false,
        error: data?.message || "AI service error",
      });
    }

    const responseText = extractText(data);

    if (!responseText) {
      console.error("❌ Unexpected Addis AI schema:", data);
      return res.status(502).json({
        success: false,
        error: "Invalid response structure from AI service",
      });
    }

    console.log("✅ Response generated successfully");
    console.log("   Response length:", responseText.length, "characters");

    logChatAnalytics(user, prompt, responseText, target_language);

    res.json({
      success: true,
      response_text: responseText,
      language: target_language,
      usage: req.messageUsage,
    });
  } catch (error) {
    console.error("❌ Chat error:", error.message);

    if (
      error.message.includes("Failed to fetch") ||
      error.code === "ENOTFOUND"
    ) {
      return res.status(503).json({
        success: false,
        error: "AI service temporarily unavailable",
      });
    }

    res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
});

// ==========================================
// STREAM (Placeholder)
// ==========================================

router.post(
  "/stream",
  auth,
  premiumOnly,
  checkMessageLimit,
  async (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.write('data: {"error": "Streaming not yet supported"}\n\n');
    res.end();
  },
);

// ==========================================
// USAGE
// ==========================================

router.get("/usage", auth, async (req, res) => {
  const user = req.user;

  const today = new Date().toDateString();
  const lastDate = user.lastMessageDate
    ? user.lastMessageDate.toDateString()
    : null;

  let messageCount = user.messageCount;
  if (today !== lastDate) messageCount = 0;

  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  const hoursUntilReset = Math.floor((tomorrow - now) / (1000 * 60 * 60));

  res.json({
    success: true,
    usage: {
      tier: user.tier,
      dailyLimit: user.dailyLimit,
      messagesUsed: messageCount,
      messagesRemaining: user.dailyLimit - messageCount,
      percentage: ((messageCount / user.dailyLimit) * 100).toFixed(1),
      resetIn: `${hoursUntilReset} hours`,
      isUnlimited: user.tier === "premium" || user.tier === "admin",
    },
  });
});

// ==========================================
// ANALYTICS
// ==========================================

function logChatAnalytics(user, prompt, response, language) {
  console.log("📊 Analytics:", {
    userId: user._id,
    tier: user.tier,
    language,
    promptLength: prompt.length,
    responseLength: response.length,
    timestamp: new Date(),
  });
}

module.exports = router;
