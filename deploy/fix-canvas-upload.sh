#!/usr/bin/env bash
# Run on server as root:  bash /tmp/fix-canvas-upload.sh
# Fixes canvas-editor image upload:
#   1. Use URL.createObjectURL() instead of server POST (instant, reliable)
#   2. Close dialog before triggering file picker (fixes Radix focus-trap block)
#   3. Return inner FabricImage promise so errors are properly caught
set -e
cd /srv/gifteeng

python3 - << 'PYEOF'
path = "packages/ui/src/components/canvas-editor.tsx"
src = open(path).read()
original = src

# ── 1. Replace uploadUserFile (server POST → blob URL) ──────────────────────
old1 = """// ─────────────────────────────────────────────────────────────────────────────
// Upload helper — POSTs to /api/files/upload (same pattern as admin pages)
// ─────────────────────────────────────────────────────────────────────────────

async function uploadUserFile(file: File): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/api/files/upload", { method: "POST", body: form });
  if (!res.ok) throw new Error("Upload failed");
  const data: { url?: string } = await res.json();
  if (!data.url) throw new Error("Upload returned no URL");
  return data.url;
}"""

new1 = """// ─────────────────────────────────────────────────────────────────────────────
// Upload helper — creates a local blob URL for instant canvas display.
// The canvas preview (toDataURL) captures the final result as base64,
// so no server round-trip is needed at editing time.
// ─────────────────────────────────────────────────────────────────────────────

function uploadUserFile(file: File): Promise<string> {
  return Promise.resolve(URL.createObjectURL(file));
}"""

if old1 in src:
    src = src.replace(old1, new1, 1)
    print("✅ uploadUserFile patched → blob URL")
else:
    print("⚠️  uploadUserFile pattern not found — may already be patched")

# ── 2. Return inner FabricImage promise so errors propagate to .catch() ──────
old2 = """    uploadUserFile(file).then((url) => {
      FabricImage.fromURL(url, { crossOrigin: "anonymous" }).then((img) => {"""

new2 = """    uploadUserFile(file).then((url) => {
      return FabricImage.fromURL(url, { crossOrigin: "anonymous" }).then((img) => {"""

if old2 in src:
    src = src.replace(old2, new2, 1)
    print("✅ FabricImage promise chaining fixed")
else:
    print("⚠️  FabricImage pattern not found — may already be patched")

# ── 3. Upload dialog: close dialog BEFORE triggering file picker ─────────────
old3 = '              onClick={() => fileInputRef.current?.click()}\n              className="border-2 border-dashed border-border rounded-xl p-8 text-center cursor-pointer hover:border-primary hover:bg-accent/30 transition-all group"'

new3 = '              onClick={() => { setPopupTool(null); setTimeout(() => fileInputRef.current?.click(), 80); }}\n              className="border-2 border-dashed border-border rounded-xl p-8 text-center cursor-pointer hover:border-primary hover:bg-accent/30 transition-all group"'

if old3 in src:
    src = src.replace(old3, new3, 1)
    print("✅ Upload dialog click fixed")
else:
    print("⚠️  Upload dialog click pattern not found — may already be patched")

# ── 4. Images dialog "Upload your own" — same fix ────────────────────────────
old4 = '            <button onClick={() => { fileInputRef.current?.click(); setPopupTool(null); }} className="w-full py-2.5 rounded-xl border-2 border-dashed border-border text-xs font-medium text-muted-foreground hover:border-primary hover:text-primary transition-all">'

new4 = '            <button onClick={() => { setPopupTool(null); setTimeout(() => fileInputRef.current?.click(), 80); }} className="w-full py-2.5 rounded-xl border-2 border-dashed border-border text-xs font-medium text-muted-foreground hover:border-primary hover:text-primary transition-all">'

if old4 in src:
    src = src.replace(old4, new4, 1)
    print("✅ Images dialog upload button fixed")
else:
    print("⚠️  Images dialog pattern not found — may already be patched")

if src != original:
    open(path, "w").write(src)
    print("\n✅ canvas-editor.tsx updated")
else:
    print("\nℹ️  No changes written (all patterns already applied)")
PYEOF

echo ""
echo "→ Building web app (takes ~2 min)…"
pnpm --filter=@gifteeng/web build 2>&1 | tail -15

echo ""
echo "→ Restarting web service…"
systemctl restart gifteeng-web

echo ""
echo "🎉 Done! Test at: http://217.216.59.87/customize/very-test"
