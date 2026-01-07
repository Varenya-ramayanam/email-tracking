const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const analyzeInterviewDetails = async (emailText) => {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-pro" });

    const prompt = `
      Extract interview details from the following email text. 
      Return ONLY a JSON object. If no specific date/time is found, return null.
      
      Fields to extract:
      1. company: Name of the company.
      2. date: YYYY-MM-DD.
      3. time: HH:mm.
      4. description: A very short summary.
      5. level: The stage of the interview (e.g., "Technical Round", "HR Round", "Managerial Round", "Online Assessment"). 
         If the level is not explicitly mentioned, use your best judgment based on the context of the email to decide the level.

      Format:
      {
        "company": "...",
        "date": "...",
        "time": "...",
        "description": "...(length only 10 words)",
        "level": "..."
      }

      Email Text: "${emailText}"
    `;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    let text = response.text().replace(/```json|```/g, "").trim();

    const data = JSON.parse(text);
    return (data && data.date && data.time) ? data : null;
  } catch (error) {
    console.error("🤖 Gemini Analysis Error:", error.message);
    return null;
  }
};

module.exports = { analyzeInterviewDetails };