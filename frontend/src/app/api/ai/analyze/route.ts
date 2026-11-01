import { GoogleGenerativeAI } from '@google/generative-ai';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { NextResponse } from 'next/server';

const apiKey = process.env.GEMINI_API_KEY || '';
const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    // Allow guest or authenticated callers with room access
    const { code, language = 'javascript' } = await req.json();

    if (!code || !code.trim()) {
      return NextResponse.json({ success: false, error: 'Code content cannot be empty' }, { status: 400 });
    }

    if (!genAI) {
      return NextResponse.json(
        {
          success: false,
          error: 'GEMINI_API_KEY not configured on server',
        },
        { status: 500 }
      );
    }

    const model = genAI.getGenerativeModel({
      model: 'gemini-1.5-flash',
      generationConfig: {
        responseMimeType: 'application/json',
      },
    });

    const prompt = `
You are an expert algorithmic code reviewer and software architect.
Analyze the following ${language} code and return strict JSON with this exact schema:
{
  "timeComplexity": "e.g. O(n)",
  "spaceComplexity": "e.g. O(1)",
  "complexityExplanation": "1-2 sentence concise explanation of why it has this Big-O time and space complexity",
  "errors": [
    {
      "line": 4,
      "severity": "warning",
      "message": "description of bug, potential edge case, or syntax issue"
    }
  ],
  "optimizationTips": [
    "Tip 1 on performance or readability",
    "Tip 2 on algorithm improvement"
  ],
  "optimizedCode": "clean, refactored, modern ES6+ JavaScript code"
}

Code to analyze:
${code}
`;

    const result = await model.generateContent(prompt);
    const textResponse = result.response.text();
    const parsedData = JSON.parse(textResponse);

    return NextResponse.json({
      success: true,
      data: parsedData,
    });
  } catch (error: any) {
    console.error('Gemini AI Analysis Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error?.message || 'Failed to complete AI review',
      },
      { status: 500 }
    );
  }
}
