"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import Galaxy from "./components/Galaxy";

const DomeGallery = dynamic(() => import("./components/DomeGallery"), {
  ssr: false,
  loading: () => (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "grid",
        placeItems: "center",
        color: "rgba(255,255,255,0.72)",
        fontFamily: "Arial, sans-serif",
      }}
    >
      Загрузка галереи...
    </div>
  ),
});

const FORM_INITIAL_STATE = {
  name: "",
  age: "",
  furColor: "",
};

const COLORS = [
  "#ff6b6b",
  "#ffd93d",
  "#6bcb77",
  "#4d96ff",
  "#ff6bff",
  "#ff8a5c",
  "#a29bfe",
  "#fd79a8",
  "#00b894",
  "#fdcb6e",
  "#e17055",
  "#74b9ff",
  "#6c5ce7",
  "#00cec9",
  "#fab1a0",
  "#ffeaa7",
];

const SUBMIT_TIMEOUT_MS = 20000;

function getPointer(event) {
  if (event.touches?.length) return event.touches[0];
  if (event.changedTouches?.length) return event.changedTouches[0];
  return event;
}

export default function Home() {
  const [color, setColor] = useState(COLORS[0]);
  const [formData, setFormData] = useState(FORM_INITIAL_STATE);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState(null);
  const canvasRef = useRef(null);
  const ctxRef = useRef(null);
  const isDrawingRef = useRef(false);
  const gallerySectionRef = useRef(null);
  const [isGalleryReady, setIsGalleryReady] = useState(false);

  const initCanvas = useCallback((canvas) => {
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvasRef.current = canvas;
    ctxRef.current = ctx;
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = COLORS[0];
  }, []);

  useEffect(() => {
    if (ctxRef.current) {
      ctxRef.current.strokeStyle = color;
    }
  }, [color]);

  useEffect(() => {
    const section = gallerySectionRef.current;
    if (!section) return;

    const fallbackTimer = window.setTimeout(() => setIsGalleryReady(true), 4500);

    if (!("IntersectionObserver" in window)) {
      return () => window.clearTimeout(fallbackTimer);
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        window.clearTimeout(fallbackTimer);
        setIsGalleryReady(true);
        observer.disconnect();
      },
      { rootMargin: "-120px 0px" },
    );

    observer.observe(section);
    return () => {
      window.clearTimeout(fallbackTimer);
      observer.disconnect();
    };
  }, []);

  const getCanvasPoint = useCallback((event) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;

    const pointer = getPointer(event);
    return {
      x: ((pointer.clientX - rect.left) / rect.width) * canvas.width,
      y: ((pointer.clientY - rect.top) / rect.height) * canvas.height,
    };
  }, []);

  const startDrawing = useCallback(
    (event) => {
      event.preventDefault();
      const point = getCanvasPoint(event);
      const ctx = ctxRef.current;
      if (!point || !ctx) return;

      ctx.beginPath();
      ctx.moveTo(point.x, point.y);
      isDrawingRef.current = true;
    },
    [getCanvasPoint],
  );

  const draw = useCallback(
    (event) => {
      if (!isDrawingRef.current) return;
      event.preventDefault();

      const point = getCanvasPoint(event);
      const ctx = ctxRef.current;
      if (!point || !ctx) return;

      ctx.lineTo(point.x, point.y);
      ctx.stroke();
    },
    [getCanvasPoint],
  );

  const stopDrawing = useCallback(() => {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;
    ctxRef.current?.closePath();
  }, []);

  const clearCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }, []);

  const handleInputChange = (event) => {
    const { name, value } = event.target;
    setFormData((current) => ({ ...current, [name]: value }));
  };

  const downloadDrawing = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const link = document.createElement("a");
    link.download = "мой_фурри.png";
    link.href = canvas.toDataURL("image/png");
    link.click();
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas || isSubmitting) return;

    setIsSubmitting(true);
    setSubmitStatus(null);
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), SUBMIT_TIMEOUT_MS);

    try {
      const response = await fetch("/api/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          ...formData,
          drawing: canvas.toDataURL("image/png"),
        }),
      });

      const contentType = response.headers.get("content-type") || "";
      const data = contentType.includes("application/json") ? await response.json() : {};
      if (!response.ok) {
        throw new Error(data.error || "Ошибка при отправке. Попробуйте позже.");
      }

      setSubmitStatus({ type: "success", message: data.message || "Анкета успешно отправлена!" });
      setFormData(FORM_INITIAL_STATE);
      clearCanvas();
    } catch (error) {
      let message = "Ошибка при отправке. Попробуйте позже.";

      if (error instanceof DOMException && error.name === "AbortError") {
        message = "Сервер слишком долго отвечает. Попробуйте ещё раз через минуту.";
      } else if (error instanceof TypeError && error.message === "Failed to fetch") {
        message = "Не удалось подключиться к серверу. Проверьте, что сайт запущен через npm run dev или npm run start.";
      } else if (error instanceof Error) {
        message = error.message;
      }

      setSubmitStatus({
        type: "error",
        message,
      });
    } finally {
      window.clearTimeout(timeoutId);
      setIsSubmitting(false);
    }
  };

  return (
    <main style={{ minHeight: "100vh", background: "#120f17", overflowX: "hidden" }}>
      <section
        style={{
          width: "100%",
          minHeight: "100svh",
          position: "relative",
          overflow: "hidden",
          background: "#08070c",
        }}
      >
        <Galaxy
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
          }}
          mouseRepulsion
          mouseInteraction
          density={1}
          glowIntensity={0.3}
          saturation={0}
          hueShift={140}
          twinkleIntensity={0.3}
          rotationSpeed={0.1}
          repulsionStrength={2}
          autoCenterRepulsion={0}
          starSpeed={1}
          speed={1}
          maxPixelRatio={1.35}
          targetFps={45}
        />

        <h1
          style={{
            position: "absolute",
            top: "34%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            width: "min(92vw, 1100px)",
            margin: 0,
            color: "white",
            fontSize: "clamp(2rem, 6vw, 4.5rem)",
            fontWeight: "800",
            textShadow: "0 0 20px rgba(255,255,255,0.5), 0 0 40px rgba(255,200,100,0.3)",
            zIndex: 10,
            pointerEvents: "none",
            textAlign: "center",
            fontFamily: "Arial, sans-serif",
            letterSpacing: "1px",
            background: "linear-gradient(135deg, #ffd700, #ff6b6b, #ffd700)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}
        >
          ✨ Сайт для фурри любого класса ✨
        </h1>

        <div
          style={{
            position: "absolute",
            left: "50%",
            bottom: "clamp(12px, 4vh, 42px)",
            transform: "translateX(-50%)",
            zIndex: 10,
            width: "min(94vw, 620px)",
            pointerEvents: "auto",
          }}
        >
          <form
            onSubmit={handleSubmit}
            style={{
              background: "rgba(0,0,0,0.72)",
              backdropFilter: "blur(15px)",
              borderRadius: "18px",
              padding: "clamp(16px, 3vw, 24px)",
              border: "1px solid rgba(255,255,255,0.1)",
              boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
              maxHeight: "82svh",
              overflowY: "auto",
            }}
          >
            <h2
              style={{
                margin: "0 0 14px",
                color: "white",
                textAlign: "center",
                fontSize: "clamp(1.05rem, 2vw, 1.4rem)",
                fontWeight: 800,
                fontFamily: "Arial, sans-serif",
                background: "linear-gradient(135deg, #ffd700, #ff6b6b)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              🐾 Кто ты в мире фурри?
            </h2>

            <div style={{ display: "grid", gap: "10px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "10px" }}>
                <input
                  type="text"
                  name="name"
                  placeholder="Имя"
                  value={formData.name}
                  onChange={handleInputChange}
                  style={inputStyle}
                  maxLength={80}
                  required
                />
                <input
                  type="number"
                  name="age"
                  placeholder="Возраст"
                  value={formData.age}
                  onChange={handleInputChange}
                  style={inputStyle}
                  min="1"
                  max="120"
                  required
                />
              </div>

              <input
                type="text"
                name="furColor"
                placeholder="Цвет фурри (например: рыжий, белый, чёрный)"
                value={formData.furColor}
                onChange={handleInputChange}
                style={inputStyle}
                maxLength={80}
                required
              />
            </div>

            <p
              style={{
                margin: "14px 0 10px",
                color: "rgba(255,255,255,0.82)",
                textAlign: "center",
                fontSize: "clamp(0.82rem, 1.5vw, 1rem)",
                fontFamily: "Arial, sans-serif",
              }}
            >
              🎨 Выбери цвет и нарисуй своего фурри
            </p>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(8, minmax(26px, 1fr))",
                gap: "8px",
                marginBottom: "10px",
              }}
            >
              {COLORS.map((item) => (
                <button
                  key={item}
                  type="button"
                  aria-label={`Выбрать цвет ${item}`}
                  aria-pressed={color === item}
                  onClick={() => setColor(item)}
                  style={{
                    width: "100%",
                    aspectRatio: "1",
                    borderRadius: "50%",
                    backgroundColor: item,
                    cursor: "pointer",
                    border: color === item ? "3px solid white" : "2px solid rgba(255,255,255,0.24)",
                    boxShadow: color === item ? "0 0 20px rgba(255,255,255,0.35)" : "none",
                    transform: color === item ? "scale(1.08)" : "scale(1)",
                    transition: "all 0.18s ease",
                  }}
                />
              ))}
            </div>

            <div
              style={{
                border: "2px solid rgba(255,255,255,0.15)",
                borderRadius: "12px",
                overflow: "hidden",
                background: "rgba(255,255,255,0.05)",
              }}
            >
              <canvas
                ref={initCanvas}
                width={800}
                height={320}
                style={{
                  width: "100%",
                  height: "auto",
                  aspectRatio: "5 / 2",
                  display: "block",
                  cursor: "crosshair",
                  touchAction: "none",
                }}
                onMouseDown={startDrawing}
                onMouseMove={draw}
                onMouseUp={stopDrawing}
                onMouseLeave={stopDrawing}
                onTouchStart={startDrawing}
                onTouchMove={draw}
                onTouchEnd={stopDrawing}
              />
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
                gap: "10px",
                marginTop: "10px",
              }}
            >
              <button type="button" style={secondaryButtonStyle} onClick={clearCanvas}>
                🗑️ Очистить
              </button>
              <button type="button" style={secondaryButtonStyle} onClick={downloadDrawing}>
                💾 Сохранить рисунок
              </button>
            </div>

            {submitStatus && (
              <div
                style={{
                  marginTop: "10px",
                  padding: "10px",
                  borderRadius: "10px",
                  background:
                    submitStatus.type === "success" ? "rgba(76, 175, 80, 0.2)" : "rgba(244, 67, 54, 0.2)",
                  border: submitStatus.type === "success" ? "1px solid #4caf50" : "1px solid #f44336",
                  color: submitStatus.type === "success" ? "#4caf50" : "#f44336",
                  textAlign: "center",
                  fontFamily: "Arial, sans-serif",
                }}
                role="status"
              >
                {submitStatus.message}
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              style={{
                width: "100%",
                marginTop: "14px",
                padding: "12px",
                borderRadius: "12px",
                border: "none",
                background: isSubmitting ? "#666" : "linear-gradient(135deg, #ffd700, #ff6b6b, #ffd700)",
                color: "white",
                fontSize: "1rem",
                fontWeight: "bold",
                cursor: isSubmitting ? "not-allowed" : "pointer",
                fontFamily: "Arial, sans-serif",
                letterSpacing: "0.5px",
                boxShadow: isSubmitting ? "none" : "0 5px 25px rgba(255,215,0,0.22)",
                opacity: isSubmitting ? 0.7 : 1,
              }}
            >
              {isSubmitting ? "⏳ Отправка..." : "🌟 Отправить анкету"}
            </button>
          </form>
        </div>
      </section>

      <section
        ref={gallerySectionRef}
        style={{
          width: "100%",
          height: "100svh",
          minHeight: "620px",
          background: "#120f17",
        }}
      >
        {isGalleryReady ? (
          <DomeGallery
            fit={0.8}
            minRadius={320}
            maxRadius={760}
            maxVerticalRotationDeg={0}
            segments={34}
            dragDampening={0.8}
            grayscale
          />
        ) : (
          <div
            style={{
              width: "100%",
              height: "100%",
              display: "grid",
              placeItems: "center",
              color: "rgba(255,255,255,0.7)",
              fontFamily: "Arial, sans-serif",
            }}
          >
            Загрузка галереи...
          </div>
        )}
      </section>
    </main>
  );
}

const inputStyle = {
  width: "100%",
  minWidth: 0,
  padding: "10px 14px",
  borderRadius: "10px",
  border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(255,255,255,0.08)",
  color: "white",
  fontSize: "0.92rem",
  outline: "none",
  fontFamily: "Arial, sans-serif",
};

const secondaryButtonStyle = {
  padding: "9px 16px",
  borderRadius: "10px",
  border: "1px solid rgba(255,255,255,0.2)",
  background: "rgba(255,255,255,0.08)",
  color: "white",
  fontSize: "0.88rem",
  cursor: "pointer",
  fontFamily: "Arial, sans-serif",
};
