const { GoogleGenerativeAI } = require("@google/generative-ai");
const dotenv = require("dotenv");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// This is a Temporary Mock Service to bypass the 404 errors
const analyzeInterviewDetails = async (emailText) => {
  console.log("🛠️ Using Mock Gemini Service for testing...");

  // Simulate a short delay like a real AI
  await new Promise(resolve => setTimeout(resolve, 1000));

  // If the email looks like a shortlist, return fake data
  if (emailText.toLowerCase().includes("shortlisted") || emailText.toLowerCase().includes("interview")) {
    return {
      company: "TechFlow Solutions (Mock)",
      date: "2025-12-30",
      time: "14:00",
      description: "Technical Interview extracted via Mock Service"
    };
  }
  
  return null;
};

module.exports = { analyzeInterviewDetails };
