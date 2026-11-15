import { NextResponse } from 'next/server';

const JUDGE0_LANGUAGE_MAP: Record<string, number> = {
  javascript: 63, // JavaScript (Node.js 12.14.0)
  python: 71,     // Python (3.8.1)
  java: 62,       // Java (OpenJDK 13.0.1)
  c: 50,          // C (GCC 9.2.0)
  cpp: 54,        // C++ (GCC 9.2.0)
};

export async function POST(req: Request) {
  try {
    const { language = 'javascript', code = '' } = await req.json();

    if (!code || !code.trim()) {
      return NextResponse.json({
        success: false,
        error: 'Cannot execute empty code',
      }, { status: 400 });
    }

    const languageId = JUDGE0_LANGUAGE_MAP[language.toLowerCase()];
    if (!languageId) {
      return NextResponse.json({
        success: false,
        error: `Unsupported execution language: ${language}`,
      }, { status: 400 });
    }

    const startTime = performance.now();

    // Call Judge0 CE execution engine
    const judgeRes = await fetch('https://ce.judge0.com/submissions?base64_encoded=false&wait=true', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        language_id: languageId,
        source_code: code,
        stdin: '',
      }),
    });

    const duration = ((performance.now() - startTime) / 1000).toFixed(2);

    if (!judgeRes.ok) {
      const errText = await judgeRes.text();
      return NextResponse.json({
        success: false,
        error: `Execution server responded with status ${judgeRes.status}: ${errText}`,
      }, { status: 502 });
    }

    const result = await judgeRes.json();

    // Extract outputs from Judge0 response
    const stdout = result.stdout || '';
    const stderr = result.stderr || '';
    const compileOutput = result.compile_output || '';
    const status = result.status?.description || 'Executed';
    const execTime = result.time ? `${result.time}s` : `${duration}s`;

    return NextResponse.json({
      success: true,
      data: {
        stdout,
        stderr,
        compileOutput,
        status,
        execTime,
      },
    });
  } catch (error: any) {
    console.error('Code execution API error:', error);
    return NextResponse.json({
      success: false,
      error: error?.message || 'Failed to execute code in sandbox',
    }, { status: 500 });
  }
}
