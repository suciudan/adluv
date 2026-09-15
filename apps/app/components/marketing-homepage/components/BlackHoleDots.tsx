import { useCallback, useEffect, useImperativeHandle, useRef, forwardRef } from "react";

interface Dot {
  baseX: number;
  baseY: number;
  x: number;
  y: number;
}

const SPACING = 32;
const DOT_RADIUS = 1;
const DOT_COLOR = "139, 92, 246";
const PULL_RADIUS = 180;
const SWIRL_STRENGTH = 1.8;
const PULL_STRENGTH = 0.08;
const RETURN_SPEED = 0.06;
const EVENT_HORIZON = 28;

export interface BlackHoleDotsHandle {
  onMouseMove: (clientX: number, clientY: number) => void;
  onMouseLeave: () => void;
}

export const BlackHoleDots = forwardRef<BlackHoleDotsHandle>(function BlackHoleDots(_props, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dotsRef = useRef<Dot[]>([]);
  const mouseRef = useRef({ x: -9999, y: -9999, active: false });
  const rafRef = useRef<number>(0);
  const sizeRef = useRef({ w: 0, h: 0 });

  const buildGrid = useCallback((w: number, h: number) => {
    const dots: Dot[] = [];
    const cols = Math.ceil(w / SPACING) + 2;
    const rows = Math.ceil(h / SPACING) + 2;
    const ox = (w - (cols - 1) * SPACING) / 2;
    const oy = (h - (rows - 1) * SPACING) / 2;

    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const x = ox + col * SPACING;
        const y = oy + row * SPACING;
        dots.push({ baseX: x, baseY: y, x, y });
      }
    }

    return dots;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext("2d");
    if (!context) return;

    let running = true;

    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;

      const w = parent.clientWidth;
      const h = parent.clientHeight;
      const dpr = window.devicePixelRatio || 1;

      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);

      sizeRef.current = { w, h };
      dotsRef.current = buildGrid(w, h);
    };

    const animate = () => {
      if (!running) return;

      const { w, h } = sizeRef.current;
      context.clearRect(0, 0, w, h);

      const { x: mouseX, y: mouseY, active } = mouseRef.current;

      for (const dot of dotsRef.current) {
        if (active) {
          const dx = dot.x - mouseX;
          const dy = dot.y - mouseY;
          const distance = Math.sqrt(dx * dx + dy * dy);

          if (distance < PULL_RADIUS && distance > 0.5) {
            const norm = 1 - distance / PULL_RADIUS;
            const pullFactor = norm * norm;
            const tangentX = -dy / distance;
            const tangentY = dx / distance;
            const swirlAmount = SWIRL_STRENGTH * pullFactor * (distance > EVENT_HORIZON ? 1 : 0.3);

            dot.x += tangentX * swirlAmount;
            dot.y += tangentY * swirlAmount;

            if (distance > EVENT_HORIZON) {
              const pull = PULL_STRENGTH * pullFactor * distance;
              dot.x -= (dx / distance) * pull;
              dot.y -= (dy / distance) * pull;
            } else {
              const orbitDistance = EVENT_HORIZON * 0.6;
              const currentAngle = Math.atan2(dot.y - mouseY, dot.x - mouseX);
              dot.x += (mouseX + Math.cos(currentAngle) * orbitDistance - dot.x) * 0.1;
              dot.y += (mouseY + Math.sin(currentAngle) * orbitDistance - dot.y) * 0.1;
            }
          } else {
            dot.x += (dot.baseX - dot.x) * RETURN_SPEED;
            dot.y += (dot.baseY - dot.y) * RETURN_SPEED;
          }
        } else {
          dot.x += (dot.baseX - dot.x) * RETURN_SPEED;
          dot.y += (dot.baseY - dot.y) * RETURN_SPEED;
        }

        let opacity = 0.12;
        if (active) {
          const dx = dot.x - mouseX;
          const dy = dot.y - mouseY;
          const distance = Math.sqrt(dx * dx + dy * dy);
          if (distance < PULL_RADIUS) {
            const norm = 1 - distance / PULL_RADIUS;
            opacity = 0.12 + norm * 0.55;
            if (distance < EVENT_HORIZON) {
              opacity = 0.7 + Math.random() * 0.15;
            }
          }
        }

        context.beginPath();
        context.arc(dot.x, dot.y, DOT_RADIUS, 0, Math.PI * 2);
        context.fillStyle = `rgba(${DOT_COLOR}, ${opacity})`;
        context.fill();
      }

      if (active) {
        const gradient = context.createRadialGradient(mouseX, mouseY, 0, mouseX, mouseY, EVENT_HORIZON * 1.2);
        gradient.addColorStop(0, "rgba(10, 10, 15, 0.9)");
        gradient.addColorStop(0.5, "rgba(10, 10, 15, 0.4)");
        gradient.addColorStop(1, "rgba(10, 10, 15, 0)");

        context.beginPath();
        context.arc(mouseX, mouseY, EVENT_HORIZON * 1.2, 0, Math.PI * 2);
        context.fillStyle = gradient;
        context.fill();
      }

      rafRef.current = requestAnimationFrame(animate);
    };

    resize();
    window.addEventListener("resize", resize);
    rafRef.current = requestAnimationFrame(animate);

    return () => {
      running = false;
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
    };
  }, [buildGrid]);

  useImperativeHandle(ref, () => ({
    onMouseMove(clientX: number, clientY: number) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      mouseRef.current = {
        x: clientX - rect.left,
        y: clientY - rect.top,
        active: true,
      };
    },
    onMouseLeave() {
      mouseRef.current = { ...mouseRef.current, active: false };
    },
  }), []);

  return (
    <div className="pointer-events-none absolute inset-0">
      <canvas ref={canvasRef} className="absolute inset-0" />
    </div>
  );
});
