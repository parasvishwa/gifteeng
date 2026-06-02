#!/usr/bin/env bash
set -e
cd /srv/gifteeng

echo "=== Session 157: Customizer Phase A+B+C — sharp/pdf-lib + canvas editor upgrade ==="

echo "--- Extracting API patch ---"
tar xzf /tmp/patch_session157_api.tar.gz

echo "--- Extracting UI patch ---"
tar xzf /tmp/patch_session157_ui.tar.gz

echo "--- Installing new API deps (sharp, pdf-lib) ---"
pnpm --filter @gifteeng/api install --no-frozen-lockfile

echo "--- Installing new UI deps (framer-motion, @floating-ui/react, etc.) ---"
pnpm --filter @gifteeng/ui install --no-frozen-lockfile

echo "--- Building API ---"
pnpm --filter @gifteeng/api build

echo "--- Building Web ---"
pnpm --filter @gifteeng/web build

echo "--- Restarting services ---"
systemctl restart gifteeng-api
systemctl restart gifteeng-web

sleep 6

echo "--- Health checks ---"
curl -sf http://localhost:4000/health -o /dev/null && echo "api HTTP 200" || echo "api FAILED"
curl -sf http://localhost:3000 -o /dev/null && echo "web HTTP 200" || echo "web FAILED"

echo "=== Session 157 deploy complete ==="
echo "  API changes:"
echo "    - canvas-export.controller.ts: pdf-lib + sharp (replaces pdfkit)"
echo "    - PDF export: compressed PNG embedded, bleed marks added"
echo "    - ai-customizer: POST /customizer/ai heuristic endpoint"
echo "  Canvas editor (packages/ui) changes:"
echo "    - framer-motion: AnimatePresence on text panel (smooth slide-in)"
echo "    - @floating-ui/react: floating mini-toolbar (delete/layer/duplicate) near selected object"
echo "    - @use-gesture/react: mobile pinch-to-zoom on canvas container"
echo "    - react-hotkeys-hook: keyboard shortcuts (del, ctrl+z, ctrl+a) via hook"
echo "    - colorthief: palette extraction from uploaded images, shown as swatches"
echo "    - qr-code-styling: new QR tool — generates styled QR code onto canvas"
