import { NextResponse } from "next/server";
import { Resend } from "resend";

export const runtime = "nodejs";

const MAX_FIELD_LENGTH = 80;
const MAX_DRAWING_LENGTH = 1_500_000;
const RATE_LIMIT_MAX_REQUESTS = 3;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

const rateLimitStore = globalThis.__sendEmailRateLimitStore ?? new Map();
globalThis.__sendEmailRateLimitStore = rateLimitStore;

function cleanText(value) {
  return String(value ?? "").trim().slice(0, MAX_FIELD_LENGTH);
}

function escapeHtml(value) {
  return cleanText(value).replace(/[&<>"']/g, (char) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };

    return entities[char];
  });
}

function getClientIp(request) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  const forwardedIp = forwardedFor?.split(",")[0]?.trim();

  return (
    forwardedIp ||
    request.headers.get("x-real-ip") ||
    request.headers.get("cf-connecting-ip") ||
    "unknown"
  );
}

function getRateLimitHeaders(rateLimit) {
  return {
    "Retry-After": String(rateLimit.retryAfter),
    "X-RateLimit-Limit": String(RATE_LIMIT_MAX_REQUESTS),
    "X-RateLimit-Remaining": String(rateLimit.remaining),
    "X-RateLimit-Reset": String(Math.ceil(rateLimit.resetAt / 1000)),
  };
}

function checkRateLimit(key) {
  const now = Date.now();

  for (const [storedKey, record] of rateLimitStore.entries()) {
    if (record.resetAt <= now) {
      rateLimitStore.delete(storedKey);
    }
  }

  const current = rateLimitStore.get(key);
  if (!current) {
    const resetAt = now + RATE_LIMIT_WINDOW_MS;
    rateLimitStore.set(key, { count: 1, resetAt });

    return {
      allowed: true,
      remaining: RATE_LIMIT_MAX_REQUESTS - 1,
      resetAt,
      retryAfter: Math.ceil(RATE_LIMIT_WINDOW_MS / 1000),
    };
  }

  if (current.count >= RATE_LIMIT_MAX_REQUESTS) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: current.resetAt,
      retryAfter: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
    };
  }

  current.count += 1;

  return {
    allowed: true,
    remaining: RATE_LIMIT_MAX_REQUESTS - current.count,
    resetAt: current.resetAt,
    retryAfter: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
  };
}

function isValidDrawing(value) {
  return (
    typeof value === "string" &&
    value.startsWith("data:image/png;base64,") &&
    value.length <= MAX_DRAWING_LENGTH
  );
}

export async function POST(request) {
  const clientIp = getClientIp(request);
  const rateLimit = checkRateLimit(clientIp);
  const rateLimitHeaders = getRateLimitHeaders(rateLimit);

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Слишком много отправок. Попробуйте снова через 10 минут." },
      { status: 429, headers: rateLimitHeaders },
    );
  }

  try {
    const resendApiKey = process.env.RESEND_API_KEY;
    const emailTo = process.env.EMAIL_TO;

    if (!resendApiKey || !emailTo) {
      return NextResponse.json(
        { error: "Отправка временно недоступна: не настроены переменные окружения." },
        { status: 503, headers: rateLimitHeaders },
      );
    }

    const payload = await request.json();
    const name = cleanText(payload.name);
    const furColor = cleanText(payload.furColor);
    const age = Number(payload.age);
    const drawing = payload.drawing;

    if (!name || !furColor || !Number.isInteger(age) || age < 1 || age > 120) {
      return NextResponse.json(
        { error: "Проверьте имя, возраст и цвет образа." },
        { status: 400, headers: rateLimitHeaders },
      );
    }

    if (!isValidDrawing(drawing)) {
      return NextResponse.json(
        { error: "Рисунок не найден или слишком большой." },
        { status: 400, headers: rateLimitHeaders },
      );
    }

    const safeName = escapeHtml(name);
    const safeFurColor = escapeHtml(furColor);
    const safeAge = String(age);

    const htmlContent = `
      <!doctype html>
      <html lang="ru">
        <head>
          <meta charset="utf-8" />
          <style>
            body { margin: 0; font-family: Arial, sans-serif; background: #08070c; color: #f8fafc; }
            .container { max-width: 640px; margin: 0 auto; padding: 28px; }
            .panel { background: #12101a; border: 1px solid rgba(255,255,255,.12); border-radius: 14px; padding: 24px; }
            h1 { margin: 0 0 20px; color: #ffd166; font-size: 24px; }
            .field { margin: 12px 0; padding: 12px; background: rgba(255,255,255,.06); border-radius: 10px; }
            .label { display: block; margin-bottom: 4px; color: #ffd166; font-weight: 700; }
            .value { color: #f8fafc; }
            img { display: block; max-width: 100%; border-radius: 12px; border: 1px solid rgba(255,255,255,.12); }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="panel">
              <h1>Новая анкета персонажа</h1>
              <div class="field">
                <span class="label">Имя</span>
                <span class="value">${safeName}</span>
              </div>
              <div class="field">
                <span class="label">Возраст</span>
                <span class="value">${safeAge}</span>
              </div>
              <div class="field">
                <span class="label">Цвет образа</span>
                <span class="value">${safeFurColor}</span>
              </div>
              <div class="field">
                <span class="label">Рисунок</span>
                <img src="${drawing}" alt="Рисунок персонажа" />
              </div>
            </div>
          </div>
        </body>
      </html>
    `;

    const resend = new Resend(resendApiKey);
    const { error } = await resend.emails.send({
      from: process.env.EMAIL_FROM || "Fursona Studio <onboarding@resend.dev>",
      to: emailTo,
      subject: `Новая анкета от ${name}`,
      html: htmlContent,
    });

    if (error) {
      console.error("Resend error:", error);
      return NextResponse.json(
        { error: "Не удалось отправить письмо. Попробуйте позже." },
        { status: 502, headers: rateLimitHeaders },
      );
    }

    return NextResponse.json(
      { success: true, message: "Анкета успешно отправлена." },
      { status: 200, headers: rateLimitHeaders },
    );
  } catch (error) {
    console.error("API error:", error);
    return NextResponse.json(
      { error: "Внутренняя ошибка сервера." },
      { status: 500, headers: rateLimitHeaders },
    );
  }
}
