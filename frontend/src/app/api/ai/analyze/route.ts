import { GoogleGenerativeAI } from '@google/generative-ai';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { NextResponse } from 'next/server';

const apiKey = process.env.GEMINI_API_KEY || '';
const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;

// Available candidate models with generateContent support
const CANDIDATE_MODELS = ['gemini-3.5-flash', 'gemini-3.5-flash-lite', 'gemini-3.8-flash'];

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

    const prompt = `You are an expert algorithmic code reviewer and software architect.
Analyze the following ${language} code thoroughly.
Identify any syntax errors, compiler issues, runtime mistakes (such as type mismatches, undeclared variables, missing includes/imports, memory leaks, or invalid operations), logical bugs, edge cases, and performance bottlenecks.
Return strict JSON with this exact schema:
{
  "timeComplexity": "e.g. O(n) or O(1)",
  "spaceComplexity": "e.g. O(1)",
  "complexityExplanation": "1-2 sentence concise explanation of why it has this Big-O time and space complexity",
  "errors": [
    {
      "line": 4,
      "severity": "error",
      "message": "exact mistake explanation and how to fix it"
    }
  ],
  "optimizationTips": [
    "Clear actionable step to fix or optimize the code"
  ],
  "optimizedCode": "clean, fully working, modern ${language} code fixing all mistakes"
}

Code to analyze:
${code}`;

    let lastError: any = null;
    let parsedData = null;

    for (const modelName of CANDIDATE_MODELS) {
      try {
        const model = genAI.getGenerativeModel({
          model: modelName,
          generationConfig: {
            responseMimeType: 'application/json',
          },
        });

        const result = await model.generateContent(prompt);
        const textResponse = result.response.text();
        parsedData = JSON.parse(textResponse);
        break; // Success!
      } catch (err: any) {
        console.warn(`Model ${modelName} failed, trying fallback:`, err?.message);
        lastError = err;
      }
    }

    if (!parsedData) {
      throw lastError || new Error('All AI review models were unavailable');
    }

    // Normalize optimizationTips
    if (typeof parsedData.optimizationTips === 'string') {
      parsedData.optimizationTips = parsedData.optimizationTips
        .split('\n')
        .map((s: string) => s.replace(/^\d+[\.\)]\s*/, '').trim())
        .filter(Boolean);
    } else if (!Array.isArray(parsedData.optimizationTips)) {
      parsedData.optimizationTips = [];
    }

    // Normalize errors
    if (!Array.isArray(parsedData.errors)) {
      parsedData.errors = [];
    }

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
