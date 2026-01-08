const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const analyzeInterviewDetails = async (emailText) => {
  try {
    // Note: Updated model name to a stable version
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-pro" });

    const prompt = `
      You are an AI assistant filtering recruitment emails. 
      Analyze the following email text and extract interview details.

      ### REJECTION CRITERIA (MANDATORY):
      Return 'null' (no JSON) if the email is:
      1. From a platform aggregator like Internshala, LinkedIn Job Alerts, or Naukri.
      2. A generic "Application Received" or "Thanks for applying" email.
      3. A promotional/marketing email or a newsletter.
      4. Missing a specific request for an interview or assessment.

      ### EXTRACTION CRITERIA:
      Only return a JSON object if the email is a direct invitation to an interview, 
      an online assessment (OA), or a technical round.

      Fields:
      1. company: Name of the company.
      2. date: YYYY-MM-DD.
      3. time: HH:mm.
      4. description: A very short summary (max 10 words).
      5. level: The stage (e.g., "Technical Round", "HR Round", "Online Assessment"). Use judgment if not explicit.

      ### FORMAT:
      {
        "company": "...",
        "date": "...",
        "time": "...",
        "description": "...",
        "level": "..."
      }
      If rejection criteria are met, return exactly: null

      Email Text: "${emailText}"
    `;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    let text = response.text().trim();

    // Check if the AI returned the literal string "null"
    if (text.toLowerCase() === 'null') return null;

    // Clean JSON formatting if present
    text = text.replace(/```json|```/g, "").trim();

    const data = JSON.parse(text);
    
    // Validate we have the bare minimums for a calendar event
    return (data && data.date && data.time) ? data : null;
  } catch (error) {
    console.error("🤖 Gemini Analysis Error:", error.message);
    return null;
  }
};

module.exports = { analyzeInterviewDetails };